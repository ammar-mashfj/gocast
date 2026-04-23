<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * One-per-email row holding the hashed 6-digit password-reset code.
 *
 * Keyed by email (not user_id) so unauthenticated callers can initiate a
 * reset. Attempts and expires_at gate brute-force and stale submissions.
 */
#[Fillable(['email', 'code_hash', 'attempts', 'expires_at'])]
class PasswordResetCode extends Model
{
    public const CODE_TTL_MINUTES = 15;

    public const MAX_ATTEMPTS = 5;

    protected $primaryKey = 'email';

    public $incrementing = false;

    protected $keyType = 'string';

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
