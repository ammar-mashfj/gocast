<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Anonymous "notify me when this station goes live" opt-in.
 *
 * Captures intent now; delivery is queued from the live-transition handler
 * once the email worker is set up.
 */
#[Fillable(['station_id', 'email', 'notified_at'])]
class StationNotifySubscription extends Model
{
    protected function casts(): array
    {
        return [
            'notified_at' => 'datetime',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }
}
