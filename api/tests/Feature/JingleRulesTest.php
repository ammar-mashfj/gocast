<?php

use App\Models\AutodjSlot;
use App\Models\JingleList;
use App\Models\Plan;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Services\AutoDjScheduler;
use Carbon\CarbonImmutable;

/**
 * Jingle lists and their rules, asserted through the scheduler: what is
 * handed to the container at each break, given the time that break starts.
 *
 *   "Play a [pick] jingle from [list] [how often], [when]."
 */
afterEach(fn () => CarbonImmutable::setTestNow());

function jrStation(string $timezone = 'UTC'): Station
{
    $station = Station::factory()->withAutoDj()->create(['timezone' => $timezone]);

    foreach (range(1, 6) as $n) {
        Track::factory()->for($station)->create([
            'title' => "Song {$n}",
            'duration_seconds' => 180,
            'duration_measured_at' => now(),
            'position' => $n,
        ]);
    }

    return $station;
}

/** @param  list<string>  $titles */
function jrList(Station $station, array $titles, array $attributes = []): JingleList
{
    $list = JingleList::factory()->for($station)->create($attributes);

    foreach ($titles as $i => $title) {
        Track::factory()->for($station)->jingle()->create([
            'jingle_list_id' => $list->id,
            'title' => $title,
            'duration_seconds' => 6,
            'duration_measured_at' => now(),
            'position' => $i + 1,
        ]);
    }

    return $list;
}

/**
 * Titles handed out by successive asks starting at `$from`, each ask made
 * the moment the previous answer starts, as Liquidsoap does.
 *
 * @return list<string>
 */
function jrPlay(Station $station, string $from, int $count): array
{
    $at = CarbonImmutable::parse($from, $station->timezone ?? 'UTC');
    $titles = [];

    foreach (range(1, $count) as $i) {
        CarbonImmutable::setTestNow($at);

        $loaded = Station::query()
            ->with(['user.plan', 'defaultPlaylist', 'autodjSlots.playlist', 'jingleLists'])
            ->findOrFail($station->id);

        $uri = app(AutoDjScheduler::class)->next($loaded, fresh: $i === 1, script: AutoDjScheduler::PLANNING_SCRIPT);
        preg_match('/title="([^"]+)"/', (string) $uri, $m);
        $titles[] = $m[1] ?? '-';

        // The next ask comes when this answer starts.
        $at = $loaded->autodj_queued_starts_at;
    }

    return $titles;
}

it('plays a jingle every N songs', function () {
    $station = jrStation();
    jrList($station, ['ID'], ['every_songs' => 2]);

    expect(jrPlay($station, '2026-10-05 07:00', 7))
        ->toBe(['Song 1', 'Song 2', 'ID', 'Song 3', 'Song 4', 'ID', 'Song 5']);
});

it('plays a jingle every N minutes, judged at the break', function () {
    // Songs are three minutes. First break: never played, so due. Then the
    // first break at least ten minutes after it.
    $station = jrStation();
    jrList($station, ['ID'], ['frequency' => JingleList::FREQUENCY_MINUTES, 'every_minutes' => 10, 'every_songs' => null]);

    expect(jrPlay($station, '2026-10-05 07:00', 7))
        ->toBe(['ID', 'Song 1', 'Song 2', 'Song 3', 'Song 4', 'ID', 'Song 5']);
});

it('never plays two jingles back to back', function () {
    $station = jrStation();
    jrList($station, ['A'], ['every_songs' => 1, 'songs_since' => 5]);
    jrList($station, ['B'], ['every_songs' => 1, 'songs_since' => 5]);

    $played = jrPlay($station, '2026-10-05 07:00', 6);

    foreach (range(1, 5) as $i) {
        expect(str_starts_with($played[$i], 'Song') || str_starts_with($played[$i - 1], 'Song'))->toBeTrue();
    }
});

it('plays a set-time jingle at the first break after its time', function () {
    $station = jrStation();
    jrList($station, ['Top of the hour'], ['frequency' => JingleList::FREQUENCY_TIMES, 'times' => ['08:00'], 'every_songs' => null]);

    // Breaks at 07:57, 08:00, 08:03 …
    expect(jrPlay($station, '2026-10-05 07:57', 4))
        ->toBe(['Song 1', 'Top of the hour', 'Song 2', 'Song 3']);
});

