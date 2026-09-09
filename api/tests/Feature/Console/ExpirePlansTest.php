<?php

use App\Models\Plan;
use App\Models\User;
use App\Notifications\PlanExpired;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    Notification::fake();

    $this->free = Plan::where('slug', 'free')->firstOrFail();
    $this->pro = Plan::where('slug', 'pro')->firstOrFail();
});

it('moves an account whose plan has ended back to free and tells them', function () {
    $user = User::factory()->create([
        'plan_id' => $this->pro->id,
        'plan_expires_at' => now()->subMinute(),
    ]);

    $this->artisan('plans:expire')
        ->expectsOutputToContain('Moved 1 account(s)')
        ->assertSuccessful();

    $user->refresh();

    expect($user->plan_id)->toBe($this->free->id)
        ->and($user->plan_expires_at)->toBeNull();

    Notification::assertSentTo($user, PlanExpired::class);
});

it('leaves accounts whose date has not come, and open-ended ones, alone', function () {
    $later = User::factory()->create([
        'plan_id' => $this->pro->id,
        'plan_expires_at' => now()->addDay(),
    ]);
    $forever = User::factory()->create(['plan_id' => $this->pro->id]);

    $this->artisan('plans:expire')->assertSuccessful();

    expect($later->fresh()->plan_id)->toBe($this->pro->id)
        ->and($forever->fresh()->plan_id)->toBe($this->pro->id);

    Notification::assertNothingSent();
});

it('is safe to run twice', function () {
    $user = User::factory()->create([
        'plan_id' => $this->pro->id,
        'plan_expires_at' => now()->subMinute(),
    ]);

    $this->artisan('plans:expire');
    $this->artisan('plans:expire');

    Notification::assertSentToTimes($user, PlanExpired::class, 1);
});
