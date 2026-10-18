<?php

use App\Console\Commands\E2ESeedCommand;
use App\Models\AutodjSlot;
use App\Models\ListenerSession;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\Track;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Process;

/**
 * e2e:seed rebuilds the keeper accounts the Playwright capture specs sign in
 * as. What matters: the data those specs click on exists, a rerun lands on
 * the same state, and nothing ever asks Docker for a container.
 */
function seededCounts(): array
{
    return [
        'users' => User::withTrashed()->count(),
        'stations' => Station::withTrashed()->count(),
        'tracks' => Track::count(),
        'slots' => AutodjSlot::count(),
        'shows' => StreamSession::count(),
        'listens' => ListenerSession::count(),
        'playlists' => DB::table('playlists')->count(),
        'playlist_track' => DB::table('playlist_track')->count(),
        'hourly' => DB::table('listener_stats_hourly')->count(),
        'geo' => DB::table('listener_geo_daily')->count(),
    ];
}

it('seeds the three keeper accounts with what the capture specs rely on', function () {
    $this->artisan('e2e:seed')
        ->expectsOutputToContain('seeded:shell@gocast.test pro station=night-shift-shell')
        ->expectsOutputToContain('seeded:free@gocast.test free station=free-shell')
        ->expectsOutputToContain('seeded:create@gocast.test free no-station')
        ->assertSuccessful();

    $pro = User::where('email', 'shell@gocast.test')->firstOrFail();
    $free = User::where('email', 'free@gocast.test')->firstOrFail();
    $new = User::where('email', 'create@gocast.test')->firstOrFail();

    foreach ([$pro, $free, $new] as $user) {
        expect($user->email_verified_at)->not->toBeNull()
            ->and(Hash::check('Password123!', $user->password))->toBeTrue();
    }

    expect($pro->plan->slug)->toBe('pro')
        ->and($free->plan->slug)->toBe('free')
        ->and($new->stations()->count())->toBe(0);

    $station = $pro->stations()->sole();
    expect($station->slug)->toBe('night-shift-shell')
        ->and($station->name)->toBe('Night Shift Shell')
        ->and($station->timezone)->toBe('Europe/London')
        ->and($station->desired_state)->toBe(Station::STATE_STOPPED)
        ->and($station->artwork_url)->toBeNull()
        ->and($station->stream_key)->not->toBeEmpty();

    expect($station->playlists()->pluck('name')->all())->toEqualCanonicalizing([
        'Main rotation', 'Morning Soul', 'Lofi Afternoon', 'Big Rotation', 'One Track Wonder', 'Empty Shelf',
    ]);
    expect($station->playlists()->where('name', 'Empty Shelf')->sole()->tracks()->count())->toBe(0)
        ->and($station->playlists()->where('name', 'One Track Wonder')->sole()->tracks()->count())->toBe(1)
        ->and($station->defaultPlaylist->name)->toBe('Main rotation');

    // help-screenshots clicks `button[title^='Morning Soul']` and ticks
    // Mon/Tue/Thu/Fri onto it, so it is the unlabelled Wednesday slot.
    $morning = $station->autodjSlots()->whereNull('label')->sole();
    expect($morning->playlist->name)->toBe('Morning Soul')
        ->and($morning->days)->toBe([3])
        ->and($morning->start_time)->toBe('06:00:00');
    // One crossing midnight, one on the empty playlist.
    expect($station->autodjSlots()->where('end_time', '02:00:00')->exists())->toBeTrue()
        ->and($station->autodjSlots()->whereRelation('playlist', 'name', 'Empty Shelf')->exists())->toBeTrue();

    expect($station->tracks()->where('kind', Track::KIND_MUSIC)->count())->toBe(24)
        ->and($station->tracks()->where('kind', Track::KIND_JINGLE)->count())->toBe(5)
        ->and($station->jingles_enabled)->toBeTrue();

    // Your shows: more than one 20-row page, two from DJ software.
    expect($station->streamSessions()->count())->toBe(24)
        ->and($station->streamSessions()->where('source_type', 'external')->count())->toBe(2)
        ->and($station->streamSessions()->whereNull('ended_at')->count())->toBe(0);

    $listens = fn () => ListenerSession::where('station_id', $station->id);
    expect($listens()->count())->toBe(360)
        ->and($listens()->whereNull('ended_at')->count())->toBe(0)
        ->and($listens()->where('started_at', '<', now()->subDays(90))->count())->toBe(0)
        ->and(DB::table('listener_geo_daily')->where('station_id', $station->id)->exists())->toBeTrue()
        ->and(DB::table('listener_stats_hourly')->where('station_id', $station->id)->sum('listener_minutes'))->toBeGreaterThan(0);

    $freeStation = $free->stations()->sole();
    expect($freeStation->slug)->toBe('free-shell')
        ->and($freeStation->desired_state)->toBe(Station::STATE_STOPPED)
        ->and($freeStation->tracks()->count())->toBe(0)
        ->and($freeStation->streamSessions()->count())->toBe(0);
});

it('is idempotent', function () {
    $this->artisan('e2e:seed')->assertSuccessful();
    $first = seededCounts();
    $firstProId = User::where('email', 'shell@gocast.test')->value('id');

    $this->artisan('e2e:seed')->assertSuccessful();

    expect(seededCounts())->toBe($first)
        ->and(User::where('email', 'shell@gocast.test')->value('id'))->not->toBe($firstProId);
});

it('never starts a container', function () {
    Process::fake();
    $supervisor = $this->spy(LiquidsoapSupervisor::class);

    // Twice, so the delete-and-recreate path runs too.
    $this->artisan('e2e:seed')->assertSuccessful();
    $this->artisan('e2e:seed')->assertSuccessful();

    $supervisor->shouldNotHaveReceived('up');
    $supervisor->shouldNotHaveReceived('restart');
    Process::assertNothingRan();
    expect(Station::running()->count())->toBe(0);
});

it('leaves the throwaway accounts alone unless asked', function () {
    foreach (E2ESeedCommand::THROWAWAY_EMAILS as $email) {
        User::factory()->create(['email' => $email]);
    }

    $this->artisan('e2e:seed')->assertSuccessful();
    expect(User::whereIn('email', E2ESeedCommand::THROWAWAY_EMAILS)->count())->toBe(2);

    $this->artisan('e2e:seed', ['--clean-throwaway' => true])
        ->expectsOutputToContain('deleted:share-check@gocast.test')
        ->assertSuccessful();
    expect(User::withTrashed()->whereIn('email', E2ESeedCommand::THROWAWAY_EMAILS)->count())->toBe(0);
});

it('refuses to clobber a station somebody else owns on a keeper link', function () {
    Station::factory()->create(['slug' => 'night-shift-shell']);

    $this->artisan('e2e:seed')
        ->expectsOutputToContain('night-shift-shell already exists')
        ->assertFailed();
});

it('refuses outside local and testing', function () {
    app()->detectEnvironment(fn () => 'production');

    try {
        $this->artisan('e2e:seed')
            ->expectsOutputToContain('only available in local/testing')
            ->assertFailed();
    } finally {
        app()->detectEnvironment(fn () => 'testing');
    }

    expect(User::where('email', 'shell@gocast.test')->exists())->toBeFalse();
});
