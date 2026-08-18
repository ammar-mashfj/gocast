<?php

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

    $this->station = Station::factory()->create();

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

    expect($this->station->fresh()->autodj_cursor_position)->toBe(2);
});

/**
 * The cursor update runs at every track boundary on every station. If it went
 * through the model it would fire StationObserver, which re-renders the .liq
 * and restarts the container — a restart per track, fleet-wide.
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
    $empty = Station::factory()->create();

    askForNextTrack($empty->slug)->assertNoContent();
});

it('answers 404 for a station that does not exist', function () {
    askForNextTrack('no-such-station')->assertNotFound();
});

it('refuses a request without the internal key', function () {
    $this->get('/api/internal/next-track?slug='.$this->station->slug)
        ->assertUnauthorized();
});
