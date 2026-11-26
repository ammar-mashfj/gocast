<?php

namespace App\Models;

use Database\Factories\LavaPaymentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * One lava.top charge: a pack, the first membership payment, or a renewal.
 *
 * `granted_at` is the once-only marker, set under a row lock, so a webhook
 * lava.top delivers twice grants once. `uuid` is the public id the dashboard
 * polls; `contract_id` is lava.top's id for the charge.
 *
 * @property int $id
 * @property string $uuid
 * @property int|null $user_id
 * @property int|null $product_id
 * @property int|null $discount_id
 * @property int|null $lava_membership_id
 * @property string $kind
 * @property string $product_name
 * @property int|null $plan_id
 * @property string|null $duration_unit
 * @property int|null $duration_count
 * @property string $list_price_usd
 * @property string|null $discount_code
 * @property string $discount_usd
 * @property string $amount_usd
 * @property string $email
 * @property string $method
 * @property string|null $contract_id
 * @property string|null $payment_url
 * @property string $status
 * @property Carbon|null $paid_at
 * @property Carbon|null $granted_at
 * @property Carbon|null $granted_until
 * @property string|null $review_reason
 * @property string $refunded_usd
 * @property list<array{id: string, type: string, amount: float, at: string}>|null $refunds
 * @property array<string, mixed>|null $payload
 * @property Carbon|null $reminded_7d_at
 * @property Carbon|null $reminded_1d_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class LavaPayment extends Model
{
    /** @use HasFactory<LavaPaymentFactory> */
    use HasFactory;

    public const KIND_PACK = 'pack';

    public const KIND_MEMBERSHIP = 'membership';

    public const KIND_RENEWAL = 'renewal';

    public const METHOD_CARD = 'card';

    public const METHOD_PAYPAL = 'paypal';

    public const METHODS = [self::METHOD_CARD, self::METHOD_PAYPAL];

    public const STATUS_NEW = 'new';

    public const STATUS_PAID = 'paid';

    public const STATUS_FAILED = 'failed';

    public const STATUS_REVIEW = 'review';

    public const STATUS_REFUNDED = 'refunded';

    public const STATUS_CHARGEBACK = 'chargeback';

    protected $guarded = [];

    protected static function booted(): void
    {
        static::creating(function (LavaPayment $payment) {
            $payment->uuid ??= (string) Str::uuid();
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
            'lava_membership_id' => 'integer',
            'duration_count' => 'integer',
            'list_price_usd' => 'decimal:2',
            'discount_usd' => 'decimal:2',
            'amount_usd' => 'decimal:2',
            'refunded_usd' => 'decimal:2',
            'refunds' => 'array',
            'paid_at' => 'datetime',
            'granted_at' => 'datetime',
            'granted_until' => 'datetime',
            'payload' => 'array',
            'reminded_7d_at' => 'datetime',
            'reminded_1d_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function membership(): BelongsTo
    {
        return $this->belongsTo(LavaMembership::class, 'lava_membership_id');
    }

    /**
     * Why a failed payment failed (a declined card, lava.top unreachable),
     * for the admin table. Kept out of review_reason: routine, not a task.
     */
    public function failureReason(): ?string
    {
        if ($this->status !== self::STATUS_FAILED) {
            return null;
        }

        $reason = $this->payload['errorMessage'] ?? $this->payload['error'] ?? null;

        return is_string($reason) && $reason !== '' ? $reason : null;
    }

    public function durationLabel(): ?string
    {
        return Product::labelFor($this->duration_unit, $this->duration_count);
    }

    public function isLifetime(): bool
    {
        return $this->duration_unit === Product::UNIT_LIFETIME;
    }

    /**
     * The term in the shape PlanTerm::apply() takes.
     *
     * @return array{label: string, weeks: int, months: int}|null
     */
    public function term(): ?array
    {
        $label = $this->durationLabel();

        if ($label === null) {
            return null;
        }

        return [
            'label' => $label,
            'weeks' => $this->duration_unit === 'week' ? $this->duration_count : 0,
            'months' => $this->duration_unit === 'month' ? $this->duration_count : 0,
        ];
    }
}
