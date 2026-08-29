<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Listener counts come from Icecast's admin API — nothing pushes them to us.
// Every minute is a good balance: the dashboard number feels live without
// hammering Icecast. withoutOverlapping so a slow/hung poll can't stack up.
Schedule::command('stations:sync-listeners')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

// Container convergence: removes containers for stations that are stopped,
// soft-deleted or gone, and restarts containers for stations that should be
// on air but aren't. This is the safety net behind the power button (a start
// that failed on a busy daemon is retried here) and behind
// `--restart unless-stopped`, which would otherwise resurrect stopped stations
// after a host reboot. Cost is one `docker ps` plus one query when there is no
// drift, which is why it can afford to run this often: a station whose
// container vanished is off air the whole time nobody has noticed, and five
// minutes of that is five minutes of dead air.
//
// Note for anyone changing this interval: the command debounces its two
// destructive actions by counting CONSECUTIVE PASSES, so the interval is what
// converts those counts into wall-clock patience. Both thresholds are config,
// and both were rescaled when this moved from five minutes to one.
Schedule::command('stations:reconcile')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

// Auto-stop — the single decision tree for taking a station off air. Replaces
// `stations:reap-idle` and `stations:reap-silent`, which split the same
// question across two schedules reasoning from different proxies, and so could
// disagree about one station in one minute. See SweepStations for what each of
// them got wrong at the seam.
//
// A station is stopped only when it is producing no audio AND has nothing
// attached that could produce any. Listener count decides nothing: an AutoDJ
// rotation playing to an empty room is a paid feature working correctly.
//
// Every minute, and the interval is load-bearing — it is what turns the
// `silent_stop_seconds` window into wall-clock patience. A station needs one
// pass to start its clock and another to be stopped by it, so the effective
// time from "nothing to play" to "off air" is one to two windows.
Schedule::command('stations:sweep')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

// Day-7 inactive-broadcaster nudge — runs once a day at 16:00 UTC (a typical
// open-rate sweet spot) to email users who signed up a week ago and haven't
// gone live yet. The command itself is idempotent (skips users already
// nudged via the notifications table).
Schedule::command('app:nudge-inactive-broadcasters')
    ->dailyAt('16:00')
    ->withoutOverlapping();
