<?php

namespace App\Providers;

use App\Models\Admin;
use App\Models\Invite;
use App\Models\Plan;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Models\WaitlistEntry;
use App\Notifications\InviteRedeemed;
use App\Notifications\WelcomeNotification;
use App\Observers\StationObserver;
use App\Observers\UserObserver;
use App\Services\AdminTelegram;
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
        //
        // The Next.js server is exempt when it proves itself with the render
        // key. Every server-rendered station page, the homepage rail and the
        // sitemap reach this API from that ONE address, so without the
        // exemption a crawler walking sixty station pages in a minute got
        // 429s — which the player page used to turn into 404s, telling Google
        // the stations did not exist.
        RateLimiter::for('public', function (Request $request) {
            $renderKey = (string) config('services.render_api_key');

            if ($renderKey !== '' && hash_equals($renderKey, (string) $request->header('X-Render-Key'))) {
                return Limit::none();
            }

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

        // The dashboard bell's badge poll. Keyed by USER, not IP: this is an
        // authenticated endpoint, and the two people sharing a station's
        // office wifi should not be able to throttle each other's bell.
        //
        // Sized for the client's 60-second interval with a wide margin, so a
        // tab that wakes from sleep and catches up, a second dashboard tab, and
        // the refetch-on-focus all fit without anyone hitting a 429 for
        // looking at the page.
        RateLimiter::for('notification-poll', function (Request $request) {
            return Limit::perMinute(30)->by($request->user()->id);
        });

        Relation::enforceMorphMap([
            'admin' => Admin::class,
            'user' => User::class,
            'station' => Station::class,
            'plan' => Plan::class,
            'invite' => Invite::class,
        ]);

        // Drive per-station Liquidsoap containers from the Station model
        // lifecycle. See StationObserver for the create/update/delete hooks.
        Station::observe(StationObserver::class);

        // Carries a plan change through to running containers — currently the
        // free-tier watermark, which must stop the moment someone upgrades
        // rather than at their next restart.
        User::observe(UserObserver::class);

        // Operator alerts to the admin's Telegram chat. Hooked on the models,
        // not the controllers, so every path that creates the row is covered.
        // Inert until TELEGRAM_BOT_TOKEN is set — see AdminTelegram.
        User::created(fn (User $user) => app(AdminTelegram::class)->userRegistered($user));
        WaitlistEntry::created(fn (WaitlistEntry $entry) => app(AdminTelegram::class)->accessRequested($entry, isNew: true));
        WaitlistEntry::updated(fn (WaitlistEntry $entry) => app(AdminTelegram::class)->accessRequested($entry, isNew: false));
        Station::created(fn (Station $station) => app(AdminTelegram::class)->stationCreated($station));
        StreamSession::created(fn (StreamSession $session) => app(AdminTelegram::class)->broadcastStarted($session));

        // Send the welcome email the moment a user verifies. Anchored on
        // verification (not registration) so the email is reachable, and so
        // OAuth signups still get a welcome since their email is auto-verified.
        //
        // An account that arrived through an invite gets the Pro welcome
        // instead of the generic one — same moment, same reason, and it says
        // everything the generic one does plus what the plan gives them.
        Event::listen(Verified::class, function (Verified $event) {
            if (! $event->user instanceof User) {
                return;
            }

            $user = $event->user;

            if ($user->invite_id !== null && $user->plan) {
                $user->notify(new InviteRedeemed($user->plan, $user->plan_expires_at));

                return;
            }

            $user->notify(new WelcomeNotification);
        });
    }
}
