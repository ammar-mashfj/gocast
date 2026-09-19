<?php

namespace Database\Factories;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Put the account on a plan by slug.
     *
     * `users.plan_id` defaults to 1 — the free row — so a factory user has no
     * AutoDJ, no encoder and no embed unless a test says otherwise. Looked up
     * rather than created so tests exercise the same rows production grants;
     * firstOrFail because a typo'd slug silently landing on free is how an
     * entitlement test passes while asserting nothing.
     */
    public function onPlan(string $slug): static
    {
        return $this->state(fn () => [
            'plan_id' => Plan::where('slug', $slug)->firstOrFail()->id,
        ]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
