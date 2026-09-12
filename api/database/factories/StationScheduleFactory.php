<?php

namespace Database\Factories;

use App\Models\Station;
use App\Models\StationSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StationSchedule>
 */
class StationScheduleFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'station_id' => Station::factory(),
            'label' => fake()->optional()->words(2, asText: true),
            'days' => [fake()->numberBetween(0, 6)],
            'start_time' => fake()->numberBetween(0, 23).':00:00',
            'position' => 0,
        ];
    }
}
