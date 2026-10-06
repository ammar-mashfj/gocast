<?php

use App\Models\AutodjSlot;
use App\Models\Plan;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistTracks;
use Carbon\CarbonImmutable;
use Illuminate\Testing\TestResponse;

/**
 * On-time starts and Laravel-decided jingles, through the endpoint the
 * container calls. `remaining` is the X-Gocast-Remaining header: how much of
 * the container's current track is left, so the answer starts at
 * now + remaining.
 *
 * Every station here is in UTC unless a test says otherwise, and every slot
 * runs every day, so the weekday the clock lands on never matters.
 */
beforeEach(function () {
    config([
        'services.internal_api_key' => 'test-internal-key',
        'liquidsoap.hard_start_early_seconds' => 20.0,
        // Listeners exactly on the container's timeline, unless a test says
        // otherwise, so the arithmetic below is the arithmetic of the plan.
        'liquidsoap.planning_lead_seconds' => 0,
    ]);
});

function ask(Station $station, ?float $remaining = 0.0): TestResponse
{
    $request = test()->withHeader('X-Internal-Key', 'test-internal-key');

    if ($remaining !== null) {
        $request = $request->withHeader('X-Gocast-Remaining', (string) $remaining);
    }

    return $request->get('/api/internal/next-track?slug='.$station->slug);
}

/** The title an answer plays, or null for 204. */
function titleOf(TestResponse $response): ?string
{
    return preg_match('/title="([^"]+)"/', (string) $response->getContent(), $m) ? $m[1] : null;
}

/** Where an answer is cut, in seconds of the file, or null when it plays whole. */
function cutOf(TestResponse $response): ?float
{
    return str_contains((string) $response->getContent(), 'liq_fade_out=')
        && preg_match('/liq_cue_out="([0-9.]+)"/', (string) $response->getContent(), $m) ? (float) $m[1] : null;
}

function at(string $time): CarbonImmutable
{
    $moment = CarbonImmutable::parse("2026-10-05 {$time}", 'UTC');
    test()->travelTo($moment);

    return $moment;
}

/**
 * A station whose default playlist holds `$songs` (title => seconds), in that
 * order, with nothing analysed — so a song's airtime is exactly its length.
 *
 * @param  array<string, float|int|null>  $songs
 */
function plannedStation(array $songs, string $order = Playlist::ORDER_SEQUENTIAL, array $attributes = []): Station
{
    $station = Station::factory()->withAutoDj()->create(array_merge(['timezone' => 'UTC'], $attributes));
    $station->defaultPlaylist->fill(['order' => $order])->save();

    $position = 1;
    foreach ($songs as $title => $seconds) {
        Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => $position++,
            'title' => $title,
            'duration_seconds' => $seconds ?? 0,
        ]);
    }

    return $station;
}

/**
 * A second playlist with its own songs, scheduled every day from `$start` for
 * an hour.
 *
 * @param  array<string, int>  $songs
 */
function slotAt(Station $station, string $start, string $mode, array $songs = ['Slot Song' => 200], string $end = '23:00'): AutodjSlot
{
    $playlist = Playlist::factory()->for($station)->create(['name' => 'Morning']);

    $ids = collect($songs)->map(fn (int $seconds, string $title) => Track::factory()->create([
        'station_id' => $station->id,
        'kind' => Track::KIND_MUSIC,
        'title' => $title,
        'duration_seconds' => $seconds,
    ])->getKey())->values()->all();

    // The factory files every music track under the default too, as an
    // upload does; these belong to the slot only.
    $station->defaultPlaylist->tracks()->detach($ids);
    app(PlaylistTracks::class)->attach($playlist, $ids);

    return AutodjSlot::factory()->create([
        'station_id' => $station->id,
        'playlist_id' => $playlist->id,
        'days' => [0, 1, 2, 3, 4, 5, 6],
        'start_time' => $start,
        'end_time' => $end,
        'start_mode' => $mode,
    ]);
}

function jingleFor(Station $station, string $title = 'Station ID', int $seconds = 5): Track
{
    return Track::factory()->for($station)->jingle()->create(['title' => $title, 'duration_seconds' => $seconds]);
}

// ── The clock ──

