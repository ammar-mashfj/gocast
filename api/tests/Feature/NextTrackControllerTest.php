<?php

use App\Models\Plan;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use Illuminate\Testing\TestResponse;

/**
 * The endpoint every running station asks once per track boundary. It is on
 * the audio path: a wrong answer here is silence or a repeated song, so the
 * ordering contract is asserted rather than assumed.
 */
beforeEach(function () {
    config(['services.internal_api_key' => 'test-internal-key']);

    // withAutoDj: the gate in AutoDjScheduler::next() answers 204 for a free
    // owner, and `users.plan_id` defaults to free. Every ordering assertion
    // below is about a station that is entitled to play something.
    $this->station = Station::factory()->withAutoDj()->create();

    $this->tracks = collect(range(1, 3))->map(fn (int $n) => Track::factory()->create([
        'station_id' => $this->station->id,
        'kind' => Track::KIND_MUSIC,
        'position' => $n,
        'title' => "Song {$n}",
        'path' => "track-{$n}.mp3",
    ]));
});

function askForNextTrack(string $slug): TestResponse
{
    return test()->withHeader('X-Internal-Key', 'test-internal-key')
        ->get('/api/internal/next-track?slug='.$slug);
}

it('plays the rotation top to bottom and wraps', function () {
    $titles = collect(range(1, 4))->map(function () {
        $body = askForNextTrack($this->station->slug)->assertOk()->getContent();

        preg_match('/title="([^"]+)"/', $body, $matches);

        return $matches[1];
    })->all();

    expect($titles)->toBe(['Song 1', 'Song 2', 'Song 3', 'Song 1']);
});

it('answers with an annotate uri liquidsoap can resolve', function () {
    $response = askForNextTrack($this->station->slug)->assertOk();

    expect($response->headers->get('Content-Type'))->toStartWith('text/plain')
        ->and($response->getContent())->toStartWith('annotate:')
        // The container path, not the host path — the file is mounted in.
        ->and($response->getContent())->toContain(':/data/playlists/track-1.mp3');
});

it('remembers where the rotation got to', function () {
    askForNextTrack($this->station->slug);
    askForNextTrack($this->station->slug);

    expect($this->station->defaultPlaylist->fresh()->cursor_position)->toBe(2);
});

/**
 * The cursor update runs at every track boundary on every station. It lives
 * on the playlist now, but the station row must still not move: anything
 * that went through the Station model would fire StationObserver, which
 * re-renders the .liq and restarts the container — a restart per track,
 * fleet-wide.
 */
it('does not disturb the station row', function () {
    $before = $this->station->fresh()->updated_at;

    askForNextTrack($this->station->slug);

    expect($this->station->fresh()->updated_at->eq($before))->toBeTrue();
});

it('skips a track that was deleted from under the cursor', function () {
    askForNextTrack($this->station->slug);        // Song 1
    $this->tracks[1]->delete();                   // Song 2 goes away

    $body = askForNextTrack($this->station->slug)->assertOk()->getContent();

    expect($body)->toContain('Song 3');
});

it('ignores jingles, which have their own source', function () {
    Track::factory()->create([
        'station_id' => $this->station->id,
        'kind' => Track::KIND_JINGLE,
        'position' => 1,
        'title' => 'Station ID',
    ]);

    collect(range(1, 4))->each(function () {
        expect(askForNextTrack($this->station->slug)->getContent())->not->toContain('Station ID');
    });
});

it('answers 204 when the station has no rotation', function () {
    $empty = Station::factory()->withAutoDj()->create();

    askForNextTrack($empty->slug)->assertNoContent();
});

