# Free-plan relay — plan

Status: PLAN, 2026-10-29, branch `relay-service`. Nothing built in this repo.
The design was proved end to end in a throwaway lab outside the repo
(`~/Desktop/personal/gocast-relay-lab`, results in its `RESULTS.md`): Icecast
checks, relay unit tests, three browsers, failure drills, load, a 1 h soak.
This plan includes everything the lab changed; those spots are marked
**(lab)**.

## 0. Why

Every live Free show runs its own Liquidsoap container that decodes the
browser's MP3, re-encodes it to MP3 128k for Icecast and AAC 128k for HLS, and
holds ~85 MB (400 MB at boot) for the whole show. On 2026-10-29 that was 11 of
51 running containers, peaking around 25. Free has no AutoDJ, so the container
does nothing for a Free show except re-encode audio the browser already
encoded.

The relay replaces the container **for Free only**: browser → relay → Icecast,
bytes untouched. Pro keeps the container path exactly as it is.

What Free gives up, accepted on 2026-10-29:

- **HLS.** Free listeners play the Icecast MP3 directly (`icecast.gocast.fm`,
  behind Cloudflare).
- **The watermark.** It is already off and is due to be removed system-wide.
- **Harbor's 5 s jitter buffer.** A stall over Icecast's `source-timeout`
  drops to the silence fallback (§3.4).
- **Steady 128k.** Liquidsoap re-encodes to a constant 128k; on the relay
  listeners get the studio's bitrate as sent. When the studio steps down
  mid-show (128 → 96 → 64), listeners hear ~3–4 s of glitchy audio, then it
  plays cleanly **(lab, 0.9)**. Kept on purpose (decision, §8).

What Free gains:

- No container, so there is no boot wait or 400 MB spike, and Docker trouble
  can't take a Free show off air.
- Listeners hear the DJ about 2–5 s behind instead of 16–20 s.

## 1. The flow

```
studio ──wss (webcast)──▶ Cloudflare ─▶ nginx ─▶ relay@1 / relay@2 ──PUT /stream/{slug}──▶ Icecast 2.5
                                                                                        │
                       Laravel ◀── role url (client_add): "may slug:token publish here?" ┤
                       Laravel ◀── event url: source-connect / source-disconnect ────────┘
listener ──GET icecast.gocast.fm/stream/{slug}──▶ Cloudflare ─▶ nginx ─▶ Icecast
```

**Going live**

1. `POST /stations/{slug}/start`. For a station that resolves to the relay
   path (§4.1), this sets `desired_state=running`, `started_at` and
   `ingest_path=relay`, and starts no container.
2. `POST /auth/broadcast-token` returns the token as today. `ingest_url` is
   the relay URL instead of the container's.
3. The studio opens the WebSocket with the same `webcast` hello it sends
   today: `{type:'hello', data:{mime, user: slug, password: token}}`.
4. The relay checks the slug format, opens TCP to Icecast and writes
   `PUT /stream/{slug}` with `Authorization: Basic slug:token` and
   **`Expect: 100-continue`** **(lab)**: Icecast 2.5 sends nothing back on an
   accepted `PUT` without it, so a relay waiting for an answer would hang.
5. Icecast asks Laravel (`client_add`). Laravel checks the token against the
   slug, the mount against `stations.icecast_mount`, and that the station is
   on the relay path. It answers with the auth header or a refusal.
   Icecast makes these calls **one at a time** **(lab)**, so this endpoint
   must be lean (§4.2).
6. On Icecast's `100 Continue`, the relay sends the studio `{type:'ok'}`, and
   the studio shows "live". On a refusal the relay closes with `4001`, which
   the studio already shows as "rejected".
7. Icecast fires `source-connect`, and Laravel opens the StreamSession using
   the same code path as today's `live_connected`.

**During the show**

- Audio: binary frames are copied to the Icecast socket and nothing else.
- Now playing: in relay mode the studio POSTs the title to Laravel over HTTP,
  not over the socket. Laravel writes `metadata:{id}` (as `NowPlayingController`
  does) and calls Icecast's admin `metadata` endpoint.
