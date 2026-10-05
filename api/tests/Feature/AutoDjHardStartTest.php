<?php

use App\Models\AutodjSlot;
use App\Models\JingleList;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Services\AutoDjScheduler;
use Carbon\CarbonImmutable;

/**
 * Laravel's AutoDJ clock and hard starts, asserted through the scheduler.
 *
 * Every test pins the clock. The container asks for track N+1 the moment N
 * starts, so the answer starts at now + N's airtime; the first ask after a
 * boot (`fresh`) starts now. See docs/JINGLES-AND-HARD-SLOTS-PLAN.md.
 */
afterEach(fn () => CarbonImmutable::setTestNow());

function hsStation(string $timezone = 'UTC', string $order = Playlist::ORDER_SEQUENTIAL): Station
{
    $station = Station::factory()->withAutoDj()->create(['timezone' => $timezone]);
    $station->defaultPlaylist->fill(['order' => $order])->save();

    return $station;
}

/** A measured track on `$playlist` (the default when null), `$seconds` long. */
function hsTrack(Station $station, string $title, float $seconds, ?Playlist $playlist = null, bool $measured = true): Track
{
    $track = Track::factory()->for($station)->create([
        'title' => $title,
        'duration_seconds' => $seconds,
        'duration_measured_at' => $measured ? now() : null,
        'path' => strtolower(str_replace(' ', '-', $title)).'.mp3',
    ]);

    if ($playlist !== null) {
        $track->playlists()->detach();
        $playlist->tracks()->attach($track->id, ['position' => $playlist->tracks()->count() + 1]);
    }

    return $track;
}

function hsSlot(Station $station, Playlist $playlist, string $start, string $end, string $mode = AutodjSlot::START_HARD, array $days = [0, 1, 2, 3, 4, 5, 6]): AutodjSlot
{
    return AutodjSlot::factory()->create([
        'station_id' => $station->id,
        'playlist_id' => $playlist->id,
        'days' => $days,
        'start_time' => $start,
        'end_time' => $end,
        'start_mode' => $mode,
    ]);
}

/** Ask for the next track at `$at` (station time), as a planning script. */
function hsNext(Station $station, string $at, bool $fresh = false, int $script = AutoDjScheduler::PLANNING_SCRIPT): ?string
{
    CarbonImmutable::setTestNow(CarbonImmutable::parse($at, $station->timezone ?? 'UTC'));

    $loaded = Station::query()
        ->with(['user.plan', 'defaultPlaylist', 'autodjSlots.playlist', 'jingleLists'])
        ->findOrFail($station->id);

    return app(AutoDjScheduler::class)->next($loaded, fresh: $fresh, script: $script);
}

function hsTitle(?string $uri): ?string
{
    return $uri !== null && preg_match('/title="([^"]+)"/', $uri, $m) ? $m[1] : null;
}

function hsCueOut(?string $uri): ?string
{
    return $uri !== null && preg_match('/liq_cue_out="([^"]+)"/', $uri, $m) ? $m[1] : null;
}

// --- The clock ------------------------------------------------------------

it('starts the first track after a boot now', function () {
    $station = hsStation();
    hsTrack($station, 'One', 200);

    hsNext($station, '2026-10-05 07:00:00', fresh: true);

    $station->refresh();
    expect($station->autodj_queued_starts_at->toDateTimeString())->toBe('2026-10-05 07:00:00')
        ->and($station->autodj_queued_seconds)->toBe(200.0);
});

it('starts the next track when the one handed out before it ends', function () {
    $station = hsStation();
    hsTrack($station, 'One', 200);
    hsTrack($station, 'Two', 150);

    hsNext($station, '2026-10-05 07:00:00', fresh: true);
    // Liquidsoap asks again the moment One starts — about now.
    hsNext($station, '2026-10-05 07:00:00.3');

    expect($station->fresh()->autodj_queued_starts_at->format('H:i:s.v'))->toBe('07:03:20.300');
});

it('re-anchors on now at every ask, so a live show leaves no error behind', function () {
    // The queued track waited out a 40-minute live show. It starts when the
    // show ends — now — and the clock follows, rather than carrying the old
    // prediction forward.
    $station = hsStation();
    hsTrack($station, 'One', 200);
    hsTrack($station, 'Two', 150);

    hsNext($station, '2026-10-05 07:00:00', fresh: true);
    hsNext($station, '2026-10-05 07:40:00');

    expect($station->fresh()->autodj_queued_starts_at->format('H:i:s'))->toBe('07:43:20');
});

