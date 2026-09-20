<?php

use App\Models\AutodjSlot;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Services\AutoDjProgramme;
use Carbon\CarbonImmutable;

/**
 * The resolver: which playlist is on at a given instant.
 *
 * Every case pins an instant with CarbonImmutable rather than relying on
 * now(), because the interesting inputs are the ones a clock rarely lands
 * on — a window running past midnight, the Saturday→Sunday wrap, the two
 * nights a year the clocks move.
 */
function programmeStation(string $timezone = 'Europe/Madrid'): Station
{
    return Station::factory()->withAutoDj()->create(['timezone' => $timezone]);
}

function filledPlaylist(Station $station, string $name): Playlist
{
    $playlist = Playlist::factory()->for($station)->create(['name' => $name]);
    $track = Track::factory()->for($station)->create();
    $playlist->tracks()->attach($track->id, ['position' => 1]);

    return $playlist;
}

function slot(Station $station, Playlist $playlist, array $days, string $start, string $end, ?string $label = null): AutodjSlot
{
    return AutodjSlot::factory()->create([
        'station_id' => $station->id,
        'playlist_id' => $playlist->id,
        'days' => $days,
        'start_time' => $start,
        'end_time' => $end,
        'label' => $label,
    ]);
}

function resolveAt(Station $station, string $when, string $timezone = 'Europe/Madrid'): array
{
    return app(AutoDjProgramme::class)->resolve(
        $station->fresh()->load('autodjSlots.playlist', 'defaultPlaylist'),
        CarbonImmutable::parse($when, $timezone),
    );
}

it('plays the default when nothing is scheduled', function () {
    $station = programmeStation();

    $programme = resolveAt($station, '2026-09-21 10:00');

    expect($programme['playlist']->id)->toBe($station->defaultPlaylist->id)
        ->and($programme['slot'])->toBeNull()
        ->and($programme['until'])->toBeNull()
        ->and($programme['next'])->toBeNull();
});

it('picks the slot whose window contains now, on a day it runs', function () {
    $station = programmeStation();
    $calm = filledPlaylist($station, 'Morning Calm');
    slot($station, $calm, [1, 2, 3, 4, 5], '06:00', '12:00');

    // Monday 2026-09-21, inside the window.
    $inside = resolveAt($station, '2026-09-21 09:30');
    expect($inside['playlist']->id)->toBe($calm->id)
        ->and($inside['until']->format('Y-m-d H:i'))->toBe('2026-09-21 12:00');

    // Monday, after it: the default, until tomorrow's window.
    $after = resolveAt($station, '2026-09-21 12:00');
    expect($after['playlist']->id)->toBe($station->defaultPlaylist->id)
        ->and($after['slot'])->toBeNull()
        ->and($after['until']->format('Y-m-d H:i'))->toBe('2026-09-22 06:00')
        ->and($after['next']['slot']->playlist_id)->toBe($calm->id);

    // Saturday: the slot does not run.
    $weekend = resolveAt($station, '2026-09-26 09:30');
    expect($weekend['playlist']->id)->toBe($station->defaultPlaylist->id);
});

it('runs a slot past midnight under the day it starts', function () {
    $station = programmeStation();
    $mix = filledPlaylist($station, 'Friday Night Mix');
    slot($station, $mix, [5], '22:00', '02:00');

    // Friday 2026-09-25 23:00 and Saturday 01:30 are both inside.
    expect(resolveAt($station, '2026-09-25 23:00')['playlist']->id)->toBe($mix->id)
        ->and(resolveAt($station, '2026-09-26 01:30')['playlist']->id)->toBe($mix->id)
        ->and(resolveAt($station, '2026-09-26 01:30')['until']->format('Y-m-d H:i'))->toBe('2026-09-26 02:00')
        // Saturday 02:00 is out, and Saturday 23:00 is not a Friday start.
        ->and(resolveAt($station, '2026-09-26 02:00')['slot'])->toBeNull()
        ->and(resolveAt($station, '2026-09-26 23:00')['slot'])->toBeNull();
});

it('wraps from Saturday night into Sunday', function () {
    $station = programmeStation();
    $late = filledPlaylist($station, 'Late');
    slot($station, $late, [6], '23:00', '01:00');

    expect(resolveAt($station, '2026-09-27 00:30')['playlist']->id)->toBe($late->id);
});

it('keeps the wall clock across the spring DST change', function () {
    // Madrid moves 02:00 → 03:00 on 2026-03-29 (a Sunday). A 06:00–12:00
    // slot is still 06:00–12:00 on the clock that day.
    $station = programmeStation();
    $calm = filledPlaylist($station, 'Calm');
    slot($station, $calm, [0], '06:00', '12:00');

    $programme = resolveAt($station, '2026-03-29 06:30');

    expect($programme['playlist']->id)->toBe($calm->id)
        ->and($programme['until']->format('H:i'))->toBe('12:00')
        ->and($programme['until']->utcOffset())->toBe(120);
});

it('keeps the wall clock across the autumn DST change', function () {
    // Madrid moves 03:00 → 02:00 on 2026-10-25 (a Sunday). A Saturday
    // 22:00–04:00 slot ends at 04:00 on the clock — five real hours.
    $station = programmeStation();
    $night = filledPlaylist($station, 'Night');
    slot($station, $night, [6], '22:00', '04:00');

    $programme = resolveAt($station, '2026-10-25 03:30');

    expect($programme['playlist']->id)->toBe($night->id)
        ->and($programme['until']->format('Y-m-d H:i'))->toBe('2026-10-25 04:00')
        ->and($programme['until']->utcOffset())->toBe(60);
});

it('falls through to the default when the scheduled playlist is empty', function () {
    $station = programmeStation();
    $empty = Playlist::factory()->for($station)->create(['name' => 'Nothing yet']);
    slot($station, $empty, [1], '06:00', '12:00');

    $programme = resolveAt($station, '2026-09-21 09:00');

    expect($programme['playlist']->id)->toBe($station->defaultPlaylist->id)
        ->and($programme['slot'])->toBeNull()
        // ...but still says when the situation changes.
        ->and($programme['until']->format('H:i'))->toBe('12:00');
});

it('treats a station without a timezone as unscheduled', function () {
    $station = programmeStation();
    $calm = filledPlaylist($station, 'Calm');
    slot($station, $calm, [1], '06:00', '12:00');
    $station->forceFill(['timezone' => null])->save();

    $programme = resolveAt($station, '2026-09-21 09:00', 'UTC');

    expect($programme['playlist']->id)->toBe($station->defaultPlaylist->id)
        ->and($programme['slot'])->toBeNull();
});

it('names the next slot while the default plays, across the week', function () {
    $station = programmeStation();
    $calm = filledPlaylist($station, 'Calm');
    slot($station, $calm, [3], '06:00', '12:00', 'Midweek');

    // Thursday: the next Wednesday is six days away.
    $programme = resolveAt($station, '2026-09-24 09:00');

    expect($programme['slot'])->toBeNull()
        ->and($programme['next']['slot']->label)->toBe('Midweek')
        ->and($programme['next']['starts_at']->format('Y-m-d H:i'))->toBe('2026-09-30 06:00');
});
