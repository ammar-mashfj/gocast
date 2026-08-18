<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Per-station Liquidsoap host paths
    |--------------------------------------------------------------------------
    |
    | Liquidsoap runs as Docker containers spawned by LiquidsoapSupervisor —
    | one per station. These directories on the HOST are bind-mounted into
    | each container; they must exist before a station starts up. Created
    | by infra/setup-host.sh.
    |
    | Inside the container the mounts always resolve as:
    |   /station.liq         (file, read-only)
    |   /data/playlists/     (dir, read-only)
    |   /data/hls/           (dir, read-write)
    |
    | The path values here are HOST paths used as the source of those
    | bind mounts. The api container needs `/var/gocast` mounted in for
    | Laravel to write the .liq files; see docker-compose.yml.
    */

    'liq_dir' => env('LIQUIDSOAP_LIQ_DIR', '/var/gocast/liq'),
    'playlists_dir' => env('LIQUIDSOAP_PLAYLISTS_DIR', '/var/gocast/playlists'),
    'hls_dir' => env('LIQUIDSOAP_HLS_DIR', '/var/gocast/hls'),

    /*
    | Platform-owned audio, shared by every station and mounted read-only at
    | /data/system. Currently just the free-tier watermark clip. Unlike the
    | three above this is NOT per-station — one directory, one copy on disk.
    */
    'system_dir' => env('LIQUIDSOAP_SYSTEM_DIR', '/var/gocast/system'),

    /*
    |--------------------------------------------------------------------------
    | Addresses as seen FROM INSIDE a station container
    |--------------------------------------------------------------------------
    |
    | These are rendered into every station's .liq file. The critical thing to
    | understand is whose point of view they describe: a Liquidsoap container
    | attached to `gocast-network`, NOT the machine Laravel runs on.
    |
    | The defaults are the all-Docker values, where Icecast and the API are
    | compose services reachable by service name over the Docker network. They
    | are the right values in production and must stay that way — a station
    | container renders identically whether Laravel is containerised or not,
    | so a wrong default here breaks prod silently.
    |
    | Override them when Laravel/Icecast run natively on the host instead of
    | in compose. From inside a container the host is `host.docker.internal`
    | (LiquidsoapSupervisor passes --add-host host-gateway on every station),
    | and the port becomes the PUBLISHED host port rather than the internal
    | container port:
    |
    |   LIQUIDSOAP_ICECAST_HOST=host.docker.internal
    |   LIQUIDSOAP_ICECAST_PORT=8888
    |   LIQUIDSOAP_API_URL=http://host.docker.internal:8000
    |
    | RTSP is the exception that needs no override: MediaMTX runs with
    | network_mode: host in both setups, so it is always on the host gateway.
    */

    'icecast_host' => env('LIQUIDSOAP_ICECAST_HOST', 'icecast'),
    'icecast_port' => (int) env('LIQUIDSOAP_ICECAST_PORT', 8000),

    /*
    | Base URL a station container uses to call Laravel back (now-playing
    | metadata pushes). No trailing slash — the .liq appends the path.
    */
    'api_url' => env('LIQUIDSOAP_API_URL', 'http://api'),

    /*
    |--------------------------------------------------------------------------
    | Broadcaster ingest (input.harbor)
    |--------------------------------------------------------------------------
    |
    | Port inside each station container where broadcasters connect. Harbor
    | speaks two protocols on it: the webcast WebSocket protocol (the studio)
    | and the traditional Icecast source protocol (BUTT, Mixxx, and friends).
    |
    | This is per-container, so every station uses the same number — they are
    | on separate network namespaces and never collide. Nothing publishes it to
    | the host; the browser reaches it through the URL below.
    */
    'harbor_input_port' => (int) env('LIQUIDSOAP_HARBOR_INPUT_PORT', 8090),

    /*
    | Public WebSocket base the studio connects to, with `{slug}` substituted.
    |
    | In production this is a path on the main domain, reverse-proxied to the
    | right station container — one TLS endpoint, no per-station DNS. Leave it
    | unset in local hybrid dev and Laravel falls back to addressing the
    | container directly on the Docker bridge, which works on Linux without
    | publishing any ports.
    */
    'ingest_url' => env('LIQUIDSOAP_INGEST_URL'),

    /*
    |--------------------------------------------------------------------------
    | How Laravel reaches a station container's telnet control port
    |--------------------------------------------------------------------------
    |
    | LiquidsoapSupervisor::telnet() sends skip-track / playlist-reload
    | commands to a running station. How it addresses that container depends
    | on where Laravel itself runs:
    |
    |   'name' — connect to the container name (gocast-liquidsoap-<slug>) and
    |            let Docker's embedded DNS resolve it. Requires Laravel to be
    |            ON gocast-network, i.e. running as a compose service. This is
    |            the production path and the default.
    |
    |   'ip'   — ask the daemon for the container's IP with `docker inspect`
    |            and connect to that directly. Needed when Laravel runs
    |            natively on the host, where Docker's DNS does not exist. Works
    |            on Linux because the host routes to container bridge IPs.
    |            Costs one extra docker call per telnet command.
    */

    'telnet_resolve' => env('LIQUIDSOAP_TELNET_RESOLVE', 'name'),

    /*
    |--------------------------------------------------------------------------
    | Harbor HTTP control surface
    |--------------------------------------------------------------------------
    |
    | Each station container runs Liquidsoap's built-in harbor HTTP server and
    | serves /status and /healthz on this port. That makes the container the
    | source of truth for what is on air right now — what is playing, how far
    | into it, which source won the fallback — instead of Laravel inferring it
    | from webhooks that can desync.
    |
    | The port is bound inside the container only; it is reachable over
    | gocast-network exactly like the telnet port, and is resolved with the
    | same 'name' vs 'ip' rule as `telnet_resolve` above. Handlers additionally
    | require the X-Internal-Key header, so a foothold on the docker network
    | still cannot read station state.
    |
    | `status_ttl_seconds` is how long a pulled status is cached in Redis. Keep
    | it short — this is a live progress read — but non-zero so a busy discover
    | page doesn't hit every container once per station per request.
    */

    'harbor_port' => (int) env('LIQUIDSOAP_HARBOR_PORT', 8080),
    'harbor_timeout' => (float) env('LIQUIDSOAP_HARBOR_TIMEOUT', 1.5),
    'status_ttl_seconds' => (int) env('LIQUIDSOAP_STATUS_TTL', 2),

    /*
    |--------------------------------------------------------------------------
    | Dead-air handling on the live input
    |--------------------------------------------------------------------------
    |
    | A broadcaster who mutes their mic, sleeps their laptop, or loses their
    | audio device keeps the RTSP session open — so without this the `live`
    | source stays "available" and listeners get silence indefinitely while
    | AutoDJ sits idle behind it.
    |
    | blank.strip marks the live source unavailable after `blank_max_seconds`
    | below `blank_threshold_db`, which lets the fallback demote to AutoDJ on
    | its own. Set blank_max_seconds to 0 to disable the behaviour entirely.
    |
    | 15s is deliberately generous: a dramatic pause or a quiet intro must not
    | knock a real broadcaster off air.
    */

    'blank_max_seconds' => (float) env('LIQUIDSOAP_BLANK_MAX_SECONDS', 15),
    'blank_threshold_db' => (float) env('LIQUIDSOAP_BLANK_THRESHOLD_DB', -40),

    /*
    |--------------------------------------------------------------------------
    | AutoDJ crossfade
    |--------------------------------------------------------------------------
    |
    | Applies ONLY to transitions between AutoDJ tracks. A live broadcast is
    | one continuous track with no boundaries, so fading it is always wrong —
    | doing so once produced hundreds of stacked 2s gain ramps
    | ("clock.cross: possible source leak") heard as the volume sliding down
    | and snapping back up.
    |
    | `crossfade_enabled` is a kill switch, on purpose. Transitions have wedged
    | AutoDJ playback in the past (two requests of the same file stuck on air,
    | elapsed() running past 1200s on a 184s track, listeners hearing the
    | track summed with a time-shifted copy of itself). The mechanism is not
    | fully understood, so being able to fall back to hard cuts by flipping an
    | env var — with no code change and no redeploy — is worth the config knob.
    | Set LIQUIDSOAP_CROSSFADE_ENABLED=false to cut instead of fade.
    |
    | The smart-transition thresholds mirror AzuraCast's `cross.smart`, which
    | is the reference implementation for this: rather than always overlapping,
    | it compares the loudness of the outgoing and incoming track and only
    | fades when the result will not turn to mush. Two loud tracks are hard
    | cut instead of summed, which is what keeps a master limited to 0.0 dBFS
    | from clipping the encoder during the overlap.
    |
    |   high   — above this (dB) a track counts as loud
    |   medium — below this (dB) a track counts as quiet
    |   margin — dB difference beyond which two tracks are "far apart"
    */

    // Still defaults to FALSE, but the reason is now historical rather than
    // structural — read this before deciding.
    //
    // On Liquidsoap 2.4.0 cross() never survived a transition on this graph.
    // Three formulations were tried — the crossfade() wrapper, a hand-written
    // cross() transition, and the cross.smart port with duration annotated —
    // and each wedged AutoDJ, the last on its very first track boundary. Output
    // degenerated to a single buffered frame looping forever: a static harmonic
    // spectrum, unchanging for 20s, heard as a stuck-PC buzz. elapsed() climbed
    // past the track length, remaining() froze, decoder End_of_file stopped
    // firing, and nothing at all was logged.
    //
    // That was an upstream bug, not our config: savonet#4851 attached the
    // crossfade's `transition` and `pre_buffer` sources to the passive child
    // clock instead of the top-level one, so nothing animated them. Fixed in
    // Liquidsoap 2.4.3; the image is now pinned to 2.4.5, which additionally
    // fixes savonet#5194 (cross/crossfade crash when source.skip is called
    // from a harbor.http handler — this graph serves /status over harbor.http).
    //
    // So this is expected to work now. It stays off by default only because it
    // has not yet been observed working here. To adopt it: confirm the station
    // is healthy on 2.4.5 with this false, then set it true and relaunch, and
    // watch for End_of_file every track length and elapsed+remaining summing to
    // the track duration. Prefer a playlist with more than one track.
    'crossfade_enabled' => (bool) env('LIQUIDSOAP_CROSSFADE_ENABLED', false),
    // Two DIFFERENT things, which must not share a value:
    //
    //   crossfade_duration — the cross window. How much audio is buffered from
    //                        the end of the old track and the start of the new.
    //   crossfade_fade     — the length of the fade-in/fade-out envelopes drawn
    //                        inside that window.
    //
    // The Liquidsoap book (§6.4) is explicit: "The total duration should always
    // be strictly longer than the one of the fades, otherwise the fades will not
    // be complete and you will hear abrupt changes in the volume." Its worked
    // example of the broken case is fades of 3s inside a 2s duration.
    //
    // These were previously one value used for both, i.e. permanently in the
    // degenerate case. Defaults here are the book's own: 5s window, 3s fades.
    // LiquidsoapSupervisor clamps the fade below the window before rendering,
    // so a bad env pairing cannot produce incomplete transitions.
    'crossfade_duration' => (float) env('LIQUIDSOAP_CROSSFADE_DURATION', 5),
    'crossfade_fade' => (float) env('LIQUIDSOAP_CROSSFADE_FADE', 3),
    'crossfade_high_db' => (float) env('LIQUIDSOAP_CROSSFADE_HIGH_DB', -15),
    'crossfade_medium_db' => (float) env('LIQUIDSOAP_CROSSFADE_MEDIUM_DB', -32),
    'crossfade_margin_db' => (float) env('LIQUIDSOAP_CROSSFADE_MARGIN_DB', 4),

    /*
    |--------------------------------------------------------------------------
    | Free-tier watermark
    |--------------------------------------------------------------------------
    |
    | A short platform-owned clip ("powered by GoCast") mixed OVER the station
    | at intervals, ducking whatever is playing rather than replacing it. Which
    | stations get it is a plan question (`plans.watermark_enabled`); how it
    | sounds is an install question, which is what lives here.
    |
    | Read this before tuning: free plans have no AutoDJ, so a free station is
    | live-only and this rides over a HUMAN TALKING, not over music. That makes
    | it noticeably more intrusive than the same numbers would be on a music
    | bed — two voices at once is worse than one, which is why the duck is deep
    | and the interval is measured in minutes.
    |
    | The audio itself is any file dropped in `system_dir`. That is a directory
    | rather than a fixed filename on purpose: Liquidsoap plays whatever is in
    | it (several variants rotate at random), and an EMPTY directory simply
    | makes the source fallible — no watermark, station unaffected. A missing
    | clip must never be able to take stations off air.
    |
    |   enabled  — global kill switch, independent of any plan. Turn the whole
    |              feature off across the fleet without touching plan rows.
    |   interval — seconds between watermarks. 600 = 6/hour; measured against a
    |              typical show length before choosing it. Do not go below a
    |              couple of minutes: over live speech it stops reading as
    |              branding and starts reading as a fault.
    |   duck     — the PORTION of the station's own audio kept while the
    |              watermark plays (Liquidsoap's `p`), not the amount removed.
    |              0.15 means the host drops to 15%, about -16dB. Liquidsoap's
    |              own default of 0.2 is tuned for music; speech wants deeper.
    |   fade     — seconds to ramp down and back. Long enough not to sound like
    |              a dropout, short enough not to swallow the clip's first word.
    */

    'watermark_enabled' => (bool) env('LIQUIDSOAP_WATERMARK_ENABLED', true),
    'watermark_interval_seconds' => (float) env('LIQUIDSOAP_WATERMARK_INTERVAL', 600),
    'watermark_duck' => (float) env('LIQUIDSOAP_WATERMARK_DUCK', 0.15),
    'watermark_fade_seconds' => (float) env('LIQUIDSOAP_WATERMARK_FADE', 1.0),

    /*
    | Largest clip the admin panel will accept into `system_dir`. These are
    | seconds-long platform IDs, not music, and the directory is mounted into
    | every container on the box — so the cap is small on purpose.
    */
    'watermark_clip_max_bytes' => (int) env('LIQUIDSOAP_WATERMARK_CLIP_MAX_BYTES', 5 * 1024 * 1024),

    /*
    |--------------------------------------------------------------------------
    | AutoDJ rotation source
    |--------------------------------------------------------------------------
    |
    | How a station's Liquidsoap gets its next rotation track.
    |
    |   true  (dynamic) — `request.dynamic` asks Laravel for one track at a
    |                     time over /api/internal/next-track. This is what
    |                     AzuraCast and LibreTime do, and it is the only way
    |                     the ordering can be OURS: rotation rules, dayparting
    |                     and ad breaks are all "which track is next", which is
    |                     a question a playlist file cannot be asked.
    |   false (playlist) — the legacy `playlist()` source reading playlist.m3u.
    |
    | Why the switch exists at all: measured on 2.4.5, `playlist.reload` — which
    | the file mode must send after every track change — restarts the list at
    | index 0. A listener hears the rotation jump back to song one because
    | somebody uploaded a track. Dynamic mode has no list to reset.
    |
    | Kept switchable for the same reason crossfade is: this is the audio path,
    | and a rollback should be an env var and a relaunch rather than a deploy.
    | The m3u is still written in both modes, so flipping back needs nothing else.
    */
    'autodj_dynamic' => (bool) env('LIQUIDSOAP_AUTODJ_DYNAMIC', true),

    /*
    | Seconds before Liquidsoap re-asks after the API answers "nothing to
    | play" (an empty rotation) or fails. Liquidsoap's own default is 0.1s,
    | which would mean ten requests a second, forever, for every station with
    | an empty library — a busy box's worth of traffic to be told nothing.
    */
    'autodj_retry_delay_seconds' => (float) env('LIQUIDSOAP_AUTODJ_RETRY_DELAY', 10.0),

    /*
    |--------------------------------------------------------------------------
    | Idle auto-stop
    |--------------------------------------------------------------------------
    |
    | Fallback window for `stations:reap-idle` when a plan does not set its
    | own `idle_stop_hours`. Hours a station may stay on air with no listeners
    | and no broadcaster before it is taken off air; 0 disables the reaper.
    */

    'idle_stop_hours' => (int) env('LIQUIDSOAP_IDLE_STOP_HOURS', 6),

    /*
    | Per-station AutoDJ storage cap. Total bytes of all tracks combined.
    | Uploads that would push the station over this cap are rejected.
    */
    'station_storage_bytes' => (int) env('LIQUIDSOAP_STATION_STORAGE_BYTES', 100 * 1024 * 1024),

    /*
    |--------------------------------------------------------------------------
    | Per-station container resource caps
    |--------------------------------------------------------------------------
    |
    | Passed to `docker run` as `--cpus` and `--memory` for every per-station
    | Liquidsoap container. Liquidsoap idling on a single ~128kbps Icecast
    | output uses well under 0.25 CPU and ~50MB RSS in practice; the caps
    | below are sized to absorb a transcoding spike (FFmpeg re-encode of an
    | incoming RTSP stream, HLS segment muxing) without permitting a runaway
    | station to starve its neighbors on the same host.
    |
    | Tune via env: numbers can be fractional ("0.5") for cpus, and accept
    | a "b/k/m/g" suffix for memory. Set either to an empty string to
    | disable the corresponding cap (not recommended in prod).
    |
    | The memory default was 256m until 2026-08-14, which was below what the
    | container needs to BOOT: Liquidsoap 2.4.0 spikes past 384m while
    | initialising the ffmpeg RTSP input and the HLS encoder, so the kernel
    | SIGKILLed it (exit 137) before it wrote its first log line — presenting
    | as a station that silently never starts, with a completely empty
    | `docker logs`, restart-looping every few seconds.
    |
    | Measured: killed at 320m and 384m, boots at 448m, steady state ~85MB.
    | 512m leaves headroom over the boot spike. Do not lower this below 448m
    | without re-measuring; the failure mode is silent.
    */
    'container_cpus' => env('LIQUIDSOAP_CONTAINER_CPUS', '0.5'),
    'container_memory' => env('LIQUIDSOAP_CONTAINER_MEMORY', '512m'),

    /*
    |--------------------------------------------------------------------------
    | Station image
    |--------------------------------------------------------------------------
    |
    | The image every station container runs. Config rather than a constant so
    | a bad Liquidsoap upgrade is rolled back with an env change plus
    | `stations:relaunch`, instead of a deploy.
    |
    | Prefer an explicit version tag over `:latest` in production — the tag is
    | resolved once per `docker run`, so `:latest` means two stations started
    | either side of a rebuild can be running different Liquidsoap versions.
    */

    'image' => env('LIQUIDSOAP_IMAGE', 'gocast/liquidsoap:latest'),

    /*
    |--------------------------------------------------------------------------
    | Graceful shutdown
    |--------------------------------------------------------------------------
    |
    | Seconds Docker waits after SIGTERM before it SIGKILLs a station. Measured
    | on the shipped image, Liquidsoap drains and exits in ~0.5s, so this is
    | generous — but it must stay comfortably under the 10s Process timeout on
    | every docker call, or Laravel kills the CLI mid-shutdown.
    |
    | Shutting down cleanly is what writes the HLS `persist_at` state (so a
    | restart resumes the segment sequence instead of resetting it) and closes
    | the Icecast source socket (so the mount disappears at once rather than
    | lingering until Icecast times it out).
    */

    'stop_timeout_seconds' => (int) env('LIQUIDSOAP_STOP_TIMEOUT', 5),

    /*
    |--------------------------------------------------------------------------
    | Start verification
    |--------------------------------------------------------------------------
    |
    | `docker run -d` returns when the container is CREATED, not when the
    | process survives: a station whose script is broken, or which is OOM-killed
    | while building its audio graph, reports a successful start and then sits
    | in `starting` forever.
    |
    | After starting a container we wait this long and ask Docker what actually
    | happened. Long enough to catch an immediate death (a bad .liq dies in
    | ~200ms), short enough not to matter on a start that already returns 202.
    | Set to 0 to skip verification.
    */

    'start_verify_delay_ms' => (int) env('LIQUIDSOAP_START_VERIFY_DELAY_MS', 750),

    /*
    |--------------------------------------------------------------------------
    | Container healthcheck
    |--------------------------------------------------------------------------
    |
    | Each station serves /healthz on its harbor port; without a healthcheck
    | nothing consumes it, and `docker ps --filter status=running` reports a
    | crash-looping container as running for as long as Docker's restart backoff
    | stays short (measured: 5 out of 5 samples over the first 10s of a crash
    | loop). Letting Docker poll /healthz gives `isRunning()` an honest answer
    | and hands the reconciler `--filter health=unhealthy` for free.
    |
    | The probe is written against bash's /dev/tcp because the image has no
    | curl, wget or nc.
    |
    | `start_period` is the grace window before failures count — it must cover
    | a cold boot (audio graph + Icecast connect), or a healthy station is
    | marked unhealthy while it is still coming up.
    |
    | Docker does NOT restart unhealthy containers outside Swarm. This is a
    | signal `stations:reconcile` acts on, not self-healing.
    */

    'health_enabled' => (bool) env('LIQUIDSOAP_HEALTHCHECK', true),
    'health_interval_seconds' => (int) env('LIQUIDSOAP_HEALTH_INTERVAL', 15),
    'health_timeout_seconds' => (int) env('LIQUIDSOAP_HEALTH_TIMEOUT', 3),
    'health_retries' => (int) env('LIQUIDSOAP_HEALTH_RETRIES', 3),
    'health_start_period_seconds' => (int) env('LIQUIDSOAP_HEALTH_START_PERIOD', 45),

    /*
    | How many consecutive reconciler passes a station may be unhealthy before
    | the container is recreated, and how many recreates are allowed within an
    | hour before we stop trying and leave it for a human. Without the cap, a
    | station whose script is genuinely broken is recreated every minute
    | forever.
    |
    | These are counted in PASSES, so their meaning depends on how often
    | stations:reconcile is scheduled (currently every minute). Two passes is
    | two minutes of a container continuously reporting restarting/exited/dead
    | or a failing healthcheck — a booting station never qualifies, because the
    | healthcheck's start period reports `starting` rather than `unhealthy`.
    */

    'unhealthy_passes_before_recreate' => (int) env('LIQUIDSOAP_UNHEALTHY_PASSES', 2),
    'unhealthy_recreates_per_hour' => (int) env('LIQUIDSOAP_UNHEALTHY_RECREATES_PER_HOUR', 3),

    /*
    | Consecutive passes an open StreamSession may disagree with its container
    | before the reconciler closes it as stranded.
    |
    | Far more patient than the unhealthy threshold on purpose: the signal is
    | `source != live`, which a broadcaster triggers merely by falling silent
    | for longer than the dead-air guard. Closing a live broadcaster's session
    | cannot be undone by anything the container will send afterwards, so this
    | errs towards leaving a genuinely stranded session open for a few extra
    | minutes rather than cutting a real show short.
    */

    'stranded_session_strikes' => (int) env('LIQUIDSOAP_STRANDED_SESSION_STRIKES', 10),

    /*
    |--------------------------------------------------------------------------
    | Container sandboxing
    |--------------------------------------------------------------------------
    |
    | Liquidsoap needs no capabilities beyond reading its mounts and opening
    | sockets, so every capability is dropped. `no-new-privileges` blocks setuid
    | escalation, and the pid cap bounds a fork storm.
    |
    | `--init` (a real PID 1 that reaps zombies) is off by default: the image
    | handles SIGTERM correctly on its own — verified — and nothing in the
    | current audio graph forks. Turn it on if per-track protocol resolvers
    | (autocue, replaygain) are introduced, since those fork ffmpeg per request.
    */

    'container_pids_limit' => (int) env('LIQUIDSOAP_CONTAINER_PIDS_LIMIT', 256),
    'container_init' => (bool) env('LIQUIDSOAP_CONTAINER_INIT', false),
];
