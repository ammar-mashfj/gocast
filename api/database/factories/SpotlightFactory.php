<?php

namespace Database\Factories;

use App\Models\Spotlight;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Spotlight>
 */
class SpotlightFactory extends Factory
{
    protected $model = Spotlight::class;

    /**
     * A running feature announcement for everybody.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'key' => fake()->unique()->slug(3),
            'kind' => 'feature',
            'title' => 'Something new in your dashboard',
            'body' => 'A short paragraph about it.',
            'cta_label' => 'Take a look',
            'cta_url' => '/dashboard',
            'audience' => 'all',
            'priority' => 0,
            'active' => true,
        ];
    }

    /** A Free-only offer ending in three days. */
    public function offer(): static
    {
        return $this->state([
            'kind' => 'offer',
            'title' => 'Black Friday: Pro for less',
            'cta_label' => 'Get Pro',
            'cta_url' => '/dashboard/settings?coupon=BF2026',
            'audience' => 'free',
            'ends_at' => now()->addDays(3),
        ]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
