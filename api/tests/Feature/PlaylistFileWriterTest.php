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

it('writes annotate URIs with title and artist when both are set', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz-fm']);
    Track::factory()->for($station)->create([
        'path' => '01abc.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'КАМИН',
        'artist' => 'EMIN feat. JONY',
        'duration_seconds' => 185,
        'file_size_bytes' => 1024,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    $m3u = File::get($this->tmpDir.'/jazz-fm/playlist.m3u');

    expect($m3u)->toBe(implode("\n", [
        '#EXTM3U',
        'annotate:duration="185.000",title="КАМИН",artist="EMIN feat. JONY":/data/playlists/01abc.mp3',
    ])."\n");
});

it('annotates the duration so the crossfade can time transitions', function () {
    // cross() needs to know where a track ends. We already store the length,
    // so there is no reason to make Liquidsoap infer it per playback —
    // AzuraCast annotates it for the same reason.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'timed']);
    Track::factory()->for($station)->create([
        'path' => '01dur.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'T',
        'artist' => null,
        'duration_seconds' => 184.73799301908,
        'file_size_bytes' => 1024,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    // Fixed 3 decimals: a plain float cast can emit scientific notation
    // ("1.8473799301908E+2"), which Liquidsoap's annotate parser rejects.
    expect(File::get($this->tmpDir.'/timed/playlist.m3u'))
        ->toContain('duration="184.738"')
        ->and(File::get($this->tmpDir.'/timed/playlist.m3u'))->not->toContain('E+');
});

it('omits the duration when it is unknown rather than sending zero', function () {
    // duration_seconds is NOT NULL with `default(0)`, so 0 — not null — is how
    // an unknown length actually reaches us. Emitting duration="0.000" would
    // tell Liquidsoap the track is zero-length.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'untimed']);
    Track::factory()->for($station)->create([
        'path' => '01nodur.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'T',
        'artist' => null,
        'duration_seconds' => 0,
        'file_size_bytes' => 1024,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/untimed/playlist.m3u'))
        ->toContain('annotate:title="T":/data/playlists/01nodur.mp3')
        ->and(File::get($this->tmpDir.'/untimed/playlist.m3u'))->not->toContain('duration=');
});

it('omits the artist key when no artist is set', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'arabic']);
    Track::factory()->for($station)->create([
        'path' => '01xyz.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'شبابيك - إياد',
        'artist' => null,
        'duration_seconds' => 193,
        'file_size_bytes' => 1024,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    $m3u = File::get($this->tmpDir.'/arabic/playlist.m3u');

    expect($m3u)->toContain('annotate:duration="193.000",title="شبابيك - إياد":/data/playlists/01xyz.mp3')
        ->and($m3u)->not->toContain('artist=');
});

it('escapes double quotes inside titles', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'quoted']);
    Track::factory()->for($station)->create([
        'path' => '01q.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'She said "hi"',
        'artist' => null,
        'duration_seconds' => 100,
        'file_size_bytes' => 1024,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/quoted/playlist.m3u'))
        ->toContain('annotate:duration="100.000",title="She said \\"hi\\"":/data/playlists/01q.mp3');
});

it('writes an empty playlist when the station has no tracks', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'empty']);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/empty/playlist.m3u'))->toBe("#EXTM3U\n");
});

it('writes jingles to their own m3u and keeps them out of the rotation', function () {
    // Two lists, two files. Mixing jingles into playlist.m3u would put them
    // in the rotation — played in order, once per loop — which is the exact
    // behaviour the delay/fallback in the .liq exists to avoid.
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

    $rotation = File::get($this->tmpDir.'/split/playlist.m3u');
    $jingles = File::get($this->tmpDir.'/split/jingles.m3u');

    expect($rotation)->toContain('/data/playlists/01song.mp3')
        ->and($rotation)->not->toContain('01id.mp3')
        ->and($jingles)->toContain('/data/playlists/01id.mp3')
        ->and($jingles)->not->toContain('01song.mp3');
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
    Track::factory()->for($station)->create([
        'path' => '01song.mp3',
        'title' => 'A Song',
        'artist' => null,
        'duration_seconds' => 200,
        'position' => 1,
    ]);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/flagged/jingles.m3u'))
        ->toContain('annotate:jingle="true",duration="8.000",title="Top of the hour":/data/playlists/01id.mp3')
        // Never on a rotation entry — a stray flag there would hard cut every
        // transition and blank now-playing for the whole station.
        ->and(File::get($this->tmpDir.'/flagged/playlist.m3u'))->not->toContain('jingle=');
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
 * The fix itself. `playlist_m3u.reload` restarts the rotation at track one
 * (measured on 2.4.5), and dynamic mode has no list to reload — so sending it
 * would reintroduce the exact bug the mode removes.
 */
it('does not reload the rotation when the rotation is not a file', function () {
    config(['liquidsoap.autodj_dynamic' => true]);

    $station = Station::factory()->create(['jingles_enabled' => false]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldNotReceive('telnet');

    (new PlaylistFileWriter($supervisor))->reload($station);
});

it('still reloads the rotation in legacy playlist mode', function () {
    config(['liquidsoap.autodj_dynamic' => false]);

    $station = Station::factory()->create(['jingles_enabled' => false]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with(Mockery::type(Station::class), PlaylistFileWriter::LIQ_SOURCE.'.reload')
        ->andReturn('');

    (new PlaylistFileWriter($supervisor))->reload($station);
});

/**
 * Jingles are still a playlist file, so they still need telling — and their
 * source is randomized, so a cursor reset there is inaudible.
 */
it('still reloads jingles in dynamic mode', function () {
    config(['liquidsoap.autodj_dynamic' => true]);

    $station = Station::factory()->create(['jingles_enabled' => true]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class);
    $supervisor->shouldReceive('telnet')
        ->once()
        ->with(Mockery::type(Station::class), PlaylistFileWriter::JINGLES_LIQ_SOURCE.'.reload')
        ->andReturn('');

    (new PlaylistFileWriter($supervisor))->reload($station);
});
