# Station hardening + Liquidsoap capability harvest

Production hardening for container **init**, **teardown** and **status monitoring**, plus
everything Liquidsoap 2.4 offers that we are not using yet.

Written 2026-08-15 on `feat/mediamtx-v3`.

**Status: Parts 1–4 are implemented** (2026-08-15) — ticked boxes below are done and
covered by tests; unticked ones are still open. Part 5 (the capability harvest) is
untouched and remains the feature backlog.

Two bugs were found while implementing, neither of them in the plan:

- **`/status` died on NaN/Infinity.** `response.json` raises on either, and a raised
  harbor handler answers nothing at all — Laravel read that as "container unreachable"
  and reported `starting` forever. `remaining()` is infinite for any station playing the
  silence bed, i.e. every station with an empty playlist and no broadcaster, so this was
  the common case. Found by running the rendered template in a real container; fixed with
  a `finite()` guard.
- **The 90-second broadcast-state TTL is vestigial.** `markLive()` is called once by
  `runOnReady` and nothing refreshes it, so the Redis key expires mid-broadcast and the
  `is_live` DB column is the only thing keeping a long broadcast live. That ruled out the
  obvious implementation of P0 #3 (clearing `is_live` when the Redis key is gone would end
  every broadcast after 90 seconds); the container's own `source` field is the authority
  instead.

One design decision changed during implementation: **the Icecast connection is deliberately
not part of the healthcheck verdict.** Health drives automation — an unhealthy container is
recreated — and if a lost Icecast connection counted as unhealthy, one Icecast outage would
mark every station on the box unhealthy at once and the reconciler would recreate the entire
fleet, repeatedly and to no effect. It is surfaced as the new `degraded` state instead.
Health drives automation; degraded drives attention.

> **Version note (2026-08-17):** the image has since been bumped to **Liquidsoap 2.4.5**
> (see the bump item below). Every "2.4.0" in this document is the version it was written
> against, not the version now running. The API observations still hold; the crossfade
> behaviour does not — 2.4.0's `cross()` clock bug (savonet#4851) is fixed from 2.4.3 on.

Every claim was verified against the real `gocast/liquidsoap:latest` image
(Liquidsoap 2.4.0) or read out of the current code — line references included so none of
it has to be re-derived. The published docs describe the dev branch and disagree with
2.4.0 in several places; where they do, the image won. Appendix A is a **complete station
template that compiles clean** with everything below in it. Appendix B has the API
gotchas and the re-probe recipe.

---

# Part 1 — P0: wrong today, not merely unhardened

## 1. Teardown SIGKILLs every station

`LiquidsoapSupervisor::removeContainer()` (`api/app/Services/LiquidsoapSupervisor.php:191`,
and the stale-container cleanup at `:141`) uses `docker rm -f`, which is kill, not stop.

Measured on the real image:

| command | elapsed | exit | shutdown sequence |
|---|---|---|---|
| `docker stop -t 15` | **509 ms** | 0 | scheduler drained, downloaded files cleaned, memory freed |
| `docker rm -f` (today) | 215 ms | 137 | none |

We save 300 ms and pay for it twice: `persist_at` HLS state (`/data/hls/state.json`) is
never written, so every restart resets the media sequence — exactly what that flag exists
to prevent (`api/resources/views/liquidsoap/station.blade.php:317`) — and the Icecast
source socket is never closed, so the mount lingers until Icecast times it out.

**Fix:** `docker stop --timeout N` then `docker rm`.

**Trap:** `DOCKER_TIMEOUT_SECONDS = 10` (`LiquidsoapSupervisor.php:58`) is the Process
timeout on every docker call, so `-t 15` would be killed by Laravel *mid-shutdown*.
Graceful shutdown measured at 0.5 s, so `-t 5` is generous.

**Proxy:** allowed — `docker-compose.yml` sets `CONTAINERS: 1` + `POST: 1`, which covers
`/containers/{id}/stop`.

- [x] `removeContainer()` → stop-then-rm
- [x] `--stop-signal SIGTERM --stop-timeout 5` at run time so *every* stop path is graceful

## 2. The container metrics are lying

`api/app/Http/Controllers/MetricsController.php`:

