<?php

namespace Database\Factories;

use App\Models\Admin;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<Admin>
 */
class AdminFactory extends Factory
{
    protected static ?string $password;

    /**
     * The two-factor secret every factory admin has, so a test can compute a
     * valid code with App\Services\Totp. Base32 of "12345678901234567890",
     * the RFC 6238 test key.
     */
    public const TWO_FACTOR_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            // Enrolled by default: the panel refuses an admin without it
            // (EnsureAdminTwoFactor), and most tests are about the panel.
            'two_factor_secret' => self::TWO_FACTOR_SECRET,
            'two_factor_confirmed_at' => now(),
        ];
    }

    public function withoutTwoFactor(): static
    {
        return $this->state(fn () => [
            'two_factor_secret' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_last_step' => null,
        ]);
    }
}
