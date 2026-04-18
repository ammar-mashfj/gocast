<?php

namespace Database\Factories;

use App\Models\Station;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Station>
 */
class StationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $slug = fake()->unique()->slug(2);

        return [
            'user_id' => User::factory(),
            'name' => fake()->words(2, asText: true),
            'slug' => $slug,
            'description' => fake()->optional()->sentence(),
            'genre' => fake()->optional()->word(),
            'is_live' => false,
            'featured' => false,
        ];
    }
}