describe('the plan gate', function () {
    /**
     * The hole this closes. Nothing in the rendered .liq knows about plans —
     * the AutoDJ arm is written into every station's script — and a plan
     * change never restarts a container, so before this guard a downgraded
     * station kept asking here and kept being handed its whole library. It
     * only lost the ability to upload NEW tracks.
     */
    it('answers 204 once the owner is off an AutoDJ plan', function () {
        $station = Station::factory()->withAutoDj()->create();

        Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => 1,
            'title' => 'Song 1',
            'path' => 'track-1.mp3',
        ]);

        askForNextTrack($station->slug)->assertOk();

        $station->user->forceFill(['plan_id' => Plan::where('slug', 'free')->value('id')])->save();

        askForNextTrack($station->slug)->assertNoContent();
    });

    it('goes quiet when a granted term runs out', function () {
        // End to end, through the thing that actually performs a downgrade.
        // plans:expire only rewrites `plan_id`; this is what turns that column
        // into silence on air.
        $station = Station::factory()->withAutoDj()->create();
        $station->user->forceFill(['plan_expires_at' => now()->subMinute()])->save();

        Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => 1,
            'title' => 'Song 1',
            'path' => 'track-1.mp3',
        ]);

        askForNextTrack($station->slug)->assertOk();

        test()->artisan('plans:expire')->assertSuccessful();

        askForNextTrack($station->slug)->assertNoContent();
    });

    /**
     * The container polls this every `autodj_retry_delay` seconds for as long
     * as it runs. Advancing the cursor on each of those would leave the owner
     * a scrambled running order if they ever come back onto a plan.
     */
    it('does not move the cursor while it is refusing', function () {
        $station = Station::factory()->withAutoDj()->create();

        collect(range(1, 3))->each(fn (int $n) => Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => $n,
            'title' => "Song {$n}",
            'path' => "track-{$n}.mp3",
        ]));

        askForNextTrack($station->slug)->assertOk();

        $cursor = $station->defaultPlaylist->fresh()->cursor_position;

        $station->user->forceFill(['plan_id' => Plan::where('slug', 'free')->value('id')])->save();

        collect(range(1, 5))->each(fn () => askForNextTrack($station->slug)->assertNoContent());

        expect($station->defaultPlaylist->fresh()->cursor_position)->toBe($cursor);
    });

    it('does not deal a new shuffle deck while it is refusing', function () {
        // Same reasoning as the cursor, for the other ordering mode: the deck
        // is what makes shuffle avoid repeats, and burning through it on a
        // refusal is the same lost state in a different column.
        $station = Station::factory()->withAutoDj()->create();
        $station->defaultPlaylist->fill(['order' => Playlist::ORDER_SHUFFLE])->save();

        collect(range(1, 3))->each(fn (int $n) => Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => $n,
            'title' => "Song {$n}",
            'path' => "track-{$n}.mp3",
        ]));

        askForNextTrack($station->slug)->assertOk();

        $deck = $station->defaultPlaylist->fresh()->deck;

        $station->user->forceFill(['plan_id' => Plan::where('slug', 'free')->value('id')])->save();

        collect(range(1, 5))->each(fn () => askForNextTrack($station->slug)->assertNoContent());

        expect($station->defaultPlaylist->fresh()->deck)->toBe($deck);
    });

    it('picks the rotation back up unchanged when the plan comes back', function () {
        // The practical consequence of leaving the cursor alone: a re-granted
        // account resumes where it stopped instead of restarting at song one.
        $station = Station::factory()->withAutoDj()->create();

        collect(range(1, 3))->each(fn (int $n) => Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => $n,
            'title' => "Song {$n}",
            'path' => "track-{$n}.mp3",
        ]));

        askForNextTrack($station->slug);

        $pro = $station->user->plan_id;
        $station->user->forceFill(['plan_id' => Plan::where('slug', 'free')->value('id')])->save();

        askForNextTrack($station->slug)->assertNoContent();

        $station->user->forceFill(['plan_id' => $pro])->save();

        expect(askForNextTrack($station->slug)->getContent())->toContain('Song 2');
    });

    it('leaves the station running rather than erroring', function () {
        // 204, not 4xx or 5xx: the .liq logs a severe line for any other
        // status and treats it as a stalled rotation. A station on the wrong
        // plan is not a fault — it is a station with nothing it may play.
        $station = Station::factory()->create();

        Track::factory()->create([
            'station_id' => $station->id,
            'kind' => Track::KIND_MUSIC,
            'position' => 1,
            'title' => 'Song 1',
            'path' => 'track-1.mp3',
        ]);

        askForNextTrack($station->slug)
            ->assertNoContent()
            ->assertStatus(204);
    });
});

it('answers 404 for a station that does not exist', function () {
    askForNextTrack('no-such-station')->assertNotFound();
});

it('refuses a request without the internal key', function () {
    $this->get('/api/internal/next-track?slug='.$this->station->slug)
        ->assertUnauthorized();
});
