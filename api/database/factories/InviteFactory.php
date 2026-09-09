<?php

namespace Database\Factories;

use App\Models\Invite;
use App\Models\Plan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invite>
 */
class InviteFactory extends Factory
{
    protected $model = Invite::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => Invite::generateCode(),
            // The seeded row, not a factory plan: `pro` is what invites are
            // for, and its slug is uniquely indexed.
            'plan_id' => fn () => Plan::where('slug', 'pro')->value('id') ?? Plan::factory(),
            'duration_days' => null,
            'label' => fake()->name(),
            'max_uses' => 1,
            'uses' => 0,
            'expires_at' => null,
            'created_by' => null,
        ];
    }

    public function used(): static
    {
        return $this->state(fn (array $attributes) => ['uses' => $attributes['max_uses'] ?? 1]);
    }

    public function expired(): static
    {
        return $this->state(fn () => ['expires_at' => now()->subMinute()]);
    }
}
