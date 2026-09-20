<?php

use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\AutoDjScheduler;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\deleteJson;
use function Pest\Laravel\getJson;
use function Pest\Laravel\patchJson;
use function Pest\Laravel\postJson;

/**
 * Playlists as an owner edits them, and the invariants the rotation depends
 * on: exactly one default per station, gap-free positions per playlist,
 * only this station's music inside.
 */
beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-playlist-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);

    $this->owner = User::factory()->onPlan('pro')->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create();
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

/** Pivot positions of a playlist's members, keyed by track id, in play order. */
function memberPositions(Playlist $playlist): array
{
    return DB::table('playlist_track')
        ->where('playlist_id', $playlist->id)
        ->orderBy('position')
        ->pluck('position', 'track_id')
        ->all();
}

it('creates a station with one default playlist', function () {
    $playlists = $this->station->playlists;

    expect($playlists)->toHaveCount(1)
        ->and($playlists->first()->is_default)->toBeTrue()
        ->and($playlists->first()->name)->toBe(Playlist::DEFAULT_NAME)
        ->and($playlists->first()->order)->toBe(Playlist::ORDER_SEQUENTIAL);
});

it('rejects unauthenticated requests across the surface', function () {
    $playlist = $this->station->defaultPlaylist;

    getJson("/api/stations/{$this->station->slug}/playlists")->assertUnauthorized();
    postJson("/api/stations/{$this->station->slug}/playlists", ['name' => 'X'])->assertUnauthorized();
    patchJson("/api/playlists/{$playlist->id}", ['name' => 'X'])->assertUnauthorized();
    deleteJson("/api/playlists/{$playlist->id}")->assertUnauthorized();
    getJson("/api/playlists/{$playlist->id}/tracks")->assertUnauthorized();
});

it('forbids a stranger from touching another owner\'s playlists', function () {
    $stranger = User::factory()->create();
    $playlist = $this->station->defaultPlaylist;

    actingAs($stranger, 'sanctum')
        ->getJson("/api/stations/{$this->station->slug}/playlists")
        ->assertForbidden();
    actingAs($stranger, 'sanctum')
        ->patchJson("/api/playlists/{$playlist->id}", ['name' => 'Hijacked'])
        ->assertForbidden();
    actingAs($stranger, 'sanctum')
        ->putJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => []])
        ->assertForbidden();
});

it('lists playlists with the default first and counts without loading members', function () {
    Track::factory()->count(3)->for($this->station)->create(['duration_seconds' => 100]);
    Playlist::factory()->for($this->station)->create(['name' => 'Late night', 'position' => 1]);

    $response = actingAs($this->owner, 'sanctum')
        ->getJson("/api/stations/{$this->station->slug}/playlists")
        ->assertOk()
        ->assertJsonCount(2, 'data');

    expect($response->json('data.0.is_default'))->toBeTrue()
        ->and($response->json('data.0.track_count'))->toBe(3)
        ->and($response->json('data.0.duration_seconds'))->toBe(300)
        ->and($response->json('data.1.name'))->toBe('Late night')
        ->and($response->json('data.1.track_count'))->toBe(0);
});

it('creates a playlist after the existing ones', function () {
    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/playlists", ['name' => 'Morning Calm', 'order' => 'shuffle'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Morning Calm')
        ->assertJsonPath('data.order', 'shuffle')
        ->assertJsonPath('data.is_default', false)
        ->assertJsonPath('data.track_count', 0);

    expect($this->station->playlists()->count())->toBe(2);
});

it('refuses two playlists with the same name on one station', function () {
    Playlist::factory()->for($this->station)->create(['name' => 'Chill']);

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/playlists", ['name' => 'Chill'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');
});

it('renames and reorders a playlist without touching the station row', function () {
    $playlist = $this->station->defaultPlaylist;
    $before = $this->station->fresh()->updated_at;

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/playlists/{$playlist->id}", ['name' => 'Everything', 'order' => 'shuffle'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Everything')
        ->assertJsonPath('data.order', 'shuffle');

    expect($this->station->fresh()->updated_at->eq($before))->toBeTrue();
});

it('moves the default flag as one write', function () {
    $other = Playlist::factory()->for($this->station)->create();
    $old = $this->station->defaultPlaylist;

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/playlists/{$other->id}", ['is_default' => true])
        ->assertOk()
        ->assertJsonPath('data.is_default', true);

    expect($old->fresh()->is_default)->toBeFalse()
        ->and($this->station->playlists()->where('is_default', true)->count())->toBe(1)
        ->and($this->station->fresh()->defaultPlaylist->id)->toBe($other->id);
});

