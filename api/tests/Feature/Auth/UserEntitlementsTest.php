<?php

use App\Models\Plan;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * `GET /api/user` is where the dashboard learns what the account may do.
 *
 * Before this existed the front end had no plan awareness at all, so the
 * AutoDJ nav item looked live on a free account and the first thing anyone
 * heard about the paywall was a 403 on their first upload. These tests pin
 * the shape the sidebar and library screen read, and — more importantly —
 * pin it to the SAME answer TrackController enforces.
 *
 * There is no "user with no plan" case to cover: `plan_id` is NOT NULL with a
 * FK and a default of 1. UserResource still coalesces to free, matching
 * StationLifecycleService::autoDjEnabled — an unreachable branch that would
 * become reachable the day the column goes nullable, and must fail closed.
 */
it('reports the plan entitlements the dashboard gates on', function () {
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true, 'watermark_enabled' => false]);

    $user = User::factory()->create(['plan_id' => $plan->id]);

    actingAs($user, 'sanctum')
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonPath('data.plan.slug', 'pro')
        ->assertJsonPath('data.plan.autodj_enabled', true)
        ->assertJsonPath('data.plan.watermarked', false);
});

it('reports AutoDJ as unavailable on a free plan', function () {
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    $user = User::factory()->create(['plan_id' => $plan->id]);

    actingAs($user, 'sanctum')
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.plan.slug', 'free')
        ->assertJsonPath('data.plan.autodj_enabled', false);
});

it('never leaks the password hash', function () {
    $user = User::factory()->create();

    actingAs($user, 'sanctum')
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonMissingPath('data.password')
        ->assertJsonMissingPath('data.remember_token');
});

it('sends the idle check timings to a plan without AutoDJ', function () {
    config(['studio.idle_check.idle_seconds' => 3600, 'studio.idle_check.warn_seconds' => 600]);
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    actingAs(User::factory()->create(['plan_id' => $plan->id]), 'sanctum')
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.plan.idle_check', ['idle_seconds' => 3600, 'warn_seconds' => 600]);
});

it('follows the configured idle check timings', function () {
    config(['studio.idle_check.idle_seconds' => 10, 'studio.idle_check.warn_seconds' => 10]);
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    actingAs(User::factory()->create(['plan_id' => $plan->id]), 'sanctum')
        ->getJson('/api/user')
        ->assertJsonPath('data.plan.idle_check', ['idle_seconds' => 10, 'warn_seconds' => 10]);
});

it('never idle-checks a plan with AutoDJ', function () {
    $plan = Plan::query()->where('slug', 'pro')->firstOrFail();
    $plan->update(['autodj_enabled' => true]);

    actingAs(User::factory()->create(['plan_id' => $plan->id]), 'sanctum')
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.plan.idle_check', null);
});

it('switches the idle check off when its time is zero', function () {
    config(['studio.idle_check.idle_seconds' => 0]);
    $plan = Plan::query()->where('slug', 'free')->firstOrFail();
    $plan->update(['autodj_enabled' => false]);

    actingAs(User::factory()->create(['plan_id' => $plan->id]), 'sanctum')
        ->getJson('/api/user')
        ->assertJsonPath('data.plan.idle_check', null);
});
