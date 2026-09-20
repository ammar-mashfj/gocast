<?php

namespace Database\Factories;

use App\Models\AutodjSlot;
use App\Models\Playlist;
use App\Models\Station;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AutodjSlot>
 *
 * Pass `station_id` AND a `playlist_id` belonging to that station; the
 * default here builds a fresh station with a fresh playlist on it, which is
 * fine for a slot in isolation and wrong for one on a station you already
 * hold.
 */
class AutodjSlotFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'station_id' => Station::factory(['timezone' => 'UTC']),
            'playlist_id' => fn (array $attributes) => Playlist::factory()->for(
                Station::query()->findOrFail($attributes['station_id']),
            ),
            'label' => fake()->optional()->words(2, asText: true),
            'days' => [1, 2, 3, 4, 5],
            'start_time' => '06:00:00',
            'end_time' => '12:00:00',
            'position' => 0,
        ];
    }
}
