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
            'kind' => Track::KIND_MUSIC,
            'path' => $ulid.'.mp3',
            'original_filename' => fake()->word().'.mp3',
            'title' => fake()->sentence(3),
            'artist' => fake()->name(),
            'duration_seconds' => fake()->numberBetween(60, 360),
            'file_size_bytes' => fake()->numberBetween(1024, 5_000_000),
            'position' => 1,
        ];
    }

    /**
     * A track the analyser has measured. Values are a realistic pairing: a
     * modern master sitting a little above the -14 LUFS target with almost no
     * headroom, and a second of silence at each end.
     */
    public function analyzed(
        float $loudnessLufs = -9.0,
        float $truePeakDb = -0.5,
        ?float $cueIn = 1.5,
        ?float $cueOut = null,
    ): static {
        return $this->state(fn (array $attributes): array => [
            'loudness_lufs' => $loudnessLufs,
            'true_peak_db' => $truePeakDb,
            'cue_in_seconds' => $cueIn,
            'cue_out_seconds' => $cueOut ?? max(10.0, ((float) ($attributes['duration_seconds'] ?? 180)) - 2.0),
            'analyzed_at' => now(),
            'analysis_error' => null,
        ]);
    }

    /**
     * A station ID / liner. Short by construction — the length is what makes
     * jingle-shaped test data behave like the real thing (a 4-second file
     * either side of a crossfade window is the interesting case).
     */
    public function jingle(): static
    {
        return $this->state(fn () => [
            'kind' => Track::KIND_JINGLE,
            'title' => 'Station ID',
            'artist' => null,
            'duration_seconds' => fake()->numberBetween(3, 12),
        ]);
    }
}
