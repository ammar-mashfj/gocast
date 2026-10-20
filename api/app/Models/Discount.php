<?php

namespace App\Models;

use Database\Factories\DiscountFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * A price reduction: a coupon when it has a `code`, an automatic sale when it
 * does not.
 *
 * Exactly one of `percent_off` / `amount_off_usd` is set. No attached products
 * means it applies to every product. `redemptions_count` goes up when a
 * payment using it is confirmed, not at checkout — an abandoned checkout must
 * not use up a single-use code. See App\Services\Billing\Pricing for how a
 * discount is chosen and checked.
 *
 * @property int $id
 * @property string $name
 * @property string|null $code
 * @property string|null $percent_off
 * @property string|null $amount_off_usd
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property int|null $max_redemptions
 * @property int|null $per_user_limit
 * @property int $redemptions_count
 * @property bool $active
 */
class Discount extends Model
{
    /** @use HasFactory<DiscountFactory> */
    use HasFactory;

    use LogsActivity;

    protected $fillable = [
        'name',
        'code',
        'percent_off',
        'amount_off_usd',
        'starts_at',
        'ends_at',
        'max_redemptions',
        'per_user_limit',
        'active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'percent_off' => 'decimal:2',
            'amount_off_usd' => 'decimal:2',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'max_redemptions' => 'integer',
            'per_user_limit' => 'integer',
            'redemptions_count' => 'integer',
            'active' => 'boolean',
        ];
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class);
    }

    /**
     * Codes are matched case-insensitively by storing them upper-cased, so
     * "founder-maf" and "FOUNDER-MAF" are the same coupon.
     */
    public static function normalizeCode(?string $code): ?string
    {
        $code = strtoupper(trim((string) $code));

        return $code === '' ? null : $code;
    }

    public function isCoupon(): bool
    {
        return $this->code !== null;
    }

    /** Switched on and inside its dates. Says nothing about redemptions. */
    public function isRunning(?Carbon $at = null): bool
    {
        $at ??= now();

        return $this->active
            && ($this->starts_at === null || $this->starts_at->lte($at))
            && ($this->ends_at === null || $this->ends_at->gt($at));
    }

    public function isUsedUp(): bool
    {
        return $this->max_redemptions !== null && $this->redemptions_count >= $this->max_redemptions;
    }

    /**
     * Applies to $product. Uses the loaded relation when there is one, so the
     * catalog can check every product against every sale without a query each.
     */
    public function appliesTo(Product $product): bool
    {
        $products = $this->relationLoaded('products') ? $this->products : $this->products()->get();

        return $products->isEmpty() || $products->contains('id', $product->id);
    }

    /** How many cents this takes off a price of $priceCents, never more than the price. */
    public function offCents(int $priceCents): int
    {
        $off = $this->percent_off !== null
            ? (int) round($priceCents * ((float) $this->percent_off) / 100)
            : (int) round(((float) $this->amount_off_usd) * 100);

        return max(0, min($priceCents, $off));
    }

    public function scopeAutomatic(Builder $query): void
    {
        $query->whereNull('code');
    }

    /** "20% off" / "$5 off" — for the admin list and the dialog. */
    public function describe(): string
    {
        if ($this->percent_off !== null) {
            return rtrim(rtrim($this->percent_off, '0'), '.').'% off';
        }

        return '$'.rtrim(rtrim((string) $this->amount_off_usd, '0'), '.').' off';
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()->logFillable()->logOnlyDirty()->dontLogEmptyChanges();
    }
}
