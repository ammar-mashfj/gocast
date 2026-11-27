<?php

namespace App\Models;

use Database\Factories\SpotlightFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * A message the dashboard opens as a dialog the next time a matching account
 * visits it: an offer, a new feature, a notice.
 *
 * Different from an announcement (ProductUpdate) in the one way that matters
 * for an offer: who sees it is decided when the dashboard asks, not when the
 * admin sends. So an account created after it went up still gets it, an
 * account that buys Pro mid-sale stops seeing the "get Pro" offer, and
 * nothing has to be cleaned up when `ends_at` passes. The bell's rows are
 * written once and never re-checked, which is right for "here is what
 * changed" and wrong for "this price ends on Monday".
 *
 * What each account did with it lives in `spotlight_user`. There is no
 * "close for good": however the dialog is closed, it becomes a chip in the
 * top bar that reopens it, until the spotlight ends or the account leaves
 * its audience. A dialog that could vanish for good would cost anybody who
 * shut it by reflex the offer.
 *
 * @property int $id
 * @property string $key
 * @property string $kind
 * @property string $title
 * @property string|null $chip_label
 * @property string|null $body
 * @property string|null $image_path
 * @property string|null $cta_label
 * @property string|null $cta_url
 * @property string $audience
 * @property string|null $preview_emails
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property int $priority
 * @property bool $active
 */
class Spotlight extends Model
{
    /** @use HasFactory<SpotlightFactory> */
    use HasFactory;

    use LogsActivity;

    public const KINDS = ['offer', 'feature', 'notice'];

    /**
     * Who it is for. `free` covers an account with no plan row too, the same
     * convention as everywhere else (see UserResource).
     */
    public const AUDIENCES = ['all', 'free', 'pro'];

    /** Same narrow shape as an announcement key, for the same reasons. */
    public const KEY_PATTERN = '/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/';

    protected $fillable = [
        'key',
        'kind',
        'title',
        'chip_label',
        'body',
        'image_path',
        'cta_label',
        'cta_url',
        'audience',
        'preview_emails',
        'starts_at',
        'ends_at',
        'priority',
        'active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'priority' => 'integer',
            'active' => 'boolean',
        ];
    }

    /**
     * @return BelongsToMany<User, $this>
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot(['seen_at', 'minimized_at', 'clicked_at'])
            ->withTimestamps();
    }

    /**
     * Switched on and inside its dates.
     */
    public function isRunning(?Carbon $at = null): bool
    {
        $at ??= now();

        return $this->active
            && ($this->starts_at === null || $this->starts_at->lte($at))
            && ($this->ends_at === null || $this->ends_at->gt($at));
    }

    public function matchesAudience(User $user): bool
    {
        $free = $user->plan === null || $user->plan->isFree();

        return match ($this->audience) {
            'free' => $free,
            'pro' => ! $free,
            default => true,
        };
    }

    /**
     * The test list. These accounts see it whatever its state or dates, so
     * one can be read in the real dashboard before it goes out — an
     * inactive spotlight with your own address here is a draft.
     *
     * @return list<string>
     */
    public function previewEmails(): array
    {
        return collect(preg_split('/[\s,;]+/', (string) $this->preview_emails))
            ->map(fn (string $email) => Str::lower(trim($email)))
            ->filter()
            ->values()
            ->all();
    }

    public function isPreviewFor(User $user): bool
    {
        return in_array(Str::lower($user->email), $this->previewEmails(), true);
    }

    public function isVisibleTo(User $user): bool
    {
        if ($this->isPreviewFor($user)) {
            return true;
        }

        return $this->isRunning() && $this->matchesAudience($user);
    }

    /**
     * Everything this account should be able to see right now, most important
     * first.
     *
     * Filtered in PHP rather than SQL. The table holds a handful of rows that
     * an admin wrote by hand, and the audience rule reads the plan through the
     * same model method everything else uses instead of a second copy in a
     * query.
     *
     * @return Collection<int, Spotlight>
     */
    public static function visibleTo(User $user): Collection
    {
        $user->loadMissing('plan');

        return static::query()
            ->where(fn ($query) => $query->where('active', true)->orWhereNotNull('preview_emails'))
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now())->orWhereNotNull('preview_emails'))
            ->orderByDesc('priority')
            ->orderByDesc('id')
            ->get()
            ->filter(fn (Spotlight $spotlight) => $spotlight->isVisibleTo($user))
            ->values();
    }

    /**
     * The body as HTML. Admin-written, but rendered with raw HTML stripped and
     * unsafe links refused anyway: it lands in every matching dashboard, and a
     * pasted snippet from somewhere else should not be able to carry a script.
     */
    public function bodyHtml(): ?string
    {
        if ($this->body === null || trim($this->body) === '') {
            return null;
        }

        return trim(Str::markdown($this->body, [
            'html_input' => 'strip',
            'allow_unsafe_links' => false,
        ]));
    }

    /**
     * Where the uploaded image is stored, on the public disk. The path is
     * stored rather than the URL so the URL follows APP_URL wherever the
     * database is restored.
     */
    public const IMAGE_DIRECTORY = 'uploads/spotlights';

    public function imageUrl(): ?string
    {
        return $this->image_path === null ? null : Storage::disk('public')->url($this->image_path);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()->logFillable()->logOnlyDirty()->dontLogEmptyChanges();
    }
}