- `:63` — `gocast_supervisor_containers_expected = Station::count()`. Predates the power
  button; must be `Station::query()->running()->count()`. Today every stopped station
  counts as expected, so the drift gauge is permanently wrong and anything alerting on it
  is noise.
- `:57` — `gocast_supervisor_containers_running` calls `listManagedContainers()`, which is
  `docker ps -a` (`LiquidsoapSupervisor.php:246`). Exited containers count as running.
  `-a` is right for the reconciler and wrong for this gauge.

- [x] Fix the expected query
- [x] Split: `containers_total` (`-a`) vs `containers_running` (`status=running`)

## 3. `is_live` can stick forever

Redis broadcast state self-expires (`BroadcastStateService::LIVE_TTL_SECONDS = 90`), but
the DB column only clears when `whip-not-ready` fires
(`api/app/Http/Controllers/MediaMtxLifecycleController.php:82`). Lose that webhook once —
MediaMTX's `curl` fails, api restarts mid-request — and the column stays true forever.
Three mechanisms then fail silently:

- stop is refused with `409 station_is_live` permanently
- `ReapIdleStations::hasAudience()` never returns false, so the station is never reaped
- `StationResource:60` ORs the column with Redis, so the LIVE badge sticks

**Fix:** reconcile it — container reports `source != live` (we already fetch this) or Redis
state absent, for N consecutive minutes → clear the column. Fold into `stations:reconcile`
rather than adding a fifth scheduled job.

- [x] Add live-state reconciliation

## 4. Starting a station is never verified

`docker()` (`LiquidsoapSupervisor.php:106`) does `->throw()`, so daemon-level failures
*are* caught — missing image, name conflict, unreachable daemon. That is not the failure
that happens.

Measured, running the exact command `run()` builds against a station with a broken `.liq`:

```
docker CLI exit code: 0        <-- all that ->throw() inspects
docker inspect:  Status=restarting  ExitCode=1  RestartCount=6
docker logs:     Error 4: Undefined variable this
```

`docker run -d` returns when the container is **created and started**, not when the
process survives. A station that never ran for one second reports success and the API has
already returned `202`. The reason sits in `docker logs` the whole time. The OOM case (see
the `liquidsoap-memory-cap` note) is worse — exit 137, empty logs, only `.State.OOMKilled`
carries the answer.

- [x] Post-run inspect: `.State.Status`, `.State.ExitCode`, `.State.OOMKilled`,
      `.RestartCount`; on anything but a healthy `running`, attach `docker logs --tail 20`
      and fail loudly
- [x] `last_ready_at` persisted, so "start failed" is a state rather than the absence of
      one — written by the container's own `icecast_connected` push rather than by a
      server-side poll
- [ ] Bounded readiness poll (or queued job) after start, for the case where the push
      never arrives at all
- [x] Raise OOM kills / non-zero exits to Sentry. Start failures now throw a 503
      `StationLifecycleException`, and `bootstrap/app.php` reports only the 5xx ones —
      plan limits and "end your broadcast first" are expected outcomes and would have
      buried the real faults

## 5. A crash-looping station is invisible to the entire system

**`isRunning()` lies in the window it is consulted.** `docker ps --filter status=running`
(`LiquidsoapSupervisor.php:227`), sampled every 2 s over the first 10 s of a crash loop,
returned the container name **5 out of 5 times** — Docker's restart backoff starts around
100 ms, so a failing container genuinely *is* running most of that window. Only once
backoff grows does the filter go quiet:

```
sample | ps(status=running) | inspect .State.Status | RestartCount
  1    | —                  | running               | 6
  2    | —                  | restarting            | 7
```

Consequence: `start()`'s short-circuit ("already running and healthy → return unchanged",
`StationLifecycleService.php:72`) can no-op on a station that has never started, and
`ensureRunning()` on the WHIP auth hook then lets a broadcaster publish into nothing.

**The reconciler never touches it.** `ReconcileStations` builds `$present` from
`listManagedContainers()` = `docker ps -a`. A restarting container *is* in that list, so it
is not `missing`; it is wanted, so it is not `unwanted`. A station with a broken `.liq`
restarts forever and the only symptom anywhere is `starting` in the UI.

