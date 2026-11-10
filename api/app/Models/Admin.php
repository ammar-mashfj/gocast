<?php

namespace App\Models;

use App\Models\Concerns\AuthenticationLoggable;
use Database\Factories\AdminFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Operator of the admin panel. A separate identity from User by design —
 * see the create_admins_table migration.
 *
 * There is no registration, self-service password reset, or email
 * verification: accounts come from `php artisan admin:create` and passwords
 * are recovered with `php artisan admin:reset-password`, nothing else.
 *
 * @property int $id
 * @property string $name
 * @property string $email
 * @property string $password
 * @property Carbon|null $last_login_at
 * @property string|null $two_factor_secret
 * @property Carbon|null $two_factor_confirmed_at
 * @property int|null $two_factor_last_step
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret'])]
class Admin extends Authenticatable
{
    /** @use HasFactory<AdminFactory> */
    use AuthenticationLoggable, HasFactory, LogsActivity;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_secret' => 'encrypted',
            'two_factor_confirmed_at' => 'datetime',
            'two_factor_last_step' => 'integer',
        ];
    }

    /**
     * A secret alone is not enough: setup only counts once a code from the
     * authenticator app has been accepted.
     */
    public function hasTwoFactorEnabled(): bool
    {
        return $this->two_factor_secret !== null && $this->two_factor_confirmed_at !== null;
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'email'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
