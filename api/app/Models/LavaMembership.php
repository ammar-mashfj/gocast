<?php

namespace App\Models;

use Database\Factories\LavaMembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * One monthly lava.top membership, charged by lava.top every month until it
 * is cancelled. Each charge is a LavaPayment; this row only says whether more
 * are coming.
 *
 * @property int $id
 * @property string $uuid
 * @property int|null $user_id
 * @property int|null $plan_id
 * @property string $contract_id
 * @property string $email
 * @property string $status
 * @property Carbon|null $cancelled_at
 * @property Carbon|null $ends_at
 * @property array<string, mixed>|null $payload
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class LavaMembership extends Model
{
    /** @use HasFactory<LavaMembershipFactory> */
    use HasFactory;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_CANCELLED = 'cancelled';

    protected $guarded = [];

    protected static function booted(): void
    {
        static::creating(function (LavaMembership $membership) {
            $membership->uuid ??= (string) Str::uuid();
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'plan_id' => 'integer',
            'cancelled_at' => 'datetime',
            'ends_at' => 'datetime',
            'payload' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LavaPayment::class);
    }

    /**
     * When lava.top charges next: a month after the last charge. Not the
     * account's plan end, which a pack bought on top pushes months out.
     */
    public function nextChargeAt(): ?Carbon
    {
        if (! $this->isActive()) {
            return null;
        }

        $last = $this->payments()->whereNotNull('paid_at')->max('paid_at');

        return $last ? Carbon::parse($last)->addMonthNoOverflow() : null;
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /** The account's membership that lava.top is still charging, if any. */
    public static function activeFor(User $user): ?self
    {
        return self::where('user_id', $user->id)
            ->where('status', self::STATUS_ACTIVE)
            ->latest('id')
            ->first();
    }
}
