<?php

use App\Models\JingleList;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;

/**
 * The jingle-list endpoints and the track routes' jingle side: making a
 * list, editing its rule, uploading into it, moving clips between lists,
 * and the migration that turned each station's old setting into a list.
 */
beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-jingle-list-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);

    $this->owner = User::factory()->onPlan('pro')->create();
    $this->station = Station::factory()->for($this->owner, 'user')->create(['timezone' => 'Europe/Madrid']);
});

afterEach(function () {
    if (is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

it('keeps lists to their owner', function () {
    $list = JingleList::factory()->for($this->station)->create();
    $stranger = User::factory()->create();

    getJson("/api/stations/{$this->station->slug}/jingle-lists")->assertUnauthorized();
    actingAs($stranger, 'sanctum')->getJson("/api/stations/{$this->station->slug}/jingle-lists")->assertForbidden();
    actingAs($stranger, 'sanctum')->patchJson("/api/jingle-lists/{$list->id}", ['name' => 'Mine'])->assertForbidden();
    actingAs($stranger, 'sanctum')->deleteJson("/api/jingle-lists/{$list->id}")->assertForbidden();
});

it('makes a list that plays a random jingle every four songs unless told otherwise', function () {
    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/jingle-lists", ['name' => 'Sweepers'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Sweepers')
        ->assertJsonPath('data.enabled', true)
        ->assertJsonPath('data.pick', JingleList::PICK_RANDOM)
        ->assertJsonPath('data.frequency', JingleList::FREQUENCY_SONGS)
        ->assertJsonPath('data.every_songs', 4)
        ->assertJsonPath('data.days', null)
        ->assertJsonPath('data.from_time', null);
});

it('saves a full rule and clears what the frequency does not use', function () {
    $list = JingleList::factory()->for($this->station)->create(['every_songs' => 4]);

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", [
            'frequency' => JingleList::FREQUENCY_TIMES,
            'times' => ['20:30', '08:00'],
            'exact' => true,
            'days' => [5, 1, 3],
            'from_time' => '07:00',
            'to_time' => '22:00',
        ])
        ->assertOk()
        ->assertJsonPath('data.times', ['08:00', '20:30'])
        ->assertJsonPath('data.exact', true)
        ->assertJsonPath('data.days', [1, 3, 5])
        ->assertJsonPath('data.every_songs', null)
        ->assertJsonPath('data.from_time', '07:00');

    // Back to songs: the times and the exact flag go with it.
    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", ['frequency' => JingleList::FREQUENCY_SONGS, 'every_songs' => 3])
        ->assertOk()
        ->assertJsonPath('data.times', [])
        ->assertJsonPath('data.exact', false);
});

it('refuses a rule that says nothing', function (array $payload, string $field) {
    $list = JingleList::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'minutes without a number' => [['frequency' => 'minutes', 'every_minutes' => null], 'every_minutes'],
    'set times without a time' => [['frequency' => 'times', 'times' => []], 'times'],
    'a bad time' => [['frequency' => 'times', 'times' => ['8am']], 'times.0'],
    'a window with no end' => [['from_time' => '07:00'], 'to_time'],
    'a window of no length' => [['from_time' => '07:00', 'to_time' => '07:00'], 'to_time'],
    'an unknown pick' => [['pick' => 'loudest'], 'pick'],
    'zero songs' => [['every_songs' => 0], 'every_songs'],
]);

it('needs a station timezone before a rule can use the clock', function () {
    $this->station->update(['timezone' => null]);
    $list = JingleList::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", ['frequency' => 'times', 'times' => ['08:00']])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('frequency');
});

it('pins only one of the list’s own jingles', function () {
    $list = JingleList::factory()->for($this->station)->create();
    $other = JingleList::factory()->for($this->station)->create();
    $mine = Track::factory()->for($this->station)->jingle()->create(['jingle_list_id' => $list->id]);
    $theirs = Track::factory()->for($this->station)->jingle()->create(['jingle_list_id' => $other->id]);

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", ['pick' => 'single', 'pinned_track_id' => $theirs->id])
        ->assertJsonValidationErrors('pinned_track_id');

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", ['pick' => 'single', 'pinned_track_id' => $mine->id])
        ->assertOk()
        ->assertJsonPath('data.pinned_track_id', $mine->id);
});

it('counts new set times from now, so a time that just passed does not fire', function () {
    $list = JingleList::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/jingle-lists/{$list->id}", ['frequency' => 'times', 'times' => ['08:00']])
        ->assertOk();

    expect($list->fresh()->last_played_at)->not->toBeNull();
});

it('deletes a list together with its jingles', function () {
    $list = JingleList::factory()->for($this->station)->create();
    $keep = JingleList::factory()->for($this->station)->create();
    Track::factory()->for($this->station)->jingle()->count(2)->create(['jingle_list_id' => $list->id]);
    $kept = Track::factory()->for($this->station)->jingle()->create(['jingle_list_id' => $keep->id]);

    actingAs($this->owner, 'sanctum')->deleteJson("/api/jingle-lists/{$list->id}")->assertNoContent();

    expect(JingleList::query()->whereKey($list->id)->exists())->toBeFalse()
        ->and($this->station->jingles()->pluck('id')->all())->toBe([$kept->id]);
});

it('uploads a jingle into the list named', function () {
    $list = JingleList::factory()->for($this->station)->create(['name' => 'Promos']);

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'kind' => 'jingle',
            'jingle_list_id' => $list->id,
            'files' => [UploadedFile::fake()->create('promo.mp3', 10, 'audio/mpeg')],
        ])
        ->assertCreated()
        ->assertJsonPath('data.0.jingle_list_id', $list->id);
});

