---
feature: Broadcasting from the web studio
verified: 2026-10-04 against e145a37 plus uncommitted work (feat/design-system)
sources:
  - api/routes/api.php
  - api/app/Http/Controllers/BroadcastTokenController.php
  - api/app/Services/BroadcastTokenService.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Controllers/StreamKeyController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Console/Commands/ReconcileStations.php
  - api/app/Services/BroadcastStateService.php
  - api/app/Models/StreamSession.php
  - api/app/Console/Commands/SweepListenerSessions.php
  - api/app/Jobs/SendStationLiveNotifications.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Models/Station.php
  - api/resources/views/liquidsoap/station.blade.php
  - api/config/liquidsoap.php
  - api/database/migrations/2026_04_03_193412_create_stream_sessions_table.php
  - api/database/migrations/2026_09_15_140200_add_client_to_stream_sessions_table.php
  - infra/native/nginx/gocast-stream.conf
  - client/lib/broadcast.ts
  - client/lib/uplinkProbe.ts
  - api/app/Http/Controllers/UplinkProbeController.php
  - api/app/Http/Controllers/UplinkCheckController.php
  - client/lib/audioEngine.ts
  - client/lib/micPrefs.ts
  - client/lib/queueStore.ts
  - client/lib/useEngine.ts
  - client/lib/useAudioLevels.ts
  - client/public/pcm-worklet.js
  - client/public/encoder-worker.js
  - client/contexts/BroadcastContext.tsx
  - client/contexts/AccountContext.tsx
  - client/hooks/useBroadcastStats.ts
  - client/hooks/useTrackProgress.ts
  - client/hooks/usePublicStationStats.ts
  - client/app/dashboard/layout.tsx
  - client/app/dashboard/error.tsx
  - client/app/dashboard/broadcasts/page.tsx
  - client/app/dashboard/stations/[slug]/live/page.tsx
  - client/app/dashboard/stations/[slug]/live/layout.tsx
  - client/app/dashboard/stations/[slug]/studio/page.tsx
  - client/app/dashboard/stations/[slug]/studio/layout.tsx
  - client/components/studio/EndBroadcast.tsx
  - client/components/studio/FileQueue.tsx
  - client/components/studio/MicMeter.tsx
  - client/components/studio/MicSettings.tsx
  - client/components/studio/PushToTalk.tsx
  - client/components/studio/signal.ts
  - client/components/dashboard/EncoderConnection.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/interfaces/StreamSession.ts
  - api/tests/Feature/HarborAuthTest.php
  - api/tests/Feature/BroadcastTokenControllerTest.php
  - api/tests/Feature/BroadcastTokenServiceTest.php
  - api/tests/Feature/EncoderSessionAttributionTest.php
  - client/app/dashboard/stations/[slug]/studio/wrap/page.tsx
  - client/components/dashboard/golive/CheckList.tsx
  - client/components/dashboard/golive/MicCheckCard.tsx
  - client/components/dashboard/golive/RunningOrderCard.tsx
  - client/hooks/useMicPreview.ts
  - client/hooks/usePreflightQueue.ts
  - client/lib/preflightQueue.ts
  - client/lib/mic.ts
  - client/components/studio/NowPlaying.tsx
  - client/components/studio/StudioControls.tsx
  - client/components/studio/StudioStats.tsx
  - client/components/studio/ShortcutsDialog.tsx
  - client/components/ds/StatusBand.tsx
  - client/components/dashboard/shell/StationBand.tsx
  - client/lib/airState.ts
  - client/components/dashboard/overview/YourLinkCard.tsx
fingerprint: 6b2cfc51889bb884
---

# Broadcasting from the web studio

A station owner goes on air from a browser tab. The tab captures the microphone and a queue of local audio files, mixes them in the Web Audio API, encodes the mix to MP3 in a Web Worker, and sends the frames over one WebSocket straight into the station's own Liquidsoap container (`input.harbor`, "webcast" protocol). There is no server-side studio: **the whole broadcast lives in the browser tab**, in a React context (`BroadcastProvider`) mounted once for the entire dashboard. Close the tab and the show ends.

The one thing people get wrong: **the API never sees the audio and never opens the studio's session.** The API's only jobs are to mint a 60-second token, hand out the WebSocket address, and start the station container. The "live" state, the `StreamSession` row, the Your shows entry and the airtime all come from Liquidsoap's `live_connected` / `live_disconnected` callbacks. `POST /stations/{slug}/sessions` exists and is tested, but **nothing in this repository calls it** (see Gaps).

Encoders (BUTT, Mixxx) reach the same harbor mount by a different path and credential. That is [encoder-ingest.md](encoder-ingest.md). The station container itself is in [liquidsoap-station-script.md](liquidsoap-station-script.md); power on/off and the sweep are in [station-lifecycle.md](station-lifecycle.md). The mobile app reuses the same token endpoint from its own manager ([mobile-studio-and-encoder.md](mobile-studio-and-encoder.md)); this doc covers the web client only.

## The flow, end to end

