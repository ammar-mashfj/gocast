<?php

namespace App\Services;

use App\Models\Station;
use App\Models\Track;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Writes the per-station m3u files consumed by Liquidsoap — `playlist.m3u`
 * (the AutoDJ rotation) and `jingles.m3u` (station IDs and liners).
 *
 * Each track is written as a Liquidsoap `annotate:` URI carrying the
 * canonical title/artist from the DB — the m3u parser passes those
 * directly into the request's metadata, bypassing ID3 tag reads and
 * EXTINF parsing. That means the DB is the single source of truth for
 * now-playing metadata, regardless of whether the audio file has tags
 * or whether the title contains punctuation that LS's EXTINF parser
 * would mangle.
 *
 * Jingle entries carry one extra annotation, `jingle="true"`. The .liq
 * script reads it in two places — the crossfade transition (a jingle is
 * always hard cut, never mixed under a song) and the now-playing push
 * (a station ID is not "now playing"). Both of those live downstream of
 * the audio file, so the flag has to travel WITH the request rather than
 * being inferred from which source produced it.
 *
 * Both files are always written, even when empty and even when jingles are
 * switched off: the container's script references `jingles.m3u` by path, and
 * a missing file is a decoding error on every read attempt, whereas an empty
 * one just makes the source fallible (which the fallback already handles).
 *
 * Triggered by `reload()` via telnet whenever a track list changes
 * (add/remove/reorder); we deliberately don't use `reload_mode="watch"`
 * because some LS 2.x versions reset the queue cursor on watch reload.
 */
class PlaylistFileWriter
{
    public const FILENAME = 'playlist.m3u';

    public const JINGLES_FILENAME = 'jingles.m3u';

    /**
     * The Liquidsoap source name for the playlist — derived from the m3u
     * filename. Telnet commands use "{source}.reload", "{source}.skip" etc.
     */
    public const LIQ_SOURCE = 'playlist_m3u';

    /**
     * Same contract for the jingle playlist. Only reachable while the
     * station has jingles enabled — the source is not in the rendered
     * script otherwise, and telnet answers "unknown command".
     */
    public const JINGLES_LIQ_SOURCE = 'jingles_m3u';

    /**
     * Where the per-station playlist dir is mounted inside the Liquidsoap
     * container. Defined by LiquidsoapSupervisor's bind-mount:
     *   {host_playlists_dir}/{slug}:/data/playlists
     * Hard-coded here too so the URIs we emit into the m3u don't drift if
     * the host path changes — only the mount target is load-bearing.
     */
    private const CONTAINER_PLAYLIST_DIR = '/data/playlists';

    public function __construct(
        private readonly LiquidsoapSupervisor $supervisor,
    ) {}

    /**
     * Rewrite both of the station's playlist files from its current Track
     * rows. Idempotent — safe to call after any track-table mutation.
     *
     * If a list has zero tracks, an empty m3u is written. Liquidsoap
     * tolerates this (the playlist source becomes fallible) and the
     * fallback chain demotes past it — to the rotation for an empty jingle
     * list, and on to silence for an empty rotation.
     */
    public function write(Station $station): void
    {
        $dir = $this->stationDir($station);
        File::ensureDirectoryExists($dir);

        $columns = ['path', 'title', 'artist', 'duration_seconds'];

        $this->writeM3u(
            "{$dir}/".self::FILENAME,
            $station->musicTracks()->get($columns),
            isJingle: false,
        );

        $this->writeM3u(
            "{$dir}/".self::JINGLES_FILENAME,
            $station->jingles()->get($columns),
            isJingle: true,
        );
    }

