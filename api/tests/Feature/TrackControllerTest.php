<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
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

    // 300+ MB — exceeds the 300 MB (307_200 KB) per-file cap in
    // StoreTrackRequest. The cap is sized for hour-long DJ mixes (~144 MB at
    // 320 kbps), so anything under that is a legitimate upload now.
    $oversize = UploadedFile::fake()->create('big.mp3', 307_500, 'audio/mpeg');

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

/*
|--------------------------------------------------------------------------
| Bulk delete — DELETE /api/stations/{slug}/tracks
|--------------------------------------------------------------------------
|
| The library's multi-select. Everything single delete guarantees must hold
| for a batch as well: positions compact per kind, playlists renumber, files
| go, and nobody else's tracks are reachable.
*/

it('rejects unauthenticated bulk deletes', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();
    $track = Track::factory()->for($station)->create();

    deleteJson("/api/stations/{$station->slug}/tracks", ['track_ids' => [$track->id]])
        ->assertUnauthorized();
});

it('forbids non-owners from bulk deleting tracks', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();

    actingAs(User::factory()->create(), 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", ['track_ids' => [$track->id]])
        ->assertForbidden();

    expect(Track::whereKey($track->id)->exists())->toBeTrue();
});

it('deletes several tracks at once and returns the remaining library', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $first = Track::factory()->for($station)->create(['position' => 1, 'title' => 'Gone one']);
    $second = Track::factory()->for($station)->create(['position' => 2, 'title' => 'Kept']);
    $third = Track::factory()->for($station)->create(['position' => 3, 'title' => 'Gone two']);

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", [
            'track_ids' => [$first->id, $third->id],
        ])
        ->assertOk()
        ->assertJsonPath('meta.deleted', 2)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.title', 'Kept');

    expect(Track::whereKey([$first->id, $third->id])->count())->toBe(0)
        // The survivor closes the gap rather than staying at #2.
        ->and($second->refresh()->position)->toBe(1);
});

it('compacts each kind independently on a mixed bulk delete', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $music1 = Track::factory()->for($station)->create(['position' => 1]);
    $music2 = Track::factory()->for($station)->create(['position' => 2]);
    $jingle1 = Track::factory()->for($station)->jingle()->create(['position' => 1]);
    $jingle2 = Track::factory()->for($station)->jingle()->create(['position' => 2]);

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", [
            'track_ids' => [$music1->id, $jingle1->id],
        ])
        ->assertOk()
        ->assertJsonPath('meta.deleted', 2);

    expect($music2->refresh()->position)->toBe(1)
        ->and($jingle2->refresh()->position)->toBe(1);
});

it('removes bulk-deleted tracks from their playlists and renumbers what is left', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $playlist = $station->defaultPlaylist;

    // The factory attaches each music track to the default playlist in turn,
    // so pivot positions are 1, 2, 3 before this runs.
    $first = Track::factory()->for($station)->create(['position' => 1]);
    $second = Track::factory()->for($station)->create(['position' => 2]);
    $third = Track::factory()->for($station)->create(['position' => 3]);

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", [
            'track_ids' => [$first->id, $second->id],
        ])
        ->assertOk();

    $members = DB::table('playlist_track')
        ->where('playlist_id', $playlist->id)
        ->orderBy('position')
        ->pluck('position', 'track_id');

    expect($members)->toHaveCount(1)
        ->and((int) $members[$third->id])->toBe(1);
});

it('deletes the audio files from disk', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();

    $dir = $this->tmpDir.'/'.$station->slug;
    File::ensureDirectoryExists($dir);
    File::put($dir.'/'.$track->path, 'audio');

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", ['track_ids' => [$track->id]])
        ->assertOk();

    expect(File::exists($dir.'/'.$track->path))->toBeFalse();
});

it('refuses a batch containing another station\'s track', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $mine = Track::factory()->for($station)->create();
    $theirs = Track::factory()->for(Station::factory()->for(User::factory(), 'user'))->create();

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", [
            'track_ids' => [$mine->id, $theirs->id],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('track_ids.1');

    // Nothing partially applied — the whole batch is rejected up front.
    expect(Track::whereKey($mine->id)->exists())->toBeTrue()
        ->and(Track::whereKey($theirs->id)->exists())->toBeTrue();
});

it('rejects an empty or duplicated bulk delete', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", ['track_ids' => []])
        ->assertStatus(422)
        ->assertJsonValidationErrors('track_ids');

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", [
            'track_ids' => [$track->id, $track->id],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('track_ids.1');
});

it('still lets a downgraded user bulk delete their library', function () {
    // Same rule as the single delete above: a downgrade must never trap
    // someone's files behind a paywall.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $owner = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($owner, 'user')->create();
    $track = Track::factory()->for($station)->create();

    actingAs($owner, 'sanctum')
        ->deleteJson("/api/stations/{$station->slug}/tracks", ['track_ids' => [$track->id]])
        ->assertOk()
        ->assertJsonPath('meta.deleted', 1);
});
