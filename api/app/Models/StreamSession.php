<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks an individual BROADCAST session for a station — a human holding the
 * microphone, from the moment they connect until they drop.
 *
 * NOT {@see ListenerSession}, which is the audience. The names are one word
 * apart and describe opposite ends of the pipe. Rows here exist only for live
 * broadcasts: a station on air with AutoDJ records nothing, so anything
 * derived from this table measures LIVE airtime and never total airtime.
 *
 * Listening time and audience size are no longer this table's business. It
 * carried a `total_listener_minutes` column that nothing ever wrote, and the
 * question now has a real answer in listener_stats_hourly, which can also see
 * AutoDJ hours and Icecast listeners that a broadcaster-scoped row never
 * could. `peak_listeners` stays because it is genuinely about the broadcast:
 * the high-water mark reached while this person was on air.
 */
class StreamSession extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'peak_listeners' => 'integer',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }
}