it('does not play a set-time jingle long after its time', function () {
    // The station came on air at 09:00: the 08:00 ID is not owed any more.
    $station = jrStation();
    jrList($station, ['Top of the hour'], ['frequency' => JingleList::FREQUENCY_TIMES, 'times' => ['08:00'], 'every_songs' => null]);

    expect(jrPlay($station, '2026-10-05 09:00', 2))->toBe(['Song 1', 'Song 2']);
});

it('fades the song so an exact-time jingle plays on the dot, then the playlist carries on', function () {
    $station = jrStation();
    jrList($station, ['Top of the hour'], ['frequency' => JingleList::FREQUENCY_TIMES, 'times' => ['08:00'], 'exact' => true, 'every_songs' => null]);

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-05 07:58:00'));
    $loaded = Station::query()->with(['user.plan', 'defaultPlaylist', 'autodjSlots.playlist', 'jingleLists'])->findOrFail($station->id);
    $uri = app(AutoDjScheduler::class)->next($loaded, fresh: true, script: AutoDjScheduler::PLANNING_SCRIPT);

    expect($uri)->toContain('title="Song 1"')
        ->toContain('liq_cue_out="120.000"')
        ->toContain('liq_fade_out=');

    expect(jrPlay($station, '2026-10-05 08:00', 3))->toBe(['Top of the hour', 'Song 2', 'Song 3']);
});

it('holds an interval jingle that would leave an exact-time jingle stranded behind it', function () {
    // Song 1 ends 07:59:35. A sweeper there would end 07:59:41, inside the
    // early window of 08:00 — and the 08:00 ID cannot follow it straight
    // away (no two jingles back to back), so the song after would play out
    // in full and the ID would land minutes late. Hold the sweeper instead:
    // the song fades on 08:00, the ID plays on the dot, the sweeper after.
    $station = jrStation();
    jrList($station, ['Sweeper'], ['every_songs' => 1]);
    jrList($station, ['Top of the hour'], ['frequency' => JingleList::FREQUENCY_TIMES, 'times' => ['08:00'], 'exact' => true, 'every_songs' => null]);

    expect(jrPlay($station, '2026-10-05 07:56:35', 5))
        ->toBe(['Song 1', 'Song 2', 'Top of the hour', 'Song 3', 'Sweeper']);
});

it('plays a set-time list before an interval list when both are due', function () {
    $station = jrStation();
    jrList($station, ['Sweeper'], ['every_songs' => 1, 'songs_since' => 3]);
    jrList($station, ['Top of the hour'], ['frequency' => JingleList::FREQUENCY_TIMES, 'times' => ['08:00'], 'every_songs' => null]);

    // The loser waits for the next break.
    expect(jrPlay($station, '2026-10-05 08:00', 4))->toBe(['Top of the hour', 'Song 1', 'Sweeper', 'Song 2']);
});

it('plays the clips of an in-order list in turn', function () {
    $station = jrStation();
    jrList($station, ['One', 'Two', 'Three'], ['pick' => JingleList::PICK_IN_ORDER, 'every_songs' => 1]);

    $jingles = array_values(array_filter(jrPlay($station, '2026-10-05 07:00', 9), fn ($t) => ! str_starts_with($t, 'Song')));

    expect($jingles)->toBe(['One', 'Two', 'Three', 'One']);
});

it('plays every clip of a random list once before any twice', function () {
    $station = jrStation();
    jrList($station, ['A', 'B', 'C'], ['every_songs' => 1]);

    $jingles = array_values(array_filter(jrPlay($station, '2026-10-05 07:00', 7), fn ($t) => ! str_starts_with($t, 'Song')));

    expect($jingles)->toHaveCount(3)->and(array_unique($jingles))->toHaveCount(3);
});

it('always plays the pinned clip of a single-pick list', function () {
    $station = jrStation();
    $list = jrList($station, ['A', 'B'], ['pick' => JingleList::PICK_SINGLE, 'every_songs' => 1]);
    $list->update(['pinned_track_id' => $list->tracks()->where('title', 'B')->value('id')]);

    $jingles = array_values(array_filter(jrPlay($station, '2026-10-05 07:00', 6), fn ($t) => ! str_starts_with($t, 'Song')));

    expect(array_unique($jingles))->toBe(['B']);
});

