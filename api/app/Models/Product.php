<?php

namespace App\Models;

use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Something the checkout sells, at its list price.
 *
 * Edited in /admin/billing/products, so a new term or a new price is never a
 * code change. What buying it does is `grant_type` — see
 * App\Services\Billing\Grants — and for `plan_term`, the plan and how long.
 *
 * `active` decides whether it can be bought at all; `visible` only whether the
 * Get Pro dialog lists it. A hidden, active product is bought through a direct
 * link (`/dashboard/settings?product=slug`) — a test product, a private offer.
 *
 * @property int $id
 * @property string $slug
 * @property string $name
 * @property string|null $description
 * @property string|null $badge
 * @property string $price_usd
 * @property string $grant_type
 * @property int|null $plan_id
 * @property string|null $duration_unit
 * @property int|null $duration_count
 * @property bool $active
 * @property bool $visible
 * @property int $sort
 * @property-read Plan|null $plan
 */
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory;

    use LogsActivity;

    public const GRANT_PLAN_TERM = 'plan_term';

    /** @var list<string> */
    public const GRANT_TYPES = [self::GRANT_PLAN_TERM];

    /**
     * A term's unit. `lifetime` has no count and no end: buying it puts the
     * account on the plan with no end date.
     */
    public const UNIT_LIFETIME = 'lifetime';

    /** @var list<string> */
    public const DURATION_UNITS = ['week', 'month', self::UNIT_LIFETIME];

    protected $fillable = [
        'slug',
        'name',
        'description',
        'badge',
        'price_usd',
        'grant_type',
        'plan_id',
        'duration_unit',
        'duration_count',
        'active',
        'visible',
        'sort',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price_usd' => 'decimal:2',
            'plan_id' => 'integer',
            'duration_count' => 'integer',
            'active' => 'boolean',
            'visible' => 'boolean',
            'sort' => 'integer',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function discounts(): BelongsToMany
    {
        return $this->belongsToMany(Discount::class);
    }

    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    public function scopeListed(Builder $query): void
    {
        $query->where('active', true)->where('visible', true)->orderBy('sort')->orderBy('id');
    }

    public function isLifetime(): bool
    {
        return $this->duration_unit === self::UNIT_LIFETIME;
    }

    public function priceCents(): int
    {
        return (int) round(((float) $this->price_usd) * 100);
    }

    /**
     * "3 months", "1 week", "Lifetime" — the term in words, as emails and the
     * dialog say it. Null for a product with no term.
     */
    public function durationLabel(): ?string
    {
        return self::labelFor($this->duration_unit, $this->duration_count);
    }

    public static function labelFor(?string $unit, ?int $count): ?string
    {
        if ($unit === self::UNIT_LIFETIME) {
            return 'Lifetime';
        }

        if ($unit === null || $count === null || $count < 1) {
            return null;
        }

        return $count.' '.($count === 1 ? $unit : $unit.'s');
    }

    /**
     * How many months the term spans, for a per-month price. Weeks count as
     * 12/52 of a month so a weekly product still compares sensibly.
     */
    public function monthsEquivalent(): ?float
    {
        return match ($this->duration_unit) {
            'month' => (float) $this->duration_count,
            'week' => $this->duration_count * 12 / 52,
            default => null,
        };
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()->logFillable()->logOnlyDirty()->dontLogEmptyChanges();
    }
}
