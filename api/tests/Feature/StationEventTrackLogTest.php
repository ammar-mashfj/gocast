<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\StationEvent;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;

/**
 * Library changes on a station's timeline.
 *
 * The detail is copied onto the event rather than referenced by id, which is
 * the point: an upload log that goes blank once the track is deleted answers
 * none of the questions it was built for.
 */
beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-station-event-track-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);

    // Uploading is gated on the plan's track library, so the owner needs a
    // plan that has one before any of this is reachable.
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    $this->owner = User::factory()->create(['plan_id' => $plan->id]);
    $this->station = Station::factory()->for($this->owner, 'user')->create();
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

it('records an upload against the station that received it', function () {
    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('Artist - Song.mp3', 100, 'audio/mpeg')],
        ])->assertSuccessful();

    $event = StationEvent::where('type', StationEvent::TYPE_TRACK_UPLOADED)->sole();

    expect($event->station_id)->toBe($this->station->id)
        ->and($event->source)->toBe(StationEvent::SOURCE_OWNER)
        ->and($event->causer_id)->toBe((string) $this->owner->id)
        ->and($event->properties['kind'])->toBe(Track::KIND_MUSIC)
        ->and($event->properties['title'])->toBe('Song')
        ->and($event->properties['artist'])->toBe('Artist');
});

it('keeps enough of a deleted track to still read as a log entry', function () {
    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('Gone - Forever.mp3', 100, 'audio/mpeg')],
        ])->assertSuccessful();

    $track = Track::sole();

    actingAs($this->owner, 'sanctum')
        ->deleteJson("/api/tracks/{$track->id}")
        ->assertSuccessful();

    $event = StationEvent::where('type', StationEvent::TYPE_TRACK_DELETED)->sole();

    expect(Track::count())->toBe(0)
        ->and($event->properties['title'])->toBe('Forever')
        ->and($event->properties['artist'])->toBe('Gone')
        ->and($event->properties['track_id'])->toBe($track->id);
});

it('records nothing when the upload is rejected', function () {
    // An upload that never landed must not appear to have landed. The event is
    // written after the commit for exactly this reason.
    config(['liquidsoap.station_storage_bytes' => 1]);

    actingAs($this->owner, 'sanctum')
        ->postJson("/api/stations/{$this->station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('too-big.mp3', 100, 'audio/mpeg')],
        ]);

    expect(StationEvent::count())->toBe(0);
});
