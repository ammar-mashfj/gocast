<?php

namespace App\Models;

use App\Models\Concerns\AuthenticationLoggable;
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

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'email', 'email_verified_at', 'plan_id'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
