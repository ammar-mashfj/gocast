<?php

namespace App\Models;

use App\Models\Concerns\AuthenticationLoggable;
use App\Notifications\VerifyEmailCode;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Authenticated user who can own stations and broadcast.
 *
 * Implements email verification via MustVerifyEmail.
 * The google_id column links accounts authenticated through Google OAuth.
 *
 * @property int $plan_id
 */
#[Fillable(['name', 'email', 'password', 'google_id', 'avatar_url', 'plan_id'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use AuthenticationLoggable, HasApiTokens, HasFactory, LogsActivity, Notifiable, SoftDeletes;

    protected $appends = ['has_password'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function stations(): HasMany
    {
        return $this->hasMany(Station::class);
    }

    public function streamSessions(): HasManyThrough
    {
        return $this->hasManyThrough(StreamSession::class, Station::class);
    }

    public function getHasPasswordAttribute(): bool
    {
        return $this->password !== null;
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'email', 'email_verified_at', 'plan_id'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }

    /**
     * Override Laravel's signed-URL default: generate a 6-digit code, persist
     * a hash of it, and email the plaintext. User types it into the frontend,
     * which POSTs it to /api/email/verify for validation.
     */
    public function sendEmailVerificationNotification(): void
    {
        $code = (string) random_int(100000, 999999);

        EmailVerificationCode::updateOrCreate(
            ['user_id' => $this->id],
            [
                'code_hash' => Hash::make($code),
                'attempts' => 0,
                'expires_at' => now()->addMinutes(EmailVerificationCode::CODE_TTL_MINUTES),
            ],
        );

        $this->notify(new VerifyEmailCode($code, EmailVerificationCode::CODE_TTL_MINUTES));
    }
}
