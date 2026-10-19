<?php

namespace App\Models;

use Database\Factories\PaymentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * One checkout: what was bought, at what price, and how far the payment got.
 *
 * Everything that decides the grant is copied from the product and discount
 * at checkout (`product_name`, `plan_id`, the duration, the prices), so an
 * admin editing a product afterwards cannot change what somebody paid for.
 *
 * `status` is OxaPay's invoice status, lower-cased, plus our own
 * `failed` for an invoice OxaPay refused to create. `granted_at` is the
 * once-only marker: PaymentProcessor grants under a row lock and only while it
 * is null, which is what makes a redelivered `paid` webhook harmless.
 *
 * `uuid` is the public id — the OxaPay `order_id`, and the one the dashboard
 * polls — so the sequential primary key never leaves the server.
 *
 * @property int $id
 * @property string $uuid
 * @property int|null $user_id
 * @property int|null $product_id
 * @property int|null $discount_id
 * @property string $product_name
 * @property string $grant_type
 * @property int|null $plan_id
 * @property string|null $duration_unit
 * @property int|null $duration_count
 * @property string $list_price_usd
 * @property string|null $discount_code
 * @property string $discount_usd
 * @property string $amount_usd
 * @property string $provider
 * @property bool $sandbox
 * @property string|null $track_id
 * @property string|null $payment_url
 * @property string $status
 * @property Carbon|null $invoice_expires_at
 * @property Carbon|null $paid_at
 * @property Carbon|null $granted_at
 * @property Carbon|null $granted_until
 * @property string|null $review_reason
 * @property array<string, mixed>|null $payload
 * @property Carbon|null $reminded_7d_at
 * @property Carbon|null $reminded_1d_at
 * @property Carbon $created_at
 * @property-read User|null $user
 * @property-read Product|null $product
 * @property-read Plan|null $plan
 */
class Payment extends Model
{
    /** @use HasFactory<PaymentFactory> */
    use HasFactory;

    public const STATUS_NEW = 'new';

    public const STATUS_WAITING = 'waiting';

    public const STATUS_PAYING = 'paying';

    public const STATUS_PAID = 'paid';

    public const STATUS_MANUAL_ACCEPT = 'manual_accept';

    public const STATUS_UNDERPAID = 'underpaid';

    public const STATUS_REFUNDING = 'refunding';

    public const STATUS_REFUNDED = 'refunded';

    public const STATUS_EXPIRED = 'expired';

    /** Ours, not OxaPay's: the invoice could not be created. */
    public const STATUS_FAILED = 'failed';

    /** @var list<string> */
    public const STATUSES = [
        self::STATUS_NEW,
        self::STATUS_WAITING,
        self::STATUS_PAYING,
        self::STATUS_PAID,
        self::STATUS_MANUAL_ACCEPT,
        self::STATUS_UNDERPAID,
        self::STATUS_REFUNDING,
        self::STATUS_REFUNDED,
        self::STATUS_EXPIRED,
        self::STATUS_FAILED,
    ];

    /** Money has arrived and the purchase should be granted. */
    public const SETTLED_STATUSES = [self::STATUS_PAID, self::STATUS_MANUAL_ACCEPT];

    /**
     * Still able to become paid, so worth asking OxaPay about. `underpaid` is
     * here because accepting it in the OxaPay panel turns it into
     * `manual_accept`.
     */
    public const OPEN_STATUSES = [self::STATUS_NEW, self::STATUS_WAITING, self::STATUS_PAYING, self::STATUS_UNDERPAID];

    protected $guarded = [];

    protected static function booted(): void
    {
        static::creating(function (Payment $payment) {
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
            'duration_count' => 'integer',
            'list_price_usd' => 'decimal:2',
            'discount_usd' => 'decimal:2',
            'amount_usd' => 'decimal:2',
            'sandbox' => 'boolean',
            'invoice_expires_at' => 'datetime',
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

    public function discount(): BelongsTo
    {
        return $this->belongsTo(Discount::class);
    }

    public function scopeOpen(Builder $query): void
    {
        $query->whereIn('status', self::OPEN_STATUSES);
    }

    public function isSettled(): bool
    {
        return in_array($this->status, self::SETTLED_STATUSES, true);
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
     * The term in the shape PlanTerm::endOfTerm() takes.
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
