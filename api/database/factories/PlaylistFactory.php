<?php

namespace Database\Factories;

use App\Models\Playlist;
use App\Models\Station;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Playlist>
 *
 * Builds a NON-default playlist. Every station already owns its default one
 * from the moment it is created (Station::booted), so a test that wants the
 * default should read `$station->defaultPlaylist` rather than make another —
 * two defaults on one station is the invariant the model exists to prevent.
 */
class PlaylistFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'station_id' => Station::factory(),
            'name' => ucfirst(fake()->unique()->words(2, true)),
            'is_default' => false,
            'order' => Playlist::ORDER_SEQUENTIAL,
            'position' => 1,
        ];
    }

    public function shuffled(): static
    {
        return $this->state(fn () => ['order' => Playlist::ORDER_SHUFFLE]);
    }
}
