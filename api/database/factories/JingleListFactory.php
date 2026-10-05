<?php

namespace Database\Factories;

use App\Models\JingleList;
use App\Models\Station;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JingleList>
 */
class JingleListFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'station_id' => Station::factory(),
            'name' => 'Station IDs',
            'enabled' => true,
            'pick' => JingleList::PICK_RANDOM,
            'frequency' => JingleList::FREQUENCY_SONGS,
            'every_songs' => 4,
        ];
    }

    public function everyMinutes(int $minutes): static
    {
        return $this->state(fn () => [
            'frequency' => JingleList::FREQUENCY_MINUTES,
            'every_minutes' => $minutes,
            'every_songs' => null,
        ]);
    }

    /** @param  list<string>  $times */
    public function atTimes(array $times, bool $exact = false): static
    {
        return $this->state(fn () => [
            'frequency' => JingleList::FREQUENCY_TIMES,
            'times' => $times,
            'exact' => $exact,
            'every_songs' => null,
        ]);
    }
}
