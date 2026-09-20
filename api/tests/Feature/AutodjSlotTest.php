<?php

use App\Models\AutodjSlot;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\Track;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\putJson;

/**
 * The slot endpoint and what it does to the air: validation the resolver
 * relies on (no overlaps, a zone), and the scheduler actually walking the
 * scheduled playlist with its own cursor.
 */
beforeEach(function () {
    $this->owner = User::factory()->onPlan('pro')->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create(['timezone' => 'Europe/Madrid']);
    $this->calm = Playlist::factory()->for($this->station)->create(['name' => 'Morning Calm']);
});

function putSlots(User $owner, Station $station, array $slots, ?string $timezone = null): TestResponse
{
    $payload = ['slots' => $slots];
    if ($timezone !== null) {
        $payload['timezone'] = $timezone;
    }

    return actingAs($owner, 'sanctum')->putJson("/api/stations/{$station->slug}/autodj-slots", $payload);
}

it('rejects unauthenticated and foreign writes', function () {
    putJson("/api/stations/{$this->station->slug}/autodj-slots", ['slots' => []])->assertUnauthorized();

    $stranger = User::factory()->create();
    actingAs($stranger, 'sanctum')
        ->putJson("/api/stations/{$this->station->slug}/autodj-slots", ['slots' => []])
        ->assertForbidden();
});

it('stores slots in payload order and returns them with the programme', function () {
    $response = putSlots($this->owner, $this->station, [
        ['label' => 'Mornings', 'playlist_id' => $this->calm->id, 'days' => [5, 1, 3], 'start_time' => '06:00', 'end_time' => '12:00'],
        ['label' => null, 'playlist_id' => $this->calm->id, 'days' => [6], 'start_time' => '22:00', 'end_time' => '02:00'],
    ])->assertOk();

    expect($response->json('data.autodj_slots.0.label'))->toBe('Mornings')
        ->and($response->json('data.autodj_slots.0.days'))->toBe([1, 3, 5])
        ->and($response->json('data.autodj_slots.0.start_time'))->toBe('06:00')
        ->and($response->json('data.autodj_slots.1.end_time'))->toBe('02:00')
        ->and($response->json('data.programme.playlist.id'))->toBeString()
        ->and($this->station->autodjSlots()->pluck('position')->all())->toBe([0, 1]);
});

it('replaces the whole list, so an empty list clears it', function () {
    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
    ])->assertOk();

    putSlots($this->owner, $this->station, [])->assertOk()->assertJsonCount(0, 'data.autodj_slots');

    expect($this->station->autodjSlots()->count())->toBe(0);
});

it('refuses to clear the timezone while show times still use it', function () {
    // The zone is shared with the advertised show times; an empty slot list
    // sent with a null zone must not leave them meaningless.
    $this->station->schedules()->create([
        'label' => 'Breakfast',
        'days' => [1],
        'start_time' => '08:00',
        'position' => 0,
    ]);

    actingAs($this->owner, 'sanctum')
        ->putJson("/api/stations/{$this->station->slug}/autodj-slots", ['timezone' => null, 'slots' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('timezone');

    expect($this->station->fresh()->timezone)->toBe('Europe/Madrid');
});

it('refuses slots without a station timezone', function () {
    $this->station->forceFill(['timezone' => null])->save();

    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
    ])->assertUnprocessable()->assertJsonValidationErrors('timezone');

    // ...unless the zone rides along.
    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
    ], 'Europe/Madrid')->assertOk();

    expect($this->station->fresh()->timezone)->toBe('Europe/Madrid');
});

it('refuses another station\'s playlist', function () {
    $foreign = Playlist::factory()->create();

    putSlots($this->owner, $this->station, [
        ['playlist_id' => $foreign->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
    ])->assertUnprocessable()->assertJsonValidationErrors('slots.0.playlist_id');
});

it('refuses overlapping slots but allows touching ones', function () {
    putSlots($this->owner, $this->station, [
        ['label' => 'A', 'playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
        ['label' => 'B', 'playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '11:00', 'end_time' => '14:00'],
    ])->assertUnprocessable()->assertJsonValidationErrors('slots.1.start_time');

    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '12:00', 'end_time' => '14:00'],
    ])->assertOk();
});

it('catches an overlap across midnight and across the week wrap', function () {
    // Friday 22:00–02:00 runs into Saturday 01:00.
    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [5], 'start_time' => '22:00', 'end_time' => '02:00'],
        ['playlist_id' => $this->calm->id, 'days' => [6], 'start_time' => '01:00', 'end_time' => '03:00'],
    ])->assertUnprocessable();

    // Saturday 23:00–01:00 runs into Sunday 00:30.
    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [6], 'start_time' => '23:00', 'end_time' => '01:00'],
        ['playlist_id' => $this->calm->id, 'days' => [0], 'start_time' => '00:30', 'end_time' => '02:00'],
    ])->assertUnprocessable();
});