it('will not let the default give itself up', function () {
    $playlist = $this->station->defaultPlaylist;

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/playlists/{$playlist->id}", ['is_default' => false])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('is_default');
});

it('refuses to delete the default playlist', function () {
    $playlist = $this->station->defaultPlaylist;

    actingAs($this->owner, 'sanctum')
        ->deleteJson("/api/playlists/{$playlist->id}")
        ->assertStatus(409);

    expect($playlist->fresh())->not->toBeNull();
});

it('deletes a non-default playlist and keeps its tracks in the library', function () {
    $tracks = Track::factory()->count(2)->for($this->station)->create();
    $playlist = Playlist::factory()->for($this->station)->create();
    $playlist->tracks()->attach([$tracks[0]->id => ['position' => 1], $tracks[1]->id => ['position' => 2]]);

    actingAs($this->owner, 'sanctum')
        ->deleteJson("/api/playlists/{$playlist->id}")
        ->assertNoContent();

    expect(Playlist::query()->find($playlist->id))->toBeNull()
        ->and(Track::query()->count())->toBe(2)
        ->and(DB::table('playlist_track')->where('playlist_id', $playlist->id)->count())->toBe(0);
});

it('appends tracks at the tail, gap-free, ignoring ones already present', function () {
    $tracks = Track::factory()->count(3)->for($this->station)->create();
    $playlist = Playlist::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => [$tracks[2]->id, $tracks[0]->id]])
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.id', $tracks[2]->id)
        ->assertJsonPath('data.0.position', 1)
        ->assertJsonPath('data.1.position', 2);

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => [$tracks[0]->id, $tracks[1]->id]])
        ->assertOk()
        ->assertJsonCount(3, 'data');

    expect(memberPositions($playlist))->toBe([
        $tracks[2]->id => 1,
        $tracks[0]->id => 2,
        $tracks[1]->id => 3,
    ]);
});

it('replaces the whole membership in the order given', function () {
    $tracks = Track::factory()->count(3)->for($this->station)->create();
    $playlist = Playlist::factory()->for($this->station)->create();
    $playlist->tracks()->attach([$tracks[0]->id => ['position' => 1]]);

    actingAs($this->owner, 'sanctum')
        ->putJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => [$tracks[2]->id, $tracks[1]->id]])
        ->assertOk()
        ->assertJsonCount(2, 'data');

    expect(memberPositions($playlist))->toBe([$tracks[2]->id => 1, $tracks[1]->id => 2]);
});

it('empties a playlist with an empty replace', function () {
    $tracks = Track::factory()->count(2)->for($this->station)->create();
    $playlist = Playlist::factory()->for($this->station)->create();
    $playlist->tracks()->attach([$tracks[0]->id => ['position' => 1]]);

    actingAs($this->owner, 'sanctum')
        ->putJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => []])
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('refuses another station\'s track and refuses a jingle', function () {
    $foreign = Track::factory()->create();
    $jingle = Track::factory()->jingle()->for($this->station)->create();
    $playlist = $this->station->defaultPlaylist;

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => [$foreign->id]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('track_ids.0');

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/playlists/{$playlist->id}/tracks", ['track_ids' => [$jingle->id]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('track_ids.0');
});

it('removes one track from a playlist and compacts the rest', function () {
    $tracks = Track::factory()->count(3)->for($this->station)->create();
    $playlist = $this->station->defaultPlaylist;

    expect(memberPositions($playlist))->toBe([$tracks[0]->id => 1, $tracks[1]->id => 2, $tracks[2]->id => 3]);

    actingAs($this->owner, 'sanctum')
        ->deleteJson("/api/playlists/{$playlist->id}/tracks/{$tracks[1]->id}")
        ->assertNoContent();

    expect(memberPositions($playlist))->toBe([$tracks[0]->id => 1, $tracks[2]->id => 2])
        ->and($tracks[1]->fresh())->not->toBeNull();
});

it('answers 404 when removing a track that is not a member', function () {
    $track = Track::factory()->for($this->station)->create();
    $other = Playlist::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->deleteJson("/api/playlists/{$other->id}/tracks/{$track->id}")
        ->assertNotFound();
});

it('reorders members, keeping the unlisted ones at the tail', function () {
    $tracks = Track::factory()->count(4)->for($this->station)->create();
    $playlist = $this->station->defaultPlaylist;

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/playlists/{$playlist->id}/tracks/reorder", ['ids' => [$tracks[3]->id, $tracks[1]->id]])
        ->assertOk()
        ->assertJsonPath('data.0.id', $tracks[3]->id)
        ->assertJsonPath('data.1.id', $tracks[1]->id)
        ->assertJsonPath('data.2.id', $tracks[0]->id)
        ->assertJsonPath('data.3.id', $tracks[2]->id);

    expect(array_values(memberPositions($playlist)))->toBe([1, 2, 3, 4]);
});