it('schedules the next track at when it will start, not at when it is asked for', function () {
    // The old behaviour: asked at 07:58 for the song after the current one,
    // the default playlist answered, and the slot began a song late.
    $station = plannedStation(['Default Song' => 200]);
    slotAt($station, '08:00', AutodjSlot::START_SOFT);

    at('07:58:00');

    expect(titleOf(ask($station, remaining: 150)))->toBe('Slot Song');
});

it('serves a container on an older script exactly as before', function () {
    // No header: the schedule as of now, and never a jingle — that container
    // still runs its own jingle arm.
    $station = plannedStation(['Default Song' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
    ]);
    jingleFor($station);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:58:00');

    expect(titleOf(ask($station, remaining: null)))->toBe('Default Song')
        ->and(titleOf(ask($station, remaining: null)))->toBe('Default Song');
});

it('plans in what listeners hear, a crossfade window behind the container', function () {
    // 240s fits a 07:56:00 → 08:00:00 gap in the container's timeline, but
    // listeners hear it 5s later, so it has to end 5s sooner.
    config(['liquidsoap.planning_lead_seconds' => 5]);
    $station = plannedStation(['A' => 240, 'B' => 240]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:56:00');

    expect(cutOf(ask($station)))->toBe(235.0);
});

it('places a back-to-back ask after the answer still loading, not after the track on air', function () {
    // request.dynamic sometimes asks again a fraction of a second later,
    // before the first answer has started. The second answer plays after A.
    $station = plannedStation(['A' => 100, 'B' => 30]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    $first = at('07:58:00');
    $a = ask($station, remaining: 3);
    test()->travelTo($first->addMilliseconds(150));
    $second = ask($station, remaining: 0);

    // A ends at 07:59:43, under the early window before 08:00.
    expect(titleOf($a))->toBe('A')
        ->and(titleOf($second))->toBe('Slot Song');
});

it('places a back-to-back ask after an answer that started at once', function () {
    // At boot, after a skip or a retry nothing is playing, so the first
    // answer starts the moment it is asked for and has already begun when
    // the double ask arrives. The second answer still plays after it.
    $station = plannedStation(['A' => 105, 'B' => 30]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    $first = at('07:58:00');
    $a = ask($station, remaining: 0);
    test()->travelTo($first->addMilliseconds(150));
    $second = ask($station, remaining: 0);

    // A ends at 07:59:45, under the early window before 08:00.
    expect(titleOf($a))->toBe('A')
        ->and(titleOf($second))->toBe('Slot Song');
});

it('does not treat an ask after a pause as back-to-back', function () {
    $station = plannedStation(['A' => 100, 'B' => 30]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:50:00');
    ask($station, remaining: 0);
    at('07:50:05');

    // Five seconds on, A is playing; what is asked for now follows it.
    expect(titleOf(ask($station, remaining: 95)))->toBe('B');
});

// ── Soft slots ──

it('lets the song playing at a soft slot finish', function () {
    $station = plannedStation(['Long' => 600]);
    slotAt($station, '08:00', AutodjSlot::START_SOFT);

    at('07:55:00');

    $response = ask($station);

    expect(titleOf($response))->toBe('Long')
        ->and(cutOf($response))->toBeNull();
});

// ── Hard slots ──

it('plays a song that ends before an on-time slot as it is', function () {
    $station = plannedStation(['Fits' => 240, 'After' => 240]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:50:00');

    $response = ask($station);

    expect(titleOf($response))->toBe('Fits')
        ->and(cutOf($response))->toBeNull();
});

it('takes a shorter song from further down the shuffle when the next one would run over', function () {
    $station = plannedStation(['Too Long A' => 300, 'Short' => 180, 'Too Long B' => 250], Playlist::ORDER_SHUFFLE);
    // Before the deck is set: adding the slot's songs deals them into it.
    slotAt($station, '08:00', AutodjSlot::START_HARD);
    $playlist = $station->defaultPlaylist;
    $ids = $playlist->tracks()->pluck('tracks.id')->map(fn ($id) => (string) $id)->all();
    // A known deal: [Too Long A, Short, Too Long B].
    $playlist->forceFill(['deck' => $ids])->save();

    at('07:56:40');

    $response = ask($station);

    expect(titleOf($response))->toBe('Short')
        ->and(cutOf($response))->toBeNull()
        // The two it skipped stay in the deck, in order: they play after.
        ->and($playlist->fresh()->deck)->toBe([$ids[0], $ids[2]]);
});

it('fades a song out at the slot start when nothing fits', function () {
    $station = plannedStation(['Long A' => 300, 'Long B' => 280], Playlist::ORDER_SHUFFLE);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:58:20');

    $response = ask($station);

    expect(titleOf($response))->toBeIn(['Long A', 'Long B'])
        ->and(cutOf($response))->toBe(100.0)
        ->and((string) $response->getContent())->toContain('liq_fade_out="2.000"');
});

it('never skips ahead in an in-order playlist, it cuts the next song instead', function () {
    $station = plannedStation(['First' => 300, 'Second' => 60]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:58:20');

    $response = ask($station);

    expect(titleOf($response))->toBe('First')
        ->and(cutOf($response))->toBe(100.0);
});

it('starts the slot a few seconds early rather than cut a song for it', function () {
    $station = plannedStation(['Default Song' => 200]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:59:45');

    expect(titleOf(ask($station)))->toBe('Slot Song');
});

it('lands the slot on time over a run of asks', function () {
    // 07:52:00 + 240 + 180 = 07:59:00, leaving 60s that no song fits: the
    // next song is cut to end at 08:00:00, and the slot starts there.
    $station = plannedStation(['A' => 240, 'B' => 180, 'C' => 200]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:52:00');
    $first = ask($station);
    at('07:52:01');
    $second = ask($station, remaining: 239);
    at('07:56:01');
    $third = ask($station, remaining: 179);
    at('07:59:01');
    $fourth = ask($station, remaining: 59);

    expect([titleOf($first), titleOf($second), titleOf($third), titleOf($fourth)])
        ->toBe(['A', 'B', 'C', 'Slot Song'])
        ->and(cutOf($first))->toBeNull()
        ->and(cutOf($second))->toBeNull()
        ->and(cutOf($third))->toBe(60.0);
});

it('plays an unknown-length song as normal while the boundary is far off', function () {
    $station = plannedStation(['Unknown' => null, 'Known' => 200]);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('06:00:00');

    $response = ask($station);

    expect(titleOf($response))->toBe('Unknown')
        ->and(cutOf($response))->toBeNull();
});

it('does not cut anything for an on-time slot whose playlist is empty', function () {
    // The default plays through an empty slot, so there is nothing to start.
    $station = plannedStation(['Long' => 600]);
    slotAt($station, '08:00', AutodjSlot::START_HARD, songs: []);

    at('07:55:00');

    expect(cutOf(ask($station)))->toBeNull();
});

// ── Jingles at set times ──

it('plays a set-time jingle on the hour', function () {
    $station = plannedStation(['Song' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0, 30],
    ]);
    jingleFor($station, 'Top of the hour');

    at('07:59:50');
    $jingle = ask($station);
    at('07:59:51');
    $next = ask($station, remaining: 5);

    expect(titleOf($jingle))->toBe('Top of the hour')
        ->and((string) $jingle->getContent())->toContain('jingle="true"')
        // Played once: the time is spent.
        ->and(titleOf($next))->toBe('Song');
});

it('picks songs that end before a set-time jingle', function () {
    $station = plannedStation(['Too Long' => 400, 'Fits' => 280], Playlist::ORDER_SHUFFLE, [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0],
    ]);
    $playlist = $station->defaultPlaylist;
    $playlist->forceFill(['deck' => $playlist->tracks()->pluck('tracks.id')->map(fn ($id) => (string) $id)->all()])->save();
    jingleFor($station);

    at('07:55:00');

    $response = ask($station);

    expect(titleOf($response))->toBe('Fits')
        ->and(cutOf($response))->toBeNull();
});

it('skips a set-time jingle that would play long after its time', function () {
    // Something held AutoDJ off the air across 08:00 — a live show, say.
    $station = plannedStation(['Song' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0],
    ]);
    jingleFor($station);

    at('08:05:00');

    expect(titleOf(ask($station)))->toBe('Song');
});

it('still plays a set-time jingle that is only a little late', function () {
    $station = plannedStation(['Song' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0],
    ]);
    jingleFor($station);

    at('08:00:40');

    expect(titleOf(ask($station)))->toBe('Station ID');
});

it('reads set times on the station clock in a half-hour zone', function () {
    // 02:30 UTC is 08:00 in Kolkata.
    $station = plannedStation(['Song' => 200], attributes: [
        'timezone' => 'Asia/Kolkata',
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0],
    ]);
    jingleFor($station);

    at('02:29:50');
    expect(titleOf(ask($station)))->toBe('Station ID');
});

it('plays the jingle first when it shares its time with an on-time slot', function () {
    $station = plannedStation(['Song' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0],
    ]);
    jingleFor($station);
    slotAt($station, '08:00', AutodjSlot::START_HARD);

    at('07:59:50');
    $first = ask($station);
    at('07:59:51');
    $second = ask($station, remaining: 5);

    expect([titleOf($first), titleOf($second)])->toBe(['Station ID', 'Slot Song']);
});

// ── Every-N jingles, now decided here ──

it('plays a jingle every N songs', function () {
    $station = plannedStation(['A' => 200, 'B' => 200, 'C' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 2,
    ]);
    jingleFor($station);

    at('07:00:00');

    $titles = collect(range(1, 5))->map(fn () => titleOf(ask($station)))->all();

    expect($titles)->toBe(['A', 'B', 'Station ID', 'C', 'A']);
});

it('starts an interval clock without opening on a jingle, then plays one when it is due', function () {
    $station = plannedStation(['A' => 200, 'B' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_INTERVAL,
        'jingle_interval_seconds' => 600,
    ]);
    jingleFor($station);

    at('07:00:00');
    $first = titleOf(ask($station));
    at('07:05:00');
    $early = titleOf(ask($station));
    at('07:10:00');
    $due = titleOf(ask($station));

    expect([$first, $early, $due])->toBe(['A', 'B', 'Station ID']);
});

it('holds an every-N jingle that would run into an on-time slot', function () {
    $station = plannedStation(['A' => 20], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
        'autodj_songs_since_jingle' => 5,
    ]);
    jingleFor($station, seconds: 30);
    slotAt($station, '08:00', AutodjSlot::START_HARD, songs: ['Slot Song' => 200]);

    at('07:59:35');

    expect(titleOf(ask($station)))->toBe('A');
});

it('alternates between two jingles rather than repeating one', function () {
    $station = plannedStation(['A' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
    ]);
    jingleFor($station, 'ID One');
    jingleFor($station, 'ID Two');

    at('07:00:00');

    $jingles = collect(range(1, 8))->map(fn () => titleOf(ask($station)))
        ->filter(fn (?string $t) => str_starts_with((string) $t, 'ID'))->values()->all();

    expect($jingles)->toHaveCount(4);
    for ($i = 1; $i < count($jingles); $i++) {
        expect($jingles[$i])->not->toBe($jingles[$i - 1]);
    }
});

it('plays no jingles once the owner loses AutoDJ', function () {
    $station = plannedStation(['A' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
        'autodj_songs_since_jingle' => 5,
    ]);
    jingleFor($station);
    $station->user->forceFill(['plan_id' => Plan::query()->where('slug', 'free')->value('id')])->save();

    at('07:00:00');

    ask($station)->assertNoContent();
});

it('plays no jingles on a station with nothing to rotate', function () {
    // Jingles punctuate music; a station of only IDs is what the sweep powers down.
    $station = plannedStation([], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
        'autodj_songs_since_jingle' => 5,
    ]);
    jingleFor($station);

    at('07:00:00');

    ask($station)->assertNoContent();
});

