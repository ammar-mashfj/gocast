---
feature: Liquidsoap supervisor (station container management)
verified: 2026-10-05 against c970b2d plus uncommitted work
sources:
  - api/app/Services/LiquidsoapSupervisor.php
  - api/config/liquidsoap.php
  - api/app/Services/PlaylistFileWriter.php
  - api/app/Observers/StationObserver.php
  - api/app/Console/Commands/ReconcileStations.php
  - api/app/Console/Commands/RelaunchStations.php
  - api/app/Console/Commands/PruneDeletedStations.php
  - api/app/Jobs/StopStation.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Observers/UserObserver.php
  - api/app/Jobs/ReloadWatermarkClips.php
  - api/app/Http/Controllers/MetricsController.php
  - api/routes/console.php
  - api/tests/TestCase.php
  - api/tests/Feature/LiquidsoapSupervisorTest.php
  - api/tests/Feature/ReconcileStationsTest.php
  - api/tests/Feature/StationObserverTest.php
  - api/tests/Feature/PruneDeletedStationsTest.php
  - api/tests/Feature/PlaylistFileWriterTest.php
  - api/tests/Feature/StationContainerIpTest.php
  - api/tests/Feature/MetricsControllerTest.php
  - api/tests/Feature/ReloadWatermarkClipsTest.php
  - api/tests/Feature/StationSweepTest.php
  - api/app/Http/Controllers/BroadcastTokenController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/Admin/WatermarkClipController.php
  - api/app/Services/StationStatusService.php
  - api/app/Models/Station.php
  - infra/native/docker-compose.native.yml
  - infra/native/deploy-native.sh
  - api/database/migrations/2026_08_29_090000_add_container_index_to_stations_table.php
fingerprint: a4df6457f61f7483
---

# Liquidsoap supervisor

`App\Services\LiquidsoapSupervisor` is the only code that talks to Docker. Every station gets one container running the `gocast/liquidsoap` image, named `gocast-liquidsoap-{slug}`, started with `docker run` through the `docker` CLI (not the Docker SDK, not systemd). The supervisor also renders the station's `.liq` script, gives the container a fixed IP, and reaches into it over telnet and harbor HTTP. What the script itself does is in [Liquidsoap station script](liquidsoap-station-script.md); the on/off product rules are in [Station lifecycle](station-lifecycle.md).

The one thing people get wrong: **there is no "docker mode" versus "native mode" switch in this class.** It always shells out to `docker` and always renders a file under `liq_dir`. The deployment shapes (containerised Laravel, hybrid dev, native VPS) differ only in env values: `DOCKER_HOST`, the `LIQUIDSOAP_*_DIR` paths, `LIQUIDSOAP_ICECAST_HOST`, `LIQUIDSOAP_API_URL`, `LIQUIDSOAP_TELNET_RESOLVE`. Get those wrong and stations "start" but never report status. See [Deployment infra](deployment-infra.md) and [Dev environment](dev-environment-and-testing.md).

The second thing: the supervisor knows nothing about intent. `stations.desired_state` is owned by `StationLifecycleService` (power button, studio implicit start, sweep stop). The supervisor just makes the daemon do things. `stations:reconcile` closes the gap between the two.

## Who calls what

| Caller | Supervisor call | When |
|---|---|---|
| `StationLifecycleService::start()` | `isRunning()`, `up()` | Power button, studio start-before-broadcast. Skips `up()` when intent is running and the container is `running`. |
| `StationLifecycleService::stop()` | `down()` | Power button, `StopStation` job (reason `silent`). Runs after `desired_state=stopped` is saved and open `StreamSession`s are closed; if `down()` throws, the exception skips the `stopped` event and broadcast (intent is already stopped, so reconcile removes the leftover). |
| `StationObserver` | `up()`, `downBySlug()`, `down()`, `destroyArtifacts()` | Station row updated / renamed / deleted / restored / force-deleted. |
| `UserObserver::updated` (`plan_id` changed) | `applyWatermarkSettings()` | Pushed over telnet to each of the owner's stations with `desired_state=running` (not stopped ones); a throw is logged at error and the loop continues. |
| `UserObserver::deleting` | none directly | Soft-deleting a user soft-deletes each of their stations; force-deleting a user force-deletes every station including trashed ones. Both then fire `StationObserver` (`down()`, and for force `destroyArtifacts()`). |
| `ReconcileStations` | `listContainerStates()`, `removeContainer()`, `up()`, `slugFromContainerName()` | Every minute (`routes/console.php`, `withoutOverlapping`, background). |
| `RelaunchStations` | `up()` | Manual only. Not scheduled. |
| `ReloadWatermarkClips` job | `telnet()` | Every `running()` station, `watermark.reload`; skipped when `liquidsoap.watermark_enabled` is false; per-station failures logged at info. Dispatched by `Admin\WatermarkClipController` (two call sites). |
| `StationStatusService` | `containerHost()`, `containerName()`, `containerState()` | Every status poll: `containerState()` inspect first (a Docker error counts as "up"), then harbor `/status` over HTTP, then a second inspect if harbor fails. |
| `BroadcastTokenController` | `ingestUrl()` | Handing the studio its WebSocket URL. |
| `MetricsController` | `listContainerStates()` | Prometheus gauges `gocast_supervisor_containers_{expected,running,total,unhealthy}`. `running`/`total`/`unhealthy` are `-1` when the daemon is unreachable (`expected` is still the DB count of `running()` stations). All three count every managed container, including orphans and unwanted ones; `unhealthy` is any container whose status is not `running` OR whose health is `unhealthy`. |

