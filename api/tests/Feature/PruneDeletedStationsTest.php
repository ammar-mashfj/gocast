<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\PlaylistFileWriter;

use function Pest\Laravel\artisan;

/**
 * The collector for soft-deleted stations.
 *
 * What matters here is not that rows disappear — it is that the audio on disk
 * goes with them. A prune that removes the row and strands the files would be
 * worse than no prune at all: the disk would still fill, and nothing would be
 * left pointing at what to clean up.
 */
function trashedStationWithAudio(?Carbon\Carbon $deletedAt = null): array
{
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $dir = app(PlaylistFileWriter::class)->stationDir($station);
    @mkdir($dir, 0775, true);
    $file = $dir.'/track.mp3';
    file_put_contents($file, 'audio');
    Track::factory()->for($station, 'station')->create(['path' => 'track.mp3']);

    $station->delete();

    if ($deletedAt !== null) {
        // Straight to the column: touching deleted_at through the model would
        // re-fire the delete path we are trying to age.
        Station::withTrashed()->where('id', $station->id)->update(['deleted_at' => $deletedAt]);
    }

    return [$station, $file];
}

beforeEach(function () {
    config(['liquidsoap.playlists_dir' => sys_get_temp_dir().'/gocast-prune-'.uniqid()]);
});

it('erases a station trashed beyond the window, and its audio with it', function () {
    [$station, $file] = trashedStationWithAudio(now()->subDays(45));

    artisan('stations:prune-deleted')->assertSuccessful();

    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(0);
    expect(Track::where('station_id', $station->id)->count())->toBe(0);
    expect(is_file($file))->toBeFalse();
});

it('leaves a station still inside its grace period alone', function () {
    [$station, $file] = trashedStationWithAudio(now()->subDays(3));

    artisan('stations:prune-deleted')->assertSuccessful();

    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(1);
    expect(is_file($file))->toBeTrue();
});

it('never touches a station that is not deleted at all', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    artisan('stations:prune-deleted')->assertSuccessful();

    expect($station->fresh())->not->toBeNull();
});

it('honours an explicit --days override', function () {
    [$station] = trashedStationWithAudio(now()->subDays(10));

    artisan('stations:prune-deleted --days=30')->assertSuccessful();
    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(1);

    artisan('stations:prune-deleted --days=7')->assertSuccessful();
    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(0);
});

it('does nothing at all when retention is disabled', function () {
    [$station, $file] = trashedStationWithAudio(now()->subYears(2));

    config(['liquidsoap.deleted_station_retention_days' => 0]);

    artisan('stations:prune-deleted')->assertSuccessful();

    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(1);
    expect(is_file($file))->toBeTrue();
});

it('reports without erasing on a dry run', function () {
    [$station, $file] = trashedStationWithAudio(now()->subDays(45));

    artisan('stations:prune-deleted --dry-run')->assertSuccessful();

    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(1);
    expect(is_file($file))->toBeTrue();
});

it('collects the stations left behind by a deleted account', function () {
    // The path that motivated this: the owner is gone and can never restore
    // these, so the audio would otherwise sit on disk forever.
    $user = User::factory()->create();
    $station = Station::factory()->for($user, 'user')->create();

    $dir = app(PlaylistFileWriter::class)->stationDir($station);
    @mkdir($dir, 0775, true);
    file_put_contents($dir.'/track.mp3', 'audio');
    Track::factory()->for($station, 'station')->create(['path' => 'track.mp3']);

    $user->delete();
    Station::withTrashed()->where('id', $station->id)->update(['deleted_at' => now()->subDays(45)]);

    artisan('stations:prune-deleted')->assertSuccessful();

    expect(Station::withTrashed()->where('id', $station->id)->count())->toBe(0);
    expect(is_dir($dir))->toBeFalse();
});