it('refuses to reorder with an id that is not a member', function () {
    Track::factory()->for($this->station)->create();
    $outsider = Track::factory()->for($this->station)->create();
    $playlist = Playlist::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/playlists/{$playlist->id}/tracks/reorder", ['ids' => [$outsider->id]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('ids.0');
});

it('deals a newly added track into a shuffle cycle already in progress', function () {
    $tracks = Track::factory()->count(6)->for($this->station)->create();
    $playlist = $this->station->defaultPlaylist;
    $playlist->fill(['order' => Playlist::ORDER_SHUFFLE])->save();

    // Start a cycle: one play deals a deck of the remaining five.
    app(AutoDjScheduler::class)->next($this->station->fresh()->load('user.plan'));
    expect($playlist->fresh()->deck)->toHaveCount(5);

    $late = Track::factory()->for($this->station)->create();

    // The factory attaches to the default playlist through PlaylistTracks,
    // which is the path an upload takes.
    expect($playlist->fresh()->deck)->toHaveCount(6)
        ->and($playlist->fresh()->deck)->toContain($late->id);
});

it('lists a playlist\'s members with their playlist position', function () {
    $tracks = Track::factory()->count(2)->for($this->station)->create(['position' => 9]);
    $playlist = $this->station->defaultPlaylist;

    actingAs($this->owner, 'sanctum')
        ->getJson("/api/playlists/{$playlist->id}/tracks")
        ->assertOk()
        ->assertJsonPath('data.0.id', $tracks[0]->id)
        ->assertJsonPath('data.0.position', 1)
        ->assertJsonPath('data.1.position', 2);
});

it('lands an upload in the named playlist, or the default when none is named', function () {
    $target = Playlist::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'playlist_id' => $target->id,
            'files' => [UploadedFile::fake()->create('a.mp3', 100, 'audio/mpeg')],
        ])
        ->assertCreated();

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('b.mp3', 100, 'audio/mpeg')],
        ])
        ->assertCreated();

    expect($target->tracks()->count())->toBe(1)
        ->and($target->tracks()->first()->original_filename)->toBe('a.mp3')
        ->and($this->station->defaultPlaylist->tracks()->count())->toBe(1)
        ->and($this->station->defaultPlaylist->tracks()->first()->original_filename)->toBe('b.mp3');
});

it('refuses an upload into another station\'s playlist', function () {
    $foreign = Playlist::factory()->create();

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'playlist_id' => $foreign->id,
            'files' => [UploadedFile::fake()->create('a.mp3', 100, 'audio/mpeg')],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('playlist_id');
});

it('takes a deleted track out of every playlist and compacts each', function () {
    $tracks = Track::factory()->count(3)->for($this->station)->create();
    $other = Playlist::factory()->for($this->station)->create();
    $other->tracks()->attach([$tracks[1]->id => ['position' => 1], $tracks[2]->id => ['position' => 2]]);

    actingAs($this->owner, 'sanctum')
        ->deleteJson("/api/tracks/{$tracks[1]->id}")
        ->assertNoContent();

    expect(memberPositions($this->station->defaultPlaylist))->toBe([$tracks[0]->id => 1, $tracks[2]->id => 2])
        ->and(memberPositions($other))->toBe([$tracks[2]->id => 1]);
});

it('lists the library with each track\'s playlist membership', function () {
    $tracks = Track::factory()->count(2)->for($this->station)->create();
    $other = Playlist::factory()->for($this->station)->create();
    $other->tracks()->attach([$tracks[1]->id => ['position' => 1]]);
    $default = $this->station->defaultPlaylist;

    $response = actingAs($this->owner, 'sanctum')
        ->getJson("/api/stations/{$this->station->slug}/tracks")
        ->assertOk();

    expect($response->json('data.0.playlist_ids'))->toBe([$default->id])
        ->and(collect($response->json('data.1.playlist_ids'))->sort()->values()->all())
        ->toBe(collect([$default->id, $other->id])->sort()->values()->all());
});

it('no longer changes what plays when the library is reordered', function () {
    $tracks = Track::factory()->count(3)->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/stations/{$this->station->slug}/tracks/reorder", [
            'ids' => [$tracks[2]->id, $tracks[0]->id, $tracks[1]->id],
        ])
        ->assertOk();

    expect(memberPositions($this->station->defaultPlaylist))->toBe([
        $tracks[0]->id => 1,
        $tracks[1]->id => 2,
        $tracks[2]->id => 3,
    ]);
});
