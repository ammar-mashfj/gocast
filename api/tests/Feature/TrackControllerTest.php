<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\deleteJson;
use function Pest\Laravel\getJson;
use function Pest\Laravel\patchJson;
use function Pest\Laravel\postJson;

beforeEach(function () {
    // Keep TrackImporter from touching /var/gocast/playlists — point it at a tmp dir.
    $this->tmpDir = sys_get_temp_dir().'/gocast-track-controller-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

it('rejects unauthenticated requests across the surface', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();
    $track = Track::factory()->for($station)->create();

    getJson("/api/stations/{$station->slug}/tracks")->assertUnauthorized();
    postJson("/api/stations/{$station->slug}/tracks")->assertUnauthorized();
    patchJson("/api/tracks/{$track->id}", ['title' => 'X'])->assertUnauthorized();
    deleteJson("/api/tracks/{$track->id}")->assertUnauthorized();
});

it('lets the owner list their station tracks', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    Track::factory()->for($station)->create(['title' => 'Mine']);

    actingAs($owner, 'sanctum')
        ->getJson("/api/stations/{$station->slug}/tracks")
        ->assertOk()
        ->assertJsonPath('data.0.title', 'Mine');
});

it('forbids non-owners from listing tracks', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $stranger = User::factory()->create();

    actingAs($stranger, 'sanctum')
        ->getJson("/api/stations/{$station->slug}/tracks")
        ->assertForbidden();
});

it('forbids non-owners from uploading tracks', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $stranger = User::factory()->create();

    actingAs($stranger, 'sanctum')
        ->postJson("/api/stations/{$station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('foo.mp3', 100, 'audio/mpeg')],
        ])
        ->assertForbidden();
});

it('forbids non-owners from editing tracks', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();
    $stranger = User::factory()->create();

    actingAs($stranger, 'sanctum')
        ->patchJson("/api/tracks/{$track->id}", ['title' => 'Hijacked'])
        ->assertForbidden();
});

it('forbids non-owners from deleting tracks', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();
    $stranger = User::factory()->create();

    actingAs($stranger, 'sanctum')
        ->deleteJson("/api/tracks/{$track->id}")
        ->assertForbidden();
});

it('lets the owner update their track title and artist', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create(['title' => 'Old', 'artist' => 'Old Artist']);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/tracks/{$track->id}", ['title' => 'New', 'artist' => 'New Artist'])
        ->assertOk()
        ->assertJsonPath('data.title', 'New')
        ->assertJsonPath('data.artist', 'New Artist');

    expect($track->fresh()->title)->toBe('New');
});

it('rejects an empty title on update', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/tracks/{$track->id}", ['title' => ''])
        ->assertUnprocessable();
});

it('rejects reorder ids that belong to a different station', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    Track::factory()->for($station)->create(['position' => 1]);

    // A track that belongs to a different station — must be rejected by validation.
    $foreignStation = Station::factory()->for(User::factory(), 'user')->create();
    $foreignTrack = Track::factory()->for($foreignStation)->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}/tracks/reorder", [
            'ids' => [$foreignTrack->id],
        ])
        ->assertUnprocessable();
});

it('reorders the owner\'s own tracks and returns the updated collection', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $a = Track::factory()->for($station)->create(['position' => 1]);
    $b = Track::factory()->for($station)->create(['position' => 2]);
    $c = Track::factory()->for($station)->create(['position' => 3]);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}/tracks/reorder", [
            'ids' => [$c->id, $a->id, $b->id],
        ])
        ->assertOk()
        ->assertJsonCount(3, 'data');

    expect($c->fresh()->position)->toBe(1);
    expect($a->fresh()->position)->toBe(2);
    expect($b->fresh()->position)->toBe(3);
});

it('rejects an oversize file on upload', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    // 51 MB — exceeds the 50 MB (51_200 KB) per-file cap in StoreTrackRequest.
    $oversize = UploadedFile::fake()->create('big.mp3', 51_500, 'audio/mpeg');

    actingAs($owner, 'sanctum')
        ->postJson("/api/stations/{$station->slug}/tracks", ['files' => [$oversize]])
        ->assertUnprocessable();
});