it('starts the slot with the first track that starts inside it, not one song late', function () {
    // Asked at 07:58 for the track after a 3-minute one: it starts at 08:01,
    // inside the soft slot, so it is the slot's.
    $station = hsStation();
    hsTrack($station, 'Default song', 180);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00', AutodjSlot::START_SOFT);

    hsNext($station, '2026-10-05 07:58:00', fresh: true);
    $uri = hsNext($station, '2026-10-05 07:58:00');

    expect(hsTitle($uri))->toBe('Morning song');
});

// --- Hard slots -------------------------------------------------------------

it('fades the song out on a hard slot start when the playlist is in order', function () {
    // In order is never fit-picked: an owner who set an order gets it.
    $station = hsStation();
    hsTrack($station, 'Long', 300);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');

    $uri = hsNext($station, '2026-10-05 07:57:00', fresh: true);

    expect(hsTitle($uri))->toBe('Long')
        ->and(hsCueOut($uri))->toBe('180.000')
        ->and($uri)->toContain('liq_fade_out="2.000"')
        ->and($station->fresh()->autodj_queued_seconds)->toBe(180.0);

    // The next ask comes as Long starts; the slot is due exactly on time.
    expect(hsTitle(hsNext($station, '2026-10-05 07:57:00')))->toBe('Morning song');
});

it('picks a song that ends in time from a shuffled deck, keeping the one it skipped', function () {
    $station = hsStation(order: Playlist::ORDER_SHUFFLE);
    $long = hsTrack($station, 'Long', 300);
    $short = hsTrack($station, 'Short', 150);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');
    $station->defaultPlaylist->forceFill(['deck' => [$long->id, $short->id]])->save();

    $uri = hsNext($station, '2026-10-05 07:57:00', fresh: true);

    expect(hsTitle($uri))->toBe('Short')
        ->and(hsCueOut($uri))->toBeNull()
        ->and($station->defaultPlaylist->fresh()->deck)->toBe([$long->id]);
});

it('never fills with a song whose length is only the header guess', function () {
    $station = hsStation(order: Playlist::ORDER_SHUFFLE);
    $long = hsTrack($station, 'Long', 300);
    $guess = hsTrack($station, 'Guess', 120, measured: false);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');
    $station->defaultPlaylist->forceFill(['deck' => [$long->id, $guess->id]])->save();

    $uri = hsNext($station, '2026-10-05 07:57:00', fresh: true);

    expect(hsTitle($uri))->toBe('Long')->and(hsCueOut($uri))->toBe('180.000');
});

it('starts a hard slot early rather than play a few seconds of a song', function () {
    $station = hsStation();
    hsTrack($station, 'Default song', 200);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');

    $uri = hsNext($station, '2026-10-05 07:59:45', fresh: true);

    expect(hsTitle($uri))->toBe('Morning song')->and(hsCueOut($uri))->toBeNull();
});

it('fades a song from 20 seconds out rather than start the slot that early', function () {
    $station = hsStation();
    hsTrack($station, 'Default song', 200);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');

    $uri = hsNext($station, '2026-10-05 07:59:30', fresh: true);

    expect(hsTitle($uri))->toBe('Default song')->and(hsCueOut($uri))->toBe('30.000');
});

it('fills the last half minute before a hard slot with a jingle that fits', function () {
    $station = hsStation();
    hsTrack($station, 'Default song', 200);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');
    // Switched on but not due: every 50 songs.
    $ids = JingleList::factory()->for($station)->create(['every_songs' => 50]);
    Track::factory()->for($station)->jingle()->create([
        'jingle_list_id' => $ids->id, 'title' => 'ID', 'duration_seconds' => 15.0, 'duration_measured_at' => now(),
    ]);

    $uri = hsNext($station, '2026-10-05 07:59:30', fresh: true);
    expect(hsTitle($uri))->toBe('ID')->and($uri)->toContain('jingle="true"');

    // 15s left after the ID: within the early window, so the slot starts.
    expect(hsTitle(hsNext($station, '2026-10-05 07:59:30')))->toBe('Morning song');
});

