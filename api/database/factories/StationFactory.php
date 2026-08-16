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
            'featured' => false,
        ];
    }

    /**
     * A station with a broadcaster publishing right now.
     *
     * There is no `is_live` column to set — live-ness is derived from an open
     * StreamSession — so this opens the session MediaMTX's runOnReady webhook
     * would have opened, which is what every reader now looks at.
     */
    public function live(): static
    {
        return $this->afterCreating(fn (Station $station) => $station->streamSessions()->create([
            'started_at' => now(),
            'source_type' => 'browser',
        ]));
    }
}