## How a container is created

`up(Station)` is the only creation path. In order:

1. Returns immediately in test mode (see below).
2. `renderLiqFile()`: renders `resources/views/liquidsoap/station.blade.php` and writes `{liq_dir}/{slug}.liq` with `File::put` (not atomic, no temp file). `File::ensureDirectoryExists(liq_dir)` first.
3. `ensureDirectories()`: creates `{playlists_dir}/{slug}`, `{hls_dir}/{slug}` and the shared `system_dir`, then `chmod 0777` on the two per-station dirs (the API may run as root and create them root:root 0755; Liquidsoap is UID 100 inside the container and must write HLS).
4. If `isRunning()` (Docker `.State.Status == running`): calls `restart()` and returns. `restart()` is `down()` then `run()`. Note `restart()` does not re-render; `up()` already did.
5. Otherwise, if any container of that name exists in any state (`docker ps -a --filter name=`), `docker rm -f` it (a SIGKILL, not the graceful path), then `run()`.
6. `run()` concatenates flag groups and calls `docker run -d ...`, then `verifyStarted()`.

So `up()` is deliberately blunt: on an already-running container it stops and recreates it, which drops every listener and any live broadcaster. Callers that only want "be on air" must go through `StationLifecycleService::start()`, which skips `up()` when the container is already running. `ReconcileStations` (missing and recreate branches), `RelaunchStations` and `StationObserver` call `up()` directly.

### Flags on every `docker run`

From `baseRunCommand()`, `sandboxFlags()`, `healthFlags()`, `resourceFlags()`, `mountFlags()`:

| Flag | Value | Source |
|---|---|---|
| `--name` | `gocast-liquidsoap-{slug}` | `CONTAINER_PREFIX` |
| `--network` | `gocast-network` (`NETWORK` constant, not configurable) | supervisor |
| `--ip` | `containerIp()`, see Addressing | derived from `stations.container_index` |
| `--restart` | `unless-stopped` | supervisor |
| `--add-host` | `host.docker.internal:host-gateway` | supervisor |
| `--stop-signal` / `--stop-timeout` | `SIGTERM` / `stopTimeout()` | see below |
| `--label` | `gocast.station={slug}`, `gocast.station_id={id}` | supervisor |
| `--log-opt` | `max-size=10m`, `max-file=3` | supervisor |
| `--cap-drop ALL`, `--security-opt no-new-privileges` | always | supervisor |
| `--pids-limit` | `LIQUIDSOAP_CONTAINER_PIDS_LIMIT`, default 256; omitted if 0 | config `container_pids_limit` |
| `--init` | only if `LIQUIDSOAP_CONTAINER_INIT` true (default false) | config `container_init` |
| `--health-cmd` etc. | see Health | config `health_*`; all omitted if `LIQUIDSOAP_HEALTHCHECK=false` |
| `--cpus` | `LIQUIDSOAP_CONTAINER_CPUS`, default `0.5`; omitted if empty | config `container_cpus` |
| `--memory` and `--memory-swap` | both `LIQUIDSOAP_CONTAINER_MEMORY`, default `512m`; omitted if empty. Swap is pinned to the same value so the cap is real. | config `container_memory` |
| `-v` | `{liq_dir}/{slug}.liq:/station.liq:ro` | mount |
| `-v` | `{playlists_dir}/{slug}:/data/playlists:ro` | mount |
| `-v` | `{hls_dir}/{slug}:/data/hls` (read-write) | mount |
| `-v` | `{system_dir}:/data/system:ro`, shared by all stations, mounted even when the watermark is off | mount |
| image, command | `LIQUIDSOAP_IMAGE` (default `gocast/liquidsoap:latest`), then `/station.liq` | config `image` |

No published ports (`-p`). No `--user`, no `--read-only`. The container is not sandboxed against the network: it can reach anything `gocast-network` and the host gateway can.

The memory default is a landmine, not a preference: the config comment records that 256m SIGKILLed every station at boot with empty logs (exit 137) and that boot needs 448m or more. `verifyStarted()` has a dedicated message for that case (below).

### Start verification

`docker run -d` exits 0 once the container is created, so `verifyStarted()` sleeps `LIQUIDSOAP_START_VERIFY_DELAY_MS` (default 750; 0 skips the check) inline in the request, then reads `containerState()`. If status is not `running` it logs the exit code, OOM flag, restart count and `logTail()` (20 lines), and throws `StationLifecycleException::startFailed()`. With `oom_killed` true the message is "The station ran out of memory while starting."; otherwise the generic `station_start_failed` 503 ("We are retrying — check back in a few minutes.").

Consequences to know:

- The container is left behind (crash-looping under `--restart unless-stopped`). Nothing removes it on the failure path. The reconciler handles it within a couple of minutes as "unhealthy" (see Reconcile).
- In `StationLifecycleService::start()`, `desired_state=running` is already saved when `up()` throws, but the exception exits before `StationEvent::record(started)` and before the `StationStateChanged` broadcast. So the owner sees an error, the DB says running, and the timeline has no start entry.
- A crash that takes longer than 750 ms to happen is not caught here.

