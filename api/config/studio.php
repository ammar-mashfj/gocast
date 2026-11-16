<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Idle check on live shows without AutoDJ
    |--------------------------------------------------------------------------
    |
    | A plan without AutoDJ (Free) can only stay on air while a browser studio
    | is broadcasting, so a studio left running is a free AutoDJ. The studio
    | (client/components/studio/IdleShowGuard.tsx) asks "Still at the desk?"
    | after `idle_seconds` with nobody touching the dashboard, and ends the
    | show `warn_seconds` later if nobody answers.
    |
    | Sent to the dashboard with the plan (UserResource, `plan.idle_check`),
    | so changing these is an .env edit and a config cache refresh, no
    | frontend rebuild. Set STUDIO_IDLE_SECONDS=0 to switch the check off.
    | Plans with AutoDJ are never checked, whatever these say.
    |
    | The minutes are also written out in the help article
    | client/app/(marketing)/help/_content/my-station-went-off-air.tsx; change
    | it with them.
    |
    */

    'idle_check' => [
        'idle_seconds' => (int) env('STUDIO_IDLE_SECONDS', 3600),
        'warn_seconds' => (int) env('STUDIO_IDLE_WARN_SECONDS', 600),
    ],

];
