<?php

namespace App\Jobs;

use App\Services\IcecastAdmin;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Disconnect the audience of a station that has just been turned off or
 * deleted: listeners still on its mount, and those Icecast's fallback already
 * parked on /standby from it. See IcecastAdmin::dropListeners().
 *
 * Queued rather than inline because it is several Icecast admin calls plus
 * one per listener, and the power button (and the sweep, stopping many
 * stations in one pass) must not wait on a slow Icecast. Takes the mount, not
 * the station: a deleted station is out of reach of the default query scope by
 * the time this runs.
 *
 * Best-effort, one try: stations:reconcile disconnects whoever this misses
 * within a minute.
 */
class DropStationListeners implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public string $mount) {}

    public function handle(IcecastAdmin $icecast): void
    {
        $icecast->dropListeners($this->mount);
    }
}