- Listener counts: `SyncListenerCounts` already polls Icecast by
  `icecast_mount` and needs no change.

**Ending, or a blip**

- The socket closes → the relay closes the Icecast socket → `source-disconnect`
  → Laravel closes the session (same as today's `live_disconnected`). Icecast
  moves listeners to the shared `/standby` silence stream (§3.4).
- A reconnect inside the studio's 120 s budget opens a new session, as it
  does today. Listeners go back to the show (`fallback-override own`). A
  reconnect can briefly get `4009` because the dead connection still holds
  the mount until the relay's idle timeout notices; the studio retries it on
  a reconnect **(lab)**, see §5.
- Listeners stay on silence **forever** once a show ends **(lab, 0.7)**, so
  the player stops itself when the station goes off (§4.5).
- Nobody back within 150 s → `stations:sweep` turns the station off
  (§4.4).

## 2. The relay

Go, one static binary, top-level `relay/` directory (the old Node relay lived
there). **It never calls Laravel.** The lab's `relay/` package (~300 lines,
unit tests, fuzz test) and `cmd/relay` are the starting code; they're
copied in, not rewritten. Only dependency: `github.com/coder/websocket`.

It does this and nothing more:

1. Accepts WebSocket upgrades with subprotocol `webcast`, from allowed
   origins only.
2. Reads one text frame within 10 s: the hello. It requires
   `mime=audio/mpeg`, `user` matching `^[a-z0-9-]{1,64}$`, and a `password`
   of at most 512 bytes. Anything else closes with `4002`.
3. Dials Icecast (config: host:port, mount prefix `/stream/`). It writes the
   `PUT` request **itself** (with `Expect: 100-continue`), so a browser can
   never send arbitrary HTTP to Icecast. It waits up to 10 s for the
   response; `100` (or `200`) means accepted.
   - Icecast 401/403 → close `4001`.
   - Mount in use → close `4009`.
   - Icecast unreachable → close `1011`.
4. Sends `{type:'ok'}`, then copies binary frames to Icecast.
   - Text frames after the hello are ignored.
   - Each Icecast write has a 5 s deadline. If it's missed, both sides close
     (no unbounded buffering).
   - A 15 s read-idle timeout closes both sides. The studio sends frames even
     when quiet, so silence means a dead client.
   - Max message size is 64 KB.
5. When either side closes, both close. Icecast ending the source (e.g.
   `killsource`) closes the studio with `4005`.
6. On localhost only: `/healthz` and `/metrics` (Prometheus text: active
   connections, total, bytes in, closes by reason).
7. **Deploy = rolling restart** **(lab)**. On SIGTERM a unit stops accepting,
   closes every studio with `1001` and exits; the studios reconnect at once
   and nginx sends them to the other unit. Deploys restart `@1`, wait ~10 s,
   then `@2`. Lab: the show was back 45–173 ms after each close and the
   listener heard ≤ 2 s of silence over the whole deploy, with 300 other
   studios live. (`cloudflare/tableflip` socket handover was tried and
   dropped: it can't start a second reload while the previous old process
   still holds hours-long shows, and systemd lost track of the handed-over
   process.)
8. **Crash isolation.** Two units (`gocast-relay@1`, `gocast-relay@2`) run
   behind an nginx `least_conn` upstream. A crash drops that unit's
   broadcasters; lab: back on the other unit in 23–127 ms with no audible gap,
   and a 500-studio storm all back on air (p50 6 s, max 18 s at a 20 ms auth).
9. systemd `Type=simple`, `Restart=always`, **no pid file** **(lab)**: a pid
   file let a failed second start overwrite the running unit's pid, so the
   next restart stopped nothing.

## 3. Icecast 2.5.0 config

Checked against the 2.5.0 source (`auth_url.c`, `cfgfile.c`, `source.c`) on
2026-10-29. The bundled manual still shows the 2.4 syntax, so trust the code.