- [x] Base `isRunning()` on `.State.Status` + a stable `.RestartCount`, or make health the
      authority (below)
- [x] Third drift class in the reconciler: **present but unhealthy**

### 5a. Docker HEALTHCHECK closes most of this for free

`/healthz` already exists (`station.blade.php:237`) and nothing consumes it. Wiring it to a
container healthcheck makes Docker do the polling:

- `docker ps --filter health=healthy` replaces the check that lies during a crash loop
- `--health-start-period` *is* the "bounded starting" grace window
- the third drift class becomes `docker ps --filter health=unhealthy`

**Image constraint (checked):** no curl, no wget, no nc — but `/bin/bash` is present, so a
dependency-free probe works via `/dev/tcp`:

```sh
--health-cmd 'bash -c "exec 3<>/dev/tcp/127.0.0.1/8080; printf \"GET /healthz HTTP/1.0\r\n\r\n\" >&3; grep -q ready=true <&3"'
--health-interval 10s --health-timeout 3s --health-retries 3 --health-start-period 45s
```

**Accuracy note:** Docker does not auto-restart unhealthy containers outside Swarm. Health
is a signal the reconciler acts on, not self-healing.

- [x] Health flags at `docker run` (per-container, so timings stay config-tunable)
- [x] Switch `isRunning()` and the reconciler to health state

### 5b. Push notification on the way up

All verified compiling, no deprecation warnings, and the plumbing already exists in the
template (`on_metadata` → `/internal/now-playing`):

```liquidsoap
on_start(fun () -> notify("boot"))
on_shutdown(fun () -> notify("shutdown"))
o.on_connect(synchronous=false, fun () -> notify("icecast_connected"))   # audible NOW
o.on_disconnect(...) ; o.on_error(...)
```

`o.on_connect` is the real readiness event — the mount is live, which is stronger than
`ready` and instant versus up to 2 s of client polling.

**The catch that decides the design:** a push can only report success. A bad `.liq` or the
OOM-at-boot trap kills Liquidsoap *before any hook runs*, so silence is ambiguous — "still
booting" and "died 200 ms ago" look identical. Pair it with a **deadline**: record the
start attempt, expect `station-up` within N seconds, treat absence as failure. And keep
`/status` polling as the reconciler's authority, because a lost webhook must never strand
a station — the same lesson as P0 #3.

- [x] `/internal/station-event` endpoint (behind `internal` middleware)
- [x] Emit boot / icecast_connected / icecast_disconnected / icecast_error / shutdown
- [ ] Start deadline, so absence of an event is itself a signal

---

# Part 2 — Init hardening

- [ ] **Validate before running.** `liquidsoap --check` on the rendered `.liq` catches a
      broken template or pathological station field before it becomes a crash loop. Gate on
      a hash of the rendered output so it only runs when the file changed.
- [x] **Pin the image.** `LiquidsoapSupervisor.php:40` runs `gocast/liquidsoap:latest`
      while `infra/liquidsoap/Dockerfile:4` says in capitals not to. Move the tag to config
      so rollback is a config change plus `stations:relaunch`.
- [x] **Sandbox flags:** `--cap-drop ALL`, `--security-opt no-new-privileges`,
      `--pids-limit`. `--read-only` + tmpfs for `/tmp` is worth testing — Liquidsoap writes
      downloaded files there.
- [ ] **`--init`.** Not needed for signals (verified: SIGTERM is handled correctly as
      PID 1), but it matters once protocol resolvers fork ffmpeg per track — which is
      exactly what the loudness work in Part 5 introduces.
- [ ] **Restart policy decision.** `unless-stopped` (`:405`) retries forever; a crash loop
      hammers the daemon between reconciler passes. `on-failure:5` plus the reconciler as
      the real supervisor is the more honest split.
- [x] **Label containers** (`--label gocast.station={slug}`). The reconciler recovers the
      slug by parsing the container name, the one thing a rename changes.

---

# Part 3 — Teardown hardening

