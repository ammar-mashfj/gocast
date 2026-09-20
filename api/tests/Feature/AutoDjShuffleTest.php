<?php

use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\AutoDjScheduler;

use function Pest\Laravel\actingAs;

/**
 * Shuffle mode, asserted through the scheduler rather than the HTTP endpoint —
 * the ordering rules are the thing under test, and NextTrackControllerTest
 * already covers the transport.
 *
 * Randomness cannot be asserted as a sequence, so every test here states an
 * invariant instead: what must be true of ANY deal. The deal is repeated where
 * a single pass could pass by luck.
 */
function shuffledStation(int $trackCount): Station
{
    // withAutoDj: a free owner gets null from AutoDjScheduler::next() whatever
    // is in the library, so a shuffle test on a default station tests nothing.
    $station = Station::factory()->withAutoDj()->create();
    $station->defaultPlaylist->fill(['order' => Playlist::ORDER_SHUFFLE])->save();

    // The factory attaches each music track to the default playlist, the
    // way an upload does.
    collect(range(1, $trackCount))->each(fn (int $n) => Track::factory()->create([
        'station_id' => $station->id,
        'kind' => Track::KIND_MUSIC,
        'position' => $n,
        'title' => "Song {$n}",
        'path' => "track-{$n}.mp3",
    ]));

    return $station;
}

/** Titles of the next $count tracks, in the order the scheduler hands them out. */
function playTitles(Station $station, int $count): array
{
    $scheduler = app(AutoDjScheduler::class);
    // Fresh each call: the scheduler walks the playlist it is handed, and
    // the test may have moved the deck or the order on since the last one.
    $station = $station->fresh()->load('user.plan', 'defaultPlaylist');

    return collect(range(1, $count))->map(function () use ($scheduler, $station) {
        preg_match('/title="([^"]+)"/', (string) $scheduler->next($station), $matches);

        return $matches[1];
    })->all();
}

it('plays every track exactly once before repeating any', function () {
    $station = shuffledStation(8);

    $cycle = playTitles($station, 8);

    expect(array_unique($cycle))->toHaveCount(8);
});

it('does not play the rotation in position order', function () {
    // Ten tracks, so a shuffle landing on the sequential order by chance is a
    // 1-in-3.6-million event. Without this a scheduler that ignored the mode
    // entirely would pass every other test in this file.
    $station = shuffledStation(10);

    $inOrder = collect(range(1, 10))->map(fn (int $n) => "Song {$n}")->all();

    expect(playTitles($station, 10))->not->toBe($inOrder);
});

it('never repeats a track back to back across the seam between two decks', function () {
    // The seam is the one repeat a deck cannot prevent on its own, and it only
    // occurs once per cycle — so this walks many cycles of a small rotation,
    // where the odds of hitting it untreated are high.
    $station = shuffledStation(3);

    $played = playTitles($station, 60);

    foreach (array_slice($played, 1) as $index => $title) {
        expect($title)->not->toBe($played[$index]);
    }
});

it('keeps the deck as the unplayed remainder', function () {
    $station = shuffledStation(5);

    playTitles($station, 2);

    expect($station->defaultPlaylist->fresh()->deck)->toHaveCount(3);
});

it('deals a fresh deck as soon as the last card is taken', function () {
    // Eager refill is what lets the seam be fixed without storing the
    // last-played track, so the deck must never be observed empty.
    $station = shuffledStation(4);

    playTitles($station, 4);

    expect($station->defaultPlaylist->fresh()->deck)->toHaveCount(4);
});

it('stores the deck as json rather than a stringified array', function () {
    // The deck is written with the query builder so a track boundary never
    // looks like an edit, and that bypasses the model's casts.
    // Encoding it by hand is therefore load-bearing: miss it and the column
    // quietly fills with "Array".
    $station = shuffledStation(3);

    playTitles($station, 1);

    $raw = DB::table('playlists')->where('id', $station->defaultPlaylist->id)->value('deck');

    expect(json_decode($raw, true))->toBeArray()->toHaveCount(2);
});