1. **Entry.** "Go live" anywhere (the overview hero, the status band, the sidebar's Studio item while idle, the phone tab bar) goes straight to `/dashboard/stations/{slug}/live`. There is no picker any more; an encoder just connects with the Station settings values ([encoder-ingest.md](encoder-ingest.md)). The sidebar "Studio" item points at `/live` when idle and `/studio` while this tab broadcasts.
2. **Pre-flight** (`live/page.tsx`, "Ready when you are."): what goes out, the mic check and the running order, all with nothing going out.
3. **One press**: "Go live on {station}" runs the checks (`BroadcastManager.start`: `network`, `station`, `mic`, `engine`; `mic` omitted for music-only) on screen as a checklist, the state reaches `ready`, and the page immediately calls `goLive()` (an effect keyed on `ready` after the press). There is no separate "Go live now" step.
4. **Live**: `goLive()` connects; the state becomes `live` and the page `router.replace`s to `/studio`.
5. **Studio** (`studio/page.tsx`): talk pad and controls on the left; now playing, the show's numbers, running order, your link and End show on the right. Live state is the status band's.
6. **End** (`EndBroadcastButton`, "End show"): confirm, summary written to `sessionStorage`, socket closed, station optionally released, `router.replace` to `/studio/wrap`.
7. **That's a wrap** (`studio/wrap/page.tsx`): the show's numbers once, then back to the station.

### 1. Pre-flight (`client/app/dashboard/stations/[slug]/live/page.tsx`)

- Fetches `GET /stations/{slug}` (failure: `router.push("/dashboard")`) and, best-effort and once, `GET /stations/{slug}/status` for `live_source`, used only to explain a refusal.
- If `station.is_live && state === "idle"` and nothing was pressed, it shows "{station} is already live" with a `Notice` instead: encoder wording when `live_source.type === "external"` (names `live_source.client`: "… is broadcasting to this station. Only one source can be on at a time, so disconnect it there first."), otherwise "Someone is live from another browser or computer…". Actions: "Hear your stream ↗", "Back to station". `is_live` is the API's derived flag (see below).
- **What goes out** (`ds/ChoiceCards`): *Mic + music* or *Music only*. Stored per station in `localStorage["broadcast:micDisabled:{slug}"]`, read on first render. Music-only never calls `getUserMedia`.
- **Your microphone** (`golive/MicCheckCard`, mic mode only; `hooks/useMicPreview.ts`): "Check your mic" opens the mic (straight away if the browser has already granted it), shows `MicMeter` drawn grey (nothing is going out), and, with more than one input, a `ds/Select` of devices (`enumerateDevices()` audio inputs minus Windows' `communications` duplicate). The choice is saved (`lib/mic.ts`, `localStorage["broadcast:micDeviceId"]`, per browser) and the go-live checks open the same device; the preview is released before they run. Blocked: "This browser isn't allowed to use your microphone…" with "Go live with music only"; none: "No microphone found…". This is the only place the mic can be changed: there is no mid-show switch.
- **Your running order** (`golive/RunningOrderCard`, `hooks/usePreflightQueue.ts`, `lib/preflightQueue.ts`): the saved queue from IndexedDB, edited before any engine exists: Remove per track, "+ Add files" and drag-and-drop (files past the 2 GiB cap are skipped, `fitFiles`), "Clear" (confirm "Clear your running order?"). When the last show stopped part-way through a song: "Pick up where you stopped" / "Start over" (`resumeFromStart`, `localStorage["broadcast:resumeFromStart"]`, global). Removing a song keeps the playback record pointing at the same song. With tracks in the list, the action row shows how much of the cap they use ("X of 2.0 GB", `formatBytes` against `QUEUE_BYTE_LIMIT`). Storage blocked (private mode): "This browser won't let GoCast keep files…".
- Title line: "AutoDJ hands over when you start, and takes back when you end." when AutoDJ is audible (`is_on_air && !is_live`), else "Nothing goes out until you press the button."
- **Go live on {station}** (xl primary button with a red dot), "Listeners tune in at {player url}" followed by a "Copy" button (copies the owner-tagged link, `taggedStationUrl(…, "owner")`, through `copyText`; on failure a toast gives the link), and "Not now" (back to the overview).
- **After the press** the page shows "Going live on {station}…" and `golive/CheckList` (tick, spinner, amber failure, circle for what's to come) with a Cancel. `start(slug, { skipMic, resumeFromStart })` runs; at `ready` the page calls `goLive()` once; at `live` it replaces itself with `/studio`. Leaving the page (or Cancel) while `ready` or `connecting` calls `stop()`, so the mic isn't held open on other pages; a container `/start` already brought up is left to the sweep.
- **Errors:** "Couldn't go live." with a `Notice` saying why and "Nobody heard anything." Mic denied/not found (`isMicError`): "Go live with music only" or "Try again". Other errors: "Try again" / "Back", and a link to `/help/go-live-from-your-browser`.

### 2. `BroadcastManager.start` (`client/lib/broadcast.ts`)

Order matters and is deliberate:

1. `assertBroadcastSupported`: throws if `!window.isSecureContext` ("Broadcasting needs https:// or localhost") or, when not music-only, `navigator.mediaDevices` is absent. Runs before any side effect so a container is never started for an impossible broadcast.
2. **Step `network`** ("Checking your connection", `client/lib/uplinkProbe.ts`): sends an untimed empty `POST /broadcast/uplink-probe` to warm the connection (DNS, TCP/TLS), times a second empty one (round trip + server work), then times a 96 KB random body: three requests per check; upload kbps = bits ÷ (big − empty) ms, the difference floored at 1 ms. Timeout `PROBE_TIMEOUT_MS` = 10 s, which itself counts as a measurement (≈79 kbps). Tier = the best of `BITRATE_TIERS` [128, 96, 64] with `kbps ≥ tier × 1.5` (`HEADROOM`): ≥192 → 128, ≥144 → 96, ≥96 → 64. Below `MIN_UPLINK_KBPS` (96) the step fails with "Your connection is too slow to broadcast: it uploads about N kbps, and a show needs at least 96…" and nothing else runs, so no container starts; Try again re-probes. A lowered tier relabels the done step "Slow connection: sending at N kbps to keep up". A probe that fails for any other reason (network error, 5xx, an empty request timing out) fails the step with "Couldn't check your connection. Make sure you're online, then try again." and nothing else runs; no bitrate is guessed. Every check's verdict is reported fire-and-forget (`reportUplinkCheck` → `POST /stations/{slug}/uplink-checks`) as an `uplink_check` station event: `outcome` ok / lowered / blocked / failed, `kbps`, `bitrate`, and the browser's Network Information guess (`net_type`, `net_effective`, `net_downlink`, `net_rtt`) to compare against. Those rows are the only trace of a refused go-live, and what the thresholds should be tuned from. A `failed` report goes over the same broken line, so it often doesn't arrive.
3. **Step `station`** `ensureStationOnAir` (up to `STATION_READY_TIMEOUT_MS` = 20 s): `POST /stations/{slug}/start` (idempotent; an already-healthy running station is left alone), then polls `GET /stations/{slug}/status` every `STATION_READY_POLL_MS` = 1 s until `data.ready`. 422/403 from `/start` is shown verbatim (plan limit `station_limit_reached`, ownership); 429 becomes "Too many tries in a row. Wait a minute, then try again."; anything else becomes "Could not bring the station on air — please try again". **A timeout is not an error**: it proceeds to publish anyway, on the theory that harbor accepts the connection when it starts listening.
4. **Step `mic`**: `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } })`. All three processing flags are off on purpose (they damage music that shares the mixer).
5. **Step `engine`**: `AudioEngine.create(micStream, onChunk, slug, bitrate)`, `engine.resume()` (inside the user gesture), subscribe to the engine to push metadata, then `restoreQueue()`. Encoded chunks go to the socket only while `ws.readyState === OPEN` **and** the socket's unsent backlog is under `BACKLOG_CAP_MS` = 4 s of audio; otherwise they are dropped and counted as lost (never buffered, so a reconnect or a slow line does not replay stale audio into a live show).
6. **Connect** (`connectWebcast`, not shown as a step; a failure here marks no step; the "Couldn't go live." notice carries the reason): mint a token (`POST /auth/broadcast-token {station_slug}`; 403 becomes "You do not own this station", any other failure becomes "Not signed in — please sign in and try again"), require a non-empty `ingest_url`, then `openSocket`.
Steps 2–5 are `start()` and end in state `ready`. Step 6 onward is `goLive()`, which the go-live page calls the moment `ready` is reached after the press. It first does the following silently (`quietSteps`: the step list on screen is not updated; only a failure is shown, on the step that failed):

- resumes the audio context (inside the Start click);
- if the checklist finished more than `READY_STALE_MS` (3 min) ago, or a mic track has `readyState === 'ended'`, destroys the engine and mic and runs steps 2–5 again (with the one-press flow, `ready` is never left waiting, so in practice only the ended-track case can trigger this);
- otherwise re-runs only the `station` step, **unless** the station was confirmed on air within `STATION_FRESH_MS` (30 s; `stationCheckedAt`, set when `ensureStationOnAir` sees `ready` or gives up waiting). With the one-press flow Start follows the checks within a second, so in practice there is no second `POST /start`. When it does run, `POST /start` is idempotent, so a running station costs one request.

7. After the socket is accepted: `resumePlayback({ fromStart })` (not awaited), acquire the screen wake lock, watch tab visibility, state becomes `live`.

`openSocket` details: `new WebSocket(ingest_url, "webcast")`, `binaryType = "arraybuffer"`, connect timeout `SOCKET_CONNECT_TIMEOUT_MS` = 10 s. On open it sends one JSON frame:

```
{ type: "hello", data: { mime: "audio/mpeg", user: <slug>, password: <token>, audio: { channels: 2, samplerate: 44100, bitrate: <current tier>, encoder: "libmp3lame" } } }
```

The webcast protocol has **no acknowledgement**. The socket is treated as accepted only if it survives `HELLO_GRACE_MS` = 600 ms after the hello. A close inside that window is a rejection ("The stream server rejected this broadcast — the previous connection may still be closing" for close codes 1008/4001, otherwise "…closed the connection before the broadcast started"). This is a timing heuristic, not a handshake.

### 3. Token and harbor auth (API)

`POST /api/auth/broadcast-token` (`BroadcastTokenController`, inside the `auth:sanctum` + `verified` group, `throttle:30,1,broadcast-token`):

- Validates `station_slug` (required string, max 255). No user: 401. Station missing **or** `station.user_id !== user.id`: 403 "You do not own this station." (owner only; there is no team access).
- Returns `{ token, expires_in: 60, ingest_url }`. **It does not check that the station is running, nor the plan.** Every plan can mint one; that is how Free goes live.
- `ingest_url` is `LiquidsoapSupervisor::ingestUrl()`: if `config('liquidsoap.ingest_url')` (env `LIQUIDSOAP_INGEST_URL`) is non-empty, `{slug}` is substituted into it (production: `wss://stream.gocast.fm/broadcast/{slug}`, see `api/.env.example`); if empty it falls back to `ws://{containerHost}:{LIQUIDSOAP_HARBOR_INPUT_PORT, default 8090}/{slug}`, the container's Docker bridge IP, which changes on every restart (dev only, plain `ws://`).

The token (`BroadcastTokenService`): `base64url(json{u: user_id, s: station_slug, e: unix_expiry}) . base64url(HMAC-SHA256)` signed with `APP_KEY` (decoded from `base64:`). `TTL_SECONDS = 60`. Stateless: `verify($token, $slug)` checks the MAC (`hash_equals`), the payload shape, that `s` equals the slug, and `e` not passed. Rotating `APP_KEY` kills all outstanding tokens. A fresh token is minted on **every** connect and reconnect attempt.

Harbor's auth callback, `POST /api/internal/harbor-auth` (`HarborAuthController`, `internal` middleware = shared `X-Internal-Key`, `throttle:internal` = 300/min per IP): body `{slug, user, password, address}`.

| Step | Outcome |
|---|---|
| empty password | 403, method `none` |
| station lookup fails (DB down) | 403 (fails closed), `none` |
| unknown/soft-deleted slug | 403, `none` |
| `BroadcastTokenService::verify($password, $slug)` ok | 200, metric `allowed('token')` |
| else password equals the station's `stream_key` (`hash_equals`) and `user.canUseEncoder()` | 200, `allowed('key')` |
| stream key matches but plan lacks encoder | 403, method `plan` |
| anything else | 403, method `unknown` |

Two credentials, one gate. **The broadcast token is the studio's credential and is open to every plan; the stream key is the encoder's credential and is Pro-gated** (`StreamKeyController::rotate` refuses with 403 `encoder_not_available` for Free; `throttle:6,60,stream-key`, six per hour). The token is checked first, but a station lookup precedes both so a token minted just before its station was deleted is refused. Authentication happens once at socket open: rotating a key or downgrading a plan does not cut an in-flight broadcast. The `user` field harbor posts (the studio sends the slug there) is not used for the decision, and the token's `user_id` is verified only as part of the MAC, not compared to the station's current owner. Refusals log station/user/address/method/reason at info level and never the credential. The container's own `harbor_auth` posts with a 5 s timeout and fails closed on any non-200.

### 4. The live session (harbor to API)

Harbor's `on_connect` / `on_disconnect` (`station.blade.php`, `live_in.on_connect`, `synchronous=false`) post to `POST /api/internal/station-event` (`StationEventController`):

- `live_connected` carries `client` (user-agent, clipped to 255 characters in the `.liq`; the controller validates max 255, and an empty string is stored as null) and `via` (`browser` when the handshake has an `Upgrade: websocket` or a `sec-websocket-protocol` header, else `external`; the controller accepts only those two values and answers 422 to anything else; missing means `browser`). Unknown event names also get 422, an unknown slug 404. The controller writes the `station-event:{id}` cache entry (TTL 3600 s), a `StationEvent` timeline row, and **`openSession`**: if any open `StreamSession` exists it does nothing; otherwise it creates one (`started_at = now`, `source_type = via`, `client`) and queues `SendStationLiveNotifications` with a **2-minute delay** (that job re-checks the session is still open and emails each un-notified "notify me" subscriber once). Then it fires `StationStateChanged` (queued, not inline) so dashboards refetch.
- `live_disconnected` closes every open session (`ended_at = now`) and deletes the Redis `metadata:{station_id}` key.

So a browser broadcast's session row is created by harbor about when the socket is accepted, not by the studio. `live_source` in `GET /stations/{slug}/status` is the newest open session's `{type, client}`. `Station::isLive()` is "any open `stream_sessions` row"; `StationResource.is_live` is `isRunning() && that`, and `is_on_air` is `isRunning()` alone (true for AutoDJ too).

`stream_sessions` columns: `id` uuid, `station_id`, `started_at`, `ended_at` (null while live), `peak_listeners` (uint, default 0), `source_type` enum `browser|electron|external` (default `browser`; `electron` is reserved and written by nothing), `client` (nullable string), `ip_address` and `country` (nullable; the broadcaster's origin, taken from the `POST /auth/broadcast-token` request just before the connection by `BroadcastOrigin` and attached when harbor opens the session; null for encoders, which never ask for a token; admin monitoring only), `peak_at` (nullable timestamp), timestamps. The old `total_listener_minutes` column was dropped. **`peak_listeners` and `peak_at` are written only by `SweepListenerSessions::recordPeak`** (about once a minute, only when the sampled count exceeds the stored peak, only for the currently open session; `peak_at` is when the peak was first reached), not by anything in the studio.

### 5. Reconnect

A socket that closes after being accepted (`watchForDrop`, guarded by `this.ws !== ws`, `stopping` and `established`) starts `reconnect()`; state becomes `reconnecting` and the status band says Reconnecting (amber).

- Everything except the socket stays up: the engine, mic, queue position, push-to-talk, wake lock. The encoder keeps encoding and frames are dropped (counted as lost audio).
- Budget `RECONNECT_BUDGET_MS` = 120 000 ms. Delays between attempts `[1000, 2000, 4000, 8000, 15000]` ms, last repeated, each jittered by +/-20 %. The pause is cut short when the tab becomes visible or the user presses stop.
- Each attempt re-runs `ensureStationOnAir(8000)` (so a station stopped in the meantime is started again), mints a **new** token, and opens a new socket. On success it re-sends the last metadata (harbor forgets it on disconnect) and returns to `live`.
- The budget is deliberately below the API's `studio_gone_stop_seconds` (`LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS`, default 150): past that, a no-AutoDJ station whose last browser session closed is taken off air by the sweep (`StationAudioPolicy::studioHasGoneForGood`). Harbor's own `input.harbor timeout` is `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (default 10 s): until it fires, a dead-but-not-closed source still holds the mount and reconnects are refused. Also note harbor reports the disconnect (and the session closes) when it declares the source gone, so **each drop that outlasts harbor's detection produces its own `stream_sessions` row**.
- Out of budget: `fail(...)` with "Lost the connection to the stream server and couldn't get back on air (detail)": tears down engine, mic, wake lock; state `error`.

### 5a. Frame watchdog (a dead engine, not a dead socket)

The reconnect loop only rebuilds the socket, so it cannot fix an engine that stopped producing audio. Harbor accepts each new socket, receives nothing, and drops it at its 10 s `timeout`; every attempt "succeeds", so the 120 s budget never runs out. In production (2026-10-02, Firefox on Android 10) that ran as a 0-byte socket every 14 s for 15+ minutes, and only a fresh Go Live (a new engine) fixed it.

`watchFrames()` runs once a second from going live until stop/fail. `handleChunk` stamps `lastFrameAt` on every encoded frame, socket or not. The encoder emits about one frame per 93 ms whenever the graph runs, **silence included** (an idle studio with no mic and nothing playing still sends frames), so a gap means the graph has stopped:

- `FRAME_STALL_WAKE_MS` = 2000: if the context is `suspended` or `interrupted` (`isSuspended()` covers both), `engine.resume()` and wait. A new engine would start just as stopped; the "Audio paused" lamp asks for the tap.
- `FRAME_STALL_REBUILD_MS` = 5000 with the context `running`: `rebuildEngine()`. The current song index and elapsed time are read off the old engine, the old engine is destroyed, and a new one is built on the same mic stream at the current bitrate (`REBUILD_CREATE_TIMEOUT_MS` = 8000, through an `AbortSignal` that makes `AudioEngine.create` close its own half-built context; the rebuild doesn't await `resume()`, which can stay pending until a tap). Then `restoreQueue()`, repeat/monitor/latch and the played-tracks count carried across, and `cueAt(index, offset, playing)`: a playing song continues at the same second, and a paused one stays cued there with no audio element until Play. The socket is untouched. It finishes inside harbor's 10 s, so listeners hear a gap but the session doesn't split. The new engine reaches the studio through a re-emitted `live` (`BroadcastProvider` calls `setEngine` on `live`).
- Teardown during a rebuild: `stop()` and `fail()` both set `stopping` (`fail()` too, since 2026-10-02). The rebuild re-checks it after every await, destroys an engine it hasn't adopted yet, and never re-emits `live` after one. A build that times out or throws ends the show with "The studio's audio stopped and couldn't be restarted. Reload the page to go back on air."
- `MAX_REBUILDS` = 3 per `REBUILD_WINDOW_MS` (10 min). The next stall calls `fail()` with "The studio's audio keeps stopping in this browser. Reload the page to go back on air."

`studio_drop` reports also carry `audio_state` (the context state at the close), `frame_age_ms` (seconds here means the audio died before the socket did) and `engine_rebuilds`.

### 5b. Fitting the upload (`sampleBacklog` in `broadcast.ts`)

Once a second, driven off the encoder's own chunks rather than a timer (a hidden tab's timers can be throttled to once a minute), the manager reads `ws.bufferedAmount` as playing time at the current bitrate (`bytes × 8 ÷ kbps` = ms).

- **Down a tier** after `STEP_DOWN_AFTER_SAMPLES` = 3 consecutive samples at or above `CONGESTED_BACKLOG_MS` = 2 s, then no further step for `STEP_DOWN_COOLDOWN_MS` = 10 s so the backlog can drain.
- **Up a tier** after `STEP_UP_AFTER_CLEAR_MS` = 5 min continuously under `CLEAR_BACKLOG_MS` = 300 ms, never above 128 (so a probe-chosen 64 can climb back).
- The switch is `engine.setBitrate` → the worker flushes the old lamejs encoder's tail and builds a new one at the same 44.1 kHz. No new hello: every MP3 frame carries its own bitrate, and harbor decodes the change cleanly (verified 2026-09-30 against `gocast/liquidsoap:latest`: 128 → 64 → 96 kbps sines came out at the right pitch with no gap).
- Why the numbers: harbor drops a source after `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (10 s) without data. The drop that prompted this (kerygma, 2026-09-30, browser rated 3g, 0.4 Mbps) held 8–11 s of unsent audio at each of three drops in seven minutes, at the old 192 kbps.

`getTransportStats()` also returns `bitrate`, `backlogMs` and `congested` (backlog ≥ 2 s). Drop reports carry `bitrate` and `uplink_kbps` (the go-live measurement).

### 6. The audio graph (`client/lib/audioEngine.ts`)

One `AudioContext` pinned to **44 100 Hz** (lamejs is built for a fixed rate). Constants: `BITRATE_TIERS = [128, 96, 64]`, `DEFAULT_BITRATE = 128` (stereo CBR; Liquidsoap re-encodes to the station's 128k output, so more than 128 only spent the broadcaster's upload; 192 until 2026-09-30), `MIC_BOOST = 3` (mic gain while open), `QUEUE_BYTE_LIMIT = 2 GiB`, `MONITOR_DEFAULT_VOLUME = 0.62`, `METADATA_TIMEOUT_MS = 4000`.

```
fileSource -> fileGain --------------------------------------> mixer -> limiter -> analyser -> AudioWorklet (pcm-processor)
                       \-> monitorGain -> ctx.destination                                         |  MessagePort
mic -> micDry ---------------------------> micGain -> mixer                                        v
mic -> highpass80 -> presence(3k,+3dB) -> comp -> micWet -> micGain            Worker: lamejs -> MP3 chunks -> onChunk -> ws.send
```

- **The mixer is not connected to `ctx.destination`**, so the broadcaster does not hear the show from their speakers (feedback risk). Only `monitorGain`, tapped from `fileGain` (post-duck, never from the mic), reaches the speakers. Off by default; `M` toggles; volume slider 0-100.
- **Capture:** `public/pcm-worklet.js` batches 128-sample frames into 4096-sample stereo blocks (about 93 ms) and transfers them over a `MessageChannel` port straight to `public/encoder-worker.js`, which converts float to Int16 and calls `lamejs.Mp3Encoder(2, 44100, bitrate)`; a `bitrate` message flushes and rebuilds it. The worker imports `/lame.min.js`, **which is patched** (`q.out_samplerate=k` in `Mp3Encoder`): stock lamejs resamples on its own below ~112 kbps (96 → 32 kHz, 64 → 24 kHz), and harbor turns a mid-stream sample-rate change into silence or the wrong pitch (verified). A mono input is duplicated to both channels.
- **Push-to-talk and ducking:** `pttDown()` sets `micGain` to 3 (time constant 0.02 s) and moves `fileGain` to the duck target; `pttUp()` reverses it. The **mic ramps are always fast; only the music follows the fade setting.** Duck levels (`micPrefs.ts` `DUCK_GAIN`): `under` 0.2 (about -14 dB), `low` 0.08 (about -22 dB), `silence` 0. Fade time constants (`FADE_TIME_CONSTANT`): `instant` 0.03 s, `smooth` 0.13 s, `slow` 0.5 s (roughly 0.1 / 0.4 / 1.5 s to settle). The duck ramp re-anchors from the current value so a press mid-fade continues smoothly.
- **Latch** (`setMicLatched`): holds the mic open hands-free; `pttUp()` is a no-op while latched; unlatching closes it.
- **Broadcast voice** (default on): both mic paths exist permanently and are crossfaded by gain (`micDry`/`micWet`, 0.02 s), so toggling is click-free. Chain: high-pass 80 Hz (Q 0.707), peaking 3 kHz +3 dB (Q 1), compressor threshold -20, knee 6, ratio 3, attack 5 ms, release 150 ms.
- **Master limiter** (the last stage before the encoder): `DynamicsCompressor` threshold -2, knee 0, ratio 20, attack 1 ms, release 100 ms. Threshold is -2 rather than -1 because the compressor adds automatic makeup gain.
- **Mic prefs** (`duck`, `fade`, `broadcastVoice`) persist in `localStorage["gocast:studio-mic:v1"]` per browser, read at engine construction, validated field by field, defaults `under` / `smooth` / `true`. Changes apply immediately, even mid-talk.
- **Analyser** (fftSize 2048) is created and connected before the worklet but **nothing reads it** (see Gaps). The on-screen mic meter (`MicMeter`) builds its own `AudioContext` off the raw `MediaStream`.
- **Suspended context** (`suspended` or `interrupted`): the engine notifies on `statechange`; `BroadcastProvider` listens for every `pointerdown`/`keydown` and calls `engine.resume()` if suspended, and the frame watchdog (5a) tries a resume after 2 s of no frames.
- `destroy()` saves the playback position first (so a normal Stop now records the exact second, not the last 5 s tick), then stops the current element, disconnects every node, terminates the worker and closes the context. `flushEncoder()` (sent on stop) posts `flush` to the worker with a 1 s safety timeout so the final partial MP3 frame is not lost.

**The queue** is entirely local: `File` objects, never uploaded.

- `addFiles`: only `file.type.startsWith("audio/")`; skipped (and reported "Queue is full") once cumulative bytes would exceed 2 GiB. Duration comes from an `<audio>` metadata read (gives up after 4 s and reports 0, because a hidden Chrome tab never fires `loadedmetadata`). Title/artist from `music-metadata` (`parseBlob`, lazy-imported), else the filename, splitting "Artist - Title" on a dash unless the left part is all digits. The first added file auto-plays if nothing has played (`currentIndex === -1`).
- Each track plays through an `HTMLAudioElement` + `createMediaElementSource` (constant memory, no full decode). **The playhead is not scrubbable** (deliberately: a seek is audible on air).
- **Repeat** has two modes only, `all` (default; the queue wraps) and `one`; there is no "off" because dead air is never wanted. `next()`/`prev()` always move and wrap; only auto-advance honours `one`. Repeat mode is in memory and resets each broadcast.
- Removing the playing track starts the next one (removing the only track stops playback and resets the index to -1). `clearUpcoming()` keeps the playing track. Removal has a 6-second Undo toast (`restoreTracks` re-inserts by remembered order; it does not restart playback).
- **Persistence** (`queueStore.ts`): IndexedDB database `gocast`, version 4, stores `queue` (keyPath `id`, index `station` on the record's `station` slug), `playback` (keyed by station slug) and `order` (v4: the station's track ids in running order, keyed by slug). Every function takes the station slug; the engine gets it from `AudioEngine.create(..., station)` and the pre-flight page from the route. `saveQueue` runs serially (one save at a time) and writes **each new track's file once, in its own transaction**; a track already stored is rewritten only if its title/artist changed. Then one transaction deletes the station's tracks no longer in the queue and writes the `order` record. A new track whose file can't be read (a one-byte `isReadable` read fails) is not stored and comes back as `unreadable`; one the browser refuses to store (usually quota) comes back as `unsaved`. `loadQueue` sorts by the `order` record, falling back to each record's `position` for queues saved before v4 (the store returns records in key order, so without either a restored queue came back shuffled). Before v4 every save rewrote every blob in one transaction, so one unreadable file aborted every later save. Playback `{currentIndex, offset}` is saved every 5 s while playing, on `pagehide`, and when a track starts. **Paused position is not saved** (`saveProgress` requires `playing`). **Migration from v2** (one unscoped queue, playback key `"current"`): records without a `station` are invisible to the index; `loadQueue(slug)` for a station with nothing of its own claims them in one transaction (`claimLegacy`: rewrites them with the slug, moves the `"current"` playback to the slug's key). So the first station opened after the upgrade inherits the old queue and position; a second station starts empty. Slug, not id, because it is immutable (`Station::booted`) and is what every caller already has. `openDB` rejects on `blocked` and closes on `versionchange` so a tab on the old schema cannot hang the upgrade; a tab on the old code that outlives the upgrade fails its own saves with `VersionError`.
- **Tracks that can never play are taken out** (`dropTracks`, reasons `TrackDropReason`): `unplayable` when the audio element fires a media error other than `MEDIA_ERR_ABORTED` (an `audio.play()` rejection alone is not enough: that is autoplay blocking or a track switch), `unreadable` when a save reports the file unreadable or when the restore finds it gone. If the playing track goes, the next survivor plays (or is cued, if nothing was playing); a queue of only dead files ends empty. `BroadcastProvider` subscribes (`onTracksDropped`, with drops before the first subscriber held and delivered on subscribe) and shows a warning toast on any dashboard page: "Couldn't play "{title}", so it was taken out of the running order." or "… couldn't be read anymore and was taken out of the running order. Add the file again to play it." Queue-storage failures never break the show: they are logged and sent to Sentry once per kind per session (`reportStorageFailure`, tag `queue_storage`).
- `restoreQueue()` (step `engine`) first checks every stored file is still readable (in parallel, capped at `READABLE_CHECK_TIMEOUT_MS` = 3 s, after which it goes on unchecked) and drops the dead ones; a failing `loadQueue` costs the saved queue, not the show. It loads tracks immediately with `duration: 0`, then fills durations and old "Unknown" artist tags in the background (durations retried once when the tab becomes visible). `resumePlayback()` runs only after the socket is accepted, otherwise the first seconds would be encoded into a closed socket. It cues the saved track at the saved offset, or from 0 with `fromStart`; the saved index is mapped through `restoredIndex()` (the same song if it survived the readability check, else the next survivor from its start); it does not clamp against `duration` (still 0 at that point); `playIndexAtOffset` clamps to the real length.

**Metadata to listeners.** On every engine change the manager sends `{type:"metadata", data:{title, artist}}` over the socket when the current track's `title\0artist` differs from the last frame sent (`sentMetadataKey`). It is cached in `lastMetadata` and replayed after a reconnect. With no queue nothing is sent, and Liquidsoap's `live_metadata` substitutes the placeholder `LIQUIDSOAP_LIVE_BROADCAST_TEXT` (default "Live Broadcast") for a source that sends none.

### 7. Studio screen (`studio/page.tsx`)

Renders nothing unless `isLive` (state `live` or `reconnecting`). One grid, two columns of at least 23.75 rem (`repeat(auto-fit, minmax(min(100%, 23.75rem), 1fr))`), so it stacks on narrow screens. Left: the talk pad (`PushToTalk`, or `MusicOnlyPad` for a music-only show), a hint line ("Hold the pad or Space to talk. Press L to keep it open." / "Hold the pad to talk." on touch / "Music only — the mic stays closed.") and "Listeners hear you about 15–20 s late.", the `MicLatchButton` ("Keep mic open" / red "Close mic") and `StudioControls` (Monitor with its volume slider, `MicSettings`, and a keyboard icon button opening `ShortcutsDialog`). Right: `NowPlaying`, `StudioStats`, `FileQueue`, the overview's `YourLinkCard` (link, Tune-in code, Embed, Share…) and `EndBroadcastButton`. The page's `h1` is screen-reader only. Tab title becomes `● LIVE · {station} | GoCast` while live. When the state returns to `idle` it goes to `/studio/wrap` (if it had been live) or `/live`.

**The status band is the lamp.** The studio no longer draws its own (`OnAirLamp` is gone): `StationBand` feeds `useStudioSignal` (`components/studio/signal.ts`, with `inStudio`) into `airState`, and the band shows the result above every page, studio included. The signal's ranked states, first match wins:

| Code | Label | Condition |
|---|---|---|
| `reconnecting` | Reconnecting | `state === "reconnecting"` |
| `not-sending` | Not sending | a transport sample exists and `!connected` |
| `suspended` | Audio paused | `AudioContext` suspended |
| `silence` | Silence | mic not open (or mic-less) and queue not playing; shown only after `SILENCE_GRACE_MS` = 4000 ms |
| `dropping` | Dropping audio | a frame dropped within `RECENT_DROP_MS` = 5000 ms (socket closed, or backlog over 4 s) |
| `slow-connection` | Slow connection | `stats.congested` (backlog ≥ 2 s); detail names the current bitrate |
| `mic` | Mic open | mic open |
| `live` | Live | otherwise |

The band turns red for the mic, amber for the faults (`ds/StatusBand` also renders an sr-only `role="alert"` line that reads "{label}. {message}" while the tone is `warn`, so a fault is announced in full), and shows the show's uptime and listeners; off the studio page it adds play/pause and next for the queue and, with a latched mic, "Close mic".

Transport health (`useTransportHealth`) samples `getTransportStats()` every `HEALTH_POLL_MS` = 2000 ms. The counters (`bytesSent`, `chunksSent`, `chunksDropped`, `droppedMs`, `lastDropAt`) only count after the first successful handshake (`countersArmed`), so startup silence is not "lost audio". `droppedMs` is a wall-clock duration of drop runs (including an open one). These count what actually left the socket, not what the encoder produced. The `live` detail copy states "Listeners hear you about 15–20 seconds after you speak" (see Gaps).

**Now playing** (`NowPlaying`, the mobile studio's card): title/artist (with a queue but nothing started: "Queue loaded" / "Nothing playing yet. Press play to start."; with no queue: "Nothing queued" / "Add music from the running order"), time left whose label reads LEFT and switches to GET READY, both amber, under 20 s while playing (`ENDING_SOON_S`), a read-only progress bar flanked by elapsed and track length, "Next" and the transport (prev / play-pause / next). "Next" comes from `upNext()`: track 1 when nothing has started (every track still to come), "Holding this track" on repeat-one, "Looping this track" for a one-track queue, "(from the top)" at the wrap, "Add music" when empty. Position, bar, elapsed, length and clock are written straight to the DOM from one `requestAnimationFrame` loop reading the engine every frame (not memoised; an earlier memo froze at mount). Talk-up cues pulse the clock and set an sr-only status line only when the countdown genuinely crosses the threshold.

**Show numbers** (`StudioStats`): three compact `StatTile`s, each with a line under it. On air (uptime; "since {time}" in the station's timezone, the browser's if it has none), Listening ("nobody yet" while the peak is 0 and nobody is on, else "peak N"), Audio lost ("0 s" in green while none; under it the current bitrate, amber "N kbps · slow line" with an explanatory tooltip below `DEFAULT_BITRATE` 128, then "{bytes} sent").

**Push to talk** (`PushToTalk`): one big card that is the button, with `MicMeter` inside it; solid red with dark ink while the mic is open, a speaker-grille dot pattern (`grille` / `grille-live` utilities) and an idle "● LIVE WHILE HELD" marker. Pointer events with capture (a finger sliding off keeps the mic open until lift), `Space` anywhere except in a text field or inside a dialog/menu/toast/sortable handle (`isTypingTarget`, `isOverlayTarget`); `Enter` on the focused pad also works; window blur or the tab hiding releases the mic. A focused button does not get a click from Space keyup. `L` latches. `MicMeter` is a 40-segment dBFS peak meter (floor -60 dB) tapping the `MediaStream` before the talk gain, so the level can be checked with the mic closed. `MicSettings` popover: music level (Under you / Low / Silent), fade (Instant / Smooth / Slow), Broadcast voice switch (`ds/Switch`).

**Keyboard** (bound in `studio/page.tsx`, ignored with modifiers, repeats, typing targets and overlays): `K` play/pause, `N` next and `P` previous (only when the queue has more than one track), `R` cycle repeat, `M` monitor, `L` latch (not in music-only). `Space` is push-to-talk (in `PushToTalk`). `ShortcutsDialog` lists the same keys for the host (Space and L hidden for music-only); it is a separate list, kept in step by hand (comment in `studio/page.tsx`).

**Running order** (`FileQueue`): drag-and-drop reorder (dnd-kit with pointer, touch (150 ms hold) and keyboard sensors), drop audio files anywhere on the panel or use Add files (`accept="audio/*"`), per-row remove, Clear upcoming, per-row projected air time (wall clock, null while nothing plays or in repeat-one; drifts after any skip/pause/mic), total duration, "loops in m:ss" (`secondsUntilLoop`: what is left of the current track plus every later one, unknown durations counted as 0, ticking once a second) or "repeating this track" on repeat-one, bytes vs the 2 GiB cap (emphasised above 90 %), repeat toggle.

**Statistics** (`useBroadcastStats`): listeners come from the **public** endpoint `GET /public/stations/{slug}/listeners` via the shared feed in `usePublicStationStats.ts` (one timer per slug per tab, `POLL_MS` = 10 s, `pauseWhenHidden: false` here). Peak and history are module-scope, keyed `slug:liveSince`, so a trip to the library and back resumes the same numbers (the status band keeps them ticking off the studio page). It toasts "First listener tuned in" and milestone counts once per show (`fireOnce`). The public count's Icecast half is refreshed by `stations:sync-listeners` once a minute, so the number moves in minute-sized steps however often it is polled. The peak here is the **client's** own; Your shows shows the server's `peak_listeners` and `peak_at`. They can differ.

### 8. Elsewhere in the dashboard while live

- `BroadcastProvider` (`app/dashboard/layout.tsx`; `start()` ignores a second call while one is in flight and stops any previous manager first, so "Try again" always builds a fresh one; the first ever live show fires a one-time "You're live for the first time" toast) wraps the whole dashboard so navigating between dashboard pages (via `<Link>`, never a full load) keeps the show alive. A `beforeunload` handler warns on refresh/close while `live` or `reconnecting`.
- The **status band** (`shell/StationBand.tsx`) on every page: the studio signal, uptime, listeners, and off the studio page play/pause, next, "Close mic" (latched) or "Open studio".
- The sidebar's Studio item shows a pulsing red "Live" lamp and links to the broadcasting station's studio; the phone tab bar's Studio tab gets a red dot.
- `dashboard/error.tsx`: the layout stays mounted, so a page crash mid-show says the broadcast is still on air and links back to the studio.
- The overview hero: "You're live." with Open studio, while this tab broadcasts.

### 9. End broadcast (`EndBroadcast.tsx`, `BroadcastContext.stop`)

"End show" opens `ConfirmDialog` "End your show?" (Keep going / End show; not dismissable while ending). Wording depends on `after`: `off_air` (plan has no AutoDJ: `useAutoDjLocked()`; "Everyone listening is cut off and the station goes off air."), `silence` (AutoDJ plan but `status.playlist_length === 0`, read from the status poll, which runs only while the dialog is open; "Your show stops for everyone listening. AutoDJ has nothing to play, so they hear silence and the station switches off in a few minutes."), else `autodj` ("Your show stops for everyone listening, and they hear AutoDJ straight away."). Each adds "Your queue is kept for next time." An unknown plan or status keeps the AutoDJ wording.

On confirm: build a `ShowSummary` (duration from `liveSince`, `getSessionPeak`, `droppedMs`, `tracksPlayed` from `AudioEngine.getTracksPlayed()`, `after`; a track counts once it has aired `TRACK_PLAYED_AFTER_S` = 30 s from where it started, or reached its end, so skips past it don't count, and the count is carried across an engine rebuild) and write it to `sessionStorage["gocast:signoff:{slug}"]` **before** `stop()` (the studio moves to the wrap screen the moment the socket closes); then `stop({ releaseStation: autoDjLocked })`; then `router.replace` to `/studio/wrap`.

`BroadcastManager.stop()`: sets `stopping` (which aborts any in-flight reconnect), flushes the encoder if the socket is open, closes the socket with code 1000 "broadcast ended" (harbor sees a source disconnect and posts `live_disconnected`), destroys the engine, stops mic tracks, releases the wake lock, state `idle`. The browser always reports that close as **1006, `wasClean: false`**: harbor answers our close frame by dropping the TCP connection without sending one back (checked on the raw socket, 2026-10-04). It is harmless: `this.ws` is already released and `stopping` is set, so `watchForDrop` ignores it and nothing is reported or reconnected. `BroadcastProvider.stop` clears `stationSlug`, `liveSince`, mic/engine refs and removes `broadcast:micDisabled:{slug}`.

**Releasing the station** applies only to accounts without AutoDJ: `releaseStation` calls `POST /stations/{slug}/stop`, retrying at `[0, 400, 800, 1500, 2500]` ms because the API refuses a stop with 409 `station_is_live` while a session is still open and harbor's `live_disconnected` lands slightly after the socket closes. Any non-409 answer aborts the retry. With AutoDJ the container stays up and AutoDJ takes over at the next track boundary. While the station hands over, the band and sidebar show "SHOW ENDED · Your show has ended. Checking what’s on air now…" (`StationStatusContext` re-reads status until it settles, at most 15 s; `airState` `showEnding`; see [station-lifecycle.md](station-lifecycle.md)). The sweep (`stations:sweep`) is the backstop for every other path.

`StationPowerController::stop` refuses (409) while a session is open unless `force` is set **and** the open session is `external` (`station_is_live_external`); a browser broadcast is never force-stoppable from the API.

### 10. That's a wrap (`studio/wrap/page.tsx`)

Reads and immediately removes the `sessionStorage` entry; shows it only if it is under `FRESH_MS` = 30 minutes old, otherwise goes to the overview. "That's a wrap." with an eyebrow per `after` ("Show ended · AutoDJ has the station" / "… AutoDJ has nothing to play" plus a line about adding tracks / "… Station off air"), then `StatTile`s: On air, Peak ("listening at once"), Tracks (when counted), Audio lost ("0 s" green when none), and "Back to station". Storage failures mean no summary; it just goes to the overview.

### 11. History pages

- **Recent shows** on the overview (last 5 of the loaded 20) and **Your shows** (`/dashboard/broadcasts`) both read `GET /stations/{slug}/sessions` (`StreamSessionController::index`: `authorize('view')`, `latest('started_at')->paginate(20)`, `?finished=1` to leave the open show out, plus `summary`). Times are on the station's clock. Your shows pages with "Show more", opens a row to show `peak_at`, and summarises every finished show with a trend sentence ([station-management-dashboard.md](station-management-dashboard.md)).
- Live airtime only: a station that only ever ran AutoDJ has no rows.

## Endpoints

Every numeric throttle in `api/routes/api.php` names its own limiter (the third argument). Without one Laravel keys the counter on the user (or IP) alone, so all unnamed `throttle:N,M` routes shared one count: a go-live's probes, check report and token used to eat into the station-start limit and answer 429.

| Route | Controller | Auth | Notes |
|---|---|---|---|
| `POST /api/auth/broadcast-token` | `BroadcastTokenController` | sanctum + verified, `throttle:30,1,broadcast-token` | body `station_slug`; returns `token`, `expires_in` 60, `ingest_url` |
| `POST /api/broadcast/uplink-probe` | `UplinkProbeController` | sanctum + verified, `throttle:20,1,uplink-probe` | raw body, returns `{bytes}`; 413 over 256 KB; nothing stored |
| `POST /api/stations/{slug}/uplink-checks` | `UplinkCheckController` | owner (`update`), `throttle:20,1,uplink-checks` | the check's verdict → `uplink_check` event; admin monitoring only |
| `POST /api/stations/{slug}/start` | `StationPowerController::start` | owner, `throttle:20,1,station-start` | 202; 422 `station_limit_reached`; 503 `station_start_failed` |
| `POST /api/stations/{slug}/stop` | `StationPowerController::stop` | owner, `throttle:20,1,station-stop` | 409 `station_is_live` / `station_is_live_external`; `force` only cuts encoders |
| `GET /api/stations/{slug}/status` | `StationStatusController` | owner, `throttle:120,1,station-status` | `slug`, `state`, `desired_state`, `started_at`, `reachable`, `ready`, `icecast_connected`, `last_ready_at`, `source`, `broadcaster`, `live_source`, `now_playing`, `elapsed`, `remaining`, `playlist_length`, `up_next` (max 5) |
| `GET /api/stations/{slug}/sessions` | `StreamSessionController::index` | owner (`view`) | paginated, 20; `?finished=1`; `summary {shows, live_seconds}` over every finished show |
| `POST /api/stations/{slug}/sessions` | `StreamSessionController::store` | owner (`update`) | **not called by any client here**; see Gaps |
| `DELETE /api/stations/{slug}/sessions/{session}` | `StreamSessionController::destroy` | owner (`update`) | **not called**; does not check the session belongs to the station |
| `POST /api/internal/harbor-auth` | `HarborAuthController` | `X-Internal-Key`, 300/min/IP | 200 allow / 403 refuse |
| `POST /api/internal/station-event` | `StationEventController` | `X-Internal-Key` | opens/closes sessions |
| `POST /api/stations/{slug}/stream-key` | `StreamKeyController::rotate` | Pro, `throttle:6,60,stream-key` | encoder credential; see [encoder-ingest.md](encoder-ingest.md) |

Config and env: `LIQUIDSOAP_INGEST_URL`, `LIQUIDSOAP_HARBOR_INPUT_PORT` (8090), `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (10.0), `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` (150), `LIQUIDSOAP_SILENT_STOP_SECONDS` (600), `LIQUIDSOAP_LIVE_BROADCAST_TEXT`. Harbor is rendered with `buffer=5., max=10.`, and a further `buffer(buffer=2., max=10.)` sits on the live arm (`station.blade.php`).

**Production routing:** nginx `gocast-stream.conf` maps `location ~ "^/broadcast/([a-z0-9][a-z0-9-]{0,62})$"` to the station-router container with WebSocket upgrade headers, `proxy_read_timeout`/`proxy_send_timeout` 24 h and buffering off. The slug charset constraint is a security boundary (the router turns it into a hostname).

## Surfaces

| Surface | What |
|---|---|
| `/dashboard/stations/{slug}/live` | pre-flight (mode, mic check, running order), then one press: the checks, then on air and a redirect to the studio |
| `/dashboard/stations/{slug}/studio` | the studio (redirects to `/live` if idle and never live, to `/studio/wrap` once a live show returns to idle) |
| `/dashboard/stations/{slug}/studio/wrap` | "That's a wrap." |
| Every dashboard page | the status band (signal, uptime, listeners, transport), sidebar "Studio Live" lamp, phone tab-bar dot, tab-close warning |
| Overview | hero "You're live." + Open studio; Recent shows |
| `/dashboard/broadcasts` | Your shows: session history |
| Help | `/help/go-live-from-your-browser`, `/help/using-the-studio`, `/help/my-encoder-wont-connect` |
| Mobile | separate manager against the same token endpoint; see [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md) |

Related: [realtime-events.md](realtime-events.md) (`StationStateChanged`), [listener-analytics.md](listener-analytics.md) (listener counts and `peak_listeners`), [notifications-and-email.md](notifications-and-email.md) (the live email), [accounts-plans-invites.md](accounts-plans-invites.md) (`canUseEncoder`, `autodj_enabled`).

## Gaps and traps

1. **`StreamSessionController::store` and `destroy` are dead in practice.** No client here calls them (the web studio opens no session; harbor does). The controller docblock says so. `BroadcastStateService` (Redis `broadcast:station:{id}` keys, statuses `starting`/`live`/`reconnecting`, TTLs 60/90/45 s) is used **only** by `store`/`destroy`; `markLive`, `markReconnecting`, `isLive` and `isLiveFromState` are never called anywhere. `EncoderSessionAttributionTest` and `StationNotifySubscriptionTest` exercise `POST /sessions` as a "studio", which the real studio never does. `destroy` also does not check `$session` belongs to `$station`.
2. **`electron` source type is reserved and written by nothing**, but is in the enum, the TypeScript union and the label map ("Desktop").
3. **The studio goes blank when a broadcast dies.** `studio/page.tsx` returns `null` unless `isLive`, and its redirect effect only handles `state === "idle"`. After reconnect exhaustion `fail()` leaves `state = "error"`: the studio renders nothing and doesn't redirect, and the status band falls back to the poll's view of the station. `BroadcastProvider` also does not clear `engine`/`micStream` on `error` (only on `idle`), so they keep pointing at a destroyed engine.
4. **Each drop can split a show into several `stream_sessions` rows.** A drop that harbor detects closes the session; the reconnect opens a new one with `peak_listeners` reset. The client's `liveSince`, uptime and wrap-screen duration span the whole show, so the wrap screen and Your shows can disagree.
5. **`peak_listeners` (and `peak_at`) are sampled once a minute by another command** (`listeners:sweep`, `SweepListenerSessions::recordPeak`), only while the session is open, so a peak that rises and falls between two runs can be missed. The studio's peak is the client's own 10 s polling.
6. **Reloading the studio tab strands you for about 10 s.** The socket closes uncleanly; until harbor's timeout (default 10 s) the session stays open, so `station.is_live` is true and the `/live` page shows "Someone is live from another browser or computer" although it was this browser. The queue survives (IndexedDB), the show does not.
7. **The mic-off choice resets after every show.** The go-live page reads `broadcast:micDisabled:{slug}` as the last-used mode, but `BroadcastProvider.stop()` removes it, so each show starts on Mic + music. (`broadcast:resumeFromStart` is never removed.)
8. **The latency claim is hard-coded** ("about 15–20 seconds") in `signal.ts` and as "about 15–20 s late" on the studio page. The code shows harbor `buffer=5.`, a further 2 s live buffer, then HLS 4 s segments (`segment_duration = 4.`, `segments = 5`) plus the player's own buffering. That sums to roughly 5 s harbor + 2 s buffer + up to 5 x 4 s HLS window before the player's own buffering; the 15-20 s figure is an estimate that cannot be confirmed without a live Liquidsoap and player.
9. **`useAudioLevels.ts`, `AudioEngine.getAnalyser()`, `AudioEngine.clearQueue()` (the engine method) and `BroadcastManager.getSessionId()` are unused.** The engine builds and connects an analyser nobody reads. The go-live page clears the queue through `queueStore.clearQueue()` directly (`hooks/usePreflightQueue.ts`).
10. **The queue is per browser profile and station, not per account.** Two users who share a browser and open the same station share its queue. Files stay on that machine; a different device starts empty. The 2 GiB cap in `audioEngine.ts` is per engine, so with several stations the real ceiling is the browser's origin quota across all of them.
11. **Repeat mode is not persisted** and paused positions are not saved (only playing state is written every 5 s).
12. **The broadcast token does not check that the station is running or that the caller's plan allows anything**, and the token's `user_id` is never compared to the current owner at harbor-auth (the MAC binds it to the slug for 60 s). Consequences are limited (owner-only mint, 60 s TTL) but the token is a slug bearer, not an ownership proof.
13. **The first-start timeout is silently accepted.** If the container is not `ready` after 20 s the studio publishes anyway; the first seconds can be lost with no message.
14. **Auto-stop interplay.** A no-AutoDJ station is taken off air by the sweep 150 s after its last browser session closed; `RECONNECT_BUDGET_MS` (120 s) must stay below that. The client (`broadcast.ts`) and the API (`StationAudioPolicy`) agree only through comments; nothing enforces the ordering.
15. **Release-on-End is best effort.** `releaseStation` gives up after about 5.2 s of 409 retries or on any other status; the sweep cleans up later. It runs only when the plan lacks AutoDJ; an unknown plan (`usePlan()` null) never releases.
16. **The End dialog's "silence" wording depends on the status poll** (read only while the dialog is open); if it hasn't returned, the AutoDJ wording is shown and the wrap screen may say the wrong thing.
17. **Mixed content in dev.** With `LIQUIDSOAP_INGEST_URL` unset the studio gets `ws://<bridge-ip>:8090/<slug>`, which a page on `https://` cannot open. `infra/native/README.md` describes leaving it empty, while `api/.env.example` and `infra/native/env/api.env.example` set `wss://stream.gocast.fm/broadcast/{slug}`; the README and the env examples disagree.
18. **Secure context required.** Over plain http on a LAN address `AudioWorklet` and `mediaDevices` do not exist. `assertBroadcastSupported` throws a readable error, but it fires before any step is active, so no step shows the error, only the "Couldn't go live." notice.
19. **The 600 ms hello grace is a heuristic.** A slow rejection (auth callback near its 5 s timeout) closes after the studio already reports success; the drop path then handles it as a mid-broadcast disconnect.
20. **`HarborAuthController` gates both the studio and encoders.** Changing the check order or the plan gate affects the studio's hot path (every connect and reconnect does a token verify first).
21. **Ghost session cleanup** (a lost `live_disconnected`) is described in code comments as handled by `ReconcileStations` and by `stop()` closing sessions; `ReconcileStations::reconcileLiveFlags` (`stations:reconcile`) is the real backstop: for running stations with an open session it reads the container status (`broadcaster`, else `source === 'live'`); after `liquidsoap.stranded_session_strikes` (default 3) consecutive passes where the container says nobody is attached, it closes the open sessions. `StationLifecycleService::stop` also closes open sessions on a stop. `StreamSessionController::store` clears a ghost encoder session only when the station is not running.
22. **The upload check times the API host, not the stream host.** Today that is the same path: both vhosts are on one box behind Cloudflare, and the socket only adds a local hop (nginx → station-router → container). If stations ever move to their own servers, the probe has to move to the stream host too, or it stops measuring the route the audio takes.
23. **DevTools/CDP network throttling does not slow WebSockets**, so it tests the go-live check but never exercises the backlog watch. To test that, override `WebSocket.prototype.bufferedAmount` in the page (done 2026-09-30 with headless Playwright). Also: with nothing playing and the mic closed the lamp shows `silence`, which outranks both `dropping` and `slow-connection`.
24. **Metadata is unsanitised client-side** (title/artist straight from tags or filename); the cap (500 chars) is enforced by `NowPlayingController` per the template comment, not in the studio.

## Tests

- `api/tests/Feature/BroadcastTokenServiceTest.php`, `BroadcastTokenControllerTest.php`: token mint/verify, ownership 403, response shape.
- `api/tests/Feature/HarborAuthTest.php`: token path, stream-key path, plan gate, refusal reasons.
- `api/tests/Feature/EncoderSessionAttributionTest.php`: `live_connected` opens sessions with `via`/`client`, the `station_already_live` refusal, ghost sessions, cut-off (`force`) rules, `live_source` in `/status`.
- `api/tests/Feature/StationEventBroadcastTest.php`, `StationSweepTest.php`, `SweepListenerSessionsTest.php`, `LiquidsoapTemplateTest.php`: adjacent (event push, studio-gone stop, peak sampling, template output). `StationEventBroadcastTest` covers which events are pushed and that the session opens before the push; `StationSweepTest` covers the studio-gone stop (stops soon after a browser show ends, keeps the container inside the grace, never stops AutoDJ stations); `SweepListenerSessionsTest` covers peak raising; `LiquidsoapTemplateTest` asserts harbor `buffer` 5 s and the timeout rendering.
- `api/tests/Feature/UplinkProbeTest.php`: the probe, including that it keeps its own rate limit apart from `uplink-checks` (the named-limiter fix).
- Client: `lib/preflightQueue.test.ts` (pre-flight queue edits keep the playback record on the right song), `lib/airState.test.ts` (the band's reading of the studio signal, including SHOW ENDED while the station hands over), `components/studio/NowPlaying.test.ts` (`upNext`), `components/studio/FileQueue.test.ts` (`secondsUntilLoop`). No unit tests for `broadcast.ts`, `audioEngine.ts` or the studio components' rendering. `client/tests/e2e/dashboard-visual.spec.ts` captures the go-live page (not live; going live in a headless run really starts a station). The live path is verified by hand; automation tabs are hidden and HLS/feed behaviour differs there.

## History

History and rationale only, never the spec: `docs/ENCODER-INGEST-PLAN.md` (encoder path). The studio redesign, mic settings, queue resume and harbor latency work were recorded in session notes, not in `docs/`. The code comments cited above carry most of the reasoning.
