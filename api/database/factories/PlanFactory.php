<?php

namespace Database\Factories;

use App\Models\Plan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Plan>
 */
class PlanFactory extends Factory
{
    protected $model = Plan::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $slug = fake()->unique()->slug(1);

        return [
            'name' => ucfirst($slug),
            'slug' => $slug,
            'max_stations' => fake()->numberBetween(1, 10),
            'max_listeners' => fake()->numberBetween(50, 1000),
        ];
    }
}
