<?php

namespace App\Services;

use getID3;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The platform's own audio: the free-tier watermark clips.
 *
 * One directory for the whole box (config `liquidsoap.system_dir`), bind
 * mounted read-only into every station container at /data/system. Liquidsoap
 * points a `playlist()` at the directory rather than at a filename, so
 * whatever is in here rotates at random and an EMPTY directory simply means
 * stations play unmarked — never that they fail to start.
 *
 * Deliberately not a database table. The directory is the source of truth,
 * because that is what Liquidsoap reads: a table could disagree with the disk,
 * and the disk would win silently. Anything dropped in over SSH shows up here
 * for the same reason.
 */
class WatermarkClipLibrary
{
    /**
     * Formats Liquidsoap decodes out of the box. Anything else would be
     * accepted here and then silently skipped at play time.
     *
     * @var list<string>
     */
    public const ALLOWED_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'flac', 'wav', 'm4a', 'aac'];

    private string $dir;

    public function __construct()
    {
        $this->dir = rtrim((string) config('liquidsoap.system_dir', '/var/gocast/system'), '/');
    }

    public function directory(): string
    {
        return $this->dir;
    }

    public function exists(): bool
    {
        return is_dir($this->dir);
    }

    public function writable(): bool
    {
        return is_dir($this->dir) && is_writable($this->dir);
    }

    /**
     * Every playable clip in the directory, name-sorted.
     *
     * @return Collection<int, array{name: string, bytes: int, duration: float|null, modified_at: Carbon}>
     */
    public function all(): Collection
    {
        if (! $this->exists()) {
            return collect();
        }

        return collect(File::files($this->dir))
            ->filter(fn ($file) => in_array(strtolower($file->getExtension()), self::ALLOWED_EXTENSIONS, true))
            ->map(fn ($file) => [
                'name' => $file->getFilename(),
                'bytes' => (int) $file->getSize(),
                'duration' => $this->duration($file->getPathname()),
                'modified_at' => Carbon::createFromTimestamp($file->getMTime()),
            ])
            ->sortBy('name')
            ->values();
    }

    public function totalBytes(): int
    {
        return (int) $this->all()->sum('bytes');
    }

    /**
     * Move an uploaded clip into the directory and return its stored name.
     *
     * The name is rebuilt from a slug rather than trusted: this path is a
     * shared directory mounted into every container on the box, so a caller
     * must never be able to steer where the file lands.
     */
    public function store(UploadedFile $file): string
    {
        File::ensureDirectoryExists($this->dir);
        // Liquidsoap runs as UID 100 inside the container and the api process
        // may create this as root — same reason TrackImporter chmods the
        // per-station directories. Without it the clip is invisible to the
        // very process that is meant to play it.
        @chmod($this->dir, 0755);

        $extension = strtolower($file->getClientOriginalExtension() ?: 'mp3');

        if (! in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            throw new RuntimeException("Unsupported clip format: .{$extension}");
        }

        $stem = Str::slug(pathinfo((string) $file->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'clip';
        $name = $this->uniqueName($stem, $extension);

        $file->move($this->dir, $name);
        @chmod($this->dir.'/'.$name, 0644);

        return $name;
    }

    /**
     * Delete one clip. Returns false when it was already gone, which is not
     * an error worth surfacing — the desired end state holds either way.
     */
    public function delete(string $filename): bool
    {
        $path = $this->resolve($filename);

        if ($path === null || ! is_file($path)) {
            return false;
        }

        return @unlink($path);
    }

    /**
     * Map a caller-supplied name onto a real path inside the directory, or
     * null if it is not one of ours.
     *
     * basename() alone would stop `../`, but the containment check is what
     * makes that guarantee independent of it — this deletes files on a shared
     * volume, so one guard is not enough.
     */
    private function resolve(string $filename): ?string
    {
        $name = basename(trim($filename));

        if ($name === '' || $name === '.' || $name === '..') {
            return null;
        }

        if (! in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), self::ALLOWED_EXTENSIONS, true)) {
            return null;
        }

        $path = $this->dir.'/'.$name;
        $real = realpath($path);

        if ($real === false || ! str_starts_with($real, realpath($this->dir).'/')) {
            return null;
        }

        return $real;
    }

    /**
     * Never overwrite an existing clip: an operator replacing "powered-by.mp3"
     * with a new take should be able to hear both before removing one.
     */
    private function uniqueName(string $stem, string $extension): string
    {
        $name = $stem.'.'.$extension;
        $suffix = 2;

        while (file_exists($this->dir.'/'.$name)) {
            $name = $stem.'-'.$suffix.'.'.$extension;
            $suffix++;
        }

        return $name;
    }

    /**
     * Best-effort duration, same approach as TrackImporter::readTags(). A clip
     * whose length cannot be read is still perfectly playable, so this never
     * throws — the UI just shows nothing.
     */
    private function duration(string $path): ?float
    {
        if (! class_exists(getID3::class)) {
            return null;
        }

        try {
            $info = (new getID3)->analyze($path);
        } catch (\Throwable) {
            return null;
        }

        $seconds = $info['playtime_seconds'] ?? null;

        return is_numeric($seconds) ? (float) $seconds : null;
    }
}
