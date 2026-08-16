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

// Container convergence: removes containers for stations that are stopped,
// soft-deleted or gone, and restarts containers for stations that should be
// on air but aren't. Every five minutes rather than nightly — this is now the
// safety net behind the power button (a start that failed on a busy daemon is
// retried here) and behind `--restart unless-stopped`, which would otherwise
// resurrect stopped stations after a host reboot. Cost is one `docker ps`
// plus one query when there is no drift.
Schedule::command('stations:reconcile')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

// Idle reaper — takes stations off air when nobody is listening and nobody is
// broadcasting. A running station costs a full container whether or not it has
// an audience, so this is what keeps unattended AutoDJ rotations from holding
// capacity indefinitely. Owners restart with one click.
Schedule::command('stations:reap-idle')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// Day-7 inactive-broadcaster nudge — runs once a day at 16:00 UTC (a typical
// open-rate sweet spot) to email users who signed up a week ago and haven't
// gone live yet. The command itself is idempotent (skips users already
// nudged via the notifications table).
Schedule::command('app:nudge-inactive-broadcasters')
    ->dailyAt('16:00')
    ->withoutOverlapping();
