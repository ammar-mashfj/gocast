<?php

namespace Database\Factories;

use App\Models\Station;
use App\Models\Track;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Track>
 *
 * Use `->for($station)` when you already have one. `station_id` is not
 * in the model's $fillable, so it won't propagate through ->create([...])
 * mass-assignment — the factory sets it directly here.
 */
class TrackFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $ulid = (string) Str::ulid();

        return [
            'station_id' => Station::factory(),
            'path' => $ulid.'.mp3',
            'original_filename' => fake()->word().'.mp3',
            'title' => fake()->sentence(3),
            'artist' => fake()->name(),
            'duration_seconds' => fake()->numberBetween(60, 360),
            'file_size_bytes' => fake()->numberBetween(1024, 5_000_000),
            'position' => 1,
        ];
    }
}
