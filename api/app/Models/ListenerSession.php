<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One person, listening to one station, once.
 *
 * NOT {@see StreamSession} — that is a BROADCASTER holding the microphone.
 * This is the audience. The two names are one word apart and describe
 * opposite ends of the pipe, so check which one you want before writing a
 * query against either.
 *
 * The row is created when the player asks for a token, kept alive by that
 * player checking in, and closed by `listeners:sweep` once the check-ins stop.
 * Nothing about it is authenticated: a listener is anonymous, and the only
 * things stored are a country, a coarse device class, and a hash that cannot
 * be linked back to an IP or across days.
 *
 * These rows are PRUNED (see `analytics.retention_days`). Anything that has to
 * survive longer belongs in listener_stats_hourly or listener_geo_daily.
 */
class ListenerSession extends Model
{
    use HasFactory;

    /** Ids are minted by ListenerAnalytics, not by the database. */
    public $incrementing = false;

    protected $keyType = 'string';

    /**
     * No created_at/updated_at: `started_at` is the creation time and
     * `last_seen_at` is the update time, and carrying a second pair of
     * timestamps that mean the same thing invites them to disagree.
     */
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'ended_at' => 'datetime',
            'seconds' => 'integer',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /** Sessions that have not been closed yet — still listening, or about to be swept. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('ended_at');
    }

    /**
     * Sessions long enough to count as a real listen rather than a click.
     * See `analytics.min_listen_seconds` for why the threshold exists.
     */
    public function scopeQualified(Builder $query): Builder
    {
        return $query->where('seconds', '>=', (int) config('analytics.min_listen_seconds', 60));
    }
}