- [x] Graceful stop (P0 #1) plus `--stop-signal` / `--stop-timeout` at run time.
- [x] **`on_shutdown()` webhook** so the API can tell "we stopped it" from "it died".
- [x] **Disk hygiene.** `StationObserver::forceDeleted()` (`:117`) wipes the playlist tree
      but leaves `hls/{slug}/` and `liq/{slug}.liq` behind forever.

---

# Part 4 — Status and monitoring

## `ready` does not mean audible

`/status` reports `ready = output_source.is_ready()` (`station.blade.php:224`) — whether
the audio graph produces frames. If Icecast rejects the source (wrong password, Icecast
down) we report `ready: true` and `on_air` while nobody can hear anything.

- [x] Track Icecast connection state in a ref via `on_connect`/`on_disconnect`/`on_error`,
      expose `icecast_connected` in `/status` and `/healthz`, and factor it into
      `StationStatusService::state()` (Appendix A shows the shape)
- [x] Same idea for HLS via `on_file_change` — a stalled segment writer is invisible today

## Other gaps

- [ ] **Negative-cache the unreachable.** A wedged station is re-polled every 2 s by every
      viewer, each costing up to 1.5 s of harbor timeout inline in a web request. Longer
      TTL on the failure path; `Http::pool` for multi-station reads.
- [ ] **Per-station Prometheus.** `settings.prometheus.server := true` on 9599 plus
      `prometheus.latency` gives latency, GC and readiness per station.
- [ ] **Lifecycle metrics** in `/internal/metrics`: stations by `desired_state`, containers
      by actual state, reconciler actions, reaps, start failures, OOM kills.
- [ ] **Route lifecycle failures to Sentry**, not just `Log::error`.

---

# Part 5 — Capability harvest

Everything below exists in the image we already ship (`--list-functions` has 2282 entries;
these are the ones that matter to a radio product). Verified present; the ones marked
**compiles** are in the Appendix A template.

## 5.1 Audio quality — the biggest listener-facing gap

We correctly refuse `normalize()` (docs agree: it "can be surprised by rapid changes"),
which leaves **no leveling at all** and a flat 2 s crossfade regardless of how a track
ends.

- [ ] **`normalize_track_gain`** *(compiles)* — reads `liq_normalize_track_gain` from
      metadata and amplifies. Computes nothing itself, so it costs nothing at play time.
- [ ] **Autocue-compatible metadata** — `liq_cue_in`, `liq_cue_out`, `liq_fade_in`,
      `liq_fade_out`, `liq_cross_duration`. With
      `settings.crossfade.assume_autocue := true` *(compiles)*, supplying all four cue/fade
      keys puts crossfade in autocue mode with **zero analysis in the station container**.
      This fits our architecture exactly — `PlaylistFileWriter` already writes an
      `annotate:` URI per track from the DB.
- [ ] **Where the numbers come from:** one ffmpeg pass at upload (`ebur128` for integrated
      LUFS, `silencedetect` for cue points). The api image has no ffmpeg today (getID3
      only) — add it, or run the analysis in a throwaway liquidsoap container. Legacy rows
      can fall back to an `autocue:` URI prefix; protocols chain.
- [ ] **Broadcast processing chain**, all present: `compress`, `compress.multiband`,
      `limit`, `gate`, `nrj`, and the full `filter.iir.eq.*` family. This is the "sound
      processing" a paid radio product is expected to have.

**Gotcha found while validating:** `normalize_track_gain(pl)` returns a plain source —
`.length()`, `.remaining_files()` and the other playlist methods are **lost**. Keep the raw
`playlist` in a variable for `/status` and feed the wrapped one to the fallback. Appendix A
does this.

## 5.2 Ingest — we support exactly one way to broadcast

Today: browser WHIP through MediaMTX. Present in the image and unused:

- [ ] **`input.harbor`** *(compiles)* — the station container accepts an Icecast/HTTP
      source connection directly. That is BUTT, Mixxx, RadioDJ, OBS with an Icecast output,
      and every hardware encoder — the standard way internet radio is actually broadcast,
      and the single biggest feature gap versus AzuraCast/Radio.co. Auth via the
      `icecast_password` we already generate per station, or an `auth` callback
      (`{address, password, user} -> bool`) that asks Laravel. `on_connect` /
      `on_disconnect` give session tracking identical to the WHIP webhooks.
      **Infra caveat:** needs a routable port per station — either publish one per
      container, or reverse-proxy by path (Caddy can proxy HTTP `PUT` ingest to
      `gocast-liquidsoap-{slug}:8000`; the legacy `SOURCE` verb is not standard HTTP, so
      PUT-capable encoders are the clean path).
- [ ] **`input.srt`**, **`input.rtmp`** — present. RTMP ingest without MediaMTX in the path.
- [ ] **`input.http`** / **`input.hls`** — relay an existing stream. Rebroadcast,
      simulcast-in, or a migration path for someone moving off another host.

## 5.3 Product features sitting in the box

- [ ] **Recording / archiving** *(compiles)* — `output.file` with
      `reopen_when=predicate.changes(fun () -> time.local().hour)` writes an hourly archive,
      and `on_close(filename)` fires when each file is finished. That is show replay,
      podcast export, and compliance logging (legally required in several markets) for
      about six lines. Watch the disk cap.
- [ ] **Live show metadata** *(compiles)* — `source.insert_metadata([("title", ...)])`.
      Today a live WHIP broadcast has **no now-playing metadata at all**: the RTSP input
      carries none, and `whip-not-ready` clears the Redis key. The studio UI could set
      "Show — DJ" live.
- [ ] **`request.queue`** *(compiles)* — "play this next", jingles, station IDs. We only
      have skip.
- [ ] **`smooth_add`** — fade a jingle or bed over the live voice instead of replacing it.
- [ ] **Scheduled programming** — `switch` with `time.predicate` / `cron.add` gives
      day-parting: different playlists by hour and weekday, timed shows, scheduled jingles.
- [ ] **`rotate` / `random` / weighted rotations** — rotation rules beyond a flat loop.
- [ ] **Cover art** — `metadata.cover`, and `export_cover_metadata` on outputs.
- [ ] **TTS station IDs** — the `say:` / `pico2wave:` protocols exist but **no TTS binary is
      installed** (checked: no text2wave, pico2wave, say, espeak, flite). Would need a
      package added to the image.

## 5.4 Control and ops

- [ ] **Drop the telnet port.** Docs: the server "does not have any kind of authentication
      and permissions", and it defaults to binding 127.0.0.1. We bind `0.0.0.0:1234` on
      `gocast-network`, so anything on that network can control any station — while
      `/status` beside it demands `X-Internal-Key`. `server.execute()` inside an
      authenticated harbor handler *(compiles)* removes the port and deletes the hand-rolled
      fsockopen protocol code. Alternative: `settings.server.socket` on the `/var/gocast`
      tree already mounted into api.
- [ ] **Richer control without restarts** — the playlist source exposes `reload(empty_queue,
      uri)`, `skip`, `seek`, `queue`, `set_queue`, `current`, `remaining_files`,
      `on_position`, `register_command`. Most of a "playlist console" is already there.
- [x] **Bump 2.4.0 → 2.4.5.** DONE — `infra/liquidsoap/Dockerfile` now pins v2.4.5.
      This was not a nice-to-have: on 2.4.0 every form of `cross()` wedged AutoDJ on a
      track boundary, emitting one buffered frame forever (heard as a stuck-PC buzz) with
      nothing in the log. Root cause was savonet#4851 — the crossfade's `transition` and
      `pre_buffer` sources were attached to the passive child clock instead of the
      top-level one, so nothing animated them — fixed in **2.4.3**. 2.4.5 additionally
      fixes savonet#5194, a `cross`/`crossfade` crash when `source.skip` is called from a
      `harbor.http` handler, which is exactly how this station serves /status. Also picks
      up 2.4.1's *"audio artifact in crossfade transitions"*, and `clocks.dump` /
      `--describe-sources`, which is what you want when a station is wedged.
      Crossfade itself stays behind `LIQUIDSOAP_CROSSFADE_ENABLED` (default false) until
      a clean transition is actually observed on 2.4.5.
- [ ] **`cross.plot`** — dumps transition data for debugging crossfades.

---

# Part 6 — Suggested order

1. **P0 #4 + #5 (with 5a)** — post-run verification, an honest `isRunning()`, the
   present-but-unhealthy drift class. Until start is verified, no other signal is
   trustworthy. 5a alone is roughly an hour and removes the worst gap.
2. **P0 #1 + #2** — graceful stop, metrics query fixes. Small and immediately correct.
3. **P0 #3** — `is_live` reconciliation; it silently disables two other safety mechanisms.
4. **5b + Icecast connection state** — together these make "on air" mean what it says.
5. **Part 2/3 leftovers** — sandbox flags, image pin, disk hygiene. One pass.
6. **5.1 loudness + cue metadata** — the biggest listener-facing quality jump, and the
   piece with real product value.
7. **5.2 `input.harbor`** — a feature decision, not hardening, but it is the largest gap
   against competitors and the plumbing already exists.

---

# Appendix A — validated reference template

This compiles clean against 2.4.0 (`--check`, exit 0, no warnings). It is a *reference*,
not a drop-in: the real one is a Blade template with `@json`-escaped values, and the
rendered-value stand-ins at the top become template variables. It demonstrates, in one
place, boot/shutdown push, silence notification, dual ingest, loudness, authenticated
status **and** control, Icecast connection tracking, HLS, hourly archiving, and Prometheus.

```liquidsoap
# --- rendered values stand-ins ---
slug = "jazz-247"; api_url = "http://api"; key = "secret"
ice_pw = "sourcepw"; harbor_port = 8080

settings.log.stdout.set(true)
settings.log.level.set(2)
settings.crossfade.assume_autocue := true
settings.prometheus.server := true
settings.prometheus.server.port := 9599

ice_up = ref(false)

def notify(event, extra) =
  ignore(http.post("#{api_url}/api/internal/station-event",
    data=json.stringify({ slug = slug, event = event, detail = extra }),
    headers=[("Content-Type","application/json"), ("X-Internal-Key", key)],
    timeout=5.))
end

on_start(fun () -> notify("boot", ""))
on_shutdown(fun () -> notify("shutdown", ""))

# --- inputs ---
whip_raw = buffer(buffer=2., max=10., input.ffmpeg("rtsp://host:8554/#{slug}/live"))
whip = blank.strip(max_blank=15., threshold=-40., whip_raw)

silence_watch = blank.detect(max_blank=15., threshold=-40., whip_raw)
silence_watch.on_blank(synchronous=false, fun () -> notify("live_silent", ""))
silence_watch.on_noise(synchronous=false, fun () -> notify("live_audio", ""))

enc = input.harbor("#{slug}", port=8000, password=ice_pw,
  on_connect=fun (_) -> notify("encoder_connected", ""),
  on_disconnect=fun () -> notify("encoder_disconnected", ""))

pl = playlist(id="playlist_m3u", "/data/playlists/playlist.m3u",
  mode="normal", reload_mode="never",
  on_fail=fun () -> begin log("no playable track") ; ([] : [string]) end)
autodj = normalize_track_gain(pl)      # NOTE: loses playlist methods — keep `pl` for /status

bed = mksafe(blank())

mixed = mksafe(fallback(track_sensitive=false, [whip, enc, autodj, bed]))
air = mksafe(crossfade(duration=2., mixed))

# --- control + status ---
def authorized(req) = req.headers["x-internal-key"] == key end

harbor.http.register(port=harbor_port, method="GET", "/status", fun (req, response) ->
  if not authorized(req) then response.status_code(403) ; response.data("no")
  else
    response.json({ ready = air.is_ready(), icecast = ice_up(),
                    source = if whip.is_ready() then "live" elsif enc.is_ready() then "encoder"
                             elsif pl.is_ready() then "autodj" else "silence" end,
                    playlist_length = pl.length() })
  end)

harbor.http.register(port=harbor_port, method="POST", "/control", fun (req, response) ->
  if not authorized(req) then response.status_code(403) ; response.data("no")
  else
    if req.query["title"] != "" then mixed.insert_metadata([("title", req.query["title"])]) end
    response.json({ out = server.execute(req.query["cmd"]) })
  end)

# --- outputs ---
o = output.icecast(%mp3(bitrate=128, samplerate=44100), host="icecast", port=8000,
      password=ice_pw, mount="/stream/#{slug}", encoding="UTF-8", air)
o.on_connect(synchronous=false, fun () -> begin ice_up := true ; notify("icecast_connected","") end)
o.on_disconnect(synchronous=false, fun () -> begin ice_up := false ; notify("icecast_disconnected","") end)
o.on_error(synchronous=false, fun (~restart_in, _) -> begin ice_up := false ; restart_in(5.) ; notify("icecast_error","") end)

output.file.hls("/data/hls", segment_duration=2., segments=5, segments_overhead=5,
  persist_at="/data/hls/state.json", playlist="playlist.m3u8",
  [("aac", %ffmpeg(format="mpegts", %audio(codec="aac", b="128k")))], air)

output.file(%mp3(bitrate=128), reopen_when=predicate.changes(fun () -> time.local().hour),
  on_close=fun (f) -> notify("archive_closed", f),
  "/data/hls/archive-%Y%m%d-%H.mp3", air)

lat = prometheus.latency(labels=["station"])
lat(label_values=[slug], air)
```

---

# Appendix B — verified facts and API gotchas

Against `gocast/liquidsoap:latest` = Liquidsoap **2.4.0**, ffmpeg 6.1.6 (has `ebur128` and
`silencedetect`). Image has `/bin/bash` but **no curl, wget, nc, python3**, and **no TTS
binaries**.

**Compiles:** `enable_autocue_metadata()`, `enable_lufs_track_gain_metadata()`,
`normalize_track_gain`, `enable_replaygain_metadata()`,
`settings.crossfade.assume_autocue`, `server.execute` in a harbor handler,
`settings.server.socket`, `request.queue`, `cron.add`, `on_start`, `on_shutdown`,
`input.harbor`, `output.file` with `reopen_when`/`on_close`, `predicate.changes`,
`source.insert_metadata`, `output.icecast(...).on_connect/.on_disconnect/.on_error`,
`prometheus.gauge` / `prometheus.latency`.

**Docs are wrong for 2.4.0:**

- `blank.detect(handler, ...)` — callbacks moved to methods: `b.on_blank(synchronous=false, ...)`
- `prometheus.latency(s)` — needs the two-stage labelled form
  `prometheus.latency(labels=[...])(label_values=[...], s)`
- `cross.smart` does not exist; `crossfade` has no `assume_autocue` argument — it is the
  global setting
- `playlist`'s `on_fail` must return a list of replacement URIs (`([] : [string])`)
- `insert_metadata` as a *function* is deprecated — use the source method

**Other traps:**

- `normalize_track_gain(pl)` loses the playlist's own methods (`length`, `remaining_files`,
  `reload`, `skip`). Keep the raw playlist in a variable.