it('plays no jingle while the owner has jingles switched off', function () {
    $station = plannedStation(['A' => 200, 'B' => 200], attributes: [
        'jingles_enabled' => false,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
        'autodj_songs_since_jingle' => 5,
    ]);
    jingleFor($station);

    at('07:00:00');

    expect([titleOf(ask($station)), titleOf(ask($station))])->toBe(['A', 'B']);
});

it('keeps the music going when jingles are on but none are uploaded', function () {
    $station = plannedStation(['A' => 200, 'B' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
        'autodj_songs_since_jingle' => 5,
    ]);

    at('07:00:00');

    expect([titleOf(ask($station)), titleOf(ask($station))])->toBe(['A', 'B']);
});

it('never hands out a jingle that has been deleted', function () {
    $station = plannedStation(['A' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 1,
    ]);
    jingleFor($station, 'Kept ID');
    jingleFor($station, 'Deleted ID')->delete();

    at('07:00:00');

    $jingles = collect(range(1, 6))->map(fn () => titleOf(ask($station)))
        ->filter(fn (?string $t) => str_ends_with((string) $t, 'ID'))->unique()->values()->all();

    expect($jingles)->toBe(['Kept ID']);
});

it('never plays two jingles back to back, whatever the stored count', function () {
    // The request floors it at 1, but a row written some other way must not
    // turn the station into nothing but IDs.
    $station = plannedStation(['A' => 200, 'B' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 0,
    ]);
    jingleFor($station);

    at('07:00:00');

    $titles = collect(range(1, 6))->map(fn () => titleOf(ask($station)))->all();

    for ($i = 1; $i < count($titles); $i++) {
        expect($titles[$i] === 'Station ID' && $titles[$i - 1] === 'Station ID')->toBeFalse();
    }
});

