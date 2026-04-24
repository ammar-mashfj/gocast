<?php

use App\Jobs\SendStationLiveNotifications;
use App\Models\Station;
use App\Models\StationNotifySubscription;
use App\Models\StreamSession;
use App\Models\User;
use App\Notifications\StationLiveNotification;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\assertDatabaseCount;
use function Pest\Laravel\postJson;

beforeEach(function () {
    Notification::fake();
});

it('stores notify-me subscriptions idempotently and re-arms previously notified emails', function () {
    $station = Station::factory()->create(['slug' => 'notify-test']);

    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'listener@test.test',
        'notified_at' => now()->subHour(),
    ]);

    postJson('/api/public/stations/notify-test/notify', [
        'email' => ' LISTENER@test.test ',
    ])->assertSuccessful()
        ->assertJson(['message' => "We'll email you when {$station->name} goes live."]);

    assertDatabaseCount('station_notify_subscriptions', 1);
    $subscription = StationNotifySubscription::firstWhere('email', 'listener@test.test');
    expect($subscription->notified_at)->toBeNull();
});

it('schedules delayed notification delivery when a station session starts', function () {
    Bus::fake();
    $now = now();
    $this->travelTo($now);

    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create([
        'name' => 'Night Waves',
        'slug' => 'night-waves',
        'is_live' => false,
    ]);

    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'first@test.test',
    ]);
    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'second@test.test',
    ]);

    actingAs($owner, 'sanctum')
        ->postJson("/api/stations/{$station->slug}/sessions", [
            'device_id' => 'test-device',
        ])
        ->assertCreated()
        ->assertJson(['message' => 'Stream started.']);

    $session = StreamSession::where('station_id', $station->id)->firstOrFail();

    Bus::assertDispatched(
        SendStationLiveNotifications::class,
        fn (SendStationLiveNotifications $job): bool => $job->stationId === $station->id
            && $job->streamSessionId === $session->id
            && $job->delay?->equalTo($now->copy()->addMinutes(2))
    );
    Notification::assertNothingSent();
});

it('emails unnotified listeners when the delayed job confirms the same session is still live', function () {
    $station = Station::factory()->create([
        'name' => 'Night Waves',
        'slug' => 'night-waves',
        'is_live' => true,
    ]);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(2),
    ]);

    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'first@test.test',
    ]);
    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'second@test.test',
    ]);

    (new SendStationLiveNotifications($station->id, $session->id))->handle();

    Notification::assertSentOnDemandTimes(StationLiveNotification::class, 2);
    Notification::assertSentOnDemand(
        StationLiveNotification::class,
        fn (StationLiveNotification $notification, array $channels, $notifiable): bool => $notification->stationName === 'Night Waves'
            && $notification->stationSlug === 'night-waves'
            && in_array($notifiable->routes['mail'], ['first@test.test', 'second@test.test'], true)
    );

    expect(
        StationNotifySubscription::where('station_id', $station->id)
            ->whereNull('notified_at')
            ->exists()
    )->toBeFalse();
});

it('does not email subscriptions that were already notified', function () {
    $station = Station::factory()->create(['is_live' => true]);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(2),
    ]);

    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'already@test.test',
        'notified_at' => now()->subMinute(),
    ]);

    (new SendStationLiveNotifications($station->id, $session->id))->handle();

    Notification::assertNothingSent();
});

it('does not email listeners when the delayed job finds the station offline', function () {
    $station = Station::factory()->create(['is_live' => false]);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(2),
    ]);

    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'listener@test.test',
    ]);

    (new SendStationLiveNotifications($station->id, $session->id))->handle();

    Notification::assertNothingSent();
    expect(StationNotifySubscription::first()->notified_at)->toBeNull();
});

it('does not email listeners when the original stream session already ended', function () {
    $station = Station::factory()->create(['is_live' => true]);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subMinutes(2),
        'ended_at' => now(),
    ]);

    StationNotifySubscription::create([
        'station_id' => $station->id,
        'email' => 'listener@test.test',
    ]);

    (new SendStationLiveNotifications($station->id, $session->id))->handle();

    Notification::assertNothingSent();
    expect(StationNotifySubscription::first()->notified_at)->toBeNull();
});
