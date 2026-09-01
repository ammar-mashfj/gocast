<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One station, one day, one country — the part of the audience picture that
 * has to outlive the raw sessions it came from.
 *
 * Written by `listeners:rollup` from sessions as they close, attributed to the
 * day the session STARTED.
 */
class ListenerGeoDaily extends Model
{
    protected $table = 'listener_geo_daily';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'day' => 'date',
            'sessions' => 'integer',
            'listener_seconds' => 'integer',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }
}