### Stopping

`down(Station)` and `downBySlug(string)` both call `removeContainer($name)`. It:

1. Returns if `containerExistsByName()` is false. That runs `docker ps -a --filter name={name}` and compares the trimmed output to the name. Docker's `name` filter is a substring match (checked: `name=gocast` lists `gocast-liquidsoap-test`), so when another container's name contains this one (slugs `jazz` and `jazz-fm`), the output has two lines, the comparison fails and the method reports "absent" (see traps).
2. Runs `docker stop --timeout N`. Failure is logged (`Graceful stop failed, forcing removal`) and ignored.
3. Runs `docker rm -f`. This one is not wrapped; a daemon error propagates.

`N = stopTimeout() = max(1, min(LIQUIDSOAP_STOP_TIMEOUT (default 5), 10 - 3))`. The clamp exists because every `docker` call has a 10 s Laravel process timeout (`DOCKER_TIMEOUT_SECONDS`); a longer stop timeout would kill the CLI mid-shutdown. The graceful stop matters: Liquidsoap writes its HLS `persist_at` state and closes the Icecast socket on SIGTERM; a SIGKILL resets the HLS media sequence and leaves the mount on Icecast until it times out.

`down()` leaves the `.liq`, playlist directory and HLS directory alone. `destroyArtifacts($slug)` deletes `{liq_dir}/{slug}.liq` and `{hls_dir}/{slug}` and is only called from `StationObserver::forceDeleted`. The playlist tree is deleted by the observer itself.

`docker` calls use two timeouts: `docker()` 10 s and throws on non-zero exit; `dockerQuiet()` 3 s (`DOCKER_READ_TIMEOUT_SECONDS`) and returns the result whatever the exit code (used only by `containerState()` and `logTail()`, which sit on the polled status path).

## How a container is found

There is no registry. Identity is the container name plus two labels.

| Method | Returns | Docker command |
|---|---|---|
| `containerName($station)` | `gocast-liquidsoap-{slug}` | none |
| `slugFromContainerName($name)` | slug or null (null if no prefix or empty remainder) | none |
| `containerState($name)` | `{exists, status, health, exit_code, oom_killed, restart_count}` | `docker inspect -f` (3 s). Non-zero exit maps to `exists=false, status='absent'`. |
| `isRunning($station)` | `status === 'running'` | via `containerState`. `restarting` is not running, on purpose: the old `docker ps --filter status=running` reported a crash loop as running 5 samples out of 5. |
| `isHealthy($station)` | running and health in `healthy` or `none` | via `containerState`. **No caller in `app/`.** |
| `exists($station)` | any state | `docker ps -a`, same substring-filter comparison as `removeContainer()` |
| `listContainerStates()` | `name => {status, health}` for every `gocast-liquidsoap-*` container in one `docker ps -a` | health parsed from the `Status` column with a regex on `(healthy)`, `(unhealthy)`, `(health: starting)` |
| `listManagedContainers()` | names only (all states, `-a`) | **Dead.** No caller in `app/`. `ReconcileStations` and `MetricsController` use `listContainerStates()`; two tests still mock `listManagedContainers`, which is stale. |
| `logTail($name, 20)` | stdout + stderr of `docker logs --tail` | only used by `verifyStarted()` |

Health constants: `healthy`, `unhealthy`, `starting`, `none` (no healthcheck configured). Note `listContainerStates()` filters by `name=` substring and then re-filters by prefix, so a container that merely contains the prefix is dropped.

Labels are set but nothing reads them: the reconciler recovers the slug by parsing the container name, not the `gocast.station` label. Renames therefore depend on the observer tearing the old name down (see Rename).

### Addressing: `container_index`, `containerIp`, `containerHost`

Every station has `stations.container_index` (unsigned int, unique, non-null after migration `2026_08_29_090000`, which back-filled existing rows 1..N ordered by `created_at` then `id`). `StationObserver::creating` assigns `max(container_index over withTrashed) + 1` if unset. Indexes are never recycled, including for soft-deleted stations, so a restore returns to its own address. Two simultaneous creates can collide on the unique constraint and one fails; the code accepts that.

`containerIp()` = `long2ip(ip2long(base) + container_index + 2)` where base and prefix come from `LIQUIDSOAP_CONTAINER_SUBNET` (default `172.28.0.0/16`). The `+2` skips the network address and the gateway. Prefix must be 1 to 30. It throws `RuntimeException` (never wraps) if: the subnet is unparseable, `container_index` is null, or the offset exceeds `2^(32-prefix) - 2` (about 65k stations ever created on a /16). Widening the subnet does not move existing stations.

The subnet must equal the one the network is really created with. In the native kit that is a literal in `infra/native/docker-compose.native.yml` (`gocast-network`, subnet `172.28.0.0/16`, `ip_range` `172.28.255.0/24`); `GOCAST_SUBNET` in `domains.env` no longer exists (the `config/liquidsoap.php` comment naming it is stale). The `ip_range` keeps Docker's own IPAM (the router container) in the top /24, away from station addresses counted up from the bottom; a station with `container_index` of about 65,278 or more would land inside that range. The supervisor never creates the network or checks any of this.