1. **Source auth.** A `<role type="url">` limited to source methods, with
   `client_add` → `http://127.0.0.1:8081/api/internal/icecast/auth`. Icecast's
   URL options only support Basic auth (`username`/`password`), not
   `X-Internal-Key`, so the internal endpoints accept a dedicated Basic
   credential.
2. **Liquidsoap must still get in.** Pro containers publish with the global
   `source-password`. A static-password role (`match-method source,put`)
   goes **first**, then the url role, then anonymous for `get,head,options`.
   Verified in the lab: Liquidsoap's login never calls Laravel, a wrong
   Liquidsoap password is refused without calling it, and a Free token on
   another station's mount is refused.
3. **Events.** `<event type="url">` for `source-connect` and
   `source-disconnect` → `/api/internal/icecast/event`. The POST carries
   `action`, `mount` and `ip`.
4. **Silence fallback** **(lab: changed)**. On `<mount type="default">`:
   `fallback-mount=/standby` and `fallback-override=own`. `own` is 2.5-only
   and essential: it sends a listener back only to the mount they came from,
   never to whichever station reconnects first (lab 0.6). This also applies
   to Pro's Icecast listeners during a container restart.
   `/standby` is a **live mount fed by one paced process**, not a file: a
   `gocast-standby` systemd unit runs
   `ffmpeg -re -stream_loop -1 -i silence.mp3 -c copy -f mp3 icecast://source:…@127.0.0.1:8000/standby`
   (no encoding, negligible CPU). A file fallback failed twice in the lab:
   Icecast only starts a fallback file for mounts declared by name (Free
   mounts are created on the fly), and it serves the file unpaced, so
   browsers buffer minutes of silence and come back late.
   `silence.mp3` is 44.1 kHz stereo 128k, matching the studio.
5. Raise `<sources>` (Free peak + Pro + headroom, starting at 500) and
   icecast2's `LimitNOFILE` (65536). Keep `burst-size` 16384 (lab: 64 KB made
   no difference).
6. The public `gocast-icecast` vhost passes **GET/HEAD only**. Sources reach
   Icecast on loopback from the relay and from containers.

## 4. Laravel

### 4.1 Which path a station uses
- New column `stations.ingest_path` enum(`container`,`relay`), nullable. It
  is set at `start()` and cleared at `stop()`. **The path is decided once, at
  start, and doesn't change mid-show.** An upgrade or downgrade takes effect
  at the next start.
- `Station::resolveIngestPath()`: `relay` when the owner's plan is Free and
  `config('relay.enabled')` is on and the station passes `relay.rollout`
  (`all`, or an allowlist of slugs). Otherwise `container`.
- `Station::usesRelay()` reads the stored column.

### 4.2 Endpoints (internal server :8081, Basic auth)
- `POST /internal/icecast/auth` (`client_add`). Allowed only when all of these
  hold:
  - the user is a station slug
  - `BroadcastTokenService::verify(token, slug)` passes
  - the requested mount equals `icecast_mount`
  - the station `usesRelay()` and is `running`

  Returns the success header (`icecast-auth-user: 1`) or
  `icecast-auth-message`, and fails closed. Refusals are counted in
  `IngestMetrics`, as `HarborAuthController` does.
  **Must be lean (lab):** HMAC check plus one indexed query, no other I/O.
  Icecast calls it one login at a time (curl timeout 15 s), so after a relay
  crash the time to get every studio back scales with this answer time:
  500 studios took max 18 s at 20 ms per answer, 35 s at 50 ms.
- `POST /internal/icecast/event`: maps the mount to a station.
  `source-connect` → `openSession()`, `source-disconnect` → `closeSessions()`.
  Both are reused from `StationEventController` (extracted into a service,
  not copied). Mounts belonging to container stations are ignored, because
  their sessions come from the container.
- `POST /stations/{slug}/now-playing` (user auth, owner only, relay stations
  only): writes `metadata:{id}` and calls Icecast admin `metadata`.

### 4.3 Start, stop, token
- `StationLifecycleService::start()`: the relay path skips
  `supervisor->up()`.
