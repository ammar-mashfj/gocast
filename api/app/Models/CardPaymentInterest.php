<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An account that asked to hear when card payments arrive. Written by
 * BillingController::notifyCards(); `notified_at` is for whoever sends that
 * email one day, so nobody is told twice.
 *
 * @property int $id
 * @property int $user_id
 * @property string $email
 * @property Carbon|null $notified_at
 * @property Carbon $created_at
 */
class CardPaymentInterest extends Model
{
    protected $fillable = ['user_id', 'email'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['notified_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
