<?php

namespace App\Providers;

use App\Listeners\RecordAdminLastLogin;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Illuminate\Auth\Events\Login;
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

        // Higher ceiling for relay-to-API calls that fire on every listener or metadata event.
        RateLimiter::for('internal', function (Request $request) {
            return Limit::perMinute(300)->by($request->ip());
        });

        // Limit file uploads to prevent abuse and excessive storage consumption.
        RateLimiter::for('uploads', function (Request $request) {
            return Limit::perMinute(20)->by($request->user()->id);
        });

        Relation::enforceMorphMap([
            'admin' => Admin::class,
            'user' => User::class,
            'station' => Station::class,
            'plan' => Plan::class,
        ]);

        Event::listen(Login::class, RecordAdminLastLogin::class);
    }
}
