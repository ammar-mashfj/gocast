<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One address that asked us to stop sending it outreach.
 *
 * See the create_email_suppressions_table migration for what this list does
 * and does not govern. The short version: invites, not account mail.
 *
 * @property int $id
 * @property string $email
 * @property string $reason
 * @property int|null $invite_id
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class EmailSuppression extends Model
{
    public const REASON_UNSUBSCRIBED = 'unsubscribed';

    protected $fillable = [
        'email',
        'reason',
        'invite_id',
    ];

    /**
     * Addresses are compared case-insensitively by MySQL's default collation,
     * which is what you want — nobody who typed Rae@Example.com expects to
     * start hearing from us again.
     */
    public static function suppresses(string $email): bool
    {
        return static::where('email', $email)->exists();
    }

    /**
     * Idempotent on purpose: mail clients prefetch links, people click twice,
     * and a one-click unsubscribe may arrive more than once. All of those are
     * the same statement, and none of them should 500.
     */
    public static function record(string $email, ?Invite $invite = null): self
    {
        return static::firstOrCreate(
            ['email' => $email],
            ['reason' => self::REASON_UNSUBSCRIBED, 'invite_id' => $invite?->id],
        );
    }

    public function invite(): BelongsTo
    {
        return $this->belongsTo(Invite::class);
    }
}
