<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\patchJson;

/**
 * An owner who can actually use jingles. They are part of AutoDJ — they only
 * play between rotation tracks — so turning them on is gated on the same plan
 * flag as uploading, and a test that skipped this would be asserting against
 * the free default.
 */
function proOwner(): User
{
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    return User::factory()->create(['plan_id' => $plan->id]);
}

/**
 * Jingle settings ride on the normal station update endpoint rather than an
 * endpoint of their own, because StationObserver already watches this table
 * for changes that need the container re-rendered and restarted. These tests
 * pin the parts of that decision a future refactor could quietly break: the
 * bounds, the default, and the fact that the values reach the API response.
 */
it('defaults new stations to jingles off at a half-hour spacing', function () {
    // Off by default matters: uploading a station ID must not start
    // interrupting a rotation somebody already has listeners on.
    $station = Station::factory()->for(User::factory(), 'user')->create();

    expect($station->jingles_enabled)->toBeFalse()
        ->and($station->jingle_interval_seconds)->toBe(1800);
});

it('lets the owner turn jingles on and set the interval', function () {
    $owner = proOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", [
            'jingles_enabled' => true,
            'jingle_interval_seconds' => 900,
        ])
        ->assertOk()
        ->assertJsonPath('data.jingles_enabled', true)
        ->assertJsonPath('data.jingle_interval_seconds', 900);

    expect($station->refresh()->jingles_enabled)->toBeTrue();
});

it('rejects an interval short enough to fire between every track', function () {
    // Below a minute, delay() stops being a spacing rule and starts putting a
    // station ID between every song — which is what the rotation is for.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingle_interval_seconds' => 5])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('jingle_interval_seconds');
});

it('rejects an interval so long it is indistinguishable from off', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingle_interval_seconds' => 999_999])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('jingle_interval_seconds');
});

it('leaves jingle settings alone on an unrelated station edit', function () {
    // 'sometimes' rather than 'nullable': the existing client PUTs name,
    // description, genre and artwork with no jingle keys at all, and that must
    // not reset a configured station back to the defaults.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create([
        'jingles_enabled' => true,
        'jingle_interval_seconds' => 600,
    ]);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['name' => 'Renamed'])
        ->assertOk();

    expect($station->refresh()->jingles_enabled)->toBeTrue()
        ->and($station->jingle_interval_seconds)->toBe(600);
});

it('forbids a stranger from changing jingle settings', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    actingAs(User::factory()->create(), 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingles_enabled' => true])
        ->assertForbidden();
});

it('rejects unauthenticated jingle settings changes', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    patchJson("/api/stations/{$station->slug}", ['jingles_enabled' => true])
        ->assertUnauthorized();
});

it('defaults to interval mode so existing stations are unaffected', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    expect($station->jingle_mode)->toBe(Station::JINGLE_MODE_INTERVAL)
        ->and($station->jingle_every_tracks)->toBe(5);
});

it('lets the owner space jingles by track count instead of time', function () {
    $owner = proOwner();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", [
            'jingles_enabled' => true,
            'jingle_mode' => 'tracks',
            'jingle_every_tracks' => 8,
        ])
        ->assertOk()
        ->assertJsonPath('data.jingle_mode', 'tracks')
        ->assertJsonPath('data.jingle_every_tracks', 8);
});

it('keeps the other mode setting when one mode is in use', function () {
    // Switching modes must not discard what the owner chose for the other,
    // or flipping back and forth silently resets it to the default.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create([
        'jingle_mode' => Station::JINGLE_MODE_INTERVAL,
        'jingle_interval_seconds' => 600,
        'jingle_every_tracks' => 12,
    ]);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingle_mode' => 'tracks'])
        ->assertOk();

    expect($station->refresh()->jingle_interval_seconds)->toBe(600)
        ->and($station->jingle_every_tracks)->toBe(12);
});

it('rejects an unknown jingle mode', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingle_mode' => 'hourly'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('jingle_mode');
});

it('rejects a track count that would satisfy the counter permanently', function () {
    // `tracks_since_jingle() >= 0` is true the moment a jingle ends, so zero
    // means a jingle at every single track boundary.
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingle_every_tracks' => 0])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('jingle_every_tracks');
});

