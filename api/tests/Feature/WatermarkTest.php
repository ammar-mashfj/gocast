<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

use function Pest\Laravel\actingAs;

/**
 * The free-tier watermark: a platform-owned clip ducked over the station every
 * few minutes. Two properties matter more than anything else here and both are
 * pinned below — a free user must have no way to switch it off, and a paying
 * one must stop hearing it without their listeners being disconnected.
 */
beforeEach(function () {
    $this->free = Plan::query()->where('slug', 'free')->firstOrFail();
    $this->free->update(['watermark_enabled' => true]);

    $this->pro = Plan::query()->where('slug', 'pro')->firstOrFail();
    $this->pro->update(['watermark_enabled' => false]);
});

it('marks stations on a free plan and leaves paid ones clean', function () {
    $freeUser = User::factory()->create(['plan_id' => $this->free->id]);
    $proUser = User::factory()->create(['plan_id' => $this->pro->id]);

    expect($freeUser->watermarked())->toBeTrue()
        ->and($proUser->watermarked())->toBeFalse();
});

it('never marks a station whose owner cannot be resolved', function () {
    // `plan_id` is NOT NULL, so the unresolvable case in practice is a station
    // whose owner relation is missing — a deleted account, or simply a model
    // built without it. Failing the other way would put "powered by GoCast"
    // over a paying customer's show because of an absent relation.
    $station = Station::factory()->make();
    $station->setRelation('user', null);

    expect(app(LiquidsoapSupervisor::class)->watermarkEnabledFor($station))->toBeFalse();
});

it('honours the install-wide kill switch regardless of plan', function () {
    config(['liquidsoap.watermark_enabled' => false]);

    $freeUser = User::factory()->create(['plan_id' => $this->free->id]);

    expect($freeUser->watermarked())->toBeFalse();
});

it('gives the owner no way to switch it off', function () {
    // The whole feature rests on this. There is no station column, so even a
    // crafted payload cannot reach it — and if someone later adds one to
    // UpdateStationRequest, this fails.
    $owner = User::factory()->create(['plan_id' => $this->free->id]);
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->patchJson("/api/stations/{$station->slug}", [
            'watermarked' => false,
            'watermark_enabled' => false,
        ])
        ->assertOk();

    expect($station->refresh()->getAttributes())->not->toHaveKey('watermark_enabled')
        ->and($owner->refresh()->watermarked())->toBeTrue();
});

it('tells the owner their stream is marked, and nobody else', function () {
    // Surfaced so the dashboard can be honest and offer the upgrade — but
    // owner-only, or /discover would publish who is on the free plan.
    $owner = User::factory()->create(['plan_id' => $this->free->id]);
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->getJson("/api/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonPath('data.watermarked', true);

    actingAs(User::factory()->create(['plan_id' => $this->pro->id]), 'sanctum')
        ->getJson("/api/public/stations/{$station->slug}")
        ->assertOk()
        ->assertJsonMissingPath('data.watermarked');
});

it('applies an upgrade to running stations without restarting them', function () {
    // The moment that matters: somebody has just paid to remove the watermark.
    // Restarting would silence it and disconnect every listener they have,
    // mid-show, as the reward for upgrading.
    $user = User::factory()->create(['plan_id' => $this->free->id]);
    $station = Station::factory()->for($user, 'user')->create([
        'desired_state' => Station::STATE_RUNNING,
    ]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('up');
    $supervisor->shouldNotReceive('restart');
    $supervisor->shouldReceive('applyWatermarkSettings')->once();
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $user->update(['plan_id' => $this->pro->id]);
});

it('ignores user edits that do not change the plan', function () {
    $user = User::factory()->create(['plan_id' => $this->free->id]);
    Station::factory()->for($user, 'user')->create(['desired_state' => Station::STATE_RUNNING]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('applyWatermarkSettings');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $user->update(['name' => 'Renamed']);
});

it('does not reach for containers of stopped stations on upgrade', function () {
    // Nothing to tell — a stopped station renders the new value into its
    // script whenever it next starts.
    $user = User::factory()->create(['plan_id' => $this->free->id]);
    Station::factory()->for($user, 'user')->create(['desired_state' => Station::STATE_STOPPED]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldNotReceive('applyWatermarkSettings');
    app()->instance(LiquidsoapSupervisor::class, $supervisor);

    $user->update(['plan_id' => $this->pro->id]);
});

it('pushes the watermark state in liquidsoap var syntax', function () {
    $user = User::factory()->create(['plan_id' => $this->free->id]);
    $station = Station::factory()->for($user, 'user')->make();
    $station->setRelation('user', $user);

    config([
        'liquidsoap.watermark_interval_seconds' => 900,
        'liquidsoap.watermark_duck' => 0.2,
    ]);

    $sent = [];
    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')
        ->times(3)
        ->andReturnUsing(function ($_station, $command) use (&$sent) {
            $sent[] = $command;

            return '';
        });

    expect($supervisor->applyWatermarkSettings($station))->toBeTrue()
        ->and($sent)->toBe([
            'var.set watermark_enabled = true',
            'var.set watermark_interval = 900.0',
            'var.set watermark_duck = 0.200',
        ]);
});

it('clamps a watermark interval that would duck a host mid-sentence', function () {
    // Below a minute this stops reading as branding and starts reading as a
    // fault — and free stations are live-only, so it is a person being ducked.
    $user = User::factory()->create(['plan_id' => $this->free->id]);
    $station = Station::factory()->for($user, 'user')->make();
    $station->setRelation('user', $user);

    config(['liquidsoap.watermark_interval_seconds' => 5]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')->once()->with($station, 'var.set watermark_interval = 60.0');
    $supervisor->shouldReceive('telnet')->times(2)->andReturn('');

    $supervisor->applyWatermarkSettings($station);
});

it('never mutes the station outright in place of ducking it', function () {
    // p = 0 is silence, not a duck, and sounds like the stream dropped.
    $user = User::factory()->create(['plan_id' => $this->free->id]);
    $station = Station::factory()->for($user, 'user')->make();
    $station->setRelation('user', $user);

    config(['liquidsoap.watermark_duck' => 0]);

    $supervisor = Mockery::mock(LiquidsoapSupervisor::class)->makePartial();
    $supervisor->shouldReceive('telnet')->once()->with($station, 'var.set watermark_duck = 0.010');
    $supervisor->shouldReceive('telnet')->times(2)->andReturn('');

    $supervisor->applyWatermarkSettings($station);
});