    /**
     * Render one m3u and swap it into place.
     *
     * @param  Collection<int, Track>  $tracks
     */
    private function writeM3u(string $target, Collection $tracks, bool $isJingle): void
    {
        // Lines are Liquidsoap `annotate:` URIs — key="value" metadata pairs
        // followed by the audio file path. This makes the DB the single
        // source of truth for title/artist regardless of whether the file
        // has ID3 tags.
        //
        // We intentionally do *not* emit `#EXTINF:` lines. Liquidsoap's m3u
        // parser auto-wraps the next URI in its own `annotate:` prefix
        // derived from EXTINF, which then nests with ours and produces an
        // unresolvable URI like `annotate:foo:annotate:bar:file.mp3`.
        $lines = ['#EXTM3U'];
        foreach ($tracks as $track) {
            // Absolute container path — relative paths inside an annotate URI
            // are not resolved against the m3u's own directory (unlike bare
            // m3u entries), so we must spell out where Liquidsoap finds the
            // file inside its sandbox. basename() defends against accidental
            // absolute paths slipping into Track::$path — only the leaf name
            // is ever joined under the container playlist dir.
            $lines[] = $this->annotateTrack($track, $isJingle);
        }

        // Write to a sibling .tmp and rename: rename(2) is atomic on the
        // same filesystem, so Liquidsoap can never read a half-written
        // playlist (matters because reload() is fired right after this
        // returns).
        $tmp = $target.'.tmp';
        File::put($tmp, implode("\n", $lines)."\n");
        rename($tmp, $target);
    }

    /**
     * One track as the Liquidsoap `annotate:` URI that plays it.
     *
     * Shared with AutoDjScheduler, which hands a single one of these straight
     * to `request.dynamic` instead of writing a file. Same builder on purpose:
     * the annotations are a contract with the .liq script (the crossfade reads
     * `duration`, the jingle arm reads `jingle`), and two builders would be
     * two places for that contract to drift.
     */
    public function annotateTrack(Track $track, bool $isJingle = false): string
    {
        // Absolute container path — relative paths inside an annotate URI are
        // not resolved against the m3u's own directory (unlike bare m3u
        // entries), so we must spell out where Liquidsoap finds the file
        // inside its sandbox. basename() defends against accidental absolute
        // paths slipping into Track::$path — only the leaf name is ever
        // joined under the container playlist dir.
        return $this->annotateUri(
            $track->title,
            $track->artist,
            self::CONTAINER_PLAYLIST_DIR.'/'.basename((string) $track->path),
            $track->duration_seconds === null ? null : (float) $track->duration_seconds,
            $isJingle,
            $track,
        );
    }

    /**
     * Host path to the station's playlist directory. Tracks land here as
     * `{ulid}.{ext}`; the m3u is a sibling.
     */
    public function stationDir(Station $station): string
    {
        return rtrim(config('liquidsoap.playlists_dir'), '/').'/'.$station->slug;
    }

    /**
     * Tell the running Liquidsoap container to re-read the m3u files and
     * rebuild its queues. Call this only when a *list* changes (track added,
     * removed, reordered) — not when only title/artist tags change, since
     * that disrupts the currently playing track without a real benefit.
     *
     * The jingle source only exists in the rendered script while the station
     * has jingles enabled, so its reload is conditional — sending it anyway
     * would log a spurious failure on every upload for the (common) station
     * that has never turned jingles on.
     *
     * Failures are swallowed and logged: a Liquidsoap that's down or
     * restarting will pick up the new files on its next start anyway.
     */
    public function reload(Station $station): void
    {
        // Only in file mode. In dynamic mode the rotation is not a list
        // Liquidsoap holds, so there is nothing to re-read — and sending the
        // reload anyway would be worse than useless: `playlist.reload` resets
        // the queue cursor to the top, which is the audible bug dynamic mode
        // exists to remove. The next track is simply asked for at the next
        // boundary, and by then the tracks table already has the change.
        if (! (bool) config('liquidsoap.autodj_dynamic')) {
            $this->reloadSource($station, self::LIQ_SOURCE);
        }

        if ($station->jingles_enabled) {
            $this->reloadSource($station, self::JINGLES_LIQ_SOURCE);
        }
    }

