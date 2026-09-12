<?php

use App\Models\Station;
use App\Models\StationSchedule;
use App\Models\User;
use Carbon\CarbonImmutable;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;

/**
 * Advertised show times: the owner's claim about when a human is on air.
 *
 * The claim is display-only, so these tests are about the two things that can
 * silently make it WRONG rather than about anything in the audio path:
 *
 *   • a wall clock stored without a zone, which means a different instant to
 *     every reader;
 *   • next_occurrence crossing a DST boundary, where naive offset arithmetic
 *     is off by an hour for half the year.
 *
 * Plus the one performance guarantee: /discover must not start loading show
 * times for 24 stations a page.
 */
function scheduleOwner(): User
{
    return User::factory()->create();
}

it('stores show times in payload order', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'Europe/Madrid']);

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", [
            'schedules' => [
                ['label' => 'Late Night Jazz', 'days' => [0], 'start_time' => '22:00'],
                ['label' => 'Morning Drive', 'days' => [1, 2, 3, 4, 5], 'start_time' => '06:00'],
            ],
        ])
        ->assertOk()
        ->assertJsonPath('data.schedules.0.label', 'Late Night Jazz')
        ->assertJsonPath('data.schedules.1.label', 'Morning Drive')
        // Position follows the array, not the clock: the flagship show is not
        // always the earliest one.
        ->assertJsonPath('data.schedules.1.start_time', '06:00');

    expect($station->schedules()->pluck('position')->all())->toBe([0, 1]);
});

it('canonicalises the day list however the boxes were clicked', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'UTC']);

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", [
            'schedules' => [['days' => [5, 1, 3], 'start_time' => '20:00']],
        ])
        ->assertOk()
        ->assertJsonPath('data.schedules.0.days', [1, 3, 5]);
});

it('replaces the whole list, so removing a row deletes it', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'UTC']);

    actingAs($owner, 'sanctum')->putJson("/api/stations/{$station->slug}/schedules", [
        'schedules' => [
            ['days' => [1], 'start_time' => '09:00'],
            ['days' => [2], 'start_time' => '10:00'],
        ],
    ])->assertOk();

    actingAs($owner, 'sanctum')->putJson("/api/stations/{$station->slug}/schedules", [
        'schedules' => [['days' => [2], 'start_time' => '10:00']],
    ])->assertOk();

    expect($station->schedules()->count())->toBe(1);
});

it('lets an owner clear every show time', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'UTC']);
    StationSchedule::factory()->for($station)->create();

    // `present` rather than `required` on the array exists for exactly this:
    // "I no longer keep a schedule" is a legitimate edit.
    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", ['schedules' => []])
        ->assertOk()
        ->assertJsonPath('data.schedules', []);

    expect($station->schedules()->count())->toBe(0);
});

it('saves the timezone and the rows in one request', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => null]);

    // One request, not two: a failure between a timezone PATCH and a
    // schedules PUT would move the clock out from under times that never
    // saved, and report it to the owner as a save that failed.
    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", [
            'timezone' => 'Europe/Madrid',
            'schedules' => [['days' => [4], 'start_time' => '20:00']],
        ])
        ->assertOk()
        ->assertJsonPath('data.timezone', 'Europe/Madrid');

    expect($station->refresh()->timezone)->toBe('Europe/Madrid')
        ->and($station->schedules()->count())->toBe(1);
});

it('keeps the timezone and the rows together when a row is invalid', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'UTC']);

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", [
            'timezone' => 'Europe/Madrid',
            'schedules' => [['days' => [4], 'start_time' => 'half eight']],
        ])
        ->assertStatus(422);

    expect($station->refresh()->timezone)->toBe('UTC');
});

it('will not let the timezone be cleared while show times exist', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'Europe/Madrid']);
    StationSchedule::factory()->for($station)->create();

    // Clearing it would orphan the rows: every next_occurrence goes null and
    // the player quietly stops showing a schedule it still holds.
    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['timezone' => null])
        ->assertStatus(422)
        ->assertJsonValidationErrors('timezone');

    expect($station->refresh()->timezone)->toBe('Europe/Madrid');
});

it('lets the timezone be cleared once the show times are gone', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'Europe/Madrid']);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['timezone' => null])
        ->assertOk();

    expect($station->refresh()->timezone)->toBeNull();
});

it('ignores a weekday that is not a weekday', function () {
    $station = Station::factory()->create(['timezone' => 'UTC']);

    // Validation keeps 7 out of the API, but `days` is JSON with nothing
    // behind it — a seeder or import can still write one. An earlier form of
    // nextOccurrence() looped until the weekday matched, which for 7 meant
    // never, on an endpoint the whole internet can reach.
    $schedule = StationSchedule::factory()->for($station)->create([
        'days' => [7, 2],
        'start_time' => '09:00:00',
    ]);

    expect($schedule->nextOccurrence(CarbonImmutable::parse('2026-07-06 10:00:00', 'UTC'))?->toIso8601String())
        ->toBe('2026-07-07T09:00:00+00:00');

    $onlyInvalid = StationSchedule::factory()->for($station)->create(['days' => [9]]);

    expect($onlyInvalid->nextOccurrence())->toBeNull();
});

it('refuses show times until the station has a timezone', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => null]);

    // Defaulting to UTC here would publish a number that is wrong by hours
    // for most of the world and right by accident for one slice of it.
    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", [
            'schedules' => [['days' => [4], 'start_time' => '20:00']],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('timezone');

    expect($station->schedules()->count())->toBe(0);
});

