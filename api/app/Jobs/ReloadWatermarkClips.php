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
 * NOT IN USE: the watermark is switched off (LIQUIDSOAP_WATERMARK_ENABLED=false)
 * and not wanted any more, so handle() returns before touching any station.
 * Before it is ever turned back on, this job must change: `watermark.reload`
 * runs set_queue()/fetch() on the telnet thread, outside the clock thread,
 * which is the lock race that froze unity-radio on 2026-11-10 (THE RULE in
 * resources/views/liquidsoap/station.blade.php). Drop the live reload and let
 * clips apply when containers are recreated, or make it only set a flag the
 * clock thread acts on. The full checklist is in config/liquidsoap.php under
 * "Free-tier watermark".
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

        Station::query()->running()->onContainer()->cursor()->each(function (Station $station) use ($supervisor): void {
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