    private function reloadSource(Station $station, string $source): void
    {
        try {
            $this->supervisor->telnet($station, $source.'.reload');
        } catch (Throwable $e) {
            Log::info('PlaylistFileWriter reload skipped', [
                'station' => $station->slug,
                'source' => $source,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Build a Liquidsoap `annotate:` URI like:
     *   annotate:duration="184.74",title="КАМИН",artist="EMIN":/data/playlists/abc.mp3
     *
     * Double quotes inside values are backslash-escaped, which is how
     * Liquidsoap's lexer expects them. Empty fields are omitted so the
     * downstream "no artist" case doesn't pollute `m["artist"]` with "".
     *
     * `duration` is emitted because the crossfade needs to know where a track
     * ends in order to time a transition, and it is the one field Liquidsoap
     * would otherwise have to infer per playback. AzuraCast — the reference
     * implementation for this pipeline — always annotates it for the same
     * reason. We already store it, so there is no reason to make Liquidsoap
     * guess. Omitted when unknown rather than sent as 0, which would read as
     * a zero-length track.
     *
     * Formatted with 3 decimals via number_format: the default float cast can
     * emit scientific notation ("1.8473799301908E+2") for some values, which
     * Liquidsoap's annotate parser does not accept.
     *
     * `jingle="true"` is emitted first for jingle entries. It is not display
     * metadata — it is how the .liq script recognises a station ID once the
     * request has been handed downstream, which is what lets it hard cut the
     * transition and keep the ID out of now-playing.
     *
     * `liq_cue_in` / `liq_cue_out` / `liq_amplify` are Liquidsoap's own
     * instruction keys and come from the analyser — see analysisAnnotations().
     */
    private function annotateUri(
        string $title,
        ?string $artist,
        string $path,
        ?float $durationSeconds = null,
        bool $isJingle = false,
        ?Track $track = null,
    ): string {
        $parts = [];

        if ($isJingle) {
            $parts[] = 'jingle="true"';
        }

        foreach ($this->analysisAnnotations($track) as $annotation) {
            $parts[] = $annotation;
        }

        if ($durationSeconds !== null && $durationSeconds > 0) {
            $parts[] = 'duration="'.number_format($durationSeconds, 3, '.', '').'"';
        }

        $parts[] = 'title="'.$this->escapeAnnotateValue($title).'"';

        $artist = trim((string) $artist);
        if ($artist !== '') {
            $parts[] = 'artist="'.$this->escapeAnnotateValue($artist).'"';
        }

        return 'annotate:'.implode(',', $parts).':'.$path;
    }

    /**
     * The analyser's findings, as instructions Liquidsoap acts on.
     *
     * These three keys are not ours: `liq_cue_in`, `liq_cue_out` and
     * `liq_amplify` are read by Liquidsoap itself — the first two by the
     * request layer (`settings.playlist.cue_in_metadata`), the third by the
     * `amplify` operator the script wraps the rotation in. Rename one and it
     * silently stops doing anything.
     *
     * Derived here rather than stored, which is the point of keeping raw
     * measurements: the loudness target lives in config and is applied at the
     * moment this runs, so retuning it relevels the whole library at each
     * station's next track boundary — no re-analysis, no restart, nothing
     * written.
     *
     * An unanalysed track contributes nothing and plays exactly as it did
     * before any of this existed. `apply_amplify=false` drops the gain but
     * keeps the cue points, because they are separate corrections and the
     * reason to distrust one is not a reason to distrust the other.
     *
     * @return list<string>
     */
    private function analysisAnnotations(?Track $track): array
    {
        if ($track === null) {
            return [];
        }

        $parts = [];

        [$cueIn, $cueOut] = (new TrackAnalysis(
            loudnessLufs: $track->loudness_lufs,
            truePeakDb: $track->true_peak_db,
            cueInSeconds: $track->cue_in_seconds,
            cueOutSeconds: $track->cue_out_seconds,
        ))->cuePoints((float) $track->duration_seconds);

        if ($cueIn !== null) {
            $parts[] = 'liq_cue_in="'.number_format($cueIn, 3, '.', '').'"';
        }

        if ($cueOut !== null) {
            $parts[] = 'liq_cue_out="'.number_format($cueOut, 3, '.', '').'"';
        }

        if (! config('liquidsoap.apply_amplify', true)) {
            return $parts;
        }

        $amplify = (new TrackAnalysis(
            loudnessLufs: $track->loudness_lufs,
            truePeakDb: $track->true_peak_db,
        ))->amplifyDb();

        if ($amplify !== null) {
            // The `dB` suffix is required: a bare float is read as a linear
            // multiplier, so "-6" would mean inverted phase at six times the
            // volume rather than six decibels down.
            $parts[] = 'liq_amplify="'.number_format($amplify, 2, '.', '').' dB"';
        }

        return $parts;
    }

    private function escapeAnnotateValue(string $value): string
    {
        return str_replace(['\\', '"'], ['\\\\', '\\"'], $value);
    }
}
