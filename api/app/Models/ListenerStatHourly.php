<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One station, one hour, permanently.
 *
 * Written in two passes that never touch the same columns:
 *
 *   • `listeners:sweep`, every minute, samples live concurrency and folds it
 *     into peak_listeners / listener_minutes / sampled_minutes.
 *   • `listeners:rollup`, after the hour closes, counts the session rows that
 *     started in it and fills sessions_started / unique_listeners /
 *     qualified_listens.
 *
 * Rows are sparse ON PURPOSE: a minute with no listeners writes nothing, so a
 * dormant station costs zero rows instead of 24 empty ones a day. A missing
 * row means "nobody was listening", and charts should fill gaps with 0.
 */
class ListenerStatHourly extends Model
{
    protected $table = 'listener_stats_hourly';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'hour' => 'datetime',
            'peak_listeners' => 'integer',
            'listener_minutes' => 'integer',
            'sampled_minutes' => 'integer',
            'sessions_started' => 'integer',
            'unique_listeners' => 'integer',
            'qualified_listens' => 'integer',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }
}