- `out` and `encoder` are taken as top-level names — Liquidsoap warns "variable is
  overridden". Use `air` / `enc`.
- `!ref` is deprecated; use `ref()`.

**Settings confirmed via `--list-settings`:**
`settings.normalize_track_gain_metadata := "liq_normalize_track_gain"`,
`settings.autocue.internal.metadata_override := ["liq_cue_in","liq_cue_out","liq_fade_in","liq_fade_in_delay","liq_fade_out","liq_fade_out_delay","liq_disable_autocue"]`,
`settings.autocue.internal.lufs_target := -14.0`, `crossfade`'s `override_duration`
defaults to `"liq_cross_duration"`.

**Re-probe recipe** — mount the **file**, not its directory (the container runs as UID 100
and cannot traverse a host-owned scratch dir; it fails as a bogus `line 1: Syntax error`):

```sh
docker run --rm --entrypoint liquidsoap \
  -v "$PWD/x.liq:/s.liq:ro" gocast/liquidsoap:latest --check /s.liq

docker run --rm --entrypoint liquidsoap gocast/liquidsoap:latest -h <function>
docker run --rm --entrypoint liquidsoap gocast/liquidsoap:latest --list-settings | grep -i <feature>
docker run --rm --entrypoint liquidsoap gocast/liquidsoap:latest --list-functions
```

Related: `station-lifecycle` artifact (the lifecycle reference this hardens),
`stations-api-reference.md`.