it('refuses to clear the timezone while slots exist', function () {
    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
    ])->assertOk();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/stations/{$this->station->slug}", ['timezone' => null])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('timezone');
});

it('deletes the slots that play a deleted playlist', function () {
    putSlots($this->owner, $this->station, [
        ['playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
    ])->assertOk();

    actingAs($this->owner, 'sanctum')->deleteJson("/api/playlists/{$this->calm->id}")->assertNoContent();

    expect(AutodjSlot::query()->count())->toBe(0);
});

it('shows the slots and the programme on the owner\'s station fetch', function () {
    actingAs($this->owner, 'sanctum')
        ->getJson("/api/stations/{$this->station->slug}")
        ->assertOk()
        ->assertJsonPath('data.autodj_slots', [])
        ->assertJsonPath('data.programme.playlist.id', $this->station->defaultPlaylist->id)
        ->assertJsonPath('data.programme.slot_id', null);
});

describe('on air', function () {
    beforeEach(function () {
        config(['services.internal_api_key' => 'test-internal-key']);

        // Default: Song 1..3. Calm: Calm 1..2.
        collect(range(1, 3))->each(fn (int $n) => Track::factory()->for($this->station)->create(['title' => "Song {$n}"]));
        $calmTracks = collect(range(1, 2))->map(fn (int $n) => Track::factory()->for($this->station)->create(['title' => "Calm {$n}"]));
        $this->calm->tracks()->attach($calmTracks->mapWithKeys(fn (Track $t, int $i) => [$t->id => ['position' => $i + 1]])->all());

        putSlots($this->owner, $this->station, [
            ['label' => 'Mornings', 'playlist_id' => $this->calm->id, 'days' => [1], 'start_time' => '06:00', 'end_time' => '12:00'],
        ])->assertOk();
    });

    function nextTitle(Station $station): string
    {
        $body = test()->withHeader('X-Internal-Key', 'test-internal-key')
            ->get('/api/internal/next-track?slug='.$station->slug)
            ->assertOk()
            ->getContent();

        preg_match('/title="([^"]+)"/', $body, $matches);

        return $matches[1];
    }

    it('walks the scheduled playlist inside the slot and the default outside it, each with its own cursor', function () {
        // Monday 09:00 Madrid: inside.
        Carbon::setTestNow(CarbonImmutable::parse('2026-09-21 09:00', 'Europe/Madrid'));
        expect(nextTitle($this->station))->toBe('Calm 1');

        // Monday 13:00: outside — the default starts from its own top.
        Carbon::setTestNow(CarbonImmutable::parse('2026-09-21 13:00', 'Europe/Madrid'));
        expect(nextTitle($this->station))->toBe('Song 1')
            ->and(nextTitle($this->station))->toBe('Song 2');

        // Tuesday 09:00: not a slot day. Still the default, still where it was.
        Carbon::setTestNow(CarbonImmutable::parse('2026-09-22 09:00', 'Europe/Madrid'));
        expect(nextTitle($this->station))->toBe('Song 3');

        // Next Monday 09:00: back in the slot, resumed where it left off.
        Carbon::setTestNow(CarbonImmutable::parse('2026-09-28 09:00', 'Europe/Madrid'));
        expect(nextTitle($this->station))->toBe('Calm 2');

        Carbon::setTestNow();
    });

    it('records a playlist_changed event at the boundary where the rotation switched', function () {
        Carbon::setTestNow(CarbonImmutable::parse('2026-09-21 09:00', 'Europe/Madrid'));
        nextTitle($this->station);
        nextTitle($this->station);

        Carbon::setTestNow(CarbonImmutable::parse('2026-09-21 13:00', 'Europe/Madrid'));
        nextTitle($this->station);
        nextTitle($this->station);

        $events = StationEvent::query()
            ->where('station_id', $this->station->id)
            ->where('type', StationEvent::TYPE_PLAYLIST_CHANGED)
            ->oldest('created_at')
            ->get();

        expect($events)->toHaveCount(2)
            ->and($events[0]->properties['playlist'])->toBe('Morning Calm')
            ->and($events[0]->properties['slot'])->toBe('Mornings')
            ->and($events[1]->properties['playlist'])->toBe(Playlist::DEFAULT_NAME)
            ->and($events[1]->properties['from_playlist_id'])->toBe($this->calm->id);

        Carbon::setTestNow();
    });

    it('does not disturb the station row when it switches', function () {
        Carbon::setTestNow(CarbonImmutable::parse('2026-09-21 09:00', 'Europe/Madrid'));
        $before = $this->station->fresh()->updated_at;

        nextTitle($this->station);

        expect($this->station->fresh()->updated_at->eq($before))->toBeTrue();

        Carbon::setTestNow();
    });
});
