<?php

namespace App\Models;

use Database\Factories\InviteFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * An invitation code that puts whoever redeems it onto a plan.
 *
 * Minted from the admin panel, sent by hand inside an email or a post, and
 * redeemed either at registration (the code rides along in the sign-up
 * request) or from an existing account (POST /api/invites/redeem). Both paths
 * go through InviteRedemption, which is the only writer of `uses`.
 *
 * See the create_invites_table migration for why the columns are shaped the
 * way they are.
 *
 * @property int $id
 * @property string $code
 * @property int $plan_id
 * @property int|null $duration_days
 * @property string|null $label
 * @property int $max_uses
 * @property int $uses
 * @property Carbon|null $expires_at
 * @property int|null $created_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Plan $plan
 * @property-read Admin|null $creator
 */
class Invite extends Model
{
    /** @use HasFactory<InviteFactory> */
    use HasFactory;

    use LogsActivity;

    /**
     * Length of a generated code. 20 characters from a 62-symbol alphabet is
     * about 119 bits, so a code cannot be brute-forced through the public
     * lookup endpoint even without its rate limit.
     */
    public const CODE_LENGTH = 20;

    /**
     * `uses` is deliberately absent: InviteRedemption increments it with a
     * conditional UPDATE, and letting it be mass-assigned would invite a
     * second, racy way of writing it.
     */
    protected $fillable = [
        'code',
        'plan_id',
        'duration_days',
        'label',
        'max_uses',
        'expires_at',
        'created_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'duration_days' => 'integer',
            'max_uses' => 'integer',
            'uses' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public static function generateCode(): string
    {
        // Loop rather than trust the unique index alone: a collision would
        // otherwise surface to the admin as a 500 on a form submit.
        do {
            $code = Str::random(self::CODE_LENGTH);
        } while (self::where('code', $code)->exists());

        return $code;
    }

    /**
     * A readable code built from who the invite is for: "DJ Ammar" on Pro
     * becomes DJ-Ammar-GoCast-Pro. Casing is kept so the link reads the way
     * the name was typed; anything that is not a letter or digit becomes a
     * hyphen. A collision gets -2, -3 and so on, since two DJs can share a
     * name. Falls back to a random code when the label has nothing usable
     * in it.
     */
    public static function codeFor(?string $label, Plan $plan): string
    {
        $base = trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', (string) $label), '-');

        if ($base === '') {
            return self::generateCode();
        }

        $suffix = '-GoCast-'.trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', $plan->name), '-');

        // The column is 40 wide; leave room for the suffix and a counter.
        $base = Str::limit($base, 40 - strlen($suffix) - 3, '');
        $base = trim($base, '-');

        $code = $base.$suffix;
        $n = 2;

        while (self::where('code', $code)->exists()) {
            $code = "{$base}{$suffix}-{$n}";
            $n++;
        }

        return $code;
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'created_by');
    }

    /**
     * Every account this invite brought in. The attribution the admin page
     * is really for.
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * @param  Builder<Invite>  $query
     */
    public function scopeRedeemable(Builder $query): void
    {
        $query->whereColumn('uses', '<', 'max_uses')
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    public function isExhausted(): bool
    {
        return $this->uses >= $this->max_uses;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isRedeemable(): bool
    {
        return ! $this->isExhausted() && ! $this->isExpired();
    }

    /**
     * The link that goes in the email. Lands on the sign-up page with the
     * code in the query string; the page validates it on load and sends it
     * back with the registration.
     */
    public function url(): string
    {
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');

        return "{$frontendUrl}/auth/register?invite={$this->code}";
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['code', 'plan_id', 'duration_days', 'label', 'max_uses', 'uses', 'expires_at'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
