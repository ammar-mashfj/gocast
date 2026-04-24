<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Run every 5 minutes to detect relay outages and mark orphaned live stations as offline.
Schedule::command('app:clean-stale-streams')->everyFiveMinutes();

Schedule::command('admin:detect-login-abuse')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

// Day-7 inactive-broadcaster nudge — runs once a day at 16:00 UTC (a typical
// open-rate sweet spot) to email users who signed up a week ago and haven't
// gone live yet. The command itself is idempotent (skips users already
// nudged via the notifications table).
Schedule::command('app:nudge-inactive-broadcasters')
    ->dailyAt('16:00')
    ->withoutOverlapping();
