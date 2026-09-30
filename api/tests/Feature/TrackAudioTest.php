<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;

/**
 * The library's preview: GET /tracks/{track}/audio streams the file to its
 * owner and to nobody else.
 */
beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-track-audio-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);

    $this->owner = User::factory()->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create();
    $this->track = Track::factory()->for($this->station)->create();

    File::ensureDirectoryExists($this->tmpDir.'/'.$this->station->slug);
    file_put_contents($this->tmpDir.'/'.$this->station->slug.'/'.$this->track->path, str_repeat('a', 2048));
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

it('streams the file to the owner, with range support for seeking', function () {
    $response = actingAs($this->owner, 'sanctum')
        ->get("/api/tracks/{$this->track->id}/audio");

    $response->assertOk()
        ->assertHeader('Accept-Ranges', 'bytes')
        ->assertHeader('Content-Length', '2048');
    expect($response->headers->get('Cache-Control'))->toContain('private');

    actingAs($this->owner, 'sanctum')
        ->get("/api/tracks/{$this->track->id}/audio", ['Range' => 'bytes=0-1023'])
        ->assertStatus(206)
        ->assertHeader('Content-Length', '1024');
});

it('refuses a signed-in user who is not the owner', function () {
    actingAs(User::factory()->create(), 'sanctum')
        ->get("/api/tracks/{$this->track->id}/audio")
        ->assertForbidden();
});

it('refuses a guest', function () {
    getJson("/api/tracks/{$this->track->id}/audio")->assertUnauthorized();
});

it('is a 404 when the file is gone from disk', function () {
    unlink($this->tmpDir.'/'.$this->station->slug.'/'.$this->track->path);

    actingAs($this->owner, 'sanctum')
        ->get("/api/tracks/{$this->track->id}/audio")
        ->assertNotFound();
});
