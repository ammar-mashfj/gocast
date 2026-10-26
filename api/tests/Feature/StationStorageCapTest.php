<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-storage-cap-test-'.uniqid();
    config([
        'liquidsoap.playlists_dir' => $this->tmpDir,
        // Small enough that a 10 KB fake upload on top of 15 KB goes over.
        'liquidsoap.station_storage_bytes' => 20_000,
    ]);

    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    $this->owner = User::factory()->create(['plan_id' => $plan->id]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

it('falls back to the install default when no override is set', function () {
    $station = Station::factory()->for($this->owner, 'user')->create();

    expect($station->storageCapBytes())->toBe(20_000);
});

it('uses the station override over the install default', function () {
    $station = Station::factory()->for($this->owner, 'user')->create(['storage_cap_bytes' => 5_000_000]);

    expect($station->storageCapBytes())->toBe(5_000_000);
});

it('refuses an upload past the default cap', function () {
    $station = Station::factory()->for($this->owner, 'user')->create();
    Track::factory()->for($station)->create(['file_size_bytes' => 15_000]);

    actingAs($this->owner)
        ->postJson("/api/stations/{$station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('song.mp3', 10, 'audio/mpeg')],
        ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.0.message', fn (string $message) => str_contains($message, 'storage limit reached'));
});

it('accepts the same upload on a station with a bigger cap', function () {
    $station = Station::factory()->for($this->owner, 'user')->create(['storage_cap_bytes' => 5_000_000]);
    Track::factory()->for($station)->create(['file_size_bytes' => 15_000]);

    actingAs($this->owner)
        ->postJson("/api/stations/{$station->slug}/tracks", [
            'files' => [UploadedFile::fake()->create('song.mp3', 10, 'audio/mpeg')],
        ])
        ->assertCreated();
});

it('reports each station its own cap in the library meter', function () {
    // The web and mobile meters print this number as-is: it is the only
    // reason neither client needed a change for the override.
    $default = Station::factory()->for($this->owner, 'user')->create();
    $bigger = Station::factory()->for($this->owner, 'user')->create(['storage_cap_bytes' => 5_000_000]);

    foreach (['music', 'jingle'] as $kind) {
        actingAs($this->owner, 'sanctum')
            ->getJson("/api/stations/{$default->slug}/tracks?kind={$kind}")
            ->assertOk()
            ->assertJsonPath('meta.storage_cap_bytes', 20_000);

        actingAs($this->owner, 'sanctum')
            ->getJson("/api/stations/{$bigger->slug}/tracks?kind={$kind}")
            ->assertOk()
            ->assertJsonPath('meta.storage_cap_bytes', 5_000_000);
    }
});

it('does not let the owner raise their own cap', function () {
    $station = Station::factory()->for($this->owner, 'user')->create();

    actingAs($this->owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", [
            'name' => 'Renamed FM',
            'storage_cap_bytes' => 999_999_999_999,
        ])
        ->assertOk();

    $station->refresh();

    expect($station->name)->toBe('Renamed FM')
        ->and($station->storage_cap_bytes)->toBeNull();
});
