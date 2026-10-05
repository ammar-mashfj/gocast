<?php

namespace App\Services;

use App\Models\Station;
use App\Models\Track;
use Illuminate\Support\Facades\File;

/**
 * Builds the Liquidsoap `annotate:` URIs a station's tracks are played
 * through, and prepares the directory they are played from.
 *
 * Nothing here writes a playlist file any more. Music and jingles alike are
 * served one track at a time by NextTrackController, which calls
 * annotateTrack() for each answer — see the "AutoDJ rotation" note in
 * config/liquidsoap.php for why a playlist file could not work, and
 * docs/JINGLES-AND-HARD-SLOTS-PLAN.md for why jingles followed.
 *
 * Each track is rendered as a Liquidsoap `annotate:` URI carrying the
 * canonical title/artist from the DB — Liquidsoap passes those directly into
 * the request's metadata, bypassing ID3 tag reads. That means the DB is the
 * single source of truth for now-playing metadata, regardless of whether the
 * audio file has tags or whether the title contains punctuation.
 *
 * Jingles carry one extra annotation, `jingle="true"`. The .liq script reads
 * it in two places — the crossfade transition (a jingle is always hard cut,
 * never mixed under a song) and the now-playing push (a station ID is not
 * "now playing"). Both of those live downstream of the audio file, so the
 * flag has to travel WITH the request.
 */
class PlaylistFileWriter
{
    /**
     * The Liquidsoap source name of the AutoDJ rotation. Telnet commands use
     * "{source}.skip"; LiquidsoapSupervisor renders the same constant as the
     * `request.dynamic` id, so the command and the source cannot drift.
     *
     * The value still reads `playlist_m3u` from when the rotation was a
     * playlist file. Kept rather than renamed because it is a wire name shared
     * with every already-rendered .liq on the box: changing it would leave
     * skip-track answering "unknown command" on every running station until it
     * was relaunched.
     */
    public const LIQ_SOURCE = 'playlist_m3u';

    /**
     * Where the per-station playlist dir is mounted inside the Liquidsoap
     * container. Defined by LiquidsoapSupervisor's bind-mount:
     *   {host_playlists_dir}/{slug}:/data/playlists
     * Hard-coded here too so the URIs we emit into the m3u don't drift if
     * the host path changes — only the mount target is load-bearing.
     */
    private const CONTAINER_PLAYLIST_DIR = '/data/playlists';

    /**
     * Make sure the station's playlist directory exists: where uploaded
     * audio lives, and what LiquidsoapSupervisor bind-mounts as
     * /data/playlists. Called before a container starts.
     */
    public function prepare(Station $station): void
    {
        File::ensureDirectoryExists($this->stationDir($station));
    }

    /**
     * One track as the Liquidsoap `annotate:` URI that plays it.
     *
     * Shared with AutoDjScheduler, which hands a single one of these straight
     * to `request.dynamic` instead of writing a file. Same builder on purpose:
     * the annotations are a contract with the .liq script (the crossfade reads
     * `duration` and `jingle`).
     */
    public function annotateTrack(
        Track $track,
        bool $isJingle = false,
        ?string $playlist = null,
        ?float $playFor = null,
        ?float $fadeOut = null,
    ): string {
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
            $playlist,
            $playFor,
            $fadeOut,
        );
    }

    /**
     * Host path to the station's playlist directory. Tracks land here as
     * `{ulid}.{ext}`.
     */
    public function stationDir(Station $station): string
    {
        return rtrim(config('liquidsoap.playlists_dir'), '/').'/'.$station->slug;
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
        ?string $playlist = null,
        ?float $playFor = null,
        ?float $fadeOut = null,
    ): string {
        $parts = [];

        if ($isJingle) {
            $parts[] = 'jingle="true"';
        }

        foreach ($this->analysisAnnotations($track, $playFor) as $annotation) {
            $parts[] = $annotation;
        }

        // A track cut short for a hard start fades out over its last
        // seconds. `liq_fade_out` is read by the script's fade.out on the
        // rotation (Liquidsoap's own key, like the cue points).
        if ($playFor !== null && $fadeOut !== null) {
            $parts[] = 'liq_fade_out="'.number_format($fadeOut, 3, '.', '').'"';
        }

        if ($durationSeconds !== null && $durationSeconds > 0) {
            $parts[] = 'duration="'.number_format($durationSeconds, 3, '.', '').'"';
        }

        $parts[] = 'title="'.$this->escapeAnnotateValue($title).'"';

        $artist = trim((string) $artist);
        if ($artist !== '') {
            $parts[] = 'artist="'.$this->escapeAnnotateValue($artist).'"';
        }

        // Which playlist the rotation drew this from. Not read by the script;
        // it rides along in `on_metadata` so now-playing and the station
        // timeline can say where a track came from once the schedule can
        // switch playlists by time of day.
        $playlist = trim((string) $playlist);
        if ($playlist !== '') {
            $parts[] = 'playlist="'.$this->escapeAnnotateValue($playlist).'"';
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
    private function analysisAnnotations(?Track $track, ?float $playFor = null): array
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

        // Played for `$playFor` seconds from its start: the cue-out moves in
        // so the track ends on a hard start. It only ever moves earlier.
        if ($playFor !== null) {
            $cut = round(($cueIn ?? 0.0) + max(0.0, $playFor), 3);
            $cueOut = $cueOut === null ? $cut : min($cueOut, $cut);
        }

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
