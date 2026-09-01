<?php

namespace Database\Factories;

use App\Models\ListenerSession;
use App\Models\Station;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ListenerSession>
 */
class ListenerSessionFactory extends Factory
{
    protected $model = ListenerSession::class;

    /**
     * Default is an OPEN session — someone listening right now — because that
     * is the state most of the interesting behaviour acts on. Use the `closed`
     * state for anything that reads a duration.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $startedAt = now()->subMinutes(fake()->numberBetween(1, 120));

        return [
            'id' => Str::random(22),
            'station_id' => Station::factory(),
            'transport' => 'hls',
            'country' => fake()->randomElement(['US', 'GB', 'DE', 'BR', 'JP']),
            'device' => fake()->randomElement(['mobile', 'desktop', 'tablet']),
            'browser' => fake()->randomElement(['Chrome', 'Safari', 'Firefox']),
            'referrer_host' => fake()->randomElement([null, 'reddit.com', 'google.com']),
            'visitor_hash' => hash('sha256', Str::random(16)),
            'started_at' => $startedAt,
            'last_seen_at' => $startedAt,
            'ended_at' => null,
            'seconds' => 0,
        ];
    }

    /** A finished session, long enough to pass the qualifying threshold. */
    public function closed(?int $seconds = null): static
    {
        return $this->state(function (array $attributes) use ($seconds) {
            $seconds ??= fake()->numberBetween(120, 3600);
            $endedAt = $attributes['started_at']->copy()->addSeconds($seconds);

            return [
                'ended_at' => $endedAt,
                'last_seen_at' => $endedAt,
                'seconds' => $seconds,
            ];
        });
    }

    /** Someone who pressed play and left before it counted as a listen. */
    public function bounced(): static
    {
        return $this->closed(fake()->numberBetween(1, 20));
    }
}
