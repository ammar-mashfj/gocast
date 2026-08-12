<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Writes the per-station `playlist.m3u` consumed by Liquidsoap.
 *
 * Each track is written as a Liquidsoap `annotate:` URI carrying the
 * canonical title/artist from the DB — the m3u parser passes those
 * directly into the request's metadata, bypassing ID3 tag reads and
 * EXTINF parsing. That means the DB is the single source of truth for
 * now-playing metadata, regardless of whether the audio file has tags
 * or whether the title contains punctuation that LS's EXTINF parser
 * would mangle.
 *
 * Triggered by `reload()` via telnet whenever the track list changes
 * (add/remove/reorder); we deliberately don't use `reload_mode="watch"`
 * because some LS 2.x versions reset the queue cursor on watch reload.
 */
class PlaylistFileWriter
{
    public const FILENAME = 'playlist.m3u';

    /**
     * The Liquidsoap source name for the playlist — derived from the m3u
     * filename. Telnet commands use "{source}.reload", "{source}.skip" etc.
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

    public function __construct(
        private readonly LiquidsoapSupervisor $supervisor,
    ) {}

    /**
     * Rewrite the station's playlist file from its current Track rows.
     * Idempotent — safe to call after any track-table mutation.
     *
     * If the station has zero tracks, an empty m3u is written. Liquidsoap
     * tolerates this (the playlist source becomes fallible) and the
     * fallback chain demotes to silence.
     */
    public function write(Station $station): void
    {
        $dir = $this->stationDir($station);
        File::ensureDirectoryExists($dir);

        $tracks = $station->tracks()->get(['path', 'title', 'artist']);

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
            $absolutePath = self::CONTAINER_PLAYLIST_DIR.'/'.basename((string) $track->path);
            $lines[] = $this->annotateUri($track->title, $track->artist, $absolutePath);
        }

        // Write to a sibling .tmp and rename: rename(2) is atomic on the
        // same filesystem, so Liquidsoap can never read a half-written
        // playlist (matters because reload() is fired right after this
        // returns).
        $target = "{$dir}/".self::FILENAME;
        $tmp = $target.'.tmp';
        File::put($tmp, implode("\n", $lines)."\n");
        rename($tmp, $target);
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
     * Tell the running Liquidsoap container to re-read the m3u and rebuild
     * its queue. Call this only when the *list* changes (track added,
     * removed, reordered) — not when only title/artist tags change, since
     * that disrupts the currently playing track without a real benefit.
     *
     * Failures are swallowed and logged: a Liquidsoap that's down or
     * restarting will pick up the new file on its next start anyway.
     */
    public function reload(Station $station): void
    {
        try {
            $this->supervisor->telnet($station, self::LIQ_SOURCE.'.reload');
        } catch (Throwable $e) {
            Log::info('PlaylistFileWriter reload skipped', [
                'station' => $station->slug,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Build a Liquidsoap `annotate:` URI like:
     *   annotate:title="КАМИН",artist="EMIN feat. JONY":/data/playlists/abc.mp3
     *
     * Double quotes inside values are backslash-escaped, which is how
     * Liquidsoap's lexer expects them. Empty fields are omitted so the
     * downstream "no artist" case doesn't pollute `m["artist"]` with "".
     */
    private function annotateUri(string $title, ?string $artist, string $path): string
    {
        $parts = ['title="'.$this->escapeAnnotateValue($title).'"'];

        $artist = trim((string) $artist);
        if ($artist !== '') {
            $parts[] = 'artist="'.$this->escapeAnnotateValue($artist).'"';
        }

        return 'annotate:'.implode(',', $parts).':'.$path;
    }

    private function escapeAnnotateValue(string $value): string
    {
        return str_replace(['\\', '"'], ['\\\\', '\\"'], $value);
    }
}