it('refuses to turn jingles on without AutoDJ', function () {
    // Jingles play BETWEEN rotation tracks. Without AutoDJ there is no
    // rotation, so storing this would be a setting that can never fire — and
    // a dashboard toggle that appears to work is worse than one that says why
    // it does not.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $owner = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingles_enabled' => true])
        ->assertForbidden()
        ->assertJsonPath('code', 'autodj_not_available');

    expect($station->refresh()->jingles_enabled)->toBeFalse();
});

it('still lets a downgraded owner turn jingles back off', function () {
    // Same rule as the track library: a downgrade must never strand someone
    // in a state they cannot leave.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $owner = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($owner, 'user')->create(['jingles_enabled' => true]);

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['jingles_enabled' => false])
        ->assertOk();

    expect($station->refresh()->jingles_enabled)->toBeFalse();
});

it('leaves the rest of the station editable without AutoDJ', function () {
    // The gate is on one field, not the endpoint. Renaming a station is not a
    // paid feature and must not start returning 403.
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $owner = User::factory()->create(['plan_id' => $plan->id]);
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", ['name' => 'Renamed'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Renamed');
});

// ── The downgrade gate ──
//
// The rotation half of a downgrade enforces itself: the container asks Laravel
// for every track and AutoDjScheduler::next() answers null. The jingle arm
// asks nobody — it reads an m3u off disk — so a downgraded station used to go
// silent on music and carry on playing station IDs forever. Worse than
// cosmetic: a jingle registers on the output meter, so StationAudioPolicy
// scored the station `InUse` at every sweep and it never powered down.

it('keeps jingles audible while the owner is on an AutoDJ plan', function () {
    $station = Station::factory()->for(proOwner(), 'user')->create(['jingles_enabled' => true]);

    expect($station->jinglesAudible())->toBeTrue();
});

it('takes jingles off air when the owner loses AutoDJ', function () {
    $owner = proOwner();
    $station = Station::factory()->for($owner, 'user')->create(['jingles_enabled' => true]);

    $owner->forceFill(['plan_id' => Plan::query()->where('slug', 'free')->value('id')])->save();

    // The column is untouched — the owner's own setting is theirs to keep, and
    // it comes back on its own if the plan does.
    expect($station->fresh()->jingles_enabled)->toBeTrue()
        ->and($station->fresh()->jinglesAudible())->toBeFalse();
});

it('pushes the jingle switch to running containers on a plan change', function () {
    // Without a restart, exactly like the watermark: the whole reason both are
    // interactive variables. A downgrade that waited for the next restart
    // would leave the station IDs playing for as long as the container lives.
    $owner = proOwner();
    Station::factory()->for($owner, 'user')->create([
        'jingles_enabled' => true,
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('restart');
    $supervisor->shouldReceive('applyWatermarkSettings')->once();
    $supervisor->shouldReceive('applyJingleSettings')->once();
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $owner->update(['plan_id' => Plan::query()->where('slug', 'free')->value('id')]);
});

it('pushes the NEW plan when plans:expire performs the downgrade', function () {
    // The push is only worth anything if it carries the plan that was just
    // written, and the caller that matters most did not: plans:expire
    // eager-loads `plan` to name the ended one in its email, and Eloquent
    // keeps a loaded belongsTo across a change of its key. The observer hands
    // that same user to the pushes, which walk station -> user -> plan — so
    // without unsetting it, a term running out pushed `jingles_enabled = true`
    // and the watermark off, the entitlements of the plan that had just ended.
    // Asserted on what was actually read, not on the call having happened.
    $owner = proOwner();
    $owner->forceFill(['plan_expires_at' => now()->subMinute()])->save();
    Station::factory()->for($owner, 'user')->create([
        'jingles_enabled' => true,
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $pushed = [];
    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('restart');
    $supervisor->shouldReceive('applyWatermarkSettings')->once()
        ->andReturnUsing(function (Station $station) use (&$pushed) {
            $pushed['watermark'] = $station->user->watermarked();

            return true;
        });
    $supervisor->shouldReceive('applyJingleSettings')->once()
        ->andReturnUsing(function (Station $station) use (&$pushed) {
            $pushed['jingles'] = $station->jinglesAudible();

            return true;
        });
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    test()->artisan('plans:expire')->assertSuccessful();

    expect($pushed['jingles'])->toBeFalse()
        ->and($pushed['watermark'])->toBe((bool) Plan::query()->where('slug', 'free')->value('watermark_enabled'));
});
