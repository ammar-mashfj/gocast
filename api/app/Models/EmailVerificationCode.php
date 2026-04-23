<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One-per-user row holding the hashed 6-digit email verification code.
 *
 * PK is user_id so resends upsert cleanly; attempts and expires_at gate
 * brute-force and stale submissions.
 */
#[Fillable(['user_id', 'code_hash', 'attempts', 'expires_at'])]
class EmailVerificationCode extends Model
{
    public const CODE_TTL_MINUTES = 15;

    public const MAX_ATTEMPTS = 5;

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