it('never runs an interval clock faster than a minute, whatever is stored', function () {
    $station = plannedStation(['A' => 20, 'B' => 20, 'C' => 20], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_INTERVAL,
        'jingle_interval_seconds' => 5,
    ]);
    jingleFor($station);

    at('07:00:00');
    $first = titleOf(ask($station));
    at('07:00:30');
    $tooSoon = titleOf(ask($station));
    at('07:01:00');
    $due = titleOf(ask($station));

    expect([$first, $tooSoon, $due])->toBe(['A', 'B', 'Station ID']);
});

it('counts songs in every mode, so switching to every-N songs starts from the real count', function () {
    $station = plannedStation(['A' => 200, 'B' => 200, 'C' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_INTERVAL,
        'jingle_interval_seconds' => 3600,
    ]);
    jingleFor($station);

    at('07:00:00');
    ask($station);
    ask($station);

    $station->refresh()->forceFill([
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 2,
    ])->saveQuietly();

    expect(titleOf(ask($station)))->toBe('Station ID');
});

it('does not open on a jingle when the container starts long after the last one', function () {
    $station = plannedStation(['A' => 200, 'B' => 200, 'C' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_INTERVAL,
        'jingle_interval_seconds' => 600,
        // Off overnight: the last ID was yesterday evening.
        'autodj_last_jingle_at' => '2026-10-04 22:00:00',
    ]);
    jingleFor($station);

    at('09:00:00');
    app(LiquidsoapSupervisor::class)->up($station);

    $opening = titleOf(ask($station));
    at('09:05:00');
    $early = titleOf(ask($station));
    at('09:10:00');
    $due = titleOf(ask($station));

    expect([$opening, $early, $due])->toBe(['A', 'B', 'Station ID']);
});

it('does not open on an every-N jingle counted before the container stopped', function () {
    $station = plannedStation(['A' => 200, 'B' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TRACKS,
        'jingle_every_tracks' => 2,
        // Turned off just after the songs that made a jingle due.
        'autodj_songs_since_jingle' => 2,
    ]);
    jingleFor($station);

    at('09:00:00');
    app(LiquidsoapSupervisor::class)->up($station);

    expect([titleOf(ask($station)), titleOf(ask($station)), titleOf(ask($station))])
        ->toBe(['A', 'B', 'Station ID']);
});

it('leaves a set time due when the container starts just after it', function () {
    $station = plannedStation(['A' => 200], attributes: [
        'jingles_enabled' => true,
        'jingle_mode' => Station::JINGLE_MODE_TIMES,
        'jingle_times' => [0],
        'autodj_last_jingle_at' => '2026-10-05 07:00:00',
    ]);
    jingleFor($station);

    at('08:00:10');
    app(LiquidsoapSupervisor::class)->up($station);

    expect(titleOf(ask($station)))->toBe('Station ID');
});