it('does not restart the container when the deck moves on', function () {
    // The guarantee that matters most here: a track boundary must not look
    // like a station edit, or every listener is dropped mid-song.
    $station = shuffledStation(3);
    $before = $station->updated_at;

    playTitles($station, 2);

    expect($station->fresh()->updated_at->eq($before))->toBeTrue();
});

it('skips a track deleted after the deck was dealt', function () {
    $station = shuffledStation(4);

    playTitles($station, 1);

    // Delete whatever is due next, so the dead ID sits at the head of the deck.
    $doomed = Track::query()->whereKey($station->defaultPlaylist->fresh()->deck[0])->firstOrFail();
    $doomedTitle = $doomed->title;
    $doomed->delete();

    // Only the two cards the deck has left — a third would come from a fresh
    // deal, which is allowed to repeat either of them.
    $rest = playTitles($station, 2);

    expect($rest)->not->toContain($doomedTitle)
        ->and(array_unique($rest))->toHaveCount(2);
});

it('picks up tracks added since the last deal on the next cycle', function () {
    $station = shuffledStation(3);

    playTitles($station, 3);

    Track::factory()->create([
        'station_id' => $station->id,
        'kind' => Track::KIND_MUSIC,
        'position' => 4,
        'title' => 'Song 4',
        'path' => 'track-4.mp3',
    ]);

    // The track is absent from the deck already dealt, so it airs in the cycle
    // after next — two full cycles is enough to see it without asserting which.
    expect(playTitles($station, 8))->toContain('Song 4');
});

it('repeats the only track a one track rotation has', function () {
    // Unavoidable, and the seam fix must not break trying to prevent it.
    $station = shuffledStation(1);

    expect(playTitles($station, 3))->toBe(['Song 1', 'Song 1', 'Song 1']);
});

it('answers with no track when the rotation is empty', function () {
    // Entitled, so the null below is genuinely about the empty library rather
    // than about the plan gate answering first.
    $station = Station::factory()->withAutoDj()->create();
    $station->defaultPlaylist->fill(['order' => Playlist::ORDER_SHUFFLE])->save();

    expect(app(AutoDjScheduler::class)->next($station))->toBeNull();
});

it('leaves sequential stations walking the rotation in order', function () {
    $station = shuffledStation(3);
    $station->defaultPlaylist->fill(['order' => Playlist::ORDER_SEQUENTIAL])->save();

    expect(playTitles($station, 4))->toBe(['Song 1', 'Song 2', 'Song 3', 'Song 1']);
});

it('deals a deck when an existing station is switched to shuffle', function () {
    // Every row predating the feature has a null deck, and so does any station
    // whose owner has only ever used sequential.
    $station = shuffledStation(5);
    $station->defaultPlaylist->forceFill(['deck' => null])->save();

    playTitles($station, 1);

    expect($station->defaultPlaylist->fresh()->deck)->toHaveCount(4);
});

/**
 * The setting is edited on the playlist it belongs to. Not gated on the plan,
 * matching how every other AutoDJ setting is treated: the gate is that a free
 * station's rotation never airs at all, so the ordering of a silent rotation
 * is not worth a second permission check.
 */
it('lets the owner switch a playlist to shuffle over the api', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $playlist = $station->defaultPlaylist;

    actingAs($owner)
        ->patchJson("/api/playlists/{$playlist->id}", ['order' => 'shuffle'])
        ->assertOk()
        ->assertJsonPath('data.order', 'shuffle');

    expect($playlist->fresh()->order)->toBe(Playlist::ORDER_SHUFFLE);
});

it('rejects a play order it does not have', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner)
        ->patchJson("/api/playlists/{$station->defaultPlaylist->id}", ['order' => 'random'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('order');
});

it('defaults new stations to sequential', function () {
    expect(Station::factory()->create()->defaultPlaylist->order)
        ->toBe(Playlist::ORDER_SEQUENTIAL);
});