it('rejects offset spellings of a timezone', function () {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['timezone' => 'GMT+2'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('timezone');

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['timezone' => 'Europe/Madrid'])
        ->assertOk()
        ->assertJsonPath('data.timezone', 'Europe/Madrid');
});

it('rejects malformed rows', function (array $row, string $field) {
    $owner = scheduleOwner();
    $station = Station::factory()->for($owner, 'user')->create(['timezone' => 'UTC']);

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", ['schedules' => [$row]])
        ->assertStatus(422)
        ->assertJsonValidationErrors("schedules.0.{$field}");
})->with([
    'day out of range' => [['days' => [7], 'start_time' => '20:00'], 'days.0'],
    'no days at all' => [['days' => [], 'start_time' => '20:00'], 'days'],
    'duplicate days' => [['days' => [1, 1], 'start_time' => '20:00'], 'days.0'],
    'impossible hour' => [['days' => [1], 'start_time' => '25:00'], 'start_time'],
    'seconds included' => [['days' => [1], 'start_time' => '20:00:00'], 'start_time'],
    'label too long' => [['label' => str_repeat('a', 61), 'days' => [1], 'start_time' => '20:00'], 'label'],
]);

it('will not let a stranger edit the schedule', function () {
    $station = Station::factory()->for(scheduleOwner(), 'user')->create(['timezone' => 'UTC']);

    actingAs(scheduleOwner(), 'sanctum')
        ->putJson("/api/stations/{$station->slug}/schedules", [
            'schedules' => [['days' => [1], 'start_time' => '09:00']],
        ])
        ->assertForbidden();
});

it('publishes show times on the public station page', function () {
    $station = Station::factory()->create(['timezone' => 'Europe/Madrid']);
    StationSchedule::factory()->for($station)->create([
        'label' => 'Morning Drive',
        'days' => [1],
        'start_time' => '06:00:00',
    ]);

    getJson("/api/public/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.timezone', 'Europe/Madrid')
        ->assertJsonPath('data.schedules.0.label', 'Morning Drive')
        // Seconds trimmed: a TIME column carries them, nobody schedules them.
        ->assertJsonPath('data.schedules.0.start_time', '06:00');
});

it('keeps show times off the directory listing', function () {
    $station = Station::factory()->create(['timezone' => 'UTC']);
    StationSchedule::factory()->for($station)->create();

    // /discover renders 24 stations a page and StationResource is
    // deliberately N+1-free. The relation is eager-loaded on the two show
    // endpoints only, so the key must be absent here rather than empty.
    getJson('/api/public/stations')
        ->assertOk()
        ->assertJsonMissingPath('data.0.schedules');
});

it('resolves the next occurrence in the station clock, not the server clock', function () {
    // Server on UTC, station in Madrid: a 20:00 show is 18:00 UTC in summer.
    $station = Station::factory()->create(['timezone' => 'Europe/Madrid']);
    $schedule = StationSchedule::factory()->for($station)->create([
        'days' => [4], // Thursday
        'start_time' => '20:00:00',
    ]);

    $from = CarbonImmutable::parse('2026-07-06 12:00:00', 'UTC'); // a Monday

    expect($schedule->nextOccurrence($from)->utc()->toIso8601String())
        ->toBe('2026-07-09T18:00:00+00:00');
});

it('keeps the advertised hour fixed across a DST change', function () {
    $station = Station::factory()->create(['timezone' => 'Europe/Madrid']);
    $schedule = StationSchedule::factory()->for($station)->create([
        'days' => [0], // Sunday
        'start_time' => '22:00:00',
    ]);

    // Spain leaves DST on 2026-10-25. The show stays at 22:00 LOCAL on both
    // sides — which is the whole reason the column holds a wall clock and an
    // IANA zone rather than a stored offset.
    $before = $schedule->nextOccurrence(CarbonImmutable::parse('2026-10-20 12:00:00', 'UTC'));
    $after = $schedule->nextOccurrence(CarbonImmutable::parse('2026-10-27 12:00:00', 'UTC'));

    expect($before->utc()->toIso8601String())->toBe('2026-10-25T21:00:00+00:00')
        ->and($after->utc()->toIso8601String())->toBe('2026-11-01T21:00:00+00:00')
        ->and($before->setTimezone('Europe/Madrid')->format('H:i'))->toBe('22:00')
        ->and($after->setTimezone('Europe/Madrid')->format('H:i'))->toBe('22:00');
});

it('picks the soonest day when a show runs on several', function () {
    $station = Station::factory()->create(['timezone' => 'UTC']);
    $schedule = StationSchedule::factory()->for($station)->create([
        'days' => [1, 3, 5],
        'start_time' => '09:00:00',
    ]);

    // Wednesday 10:00 — today's slot has passed, so Friday is next.
    $from = CarbonImmutable::parse('2026-07-08 10:00:00', 'UTC');

    expect($schedule->nextOccurrence($from)->toIso8601String())
        ->toBe('2026-07-10T09:00:00+00:00');
});

it('reports no next occurrence without a timezone', function () {
    $station = Station::factory()->create(['timezone' => null]);
    $schedule = StationSchedule::factory()->for($station)->create();

    expect($schedule->nextOccurrence())->toBeNull();

    getJson("/api/public/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.schedules.0.next_occurrence', null);
});

it('drops show times with the station', function () {
    $station = Station::factory()->create(['timezone' => 'UTC']);
    StationSchedule::factory()->for($station)->create();

    $station->forceDelete();

    expect(StationSchedule::query()->count())->toBe(0);
});
