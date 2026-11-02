<?php

namespace App\Console\Commands;

use App\Models\Station;
use App\Rules\NoLiquidsoapInterpolation;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Lists stations whose name, description or genre contains `#{` — the
 * Liquidsoap interpolation that ran shell commands in a station container on
 * 2026-11-02 (see LiquidsoapSupervisor::renderStationMeta).
 *
 * Read-only on purpose: it finds, a person decides. Trashed stations are
 * included because a restore would render them again, and the owner's email is
 * shown because that is who has to be dealt with.
 */
class FindLiqInjection extends Command
{
    protected $signature = 'stations:find-liq-injection';

    protected $description = 'List stations whose name, description or genre contains a Liquidsoap #{ interpolation (read-only)';

    private const FIELDS = ['name', 'description', 'genre'];

    public function handle(): int
    {
        $stations = Station::withTrashed()
            ->with('user:id,email')
            ->where(function ($query) {
                foreach (self::FIELDS as $field) {
                    $query->orWhere($field, 'like', '%#{%');
                }
            })
            ->orderBy('id')
            ->get();

        if ($stations->isEmpty()) {
            $this->info('No station text contains "#{".');

            return self::SUCCESS;
        }

        $rows = [];
        foreach ($stations as $station) {
            foreach (self::FIELDS as $field) {
                $value = (string) $station->{$field};
                if (! NoLiquidsoapInterpolation::contains($value)) {
                    continue;
                }

                $rows[] = [
                    $station->id,
                    $station->slug,
                    $station->user?->email ?? '—',
                    $station->trashed() ? 'trashed' : $station->desired_state,
                    $field,
                    Str::limit(str_replace(["\r", "\n"], ' ', $value), 160),
                ];
            }
        }

        $this->table(['id', 'slug', 'owner', 'state', 'field', 'value'], $rows);
        $this->warn("{$stations->count()} station(s) found. Nothing was changed.");

        return self::SUCCESS;
    }
}
