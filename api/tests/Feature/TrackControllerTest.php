<?php

use App\Models\Plan;
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

it('blocks uploads on a plan without AutoDJ', function () {
    // AutoDJ is the paid hook: a free station can broadcast live, but not
    // run an unattended playlist.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('song.mp3', 100, 'audio/mpeg')],
        ])
        ->assertForbidden()
        ->assertJsonPath('code', 'autodj_not_available');

    expect($station->tracks()->count())->toBe(0);
});

it('allows uploads on a plan with AutoDJ', function () {
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('song.mp3', 100, 'audio/mpeg')],
        ])
        ->assertCreated();
});

it('still lets a downgraded user see and delete their existing library', function () {
    // A downgrade must never trap someone's files behind a paywall.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create();
    $track = Track::factory()->for($station)->create();

    actingAs($user)->getJson("/api/stations/{$station->slug}/tracks")->assertOk();
    actingAs($user)->deleteJson("/api/tracks/{$track->id}")->assertNoContent();
});

it('lists only the rotation by default and jingles on request', function () {
    // The two lists live in one table but are never shown together: a jingle
    // appearing in the AutoDJ list would invite the owner to drag it into a
    // rotation slot it can never occupy.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    Track::factory()->for($station)->create(['title' => 'A Song']);
    Track::factory()->for($station)->jingle()->create(['title' => 'Station ID']);

    actingAs($owner, 'sanctum')
        ->getJson("/api/stations/{$station->slug}/tracks")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.title', 'A Song')
        ->assertJsonPath('meta.kind', 'music');

    actingAs($owner, 'sanctum')
        ->getJson("/api/stations/{$station->slug}/tracks?kind=jingle")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.title', 'Station ID')
        ->assertJsonPath('data.0.kind', 'jingle');
});

it('reports one storage figure whichever list is being viewed', function () {
    // One cap covers the station. A meter that changed as you switched tabs
    // would read as two separate quotas.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    Track::factory()->for($station)->create(['file_size_bytes' => 3_000_000]);
    Track::factory()->for($station)->jingle()->create(['file_size_bytes' => 500_000]);

    foreach (['music', 'jingle'] as $kind) {
        actingAs($owner, 'sanctum')
            ->getJson("/api/stations/{$station->slug}/tracks?kind={$kind}")
            ->assertOk()
            ->assertJsonPath('meta.storage_used_bytes', 3_500_000);
    }
});

it('rejects an unknown track kind', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->getJson("/api/stations/{$station->slug}/tracks?kind=sweeper")
        ->assertUnprocessable();
});

it('uploads into the jingle list when asked', function () {
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)
        ->postJson("/api/stations/{$station->slug}/tracks", [
            'kind' => 'jingle',
            'files' => [UploadedFile::fake()->create('id.mp3', 10, 'audio/mpeg')],
        ])
        ->assertCreated()
        ->assertJsonPath('data.0.kind', 'jingle');

    expect($station->jingles()->count())->toBe(1)
        ->and($station->musicTracks()->count())->toBe(0);
});

it('numbers the two lists independently', function () {
    // Positions are gap-free per (station, kind). Sharing one sequence would
    // leave the rotation numbered 1, 3, 4 as soon as a jingle was uploaded
    // between two songs.
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    $user = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($user, 'user')->create();

    actingAs($user)->postJson("/api/stations/{$station->slug}/tracks", [
        'files' => [UploadedFile::fake()->create('one.mp3', 10, 'audio/mpeg')],
    ])->assertCreated();

    actingAs($user)->postJson("/api/stations/{$station->slug}/tracks", [
        'kind' => 'jingle',
        'files' => [UploadedFile::fake()->create('id.mp3', 10, 'audio/mpeg')],
    ])->assertCreated()->assertJsonPath('data.0.position', 1);

    actingAs($user)->postJson("/api/stations/{$station->slug}/tracks", [
        'files' => [UploadedFile::fake()->create('two.mp3', 10, 'audio/mpeg')],
    ])->assertCreated()->assertJsonPath('data.0.position', 2);
});

it('refuses to reorder the rotation using a jingle id', function () {
    // Positions are per-kind, so a jingle id in a rotation reorder would
    // renumber the wrong sequence. Caught at validation, not silently ignored.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $song = Track::factory()->for($station)->create(['position' => 1]);
    $jingle = Track::factory()->for($station)->jingle()->create(['position' => 1]);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}/tracks/reorder", [
            'ids' => [$jingle->id, $song->id],
        ])
        ->assertUnprocessable();
});

it('compacts positions within a kind when a track is deleted', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $first = Track::factory()->for($station)->create(['position' => 1]);
    $second = Track::factory()->for($station)->create(['position' => 2]);
    $jingle = Track::factory()->for($station)->jingle()->create(['position' => 1]);

    actingAs($owner, 'sanctum')->deleteJson("/api/tracks/{$first->id}")->assertNoContent();

    expect($second->refresh()->position)->toBe(1)
        // Untouched: the jingle list has its own sequence.
        ->and($jingle->refresh()->position)->toBe(1);
});