- `stop()`: the relay path calls Icecast admin `killsource` on the mount (so
  "Turn station off" and admin stop really cut the broadcaster) instead of
  `supervisor->down()`.
- `LiquidsoapSupervisor::ingestUrl()` caller: `BroadcastTokenController`
  returns `config('relay.ingest_url')` for relay stations.

### 4.4 Status, sweep, reconcile
Today all three read the container. Without a relay branch, a Free station
would never report `ready`, never be swept, and **`ReconcileStations` would
recreate a container for it every minute**.

- `StationStatusService` builds a relay station's status from the DB and
  Redis, with no HTTP call:
  - `ready=true` while running
  - `source='live'` if a session is open
  - `broadcaster` from that session
  - `now_playing` from `metadata:{id}`
  - `icecast=true`
- `StationAudioPolicy`: relay stations get their own short verdict:
  - stop when the latest session ended more than `studio_gone_stop_seconds`
    (150) ago
  - stop when the station was started more than 5 min ago and no session
    ever opened

  No `Unreachable` no-op.
- `ReconcileStations`: relay stations are excluded from MISSING, outdated and
  recreate. Stranded sessions (an open session but no source on the mount in
  Icecast's stats) get the same 3-strike close.

### 4.5 Listener side
- `StationResource::hls_url` is null when the station resolves to the relay
  path. The player then takes its existing Icecast path
  (`useStreamPlayback.ts:180`, `PlayerView.tsx:414`). Analytics already split
  by `transport`.
- `LiveBanner` copy ("about 15–20 seconds") becomes path-aware. Help and
  feature docs that quote the delay are updated too.
- **The player stops itself when a relay station goes off** **(lab, 0.7)**.
  Icecast keeps listeners on `/standby` silence indefinitely, so the player
  page must stop playback (and show the off-air state) when the station's
  status says it's off, instead of relying on the stream ending.
- No "reload on underrun" in the player **(lab)**: tried for the bitrate
  glitch and rejected, it looped because browsers report `waiting` for 4–9 s
  on every normal start.

## 5. Client
- In relay mode `openSocket()` waits for `{type:'ok'}` (5 s) instead of the
  600 ms "survived the grace" guess. Close codes map as above. `4009` maps to
  the existing "already live" message **on a first go-live only**; inside the
  reconnect loop `4009` is retried like any other failure **(lab)**, because
  it's usually our own dead connection still holding the mount. `4001` and
  `4002` stay final.
- In-show bitrate step-down stays as it is (decision, §8).
- Known: the reconnect loop's last try can land up to ~18 s after the 120 s
  budget (it checks the deadline before waiting). Same as today; harmless.
- `sendMetadata()` POSTs to `/stations/{slug}/now-playing` in relay mode. The
  re-send after a reconnect (`broadcast.ts:1243`) goes through the same
  function.
- `ensureStationOnAir()` needs no change if the relay status reports
  `ready=true` immediately (§4.4).
- The relay mode flag comes from the token response (`ingest: 'relay'`), so
  the client never decides the path itself.

## 6. Testing — every part has a pass/fail gate

Nothing moves to the next phase until its gate passes. Results go in §9.

**Lab status:** Phases 0, 1, 4 and 5 passed in the lab against the lab's
fake Laravel; Phase 3 passed with a test studio built from GoCast's real
encoder files in Chromium, Firefox and WebKit. In the repo they're re-run
against real Laravel and the real studio; Phases 2, 6 and 7 are new.

### Phase 0 — Icecast 2.5.0 spike (before any product code) — PASSED in the lab
Local Icecast at prod's exact version (2.5.0, same distro package), a stub
auth/event server and a test MP3. Each check is scripted in
`relay/spike/`:

| # | Check | Pass when |
|---|---|---|
| 0.1 | `PUT` source with `slug:token`, url role admits | 200, audio playable |
| 0.2 | Same with a wrong token | refused, `Icecast-Auth-Message` logged |
| 0.3 | Liquidsoap-style source with the global password, url role present | admitted (stack fall-through works) |
| 0.4 | Events fire on connect/disconnect with Basic auth | both POSTs arrive with mount + ip |
| 0.5 | Silence fallback on a mount created on the fly (no `<mount>` block for it) | listener moves to silence, returns on reconnect |
| 0.6 | Two stations drop at once, one comes back | only its own listeners return (`own`) |
| 0.7 | Does the fallback file loop or end? | answer recorded; if it ends, its length is the cap on how long a listener waits |
| 0.8 | Sample-rate switch 48 kHz show ↔ 44.1 kHz silence | plays in Chrome, Firefox, Safari (macOS + iOS), VLC; else force the relay studio to 44.1 kHz |
| 0.9 | Bitrate step-down 128 → 96 → 64 mid-stream | same players keep playing |
| 0.10 | Admin `killsource` and `metadata` with our credentials | work |
| 0.11 | `PUT` via the public vhost | rejected by nginx |

If any check fails, the plan is revised before Phase 1.

Lab answers: all pass. 0.5 only with the paced `/standby` feeder (§3.4);
0.7 loops forever, so the player stops itself (§4.5); 0.8 N/A, the studio is
pinned to 44.1 kHz stereo; 0.9 recovers in every browser after ~3–4 s of
glitch.

### Phase 1 — relay unit tests (`go test -race ./...`)
- hello parsing, including a fuzz test of the parser
- slug/mount validation
- exact `PUT` bytes
- each Icecast response → each close code
- close propagation both ways
- write deadline, idle timeout, oversize message
- metrics counters
- drain on SIGTERM closes everyone with `1001`
- (all present in the lab's `relay_test.go`; 4.45 M fuzz inputs clean)

### Phase 2 — Laravel (Pest, targeted files only)
- `resolveIngestPath` rules
- auth endpoint: every refusal case, including a Pro station, a stopped
  station, wrong mount, expired token, token for another slug, Basic auth
  missing
- event endpoint opens and closes sessions, ignores container mounts
- start/stop on the relay path: no supervisor calls; `killsource` sent
- status payload for relay stations
- sweep verdicts
- reconcile excludes relay stations, and stranded sessions are closed
- `hls_url` null rule
- now-playing endpoint auth
- token response carries `ingest: 'relay'`
- Existing tests that must stay green: `StationLifecycleServiceTest`,
  `StationSweepTest`, `ReconcileStationsTest`, `StationStatusTest`,
  `HarborAuthTest`, `StationHlsUrlTest`, `BroadcastTokenControllerTest`.

### Phase 3 — end to end, local
Local Icecast 2.5.0 with the real config, both relay units, nginx, Laravel,
and a new Playwright spec `free-relay.spec.ts` with a fake mic and a Free
account. Each step passes or fails on its own:

1. Go live → "live" shown, a session opens, no container exists (`docker ps`).
2. A listener (ffmpeg on the mount) receives non-silent audio.
3. Track change → now-playing appears on the player page.
4. End show → session closed, station off within 150 s, and the player
   stops itself (see 0.7).
5. Pro account in the same run → still on the container path, HLS working.
6. Bitrate step-down mid-show → listener playing again within 15 s.
7. Studio network drop and return → listener back on the show.

Run every browser test with the audio sent to a silent sink
(`PULSE_SINK=<null sink>`): the tones otherwise play through the machine's
speakers.

### Phase 4 — failure drills (scripted, against Phase 3's stack)
| Drill | Pass when |
|---|---|
| `kill -9` one relay unit mid-show | studio reconnects < 10 s; listener stays connected (silence → show) |
| Rolling restart of both units, 10 s apart, with 300 other studios live | show back each time; listener ≤ 2 s silence; all studios back |
| Icecast `SIGHUP` reload | zero drops |
| Studio network cut 30 s | same show resumes, listeners return |
| Studio network cut 170 s (past the budget and its last try) | show ends cleanly, station off |
| Station turned off mid-show | studio cut (`4005`), reconnect refused (`4001`) |
| Laravel answering in 3 s | still goes live |
| Second tab goes live | refused with "already live"; first tab unaffected |
| Laravel down at connect | refused (fails closed) |
| Laravel down mid-show | audio continues |
| Relay down entirely | Pro unaffected |

### Phase 5 — load and soak
- `relay/cmd/loadgen`: N WebSocket broadcasters each sending a real MP3 at
  real-time rate, plus M listeners.
- Runs at 500, 1,000 and 2,000 broadcasters.
- Pass:
  - relay < 1 core and < 300 MB at 2,000
  - Icecast CPU recorded, with headroom
  - auth p95 < 200 ms
- Reconnect storm: kill a unit carrying 1,000. Pass: all back within 30 s,
  and Laravel isn't saturated.
- Soak: 50 streams for 24 h. Pass: relay and Icecast memory flat.
- Lab numbers (laptop, one core = 100 %): 2,000 studios + 2,000 listeners →
  each relay unit 44 %, 84 MB; Icecast 58 %, 239 MB; 0 drops; go-live p50
  1.2 s. 1 h soak at 50 + 100: flat. The lab's `loadgen` comes along.

### Phase 6 — staging, through Cloudflare
- Deploy with the real `deploy-native.sh` changes, then re-run Phase 3 and
  the Phase 4 drills against staging.
- Plus the Cloudflare checks:
  - a WebSocket held over 2 h
  - a listener stream held over 2 h
  - the studio on a phone on cellular

### Phase 7 — production rollout
- Set `relay.rollout` = a handful of slugs (test accounts first), then 25% of
  Free starts, then `all`. Watch relay metrics, Icecast sources and container
  count at each step.
- **Rollback:** `RELAY_ENABLED=false`, and the next start uses containers. No
  redeploy needed. Shows already live on the relay finish where they are.

## 7. Deploy kit changes
- `relay/` builds a static binary (`CGO_ENABLED=0`). `deploy-native.sh`
  copies it and, only when the binary changed, restarts `gocast-relay@1`,
  waits ~10 s and checks `/healthz`, then restarts `@2`. Never both at once;
  not part of the generic `WORKER_UNITS` restart.
- `infra/native/systemd/gocast-relay@.service` (port by instance,
  `Type=simple`, `Restart=always`, no pid file, `LimitNOFILE=65536`).
- `infra/native/systemd/gocast-standby.service`: the paced `/standby`
  feeder (§3.4), `Restart=always`.
- `setup-native.sh`: an nginx vhost `gocast-relay` for `relay.gocast.fm`
  with the upstream to both units (`least_conn`, `max_fails=1
  fail_timeout=2s`, `proxy_read_timeout 6h`), `worker_rlimit_nofile` raised
  (each studio holds two sockets in nginx; the default 1,024 capped the lab
  at ~1,000 studios), and the Icecast template changes from §3.
- `infra/native/icecast/silence.mp3` (44.1 kHz stereo 128k) for the
  standby feeder.
- Env: `RELAY_ENABLED`, `RELAY_ROLLOUT`, `RELAY_INGEST_URL`, plus the Icecast
  callback Basic credential on both sides.
- DNS: `relay.gocast.fm`, proxied through Cloudflare.
- A separate host keeps the relay movable to another box later.

## 8. Decisions

Each is my recommendation; change any of them:

- **Bitrate step-down on the relay path:** keep it (decided 2026-10-29,
  option A). A weak uplink costs listeners ~3–4 s of glitch once, instead of
  a fixed 128k falling behind and dropping the show repeatedly.
- **Reconnect window:** keep 150 s, same as today.
- **Free 100-listener cap:** not enforced in v1. It isn't enforced today
  either. It can be added later via `listener_add`.
- **Cutover:** Free shows live at switch-on finish on their container. The
  path applies from the next start.
- **Staging:** I need to know how staging is deployed and how I reach it
  before Phase 6.

## 9. Results log

(filled in as each gate passes or fails)

- 2026-10-29, lab: Phases 0, 1, 3 (3 browsers), 4, 5 and a 1 h soak all
  passed. Full table in the lab's `RESULTS.md`. Not proven there: Cloudflare
  in front (Phase 6), a real iPhone, production CPU numbers.
