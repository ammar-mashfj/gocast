<?php

namespace Database\Factories;

use App\Models\Plan;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    /**
     * A month of Pro at $20 — the migration seeds the real four, this is for
     * tests that need their own.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'slug' => 'test-'.fake()->unique()->slug(2),
            'name' => 'Pro · 1 month',
            'price_usd' => 20,
            'grant_type' => Product::GRANT_PLAN_TERM,
            'plan_id' => fn () => Plan::where('slug', 'pro')->value('id'),
            'duration_unit' => 'month',
            'duration_count' => 1,
            'active' => true,
            'visible' => true,
            'sort' => 0,
        ];
    }

    public function hidden(): static
    {
        return $this->state(['visible' => false]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
