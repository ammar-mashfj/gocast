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
            // Mirrors the column defaults. Station::booted() also sets these,
            // but only on create() — a `make()`d station would otherwise carry
            // nulls into anything that renders or pushes them.
            'jingles_enabled' => false,
            'jingle_mode' => Station::JINGLE_MODE_INTERVAL,
            'jingle_interval_seconds' => Station::DEFAULT_JINGLE_INTERVAL_SECONDS,
            'jingle_every_tracks' => Station::DEFAULT_JINGLE_EVERY_TRACKS,
        ];
    }

    /**
     * A station in the admin-curated rail.
     *
     * Sets `featured_at` alongside the flag, the way Station::markFeatured()
     * does — the public rail orders on it, so a factory that set only the
     * boolean would build a station the ordering assertions cannot pin down.
     */
    public function featured(): static
    {
        return $this->state(fn () => [
            'featured' => true,
            'featured_at' => now(),
        ]);
    }

    /**
     * The owner has switched the station on: a container should exist and the
     * mount should be up. Required by anything public — the rail included —
     * because a stopped station is not audible.
     */
    public function running(): static
    {
        return $this->state(fn () => ['desired_state' => Station::STATE_RUNNING]);
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
