<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('admin:detect-login-abuse')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

// Listener counts come from Icecast's admin API — nothing pushes them to us.
// Every minute is a good balance: the dashboard number feels live without
// hammering Icecast. withoutOverlapping so a slow/hung poll can't stack up.
Schedule::command('stations:sync-listeners')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

// Nightly orphan-container sweep — `stations:reconcile` is also run from
// deploy.sh after every deploy, but the scheduled run catches drift in
// between (manual DB edits, failed observer runs, etc.). withoutOverlapping
// in case a previous run is still talking to a slow daemon.
Schedule::command('stations:reconcile')
    ->dailyAt('03:00')
    ->withoutOverlapping()
    ->runInBackground();

// Day-7 inactive-broadcaster nudge — runs once a day at 16:00 UTC (a typical
// open-rate sweet spot) to email users who signed up a week ago and haven't
// gone live yet. The command itself is idempotent (skips users already
// nudged via the notifications table).
Schedule::command('app:nudge-inactive-broadcasters')
    ->dailyAt('16:00')
    ->withoutOverlapping();
