<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    config([
        'liquidsoap.hls_base_url' => 'https://stream.gocast.fm',
        'liquidsoap.hls_variant' => 'aac',
    ]);
});

it('points the player at the media playlist, not the master', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    $this->getJson("/api/public/stations/{$station->slug}")
        // NOT playlist.m3u8. That file is a master pointing here, and players
        // drop the query string when resolving a master's variant URI — so a
        // master URL can never carry a per-listener token to the requests that
        // follow it.
        ->assertJsonPath('data.hls_url', 'https://stream.gocast.fm/jazz/aac.m3u8');
});

it('builds the filename from the same config that names the encoder', function () {
    config(['liquidsoap.hls_variant' => 'stream64']);

    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    // Liquidsoap names a media playlist after its encoder label, so the URL
    // and the .liq script have to read the same value or the player 404s.
    $this->getJson("/api/public/stations/{$station->slug}")
        ->assertJsonPath('data.hls_url', 'https://stream.gocast.fm/jazz/stream64.m3u8');
});

it('reports no HLS url when no stream host is configured', function () {
    config(['liquidsoap.hls_base_url' => '']);

    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    // A supported state, not a broken one: the player falls back to the
    // Icecast mount, which is why the frontend treats the field as optional.
    $this->getJson("/api/public/stations/{$station->slug}")
        ->assertJsonPath('data.hls_url', null)
        ->assertJsonPath('data.icecast_mount', $station->icecast_mount);
});

it('renders the encoder label into the Liquidsoap script from that config', function () {
    $liqDir = sys_get_temp_dir().'/gocast-liq-'.uniqid();

    config([
        'liquidsoap.liq_dir' => $liqDir,
        'liquidsoap.hls_variant' => 'stream64',
    ]);

    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'jazz']);

    // Through the supervisor's real render path, so this covers the view-data
    // wiring and not just the template.
    $supervisor = app(LiquidsoapSupervisor::class);
    $render = new ReflectionMethod($supervisor, 'renderLiqFile');
    $render->invoke($supervisor, $station);

    $script = File::get("{$liqDir}/jazz.liq");

    // Liquidsoap names a media playlist after its encoder label, so this label
    // and the filename in hls_url have to come from one value or the player
    // 404s on a name nobody changed on purpose.
    expect($script)->toContain('[("stream64", %ffmpeg(')
        ->and($script)->toContain('/jazz/stream64.m3u8');

    File::deleteDirectory($liqDir);
});
