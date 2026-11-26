<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A lava.top charge from the webhook: who paid, what for, and what it
 * granted. Nothing reads it to decide access; the account's own plan dates
 * do that. It is the record of the sale and the guard against retries.
 *
 * @property int $id
 * @property string $contract_id
 * @property string $event_type
 * @property string|null $product_id
 * @property string|null $email
 * @property int|null $user_id
 * @property string|null $amount
 * @property string|null $currency
 * @property int|null $months
 * @property Carbon|null $granted_until
 * @property string|null $review_reason
 * @property array<string, mixed> $payload
 */
class LavaSale extends Model
{
    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'amount' => 'decimal:2',
            'months' => 'integer',
            'granted_until' => 'datetime',
            'payload' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
