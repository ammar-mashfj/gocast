<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Run every 5 minutes to detect relay outages and mark orphaned live stations as offline.
Schedule::command('app:clean-stale-streams')->everyFiveMinutes();