it('makes a first list for a first jingle, so it plays without setup', function () {
    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'kind' => 'jingle',
            'files' => [UploadedFile::fake()->create('id.mp3', 10, 'audio/mpeg')],
        ])
        ->assertCreated();

    $list = $this->station->jingleLists()->sole();

    expect($list->name)->toBe('Jingles')
        ->and($list->enabled)->toBeTrue()
        ->and($this->station->jingles()->value('jingle_list_id'))->toBe($list->id);
});

it('refuses a list from another station on upload', function () {
    $foreign = JingleList::factory()->create();

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'kind' => 'jingle',
            'jingle_list_id' => $foreign->id,
            'files' => [UploadedFile::fake()->create('id.mp3', 10, 'audio/mpeg')],
        ])
        ->assertJsonValidationErrors('jingle_list_id');
});

it('moves a jingle to another list, and never a song', function () {
    $from = JingleList::factory()->for($this->station)->create();
    $to = JingleList::factory()->for($this->station)->create();
    $jingle = Track::factory()->for($this->station)->jingle()->create(['jingle_list_id' => $from->id]);
    $song = Track::factory()->for($this->station)->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/tracks/{$jingle->id}", ['jingle_list_id' => $to->id])
        ->assertOk()
        ->assertJsonPath('data.jingle_list_id', $to->id);

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/tracks/{$song->id}", ['jingle_list_id' => $to->id])
        ->assertJsonValidationErrors('jingle_list_id');
});

it('turns each station’s old jingle setting into one list, rule included', function () {
    // The test database ran the whole chain, so the data step is re-run by
    // hand on rows seeded as they were before it. The four old columns are
    // still on `stations` (dropped later, once the rollout is verified).
    expect(Schema::hasColumn('stations', 'jingle_mode'))->toBeTrue();

    $byTime = Station::factory()->create();
    $byTracks = Station::factory()->create();
    $none = Station::factory()->create();
    DB::table('stations')->where('id', $byTime->id)->update(['jingles_enabled' => true, 'jingle_mode' => 'interval', 'jingle_interval_seconds' => 900]);
    DB::table('stations')->where('id', $byTracks->id)->update(['jingles_enabled' => false, 'jingle_mode' => 'tracks', 'jingle_every_tracks' => 3]);
    $a = Track::factory()->for($byTime)->jingle()->create();
    $b = Track::factory()->for($byTracks)->jingle()->create();

    $migration = require database_path('migrations/2026_10_05_130200_create_jingle_lists_table.php');

    try {
        $migration->down();
        $migration->up();

        $timeList = JingleList::query()->where('station_id', $byTime->id)->sole();
        $trackList = JingleList::query()->where('station_id', $byTracks->id)->sole();

        expect($timeList->enabled)->toBeTrue()
            ->and($timeList->frequency)->toBe(JingleList::FREQUENCY_MINUTES)
            ->and($timeList->every_minutes)->toBe(15)
            ->and($timeList->pick)->toBe(JingleList::PICK_RANDOM)
            ->and($trackList->enabled)->toBeFalse()
            ->and($trackList->frequency)->toBe(JingleList::FREQUENCY_SONGS)
            ->and($trackList->every_songs)->toBe(3)
            ->and($a->fresh()->jingle_list_id)->toBe($timeList->id)
            ->and($b->fresh()->jingle_list_id)->toBe($trackList->id)
            ->and(JingleList::query()->where('station_id', $none->id)->exists())->toBeFalse();
    } finally {
        // DDL commits implicitly on MySQL, so clean up rather than trust the
        // RefreshDatabase rollback.
        Track::query()->whereIn('station_id', [$byTime->id, $byTracks->id, $none->id])->delete();
        JingleList::query()->delete();
        Station::query()->whereKey([$byTime->id, $byTracks->id, $none->id])->delete();
    }
});

it('unpins a clip that is deleted, so the list falls back to its first', function () {
    $list = JingleList::factory()->for($this->station)->create(['pick' => JingleList::PICK_SINGLE]);
    $pinned = Track::factory()->for($this->station)->jingle()->create(['jingle_list_id' => $list->id]);
    $list->update(['pinned_track_id' => $pinned->id]);

    actingAs($this->owner, 'sanctum')->deleteJson("/api/tracks/{$pinned->id}")->assertNoContent();

    expect($list->fresh()->pinned_track_id)->toBeNull();
});
