<?php

namespace App\Providers;

use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Notifications\WelcomeNotification;
use App\Observers\StationObserver;
use App\Observers\UserObserver;
use Illuminate\Auth\Events\Verified;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Tight limit on auth routes to slow down brute-force and credential-stuffing attacks.
        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // Standard limit for unauthenticated public endpoints (station pages, listener counts).
        RateLimiter::for('public', function (Request $request) {
            return Limit::perMinute(60)->by($request->ip());
        });

        // Higher ceiling for internal server-to-server calls from the station
        // containers (harbor auth, lifecycle events, now-playing pushes).
        RateLimiter::for('internal', function (Request $request) {
            return Limit::perMinute(300)->by($request->ip());
        });

        // Limit file uploads to prevent abuse and excessive storage consumption.
        RateLimiter::for('uploads', function (Request $request) {
            return Limit::perMinute(20)->by($request->user()->id);
        });

        // Opening a listening session. Per-IP, because there is no identity
        // yet — the whole point of the call is to mint one. Roomy enough for a
        // shared address (an office, a school, a household) where a dozen
        // people might press play within a minute, tight enough that nobody
        // can manufacture sessions fast enough to matter.
        RateLimiter::for('listener-start', function (Request $request) {
            return Limit::perMinute(30)->by($request->ip());
        });

        // Check-ins and goodbyes, keyed by SESSION TOKEN rather than IP.
        //
        // This distinction is load-bearing. Every listener behind one NAT
        // address shares an IP, so an IP-keyed limit would throttle the
        // audience of a station being listened to in an office and quietly
        // under-report exactly the rooms we most want to count. A token is one
        // listener by construction, so a per-token limit bounds abuse without
        // ever punishing a crowd. The ceiling on how many tokens can exist is
        // `listener-start` above.
        //
        // A well-behaved player beats four times a minute at the default
        // interval; 20 leaves room for a retry storm after a network blip
        // without leaving room for a flood.
        RateLimiter::for('listener-beat', function (Request $request) {
            return Limit::perMinute(20)->by((string) $request->route('token'));
        });

        Relation::enforceMorphMap([
            'admin' => Admin::class,
            'user' => User::class,
            'station' => Station::class,
            'plan' => Plan::class,
        ]);

        // Drive per-station Liquidsoap containers from the Station model
        // lifecycle. See StationObserver for the create/update/delete hooks.
        Station::observe(StationObserver::class);

        // Carries a plan change through to running containers — currently the
        // free-tier watermark, which must stop the moment someone upgrades
        // rather than at their next restart.
        User::observe(UserObserver::class);

        // Send the welcome email the moment a user verifies. Anchored on
        // verification (not registration) so the email is reachable, and so
        // OAuth signups still get a welcome since their email is auto-verified.
        Event::listen(Verified::class, function (Verified $event) {
            if ($event->user instanceof User) {
                $event->user->notify(new WelcomeNotification);
            }
        });
    }
}
