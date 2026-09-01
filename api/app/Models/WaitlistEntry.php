<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int|null $user_id
 * @property string $email
 * @property string $plan
 * @property string|null $social
 * @property string|null $message
 * @property string $status
 * @property Carbon|null $reviewed_at
 * @property int|null $reviewed_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read User|null $user
 * @property-read Admin|null $reviewer
 */
class WaitlistEntry extends Model
{
    /** Nobody has decided yet. The only state the admin queue shows by default. */
    public const STATUS_PENDING = 'pending';

    /** Granted: the requester's account has been moved onto the plan they asked for. */
    public const STATUS_APPROVED = 'approved';

    /**
     * Declined, or — for a Custom enquiry — handled somewhere else. Pure
     * bookkeeping: it hides the row from the queue and does nothing else.
     */
    public const STATUS_REJECTED = 'rejected';

    /** @var list<string> */
    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
    ];

    /**
     * Review columns are deliberately absent.
     *
     * The only writer of this table from the outside is WaitlistController,
     * which upserts whatever the public form sent. Leaving `status` mass
     * assignable would put "grant me Pro" one crafted field away from the
     * request body that creates the row.
     */
    protected $fillable = [
        'user_id',
        'email',
        'plan',
        'social',
        'message',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * The account behind a Pro request, or null for a public Custom enquiry.
     *
     * This is what a reviewer actually opens before granting access — the
     * stations, the library, whether anything has ever gone on air. The
     * `social` link answers "are they real"; this answers "are they using it".
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The admin who decided. Null while pending, and also on a decision made
     * by an admin account that has since been deleted — see the migration.
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'reviewed_by');
    }

    /**
     * @param  Builder<WaitlistEntry>  $query
     */
    public function scopePending(Builder $query): void
    {
        $query->where('status', self::STATUS_PENDING);
    }

    /**
     * Can this request actually be granted?
     *
     * Two conditions, and the second is the one that catches people out: a
     * Custom enquiry arrives from a stranger evaluating the product, with no
     * account to move onto a plan. Approving it is not a stricter version of
     * approving a Pro request — it is meaningless. Those get dismissed once
     * they have been answered by email.
     */
    public function isGrantable(): bool
    {
        return $this->status === self::STATUS_PENDING && $this->user_id !== null;
    }

    /**
     * Record a decision. Never mass assigned — see $fillable.
     */
    public function markReviewed(string $status, ?Admin $admin): void
    {
        $this->forceFill([
            'status' => $status,
            'reviewed_at' => now(),
            'reviewed_by' => $admin?->id,
        ])->save();
    }

    /**
     * Put the request back in the queue, forgetting who decided what.
     *
     * Used by a revoke and by a resubmit after a rejection. The old reviewer
     * is cleared rather than kept: leaving it set would credit the next
     * decision to whoever made the last one.
     */
    public function reopen(): void
    {
        $this->forceFill([
            'status' => self::STATUS_PENDING,
            'reviewed_at' => null,
            'reviewed_by' => null,
        ])->save();
    }
}