it('only plays a list inside its hours and days', function () {
    // Weekdays 07:00–10:00. 2026-10-05 is a Monday; 2026-10-10 a Saturday.
    $station = jrStation();
    jrList($station, ['Morning ID'], ['every_songs' => 1, 'days' => [1, 2, 3, 4, 5], 'from_time' => '07:00', 'to_time' => '10:00']);

    // Breaks at 06:50, 06:53, 06:56, 06:59, then 07:02 — the first inside.
    expect(jrPlay($station, '2026-10-05 06:50', 5))->toBe(['Song 1', 'Song 2', 'Song 3', 'Song 4', 'Morning ID'])
        ->and(jrPlay($station, '2026-10-10 08:00', 2))->toBe(['Song 5', 'Song 6']);
});

it('runs a list window past midnight', function () {
    // Friday 22:00–02:00 covers Saturday 01:00.
    $station = jrStation();
    jrList($station, ['Night ID'], ['every_songs' => 1, 'days' => [5], 'from_time' => '22:00', 'to_time' => '02:00']);

    expect(jrPlay($station, '2026-10-10 01:00', 2))->toContain('Night ID');
});

it('plays nothing from a switched-off or empty list', function () {
    $station = jrStation();
    jrList($station, ['Off'], ['every_songs' => 1, 'enabled' => false]);
    jrList($station, [], ['every_songs' => 1]);

    expect(jrPlay($station, '2026-10-05 07:00', 4))->toBe(['Song 1', 'Song 2', 'Song 3', 'Song 4']);
});

it('plays no jingles for an owner without AutoDJ', function () {
    $station = jrStation();
    jrList($station, ['ID'], ['every_songs' => 1]);
    $station->user->forceFill(['plan_id' => Plan::query()->where('slug', 'free')->value('id')])->save();

    expect(jrPlay($station, '2026-10-05 07:00', 2))->toBe(['-', '-']);
});

it('plays jingles over a scheduled playlist too', function () {
    $station = jrStation();
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    $track = Track::factory()->for($station)->create(['title' => 'Morning song', 'duration_seconds' => 180, 'duration_measured_at' => now()]);
    $track->playlists()->sync([$morning->id => ['position' => 1]]);
    AutodjSlot::factory()->create([
        'station_id' => $station->id, 'playlist_id' => $morning->id, 'days' => [1],
        'start_time' => '07:00', 'end_time' => '10:00',
    ]);
    jrList($station, ['ID'], ['every_songs' => 1]);

    expect(jrPlay($station, '2026-10-05 07:00', 3))->toBe(['Morning song', 'ID', 'Morning song']);
});

it('plays no jingles on a station with no music to punctuate', function () {
    // A jingle on the meter every few minutes would keep the station scored
    // as in use, so it would never power down.
    $station = Station::factory()->withAutoDj()->create(['timezone' => 'UTC']);
    jrList($station, ['ID'], ['frequency' => JingleList::FREQUENCY_MINUTES, 'every_minutes' => 5, 'every_songs' => null]);

    expect(jrPlay($station, '2026-10-05 07:00', 2))->toBe(['-', '-']);
});

it('never plays two jingles back to back even when the first has no measured length', function () {
    // A clip the analysis has not reached yet has no airtime to queue, but
    // it was still a jingle: the next answer must be a song.
    $station = jrStation();
    $a = JingleList::factory()->for($station)->create(['every_songs' => 1, 'songs_since' => 5, 'position' => 1]);
    $b = JingleList::factory()->for($station)->create(['every_songs' => 1, 'songs_since' => 5, 'position' => 2]);
    Track::factory()->for($station)->jingle()->create(['jingle_list_id' => $a->id, 'title' => 'A', 'duration_seconds' => 0, 'duration_measured_at' => null]);
    Track::factory()->for($station)->jingle()->create(['jingle_list_id' => $b->id, 'title' => 'B', 'duration_seconds' => 0, 'duration_measured_at' => null]);

    expect(jrPlay($station, '2026-10-05 07:00', 4))->toBe(['A', 'Song 1', 'B', 'Song 2']);
});
