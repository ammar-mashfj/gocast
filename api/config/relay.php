<?php

/*
|--------------------------------------------------------------------------
| Free-plan relay
|--------------------------------------------------------------------------
|
| A station whose plan has neither AutoDJ nor an external encoder (today:
| Free) can go live without a Liquidsoap container: the studio's MP3 goes
| browser → relay (Go, relay/ at the repo root) → Icecast, untouched. Icecast
| asks Laravel whether each login may publish (IcecastCallbackController::auth)
| and reports connects/disconnects, which open and close the StreamSession.
| See docs/RELAY-SERVICE-PLAN.md.
|
| The path is decided when a station starts (Station::resolveIngestPath) and
| kept until it stops, so changing anything here only affects the NEXT start.
| Turning `enabled` off is the rollback: the next start uses a container, and
| shows already on the relay finish where they are.
|
*/

return [

    'enabled' => (bool) env('RELAY_ENABLED', false),

    /*
     | `all`, or a comma-separated list of station slugs to roll out to first.
     */
    'rollout' => env('RELAY_ROLLOUT', 'all'),

    /*
     | The studio's WebSocket URL on the relay path, e.g.
     | wss://relay.gocast.fm/relay. Unlike the container ingest URL it is one
     | address for every station: the slug travels in the webcast hello.
     */
    'ingest_url' => env('RELAY_INGEST_URL'),

    /*
     | The mount the relay publishes to is this prefix plus the slug. It must
     | match the relay's own -mount-prefix flag.
     */
    'mount_prefix' => '/stream/',

    /*
     | Icecast's callbacks (url role, event bindings) can only send HTTP Basic
     | auth, not the X-Internal-Key the containers use, so they get a credential
     | of their own. The same pair is rendered into icecast.xml.
     */
    'callback_user' => env('ICECAST_CALLBACK_USER', 'icecast'),
    'callback_password' => env('ICECAST_CALLBACK_PASSWORD'),

];
