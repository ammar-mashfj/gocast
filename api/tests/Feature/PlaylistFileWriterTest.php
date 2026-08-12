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
        'annotate:title="КАМИН",artist="EMIN feat. JONY":/data/playlists/01abc.mp3',
    ])."\n");
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

    expect($m3u)->toContain('annotate:title="شبابيك - إياد":/data/playlists/01xyz.mp3')
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
        ->toContain('annotate:title="She said \\"hi\\"":/data/playlists/01q.mp3');
});

it('writes an empty playlist when the station has no tracks', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'empty']);

    app(PlaylistFileWriter::class)->write($station);

    expect(File::get($this->tmpDir.'/empty/playlist.m3u'))->toBe("#EXTM3U\n");
});
