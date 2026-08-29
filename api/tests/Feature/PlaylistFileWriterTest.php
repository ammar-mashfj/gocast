<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use App\Services\PlaylistFileWriter;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-playlist-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

/**
 * A track for annotateTrack() to render. Not persisted through write() — the
 * rotation is no longer a file, so the URI is the whole contract here.
 */
function playlistTrack(array $attributes = []): Track
{
    $station = Station::factory()->for(User::factory(), 'user')->create();

    return Track::factory()->for($station)->create(array_merge([
        'path' => '01abc.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'T',
        'artist' => null,
        'duration_seconds' => 100,
        'file_size_bytes' => 1024,
        'position' => 1,
    ], $attributes));
}

it('builds annotate URIs with title and artist when both are set', function () {
    $track = playlistTrack([
        'title' => 'КАМИН',
        'artist' => 'EMIN feat. JONY',
        'duration_seconds' => 185,
    ]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toBe('annotate:duration="185.000",title="КАМИН",artist="EMIN feat. JONY":/data/playlists/01abc.mp3');
});

it('annotates the duration so the crossfade can time transitions', function () {
    // cross() needs to know where a track ends. We already store the length,
    // so there is no reason to make Liquidsoap infer it per playback —
    // AzuraCast annotates it for the same reason.
    //
    // Fixed 3 decimals: a plain float cast can emit scientific notation
    // ("1.8473799301908E+2"), which Liquidsoap's annotate parser rejects.
    $track = playlistTrack(['duration_seconds' => 184.73799301908]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toContain('duration="184.738"')
        ->not->toContain('E+');
});

it('omits the duration when it is unknown rather than sending zero', function () {
    // duration_seconds is NOT NULL with `default(0)`, so 0 — not null — is how
    // an unknown length actually reaches us. Emitting duration="0.000" would
    // tell Liquidsoap the track is zero-length.
    $track = playlistTrack(['path' => '01nodur.mp3', 'duration_seconds' => 0]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toBe('annotate:title="T":/data/playlists/01nodur.mp3');
});

it('omits the artist key when no artist is set', function () {
    $track = playlistTrack([
        'path' => '01xyz.mp3',
        'title' => 'شبابيك - إياد',
        'artist' => null,
        'duration_seconds' => 193,
    ]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toBe('annotate:duration="193.000",title="شبابيك - إياد":/data/playlists/01xyz.mp3');
});

it('escapes double quotes inside titles', function () {
    $track = playlistTrack(['path' => '01q.mp3', 'title' => 'She said "hi"']);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toContain('title="She said \\"hi\\""');
});

it('does not write a rotation playlist file', function () {
    // The rotation is served one track at a time by NextTrackController. A
    // file here would be dead weight at best, and at worst something a future
    // .liq is tempted to read — reintroducing the reload-resets-to-track-one
    // bug that moved the rotation off a playlist in the first place.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'no-rotation-file']);
    Track::factory()->for($station)->create([
        'path' => '01song.mp3',
        'title' => 'A Song',
        'duration_seconds' => 200,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::exists($this->tmpDir.'/no-rotation-file/playlist.m3u'))->toBeFalse();
});

it('writes jingles to their own m3u and keeps the rotation out of it', function () {
    // Mixing jingles into the rotation would have them played in order, once
    // per loop — the exact behaviour the delay/fallback in the .liq exists to
    // avoid.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'split']);
    Track::factory()->for($station)->create([
        'path' => '01song.mp3',
        'title' => 'A Song',
        'artist' => 'Someone',
        'duration_seconds' => 200,
        'position' => 1,
    ]);
    Track::factory()->for($station)->jingle()->create([
        'path' => '01id.mp3',
        'title' => 'Station ID',
        'duration_seconds' => 6,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/split/jingles.m3u'))
        ->toContain('/data/playlists/01id.mp3')
        ->not->toContain('01song.mp3');
});

it('flags jingle entries so the audio graph can recognise them downstream', function () {
    // The .liq reads this annotation in two places — the crossfade (hard cut,
    // never a mix) and the now-playing push (a station ID is not "now
    // playing"). Both run long after the request left its source, so the flag
    // has to travel on the request itself.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'flagged']);
    Track::factory()->for($station)->jingle()->create([
        'path' => '01id.mp3',
        'title' => 'Top of the hour',
        'artist' => null,
        'duration_seconds' => 8,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/flagged/jingles.m3u'))
        ->toContain('annotate:jingle="true",duration="8.000",title="Top of the hour":/data/playlists/01id.mp3');
});

it('never flags a rotation entry as a jingle', function () {
    // A stray flag on a music track would hard cut every transition and blank
    // now-playing for the whole station.
    $track = playlistTrack(['path' => '01song.mp3', 'title' => 'A Song']);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))->not->toContain('jingle=');
});

it('always writes a jingles file, even when the station has none', function () {
    // The rendered script references jingles.m3u by path. A missing file is a
    // decoding error on every read; an empty one just makes the source
    // fallible, which the fallback already handles.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'nojingles']);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/nojingles/jingles.m3u'))->toBe("#EXTM3U\n");
});

/**
 * `playlist_m3u.reload` restarts the rotation at track one (measured on
 * 2.4.5). There is no list in the container to reload any more, and sending
 * the command anyway would only reintroduce that bug.
 */
it('never sends a rotation reload', function () {
    $station = Station::factory()->create(['jingles_enabled' => false]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldNotReceive('telnet');

    (new PlaylistFileWriter($supervisor))->reload($station);
});

/**
 * Jingles are still a playlist file, so they still need telling — and their
 * source is randomized, so a cursor reset there is inaudible.
 */
it('reloads jingles when the station has them enabled', function () {
    $station = Station::factory()->create(['jingles_enabled' => true]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with(Mockery::type(Station::class), PlaylistFileWriter::JINGLES_LIQ_SOURCE.'.reload')
        ->andReturn('');

    (new PlaylistFileWriter($supervisor))->reload($station);
});
