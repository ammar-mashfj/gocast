<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Console\Command;
use Throwable;

/**
 * Removes per-station Liquidsoap containers that no longer correspond to a
 * Station row.
 *
 * Why orphans happen: container lifecycle is driven by the StationObserver,
 * but the containers run with `--restart=unless-stopped` so Docker keeps
 * them alive across api-container restarts, host reboots, and DB resets.
 * If a station is removed via a path that bypasses the observer (DB seed,
 * manual SQL DELETE, hard-delete in a script, test runs creating throwaway
 * stations), the matching container survives indefinitely.
 *
 * This command is the safety net: list every gocast-liquidsoap-* container,
 * diff against `stations.slug` (including soft-deletes — we don't want to
 * kill a station the user might restore), and `docker rm -f` the rest.
 *
 * Run it:
 *   php artisan stations:reconcile           # remove orphans
 *   php artisan stations:reconcile --dry-run # report only
 *
 * Already wired into deploy.sh after stations:relaunch so every deploy
 * leaves the daemon in the right shape.
 */
class ReconcileStations extends Command
{
    protected $signature = 'stations:reconcile {--dry-run : List orphans without removing them}';

    protected $description = 'Remove Liquidsoap containers that no longer match a Station row';

    public function handle(LiquidsoapSupervisor $supervisor): int
    {
        $containers = $supervisor->listManagedContainers();

        if ($containers === []) {
            $this->info('No Liquidsoap containers running.');

            return self::SUCCESS;
        }

        // Pull slugs *including* soft-deleted stations — a user-initiated
        // soft delete already brings the container down via the observer,
        // and we want a restore to find its container still in place.
        $knownSlugs = Station::withTrashed()->pluck('slug')->all();
        $knownSet = array_flip($knownSlugs);

        $orphans = [];
        foreach ($containers as $name) {
            $slug = LiquidsoapSupervisor::slugFromContainerName($name);
            if ($slug === null) {
                continue;
            }
            if (! isset($knownSet[$slug])) {
                $orphans[] = $name;
            }
        }

        if ($orphans === []) {
            $this->info(sprintf('%d container(s), all match a station. Nothing to do.', count($containers)));

            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        $this->warn(sprintf(
            'Found %d orphan container(s)%s:',
            count($orphans),
            $dryRun ? ' (dry run — not removing)' : '',
        ));

        $failed = 0;
        foreach ($orphans as $name) {
            if ($dryRun) {
                $this->line("  • {$name}");

                continue;
            }

            try {
                $supervisor->removeContainer($name);
                $this->line("  ✓ removed {$name}");
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$name}: {$e->getMessage()}");
            }
        }

        if ($failed > 0) {
            $this->warn("{$failed} removal(s) failed.");

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
