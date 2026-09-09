<?php

namespace Database\Factories;

use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StationEvent>
 */
class StationEventFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'station_id' => Station::factory(),
            'type' => fake()->randomElement(StationEvent::CONTAINER_TYPES),
            'source' => StationEvent::SOURCE_CONTAINER,
            'properties' => null,
            'created_at' => now(),
        ];
    }

    /** An event of a given type, since that is what most assertions pin down. */
    public function type(string $type): static
    {
        return $this->state(fn () => ['type' => $type]);
    }

    /** Aged past the retention window, for the prune. */
    public function old(int $days = 60): static
    {
        return $this->state(fn () => ['created_at' => now()->subDays($days)]);
    }
}