`containerHost()` returns the IP when `LIQUIDSOAP_TELNET_RESOLVE` is `ip` (the default, and the only path that works from a host process), and the container name for any other value (works only if Laravel is itself on `gocast-network`). Anything other than exactly `ip` selects the name path, including typos.

`ingestUrl()` returns `LIQUIDSOAP_INGEST_URL` with `{slug}` substituted when set (production), else `ws://{containerHost}:{LIQUIDSOAP_HARBOR_INPUT_PORT (8090)}/{slug}` (local dev on Linux; changes when the IP does).

### Talking to a running container

- `telnet($station, $command)`: plain `fsockopen` to `containerHost:1234` (`TELNET_PORT`, must match `settings.server.telnet.port` in the blade), 3 s connect and read timeout, sends `{command}\nquit\n`, reads to EOF, returns trimmed text. CR/LF in the command are stripped. Throws `RuntimeException` if the connect fails. It deliberately avoids `docker exec` because the socket proxy denies EXEC. It does **not** inspect the reply: a Liquidsoap `ERROR: unknown command` (source or variable not present in an older script) comes back as ordinary text and callers treat it as success.
- Harbor HTTP (`/status`, `/healthz` on `LIQUIDSOAP_HARBOR_PORT`, default 8080) is called by `StationStatusService`, not by the supervisor. The container's own healthcheck probes `/healthz`.
- `applyWatermarkSettings()` sends `watermark_enabled` (owner's plan `watermarked()`, false if user/plan is unresolved), `watermark_interval` (min 60.0), `watermark_duck` (clamped 0.01 to 1.0).
- The only telnet callers left are the watermark push and `ReloadWatermarkClips`: jingles are served by `next-track` like any track, and skip-track is disabled (route, `StationPowerController::skip` and the script's `skip` command are all commented out). The variable names live in `VAR_*` constants and are passed into the blade so both sides agree. The same values are rendered as the script's initial state, so telnet is a fast path; a stopped or unreachable container is correct at next boot.

## What the rendered script depends on

`renderLiqFile()` passes these into the blade (see [station script](liquidsoap-station-script.md) for behaviour). Everything here is baked in at render time and reaches the container only on the next `up()` or `restart`.

- Station: `station` (slug, name, description, genre, mount, artwork), `nextTrackUrl` (`{api_url}/api/internal/next-track?slug={rawurlencode(slug)}`).
- Secrets: `icecastPassword` from `services.icecast.source_password`, `internalApiKey` from `services.internal_api_key`. The `.liq` file on disk therefore contains both, and the harbor-auth call sends the key as `X-Internal-Key`.
- Addresses from the container's point of view: `LIQUIDSOAP_ICECAST_HOST` / `_PORT` (default `host.docker.internal`:8000), `LIQUIDSOAP_API_URL` (default `http://host.docker.internal:8081`, trailing slash trimmed).
- Harbor: `harbor_port`, `harbor_input_port`, `harbor_input_timeout` (10.0 s), `rms_window_seconds` (2), `hls_variant` (`aac`).
- Rotation: `autodjRetryDelay` (min 1.0; default 10), `liqSource = playlist_m3u`, `scriptVersion = AutoDjScheduler::PLANNING_SCRIPT` (2; sent back on every next-track ask as `X-Gocast-Script`, and Laravel only plans jingles and hard starts for a script at 2 or later). Nothing about jingles is rendered.
- Watermark: `watermarkSupported` (install switch), `watermarkEnabled` (owner's plan), interval, duck, fade (default 1.0), container dir `/data/system`.
- Crossfade (default **off**, `LIQUIDSOAP_CROSSFADE_ENABLED`): duration 5, fade 3 (clamped to `min(fade, max(duration - 0.5, 0.1))`), high -15 dB, medium -32 dB, margin 4 dB.
- Limiter: threshold -1.0 dB, `limiter_include_live` true.
- Metadata: `live_broadcast_text` ("Live Broadcast"), `metadata_charset` (UTF-8), `gc_space_overhead` (80; 0 omits the block), `apply_amplify` (true).

### PlaylistFileWriter (the parts that touch the supervisor)

- `prepare($station)`: only ensures `{playlists_dir}/{slug}` (the bind-mounted audio directory) exists. It writes no file: there is no m3u left, for music or jingles. Called before `up()` by `StationLifecycleService::start()`, `ReconcileStations` (missing and recreate) and `RelaunchStations`. The class no longer depends on the supervisor and has no `reload()`.
- `LIQ_SOURCE = 'playlist_m3u'` is a leftover wire name for the `request.dynamic` source.
- `annotateTrack()` / `annotateUri()` build `annotate:` URIs (jingle flag, `liq_cue_in/out`, `liq_amplify` with a `dB` suffix, `liq_fade_out` on a song trimmed for a hard start, `duration` with 3 decimals, title, artist, playlist) with `"` and `\` escaped. Used only by `AutoDjScheduler`, for `NextTrackController`'s answers. Only the leaf of `Track::path` is joined under `/data/playlists`.
- `stationDir()` = `rtrim(playlists_dir) / slug`.

## Test-environment guard

`LiquidsoapSupervisor::inTestMode()` is `app()->runningUnitTests()`. When true, `up`, `down`, `downBySlug`, `removeContainer`, `restart`, `isRunning` (false), `isHealthy` (true), `containerState` (a fake running tuple), `logTail` (''), `listManagedContainers` ([]), `listContainerStates` ([]), `containerExistsByName` (false) and `telnet` ('') return without touching Docker. Consequences:

- `applyWatermarkSettings()` returns true in tests because `telnet()` returns ''.
- **Not guarded:** `destroyArtifacts()` (real filesystem deletes, which is why `StationObserverTest` can assert on it), `renderLiqFile()` is only reached through `up()`, and `containerIp()` / `containerHost()` / `ingestUrl()` are pure and run for real.
- The guard depends on the environment being `testing`. `tests/TestCase.php::createApplication()` forces `APP_ENV=testing` before boot because docker compose's `env_file` leaks `APP_ENV=local`, which otherwise disables the guard and lets factory-created stations spawn real containers on the host daemon. (It also blanks `SENTRY_LARAVEL_DSN`, unrelated to the supervisor.)
- Existing tests exercise command construction by invoking the private flag builders via reflection (`tests/Feature/LiquidsoapSupervisorTest.php`), not the daemon.

## StationObserver: keeping a running container in step

Registered in `AppServiceProvider` (`Station::observe`). Does not create containers on `created`; a new station has no container until started.

| Event | Behaviour |
|---|---|
| `creating` | Assign `container_index` if null. |
| `updated`, any of `LIQ_RELEVANT_COLUMNS` changed | Columns: `name`, `slug`, `description`, `genre`, `icecast_mount`, `icecast_password`, `artwork_url`. If the station is stopped and slug did not change: nothing (the next `up()` re-renders). If slug changed: `downBySlug(oldSlug)` and rename `{playlists_dir}/{old}` to `{new}` if old exists and new does not. Then, if `isRunning()`: `up()`. |
| `deleting` | `down()` (also fires on a hard delete, because `forceDelete()` calls `delete()`). |
| `forceDeleted` | Delete the playlist tree, then `destroyArtifacts(slug)` (`.liq` and HLS dir). |
| `restored` | `up()` if `isRunning()`, otherwise nothing. |

Every action is wrapped in `safely()`: failures are logged as `StationObserver failed` and swallowed, so a Docker hiccup never fails the HTTP request. Drift left behind is the reconciler's job.

Rendered into the script but **not** in `LIQ_RELEVANT_COLUMNS`: the plan-derived watermark state, which `UserObserver` pushes over telnet instead. The `stations.jingle_*` columns still exist but nothing reads them (jingle rules live in `jingle_lists`, read by Laravel at every track boundary), so editing them does nothing. Changing config env values (image, memory, ports) is not a station change at all; see drift.

## Reconcile: what converges the daemon onto intent

`php artisan stations:reconcile [--dry-run]`, scheduled every minute (`withoutOverlapping`, `runInBackground`). One `docker ps -a` (`listContainerStates()`) plus DB queries. Intent is `Station::running()` (global soft-delete scope excludes trashed stations); known slugs come from `withTrashed()`.

| Class | Condition | Action |
|---|---|---|
| Orphan | container slug matches no station row (even trashed) | `removeContainer()` |
| Unwanted | station exists but is stopped or soft-deleted | `removeContainer()` (this is what makes the power button survive `--restart unless-stopped` and a host reboot) |
| Missing | wanted station with no container | `playlistWriter->prepare()`, `up()`, broadcast `StationStateChanged` reason `reconciled`, log warning |
| Unhealthy | wanted container whose status is `restarting`, `exited`, `dead` or `paused`, or health is `unhealthy` (`starting` is NOT unhealthy) | Counted per pass in cache; see below |

Unhealthy handling: cache key `station-unhealthy-passes:{slug}` counts consecutive bad passes (TTL 6 h; forgotten on any clean pass). Recreate when passes >= `LIQUIDSOAP_UNHEALTHY_PASSES` (default 2; `max(1, ...)`). Recreates are capped by `station-recreates:{slug}` (TTL 1 h) at `LIQUIDSOAP_UNHEALTHY_RECREATES_PER_HOUR` (default 3); past the cap the station is left alone with an error log and counts as a failure. A recreate is `removeContainer()` + `playlistWriter->prepare()` + `up()`, then cache bookkeeping and a `reconciled` broadcast. Dry run reports without touching containers or the recreate/pass counters it would increment, but a clean pass still calls `Cache::forget` on the pass and live-strike keys, and `reconcileLiveFlags()` still runs its status fetches. The recreate counter's TTL restarts from one hour after each recreate (sliding, not a fixed hourly window).

Also, every pass, `reconcileLiveFlags()`: for each `running()->live()` station it pulls a fresh `StationStatusService::fetch()`; unreachable is ignored; if the container's `broadcaster` flag (falling back to `source === 'live'` when absent) says nobody is attached, it counts strikes in `station-live-strikes:{id}` (TTL 1 h) and after `LIQUIDSOAP_STRANDED_SESSION_STRIKES` (default 3) closes all open `StreamSession`s with `ended_at = now()`. (Session semantics belong to [Station lifecycle](station-lifecycle.md) and [Observability](observability-and-events.md).)

Exit code is FAILURE if any remove/start/recreate failed or a station is over its recreate budget. Unlike the power button, reconcile does not take the lifecycle lock and does not check `max_running_stations`.

## Other commands

- `php artisan stations:relaunch [--slug=] [--include-trashed]`: for every `running()` station, `playlistWriter->prepare()` then `up()`. Because `up()` restarts a healthy container, each station blips (the deploy script says about 3 s; in code it is graceful stop up to 5 s, `docker run`, 750 ms verify) and live broadcasters are disconnected. Not scheduled and not run by `deploy-native.sh`, which runs only `stations:reconcile` (`|| true`) and prints a manual `stations:relaunch` step when `infra/liquidsoap`, the station blade view or `LiquidsoapSupervisor.php` changed; it is the manual "re-render every script / new image / new limits" tool. No lifecycle lock, no `StationEvent`, no broadcast. `--include-trashed` also starts soft-deleted stations that are marked running; the next `stations:reconcile` pass will remove them again as unwanted.
- `php artisan stations:prune-deleted [--days=N] [--dry-run]`: scheduled daily 04:40. Retention `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS` (default 30); `<= 0` disables (prints a message, exits 0). Selects `onlyTrashed()` with `deleted_at < now - N days`, oldest first, and calls `forceDelete()` on each model one at a time (mass delete would skip the observer and strand files). Each failure is reported and retried next run; the command still exits SUCCESS. Force delete triggers `deleting` (`down()`, a no-op when no container) and `forceDeleted` (playlist tree, `.liq`, HLS dir); `tracks` rows go by FK cascade.
- `App\Jobs\StopStation` (dispatched by `stations:sweep`, see [AutoDJ](autodj.md) and [Station lifecycle](station-lifecycle.md)): one try, `WithoutOverlapping($stationId)->dontRelease()`. Reloads the station with `user.plan`, exits if gone or not intended-running, re-asks `StationAudioPolicy::verdict()` against `pullFresh()` and only calls `lifecycle->stop($station, reason: 'silent')` (force false) if it is still `Stop`. A `StationLifecycleException` (someone went live in the meantime) is logged and dropped. On success it clears `silent_since`. It is a job so a stalled `docker stop` only blocks itself.

## HarborAuthController

It does not call the supervisor. The coupling is the URL and key: `renderLiqFile()` embeds `{api_url}/api/internal/harbor-auth` and `X-Internal-Key` in each script, and the container POSTs `{slug, user, password, address}` there per connection attempt with a 5 s timeout; anything but HTTP 200 (or an unreachable API) refuses the broadcaster. Server side: `slug` required, `password` empty means refuse; the station is looked up with `user.plan` (soft-deleted stations do not match and are refused); a valid broadcast token (`BroadcastTokenService::verify`) is allowed; else a constant-time match against `stream_key`, allowed only if `user->canUseEncoder()`. Refusals log at info without the credential. A wrong `LIQUIDSOAP_API_URL` (for example `artisan serve` bound to loopback) makes every broadcaster look rejected; this is the failure the container logs name explicitly. See [Encoder ingest](encoder-ingest.md) and [Broadcasting web studio](broadcasting-web-studio.md).

## Configuration this feature reads

All in `api/config/liquidsoap.php`. Defaults as read from code.

| Env var | Default | Effect |
|---|---|---|
| `LIQUIDSOAP_LIQ_DIR` / `_PLAYLISTS_DIR` / `_HLS_DIR` / `_SYSTEM_DIR` | `/var/gocast/{liq,playlists,hls,system}` | Host paths; bind-mount sources. They must be host paths the daemon can see, not paths inside a Laravel container the daemon cannot resolve. |
| `LIQUIDSOAP_IMAGE` | `gocast/liquidsoap:latest` | Resolved at each `docker run`. |
| `LIQUIDSOAP_CONTAINER_CPUS` / `_MEMORY` | `0.5` / `512m` | Empty string disables the cap. |
| `LIQUIDSOAP_CONTAINER_PIDS_LIMIT` / `_INIT` | `256` / false | |
| `LIQUIDSOAP_STOP_TIMEOUT` | 5 (clamped to at most 7) | |
| `LIQUIDSOAP_START_VERIFY_DELAY_MS` | 750 | 0 skips verification. |
| `LIQUIDSOAP_HEALTHCHECK`, `_HEALTH_INTERVAL`, `_HEALTH_TIMEOUT`, `_HEALTH_RETRIES`, `_HEALTH_START_PERIOD` | true, 15 s, 3 s, 3, 45 s | Probe is `bash -c` over `/dev/tcp/127.0.0.1:{harbor_port}` requesting `/healthz` and grepping for ` 200 ` (the image has no curl). Healthy means audio graph producing frames AND Icecast connected. Docker does not restart unhealthy containers; only the reconciler acts on it. |
| `LIQUIDSOAP_UNHEALTHY_PASSES`, `_UNHEALTHY_RECREATES_PER_HOUR`, `_STRANDED_SESSION_STRIKES` | 2, 3, 3 | Reconciler. Counted in passes; the schedule is one minute. |
| `LIQUIDSOAP_CONTAINER_SUBNET` | `172.28.0.0/16` | Must match the real network. |
| `LIQUIDSOAP_TELNET_RESOLVE` | `ip` | `ip` or anything-else-means-name. |
| `LIQUIDSOAP_HARBOR_PORT` / `_HARBOR_TIMEOUT` / `_STATUS_TTL` / `_STATUS_DOWN_TTL` | 8080, 1.5 s, 2 s, 15 s | Status path (used by `StationStatusService`). |
| `LIQUIDSOAP_HARBOR_INPUT_PORT` / `_HARBOR_INPUT_TIMEOUT` / `_INGEST_URL` | 8090, 10.0 s, unset | |
| `LIQUIDSOAP_ICECAST_HOST` / `_PORT` / `LIQUIDSOAP_API_URL` | `host.docker.internal`, 8000, `http://host.docker.internal:8081` | From the container's point of view. `host-gateway` resolves to the default bridge gateway, so Icecast and the API must listen on all interfaces. |
| `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS` | 30 | |

Other keys in the same file (crossfade, limiter, loudness, silence trimming, watermark, auto-stop windows, storage cap, encoder host/port) belong to other features; only the ones the supervisor renders are listed above. Docker is reached via the `DOCKER_HOST` real environment variable (set for php-fpm, queue and scheduler units in the native deploy; a `config:cache` deploy no longer reads `.env`).

## Drift: what stays wrong until something recreates the container

A container's settings are frozen at `docker run` time. Nothing compares a live container against current config.

| Changed | Who notices | Result |
|---|---|---|
| `.liq` template, or any config rendered into it (crossfade, limiter, charset, GC, hls variant, api/icecast address) | Nobody | Running stations keep the old script (the file is bind-mounted and rewritten in place, but Liquidsoap does not reload). Applied on next `up()`: `stations:relaunch`, a lifecycle start, or a station edit that restarts it. |
| `LIQUIDSOAP_IMAGE`, memory, cpus, pids, health flags, stop timeout, log opts | Nobody | Same. Only `stations:relaunch` (or stop/start) applies them. |
| Health flags baked into an old container | | A container started before healthchecks reports health `none`, treated as healthy. |
| Container deleted, killed, or host reboot | `stations:reconcile` | Missing or unhealthy branch. Up to about a minute of silence plus `up()` time. |
| Owner stops the station | `StationLifecycleService::stop` then reconcile as backstop | Unwanted container removed. |
| Docker `rm` fails during stop | Reconcile | Intent is already `stopped`, so the leftover is removed next pass. |
| Station renamed while running | `StationObserver` | Old container removed by old slug, playlist dir renamed, new container started. |
| Owner's plan | `UserObserver` | Watermark over telnet, best-effort; a failed push is corrected at next boot. AutoDJ music and jingles follow the plan by themselves (`next-track` answers 204 without AutoDJ). |
| Template change of 2026-10-05 (jingles moved to Laravel) | Nobody | An old container keeps its own jingle block and plays its frozen `jingles.m3u`; it sends no `X-Gocast-Script`, so Laravel serves it music only. `stations:relaunch` moves it to the new script. |
| Plan-derived state while the container is stopped | Nobody needed | `up()` renders current values. |
| Container in `starting` health for the whole start period | Not drift | Reconciler ignores `starting`. |
| Unhealthy past 3 recreates/hour | Human | Logged as `Station unhealthy and past its recreate budget`; the metrics gauges show it. |

## Gaps and traps

1. **No modes.** The brief's "docker / native / hybrid" split does not exist in this class. It is all env (`DOCKER_HOST`, dirs, hosts, `LIQUIDSOAP_TELNET_RESOLVE`). The class docblock still says `--restart=always` while the code uses `unless-stopped`.
2. **`up()` on a healthy container restarts it.** `RelaunchStations`, `ReconcileStations`, and the observer call `up()` directly and can drop live listeners and a live broadcaster. Only `StationLifecycleService::start()` guards this.
3. **No lock outside the lifecycle service.** Reconcile, relaunch and the observer call `up()`/`removeContainer()` without `Cache::lock("station-lifecycle:{id}")`, so they can interleave a `docker run` and `docker rm -f` on the same name with a power-button press.
4. **The observer restart path does not call `PlaylistFileWriter::prepare()`**; lifecycle start, reconcile and relaunch do. It is harmless today because `up()` itself creates the station's directories (`ensureDirectories()`).
5. **A failed start leaves the container behind and skips the start event.** See Start verification. The same `verifyStarted()` exception also bubbles out of reconcile/relaunch as a per-station failure line.
6. **Rename leaks and can lose files.** The old slug's `.liq` and HLS directory are not removed (only `destroyArtifacts` at force-delete, and only for the final slug). If the playlist dir rename fails (logged, swallowed), `ensureDirectories()` creates an empty new dir and the library is orphaned under the old slug. If the new dir already exists the rename is silently skipped. The container labels carry the old slug until recreate.
7. **Deleted-and-running stations keep `desired_state=running`.** Soft delete calls `down()` but does not change intent. Restore then brings the station back (`restored` hook). Reconcile ignores trashed stations for intent, so any container for one is "unwanted".
8. **Direct row edits bypass everything.** Mass updates, raw SQL, and `withoutEvents` skip the observer; only reconcile (within about a minute) catches container-side drift, and it never re-renders scripts for a healthy container.
9. **Dead code.** `listManagedContainers()` and `isHealthy()` have no callers in `app/`. `exists()` is used only inside `up()`, and `restart()` only inside `up()`. Two tests mock `listManagedContainers` (`ReconcileStationsTest`, `MetricsControllerTest`) although nothing calls it. The `gocast.station` and `gocast.station_id` labels are written and never read. The docblock on `listManagedContainers` says "running" though it uses `-a`.
10. **Telnet success is not verified.** `telnet()` returns the reply text and nobody checks for `ERROR`, so `applyWatermarkSettings()` can return true against a container whose script predates the variables. Fix by relaunching.
11. **`docker rm -f` on the "exists but not running" branch of `up()`** is a SIGKILL, skipping the graceful HLS/Icecast shutdown that `removeContainer()` provides.
12. **`.liq` contains secrets** (Icecast source password, internal API key) in a host file under `liq_dir`, mounted read-only into the container. `File::put` is not atomic.
13. **Address arithmetic depends on external setup.** `LIQUIDSOAP_CONTAINER_SUBNET` must equal the subnet in `infra/native/docker-compose.native.yml`, whose `ip_range` confines Docker's IPAM; the supervisor checks neither, so a mismatch surfaces as `docker run` "address already in use" or a status that never answers. The network itself is not created here and its absence fails `docker run`.
14. **`isRunning()` is intent on the model but daemon truth on the supervisor.** `Station::isRunning()` reads `desired_state`; `LiquidsoapSupervisor::isRunning($station)` asks Docker. They are easy to confuse in a code review.
15. **Prune** exits SUCCESS even when some stations failed (they are retried tomorrow); `--days` beats config and `0` or negative disables it, silently.
16. **Verify delay runs inline.** Every start blocks the HTTP request for at least the graceful stop (when recreating) plus 750 ms plus `docker run`. Lock TTL in the lifecycle service is 30 s and wait is 8 s; a stalled daemon (10 s per docker call, several calls per `up()`) can exceed both.
17. **Proxy does not contain PHP RCE.** The docblock is candid: the socket proxy filters by path and method only, and `POST /containers/create` with an arbitrary HostConfig is allowed, so a compromised PHP process is effectively root on the host. EXEC is denied, which is why telnet is a raw TCP socket.
18. **Substring name filter breaks container lookup when one slug contains another.** `containerExistsByName()` compares the whole `docker ps --filter name=` output to the name, but the filter is a substring match. With containers for stations `jazz` and `jazz-fm`, asking about `gocast-liquidsoap-jazz` returns two lines, so `removeContainer()` and `exists()` treat it as absent. A stop then leaves the container running (reconcile's `removeContainer` has the same blind spot, so it never converges), and `up()` on a running `jazz` does `restart()` (no-op `down`) then `docker run` into a name conflict. Derived from the code plus the observed substring behaviour of the filter; whether slug rules allow prefix slugs to coexist was not checked.
19. **Stale config comment.** `config/liquidsoap.php` still names `GOCAST_SUBNET` in `domains.env`; the subnet now lives in `docker-compose.native.yml`. The `verifyStarted()` docblock likewise says the reconciler retries "within five minutes"; the schedule is every minute.

## Tests

- `tests/Feature/LiquidsoapSupervisorTest.php`: flag construction (stop signal/timeout, cap-drop, labels, health probe, start period, health omission, image from config, stop-timeout clamp, mounts). No test runs a real container, and none covers `verifyStarted()`, `removeContainer()` ordering, `telnet()` itself, or `ingestUrl()`.
- `tests/Feature/ReconcileStationsTest.php`: orphan/unwanted/missing/dry-run/naming filter, unhealthy debounce, health period, hourly budget, stranded-session strikes, and the `reconciled` broadcast.
- `tests/Feature/StationObserverTest.php`: test-mode guard, no container on create, no restart when stopped, restart when running, ignored columns, rename teardown, artifact wipe on hard delete only, and still restarting a running station for script-baked changes.
- `tests/Feature/PruneDeletedStationsTest.php`, `tests/Feature/PlaylistFileWriterTest.php` (annotate URIs, jingle flag, hard-start cut and fade, and that no playlist file is written, only the directory).
- `tests/Feature/StationContainerIpTest.php`: address arithmetic (reserved offset, octet carry, block ceiling, no duplicates, throw at exhaustion, subnet change keeps addresses, bad CIDR, `--ip` on the run command, telnet by IP).
- `tests/Feature/MetricsControllerTest.php` (mocks the supervisor's `listManagedContainers`, which the controller never calls), `tests/Feature/ReloadWatermarkClipsTest.php`, and `tests/Feature/StationSweepTest.php` (`new StopStation(...)->handle` at lines ~414-455).
- `RelaunchStations` has no test anywhere (no test invokes `stations:relaunch`).
- Run only targeted files (the full API suite takes minutes).

## History

- Originally the observer owned the container lifecycle (spawn on `created`); the power button and `desired_state` moved that to `StationLifecycleService`, leaving the observer as config-drift only.
- 2026-08-14: memory default raised from 256m (silent SIGKILL at boot) to 512m.
- 2026-08-29: `container_index` and fixed IPs replaced per-poll `docker inspect` address lookups.
- Reconcile went from every five minutes to every minute; its two debounces were rescaled in passes.
- The AutoDJ rotation moved from a `playlist.m3u` file with telnet reload to `request.dynamic` per track. On 2026-10-05 the jingle m3u went too (jingles are served by `next-track`; `write()`/`reload()` became `prepare()`, `applyJingleSettings` and the jingle push from both observers were removed), and skip-track was disabled.
