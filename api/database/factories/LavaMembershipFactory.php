<?php

namespace Database\Factories;

use App\Models\LavaMembership;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LavaMembership>
 */
class LavaMembershipFactory extends Factory
{
    protected $model = LavaMembership::class;

    /**
     * An active monthly membership.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'plan_id' => fn () => Plan::where('slug', 'pro')->value('id'),
            'contract_id' => (string) Str::uuid(),
            'email' => fn (array $attributes) => User::find($attributes['user_id'])?->email ?? fake()->safeEmail(),
            'status' => LavaMembership::STATUS_ACTIVE,
        ];
    }
}