it('holds over a due jingle that would run past a hard slot start', function () {
    // A 90-second promo is due a minute before the slot: played, it would
    // start the slot half a minute late, and nothing fades a jingle.
    $station = hsStation();
    hsTrack($station, 'Default song', 200);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');
    $promos = JingleList::factory()->for($station)->create(['every_songs' => 1, 'songs_since' => 5]);
    Track::factory()->for($station)->jingle()->create([
        'jingle_list_id' => $promos->id, 'title' => 'Promo', 'duration_seconds' => 90.0, 'duration_measured_at' => now(),
    ]);

    $uri = hsNext($station, '2026-10-05 07:59:00', fresh: true);

    expect(hsTitle($uri))->toBe('Default song')->and(hsCueOut($uri))->toBe('60.000');
});

it('plays a due jingle that ends before a hard slot start', function () {
    $station = hsStation();
    hsTrack($station, 'Default song', 200);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');
    $promos = JingleList::factory()->for($station)->create(['every_songs' => 1, 'songs_since' => 5]);
    Track::factory()->for($station)->jingle()->create([
        'jingle_list_id' => $promos->id, 'title' => 'Promo', 'duration_seconds' => 45.0, 'duration_measured_at' => now(),
    ]);

    expect(hsTitle(hsNext($station, '2026-10-05 07:59:00', fresh: true)))->toBe('Promo');
});

it('handles a hard slot at midnight', function () {
    // Friday 23:58 → the Saturday slot at 00:00.
    $station = hsStation();
    hsTrack($station, 'Late', 300);
    $weekend = Playlist::factory()->for($station)->create(['name' => 'Weekend']);
    hsTrack($station, 'Weekend song', 200, $weekend);
    hsSlot($station, $weekend, '00:00', '06:00', days: [6]);

    $uri = hsNext($station, '2026-10-09 23:58:00', fresh: true);

    expect(hsTitle($uri))->toBe('Late')->and(hsCueOut($uri))->toBe('120.000');
});

it('times a hard slot in the station timezone', function () {
    // 08:00 in Riyadh is 05:00 UTC.
    $station = hsStation('Asia/Riyadh');
    hsTrack($station, 'Long', 300);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');

    $uri = hsNext($station, '2026-10-05 07:58:00', fresh: true);

    expect(hsCueOut($uri))->toBe('120.000');
});

it('leaves a soft slot alone: the song finishes', function () {
    $station = hsStation();
    hsTrack($station, 'Long', 300);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00', AutodjSlot::START_SOFT);

    expect(hsCueOut(hsNext($station, '2026-10-05 07:57:00', fresh: true)))->toBeNull();
});

it('ignores a hard slot whose playlist is empty', function () {
    // It would fall through to the default, so nothing changes at 08:00.
    $station = hsStation();
    hsTrack($station, 'Long', 300);
    $empty = Playlist::factory()->for($station)->create(['name' => 'Empty']);
    hsSlot($station, $empty, '08:00', '10:00');

    expect(hsCueOut(hsNext($station, '2026-10-05 07:57:00', fresh: true)))->toBeNull();
});

it('ignores a hard start that keeps the same playlist on air', function () {
    // An all-day slot every day starts again at each midnight, but the same
    // playlist is already playing: nothing changes, so nothing is cut.
    $station = hsStation();
    $allDay = Playlist::factory()->for($station)->create(['name' => 'All day']);
    hsTrack($station, 'All-day song', 300, $allDay);
    hsSlot($station, $allDay, '00:00', '00:00');

    expect(hsCueOut(hsNext($station, '2026-10-05 23:58:00', fresh: true)))->toBeNull();
});

it('ignores a hard slot on the playlist that is already the default', function () {
    $station = hsStation();
    hsTrack($station, 'Long', 300);
    hsSlot($station, $station->defaultPlaylist, '08:00', '10:00');

    expect(hsCueOut(hsNext($station, '2026-10-05 07:57:00', fresh: true)))->toBeNull();
});

it('never trims or serves jingles to a container on an older script', function () {
    // It plays its own jingles and has no fade: a trim would be a hard cut,
    // and a jingle from here would be a second one.
    $station = hsStation();
    hsTrack($station, 'Long', 300);
    $morning = Playlist::factory()->for($station)->create(['name' => 'Morning']);
    hsTrack($station, 'Morning song', 200, $morning);
    hsSlot($station, $morning, '08:00', '10:00');
    $ids = JingleList::factory()->for($station)->create(['every_songs' => 1, 'songs_since' => 5]);
    Track::factory()->for($station)->jingle()->create(['jingle_list_id' => $ids->id]);

    $uri = hsNext($station, '2026-10-05 07:57:00', fresh: true, script: 1);

    expect(hsTitle($uri))->toBe('Long')->and(hsCueOut($uri))->toBeNull();
});
