<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
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
