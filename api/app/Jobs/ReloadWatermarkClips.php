<?php

namespace App\Jobs;

use App\Models\Station;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tell every running station to re-read the watermark clip directory.
 *
 * The rendered script sets `reload_mode = "never"` on that playlist, so a clip
 * added or removed on disk is invisible to a container that is already up
 * until this runs. Without it, a new clip would take effect at each station's
 * next restart — which for a healthy station is never.
 *
 * Queued rather than inline because this fans out one telnet connection per
 * running station, and the admin request that triggers it should not wait on
 * the whole fleet.
 *
 * Best-effort per station, exactly like PlaylistFileWriter::reload(): a
 * container that is down or unreachable reads the directory fresh when it next
 * boots, so a failure here delays a clip, it never loses one.
 */
class ReloadWatermarkClips implements ShouldQueue
{
    use Queueable;

    /**
     * The `id` given to the watermark playlist in the .liq template. Telnet
     * exposes each source's commands as "{id}.{command}".
     */
    public const LIQ_SOURCE = 'watermark';

    public function handle(LiquidsoapSupervisor $supervisor): void
    {
        // Skipped entirely when the install-wide switch is off: the source is
        // not rendered into the script at all, so every call would answer
        // "unknown command".
        if (! (bool) config('liquidsoap.watermark_enabled')) {
            return;
        }

        Station::query()->running()->cursor()->each(function (Station $station) use ($supervisor): void {
            try {
                $supervisor->telnet($station, self::LIQ_SOURCE.'.reload');
            } catch (Throwable $e) {
                Log::info('Watermark clip reload skipped', [
                    'station' => $station->slug,
                    'error' => $e->getMessage(),
                ]);
            }
        });
    }
}
