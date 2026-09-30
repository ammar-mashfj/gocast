---
feature: Broadcasting from the web studio
verified: 2026-09-29 against ea570df plus uncommitted work
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
  - client/app/dashboard/stations/[slug]/StationActions.tsx
  - client/components/studio/EndBroadcast.tsx
  - client/components/studio/FileQueue.tsx
  - client/components/studio/MicMeter.tsx
  - client/components/studio/MicSettings.tsx
  - client/components/studio/MonitorBar.tsx
  - client/components/studio/OnAirDeck.tsx
  - client/components/studio/OnAirLamp.tsx
  - client/components/studio/PushToTalk.tsx
  - client/components/studio/signal.ts
  - client/components/studio/StreamPanel.tsx
  - client/components/studio/TrackDial.tsx
  - client/components/dashboard/GoLiveTrigger.tsx
  - client/components/dashboard/BroadcastMiniController.tsx
  - client/components/dashboard/LiveBanner.tsx
  - client/components/dashboard/ShowSignOff.tsx
  - client/components/dashboard/RecentBroadcasts.tsx
  - client/components/dashboard/TrackProgress.tsx
  - client/components/dashboard/EncoderConnection.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/interfaces/StreamSession.ts
  - api/tests/Feature/HarborAuthTest.php
  - api/tests/Feature/BroadcastTokenControllerTest.php
  - api/tests/Feature/BroadcastTokenServiceTest.php
  - api/tests/Feature/EncoderSessionAttributionTest.php
fingerprint: 4e89ccb16898058a
---

# Broadcasting from the web studio

A station owner goes on air from a browser tab. The tab captures the microphone and a queue of local audio files, mixes them in the Web Audio API, encodes the mix to MP3 in a Web Worker, and sends the frames over one WebSocket straight into the station's own Liquidsoap container (`input.harbor`, "webcast" protocol). There is no server-side studio: **the whole broadcast lives in the browser tab**, in a React context (`BroadcastProvider`) mounted once for the entire dashboard. Close the tab and the show ends.

The one thing people get wrong: **the API never sees the audio and never opens the studio's session.** The API's only jobs are to mint a 60-second token, hand out the WebSocket address, and start the station container. The "live" state, the `StreamSession` row, the Recent Broadcasts entry and the airtime all come from Liquidsoap's `live_connected` / `live_disconnected` callbacks. `POST /stations/{slug}/sessions` exists and is tested, but **nothing in this repository calls it** (see Gaps).

Encoders (BUTT, Mixxx) reach the same harbor mount by a different path and credential. That is [encoder-ingest.md](encoder-ingest.md). The station container itself is in [liquidsoap-station-script.md](liquidsoap-station-script.md); power on/off and the sweep are in [station-lifecycle.md](station-lifecycle.md). The mobile app reuses the same token endpoint from its own manager ([mobile-studio-and-encoder.md](mobile-studio-and-encoder.md)); this doc covers the web client only.

## The flow, end to end

1. **Entry.** "Go live" anywhere opens `GoLiveTrigger`, a two-option dialog: *from this browser* or *from a broadcast app* (encoder). The browser option navigates to `/dashboard/stations/{slug}/live`. The sidebar "Studio" item points at `/live` when idle and `/studio` when a broadcast is running.
2. **Pre-flight** (`live/page.tsx` `PreflightView`). Nothing starts until the person presses **Continue** (`preflightApproved`). This is where the mic is chosen and the saved queue is shown.
3. **Checks** (`BroadcastManager.start`): the steps shown as a list (`network`, `station`, `mic`, `engine`; `mic` is omitted for music-only) run without a socket, and the state becomes `ready`. Nothing is on air.
4. **Go live now** (`BroadcastManager.goLive`): the Ready screen shows **Go live now** / **Cancel**. Go live now connects (not a listed step; the lamp reads "Going live…"), the state becomes `live`, and the page `router.replace`s to `/studio` at once (there is no success hold; the studio's lamp shows LIVE and carries the player link).
5. **Studio** (`studio/page.tsx`): lamp, deck, running order, side rail.
6. **End** (`EndBroadcastButton`): confirm dialog, sign-off summary written to `sessionStorage`, socket closed, station optionally released, redirect to the overview.
7. **Sign-off** (`ShowSignOff` on the station overview): one card, once.

### 1. Pre-flight (`client/app/dashboard/stations/[slug]/live/page.tsx`)

- Fetches `GET /stations/{slug}` (failure: `router.push("/dashboard")`) and, best-effort and once, `GET /stations/{slug}/status` for `live_source`, used only to explain a refusal.
- If `station.is_live && state === "idle"` it shows **"already live"** (`AlreadyLiveView`) instead of pre-flight: encoder wording when `live_source.type === "external"` (names `live_source.client`), otherwise "Someone is live from another browser or computer…". `is_live` is the API's derived flag (see below).
- **What goes out** (radio cards): *Mic + music* or *Music only*. Stored per station in `localStorage["broadcast:micDisabled:{slug}"]`. Music-only never calls `getUserMedia`.
- **Your running order** (`QueueStatus`, `loadQueueSummary`): reads the queue and playback position from IndexedDB *before* any engine exists. Shows track count, bytes of the 2 GiB cap and the last-played title. If the saved offset is at least 1 second it offers **"Pick up at m:ss"** or **"Start it over"** (`resumeFromStart`, stored in `localStorage["broadcast:resumeFromStart"]`, global, not per station). Under a second the choice is hidden because they are the same thing. "Clear queue" opens a confirm dialog and calls `clearQueue(slug)` (deletes this station's tracks and playback position only). States: skeleton while reading, "Empty. Add music files in the studio once you're live" when empty or when storage is unreadable.
- If `station.is_on_air && !station.is_live` (AutoDJ audible) an info row says going live takes over and AutoDJ resumes on End.
- Shows the player URL with a Copy button (`${env.appUrl}/station/{slug}`), then **Continue** / **Cancel** (Cancel returns to the overview).
- After approval the effect calls `start(slug, { skipMic, resumeFromStart })`, guarded by `startedRef` so one approval starts once. It ends at `ready`, which swaps the lamp and step list for `ReadyView`: "Ready when you are.", a **Mic check** card (the studio's `MicMeter` on the provider's `micStream`, drawn closed/grey; hidden for music-only; with two or more inputs it carries `MicPicker`, which lists `enumerateDevices()` audio inputs minus Windows' `communications` duplicate, refreshes on `devicechange`, and calls `BroadcastManager.switchMic(deviceId)`: open the new device, `AudioEngine.setMicStream()` rewires the mic chain, the old tracks stop, and the id is saved in `localStorage["broadcast:micDeviceId"]` (per browser, not per station). Devices are opened with `deviceId: { exact }` (with `ideal`, Chrome traded the chosen mono mic for a default that satisfies `channelCount: 2`). The checklist's mic step opens the saved device and, if that fails for any reason except `NotAllowedError`, opens the default instead of failing. Only at `ready`: there is no mid-show switch), the checks as results (Connection `Good`/`Slow · N kbps` from `getTransportStats().bitrate`, Station reachable `Yes`, Microphone access `Allowed`, Audio engine `Ready`), and **Go live now** / **Cancel**. Go live now calls `goLive()`; the view stays up with the button busy ("Going live…") until the studio opens or the attempt fails into the fault view. Cancel calls `stop()` (no station release, so a started container is left to the sweep) and returns to the overview. Leaving the page any other way while `ready` also calls `stop()`, so the mic is not held open on other dashboard pages.
- **Errors:** `state === "error"` shows a red lamp with the reason and a step list. Mic denied/not found (`isMicPermissionError`, regex on the message) shows a recovery block: *Continue without mic* (sets `micDisabled` true in storage and retries music-only) or *Try again*. Other errors show *Try again* / *Back to station* and a link to `/help/go-live-from-your-browser`.

### 2. `BroadcastManager.start` (`client/lib/broadcast.ts`)

Order matters and is deliberate:

1. `assertBroadcastSupported`: throws if `!window.isSecureContext` ("Broadcasting needs https:// or localhost") or, when not music-only, `navigator.mediaDevices` is absent. Runs before any side effect so a container is never started for an impossible broadcast.
2. **Step `network`** ("Checking your connection", `client/lib/uplinkProbe.ts`): times an empty `POST /broadcast/uplink-probe` (round trip + server work, and warms the connection), then a 96 KB random body; upload kbps = bits ÷ (big − empty) ms. Timeout `PROBE_TIMEOUT_MS` = 10 s, which itself counts as a measurement (≈79 kbps). Tier = the best of `BITRATE_TIERS` [128, 96, 64] with `kbps ≥ tier × 1.5` (`HEADROOM`): ≥192 → 128, ≥144 → 96, ≥96 → 64. Below `MIN_UPLINK_KBPS` (96) the step fails with "Your connection is too slow to broadcast: it uploads about N kbps, and a show needs at least 96…" and nothing else runs, so no container starts; Try again re-probes. A lowered tier relabels the done step "Slow connection: sending at N kbps to keep up". A probe that fails for any other reason (network error, 5xx, the empty request timing out) fails the step with "Couldn't check your connection. Make sure you're online, then try again." and nothing else runs; no bitrate is guessed. Every check's verdict is reported fire-and-forget (`reportUplinkCheck` → `POST /stations/{slug}/uplink-checks`) as an `uplink_check` station event: `outcome` ok / lowered / blocked / failed, `kbps`, `bitrate`, and the browser's Network Information guess (`net_type`, `net_effective`, `net_downlink`, `net_rtt`) to compare against. Those rows are the only trace of a refused go-live, and what the thresholds should be tuned from. A `failed` report goes over the same broken line, so it often doesn't arrive.
3. **Step `station`** `ensureStationOnAir` (up to `STATION_READY_TIMEOUT_MS` = 20 s): `POST /stations/{slug}/start` (idempotent; an already-healthy running station is left alone), then polls `GET /stations/{slug}/status` every `STATION_READY_POLL_MS` = 1 s until `data.ready`. 422/403 from `/start` is shown verbatim (plan limit `station_limit_reached`, ownership); anything else becomes "Could not bring the station on air — please try again". **A timeout is not an error**: it proceeds to publish anyway, on the theory that harbor accepts the connection when it starts listening.
4. **Step `mic`**: `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } })`. All three processing flags are off on purpose (they damage music that shares the mixer).
5. **Step `engine`**: `AudioEngine.create(micStream, onChunk, slug, bitrate)`, `engine.resume()` (inside the user gesture), subscribe to the engine to push metadata, then `restoreQueue()`. Encoded chunks go to the socket only while `ws.readyState === OPEN` **and** the socket's unsent backlog is under `BACKLOG_CAP_MS` = 4 s of audio; otherwise they are dropped and counted as lost (never buffered, so a reconnect or a slow line does not replay stale audio into a live show).
6. **Connect** (`connectWebcast`, not shown as a step; a failure here marks no step, the lamp carries the reason): mint a token (`POST /auth/broadcast-token {station_slug}`; 403 becomes "You do not own this station", any other failure becomes "Not signed in — please sign in and try again"), require a non-empty `ingest_url`, then `openSocket`.
Steps 2–5 are `start()` and end in state `ready`. Step 6 onward is `goLive()`, run from the Start button, which first does the following silently (`quietSteps`: the step list on screen is not updated, the lamp just reads "Going live…"; only a failure is shown, on the step that failed):

- resumes the audio context (inside the Start click);
- if the checklist finished more than `READY_STALE_MS` (3 min) ago, or a mic track has `readyState === 'ended'`, destroys the engine and mic and runs steps 2–5 again (new connection check, new bitrate, new engine);
- otherwise re-runs only the `station` step. `POST /start` is idempotent, so a running station costs one request; a station the sweep stopped while the host sat on Start (only a no-AutoDJ station: 10 min of silence, or 150 s after a browser show that ended in the same run) is started again.

7. After the socket is accepted: `resumePlayback({ fromStart })` (not awaited), acquire the screen wake lock, watch tab visibility, state becomes `live`.

`openSocket` details: `new WebSocket(ingest_url, "webcast")`, `binaryType = "arraybuffer"`, connect timeout `SOCKET_CONNECT_TIMEOUT_MS` = 10 s. On open it sends one JSON frame:

```
{ type: "hello", data: { mime: "audio/mpeg", user: <slug>, password: <token>, audio: { channels: 2, samplerate: 44100, bitrate: <current tier>, encoder: "libmp3lame" } } }
```

The webcast protocol has **no acknowledgement**. The socket is treated as accepted only if it survives `HELLO_GRACE_MS` = 600 ms after the hello. A close inside that window is a rejection ("The stream server rejected this broadcast — the previous connection may still be closing" for close codes 1008/4001, otherwise "…closed the connection before the broadcast started"). This is a timing heuristic, not a handshake.

### 3. Token and harbor auth (API)

`POST /api/auth/broadcast-token` (`BroadcastTokenController`, inside the `auth:sanctum` + `verified` group, `throttle:30,1`):

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

Two credentials, one gate. **The broadcast token is the studio's credential and is open to every plan; the stream key is the encoder's credential and is Pro-gated** (`StreamKeyController::rotate` refuses with 403 `encoder_not_available` for Free; `throttle:6,60`, six per hour). The token is checked first, but a station lookup precedes both so a token minted just before its station was deleted is refused. Authentication happens once at socket open: rotating a key or downgrading a plan does not cut an in-flight broadcast. The `user` field harbor posts (the studio sends the slug there) is not used for the decision, and the token's `user_id` is verified only as part of the MAC, not compared to the station's current owner. Refusals log station/user/address/method/reason at info level and never the credential. The container's own `harbor_auth` posts with a 5 s timeout and fails closed on any non-200.

### 4. The live session (harbor to API)

Harbor's `on_connect` / `on_disconnect` (`station.blade.php`, `live_in.on_connect`, `synchronous=false`) post to `POST /api/internal/station-event` (`StationEventController`):

- `live_connected` carries `client` (user-agent, clipped to 255 characters in the `.liq`; the controller validates max 255, and an empty string is stored as null) and `via` (`browser` when the handshake has an `Upgrade: websocket` or a `sec-websocket-protocol` header, else `external`; the controller accepts only those two values and answers 422 to anything else; missing means `browser`). Unknown event names also get 422, an unknown slug 404. The controller writes the `station-event:{id}` cache entry (TTL 3600 s), a `StationEvent` timeline row, and **`openSession`**: if any open `StreamSession` exists it does nothing; otherwise it creates one (`started_at = now`, `source_type = via`, `client`) and queues `SendStationLiveNotifications` with a **2-minute delay** (that job re-checks the session is still open and emails each un-notified "notify me" subscriber once). Then it fires `StationStateChanged` (queued, not inline) so dashboards refetch.
- `live_disconnected` closes every open session (`ended_at = now`) and deletes the Redis `metadata:{station_id}` key.

So a browser broadcast's session row is created by harbor about when the socket is accepted, not by the studio. `live_source` in `GET /stations/{slug}/status` is the newest open session's `{type, client}`. `Station::isLive()` is "any open `stream_sessions` row"; `StationResource.is_live` is `isRunning() && that`, and `is_on_air` is `isRunning()` alone (true for AutoDJ too).

`stream_sessions` columns: `id` uuid, `station_id`, `started_at`, `ended_at` (null while live), `peak_listeners` (uint, default 0), `source_type` enum `browser|electron|external` (default `browser`; `electron` is reserved and written by nothing), `client` (nullable string), timestamps. The old `total_listener_minutes` column was dropped. **`peak_listeners` is written only by `SweepListenerSessions::recordPeak`** (about once a minute, only when the sampled count exceeds the stored peak, only for the currently open session), not by anything in the studio.

### 5. Reconnect

A socket that closes after being accepted (`watchForDrop`, guarded by `this.ws !== ws`, `stopping` and `established`) starts `reconnect()`; state becomes `reconnecting` and the lamp turns red.

- Everything except the socket stays up: the engine, mic, queue position, push-to-talk, wake lock. The encoder keeps encoding and frames are dropped (counted as lost audio).
- Budget `RECONNECT_BUDGET_MS` = 120 000 ms. Delays between attempts `[1000, 2000, 4000, 8000, 15000]` ms, last repeated, each jittered by +/-20 %. The pause is cut short when the tab becomes visible or the user presses stop.
- Each attempt re-runs `ensureStationOnAir(8000)` (so a station stopped in the meantime is started again), mints a **new** token, and opens a new socket. On success it re-sends the last metadata (harbor forgets it on disconnect) and returns to `live`.
- The budget is deliberately below the API's `studio_gone_stop_seconds` (`LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS`, default 150): past that, a no-AutoDJ station whose last browser session closed is taken off air by the sweep (`StationAudioPolicy::studioHasGoneForGood`). Harbor's own `input.harbor timeout` is `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (default 10 s): until it fires, a dead-but-not-closed source still holds the mount and reconnects are refused. Also note harbor reports the disconnect (and the session closes) when it declares the source gone, so **each drop that outlasts harbor's detection produces its own `stream_sessions` row**.
- Out of budget: `fail(...)` with "Lost the connection to the stream server and couldn't get back on air (detail)": tears down engine, mic, wake lock; state `error`.

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
- **Suspended context:** the engine notifies on `statechange`; `BroadcastProvider` listens for every `pointerdown`/`keydown` and calls `engine.resume()` if suspended.
- `destroy()` stops the current element, disconnects every node, terminates the worker and closes the context. `flushEncoder()` (sent on stop) posts `flush` to the worker with a 1 s safety timeout so the final partial MP3 frame is not lost.

**The queue** is entirely local: `File` objects, never uploaded.

- `addFiles`: only `file.type.startsWith("audio/")`; skipped (and reported "Queue is full") once cumulative bytes would exceed 2 GiB. Duration comes from an `<audio>` metadata read (gives up after 4 s and reports 0, because a hidden Chrome tab never fires `loadedmetadata`). Title/artist from `music-metadata` (`parseBlob`, lazy-imported), else the filename, splitting "Artist - Title" on a dash unless the left part is all digits. The first added file auto-plays if nothing has played (`currentIndex === -1`).
- Each track plays through an `HTMLAudioElement` + `createMediaElementSource` (constant memory, no full decode). **The playhead is not scrubbable** (deliberately: a seek is audible on air).
- **Repeat** has two modes only, `all` (default; the queue wraps) and `one`; there is no "off" because dead air is never wanted. `next()`/`prev()` always move and wrap; only auto-advance honours `one`. Repeat mode is in memory and resets each broadcast.
- Removing the playing track starts the next one (removing the only track stops playback and resets the index to -1). `clearUpcoming()` keeps the playing track. Removal has a 6-second Undo toast (`restoreTracks` re-inserts by remembered order; it does not restart playback).
- **Persistence** (`queueStore.ts`): IndexedDB database `gocast`, version 3, stores `queue` (keyPath `id`, index `station` on the record's `station` slug) and `playback` (keyed by station slug). Every function takes the station slug; the engine gets it from `AudioEngine.create(..., station)` and the pre-flight page from the route. `saveQueue` deletes only that station's records and rewrites every track with a `position` (the store returns records in key order, so without `position` a restored queue came back shuffled). Playback `{currentIndex, offset}` is saved every 5 s while playing, on `pagehide`, and when a track starts. **Paused position is not saved** (`saveProgress` requires `playing`). **Migration from v2** (one unscoped queue, playback key `"current"`): records without a `station` are invisible to the index; `loadQueue(slug)` for a station with nothing of its own claims them in one transaction (`claimLegacy`: rewrites them with the slug, moves the `"current"` playback to the slug's key). So the first station opened after the upgrade inherits the old queue and position; a second station starts empty. Slug, not id, because it is immutable (`Station::booted`) and is what every caller already has. `openDB` rejects on `blocked` and closes on `versionchange` so a tab on the old schema cannot hang the upgrade; a tab on the old code that outlives the upgrade fails its own saves with `VersionError`.
- `restoreQueue()` (step `engine`) loads tracks immediately with `duration: 0`, then fills durations and old "Unknown" artist tags in the background (durations retried once when the tab becomes visible). `resumePlayback()` runs only after the socket is accepted, otherwise the first seconds would be encoded into a closed socket. It cues the saved track at the saved offset, or from 0 with `fromStart`; it does not clamp against `duration` (still 0 at that point); `playIndexAtOffset` clamps to the real length.

**Metadata to listeners.** On every engine change the manager sends `{type:"metadata", data:{title, artist}}` over the socket when the current track's `title\0artist` differs from the last frame sent (`sentMetadataKey`). It is cached in `lastMetadata` and replayed after a reconnect. With no queue nothing is sent, and Liquidsoap's `live_metadata` substitutes the placeholder `LIQUIDSOAP_LIVE_BROADCAST_TEXT` (default "Live Broadcast") for a source that sends none.

### 7. Studio screen (`studio/page.tsx`)

Renders nothing unless `isLive` (state `live` or `reconnecting`) **and** a signal exists. Two layouts from one tree, chosen by `matchMedia("(max-width: 1279px)")` and matching `xl:` classes: below 1280 px the deck stacks, the Share/End buttons move to the top, and the `StreamPanel` rail is hidden; from 1280 px a 340 px right rail. (Was 1024 px: with the sidebar open the rail left the deck under 430 px.) Independently of that, the talk row in `OnAirDeck` is a `@container/talk`: `PushToTalk` puts the talk pad above the meter and mic buttons until the deck is 52 rem wide, and only shows the device name from 64 rem. Tab title becomes `● LIVE · {station} | GoCast` while live.

**The lamp** (`OnAirLamp` fed by `useStudioSignal` in `components/studio/signal.ts`) is the single answer to "is it working". Ranked states, first match wins:

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

Transport health (`useTransportHealth`) samples `getTransportStats()` every `HEALTH_POLL_MS` = 2000 ms. The counters (`bytesSent`, `chunksSent`, `chunksDropped`, `droppedMs`, `lastDropAt`) only count after the first successful handshake (`countersArmed`), so startup silence is not "lost audio". `droppedMs` is a wall-clock duration of drop runs (including an open one), shown as "N.Ns of audio lost". These count what actually left the socket, not what the encoder produced.

The lamp also shows uptime (from `liveSince`), listeners, and the encoder's **current** bitrate (brighter, with a tooltip, when below 128). The `live` detail copy states "Listeners hear you about 15–20 seconds after you speak" (see Gaps).

**Deck** (`OnAirDeck`): a time-left dial (`TrackDial`, canvas ring draining clockwise; goes white at 20 s left), title/artist, a read-only progress bar, "Then {next}" and time until the queue loops, transport (prev / play-pause / next), the push-to-talk strip (hidden for music-only), and the monitor bar. Position, bar, clock and loop time are written straight to the DOM from one `requestAnimationFrame` loop reading the engine every frame (not memoised; an earlier memo froze at mount). Talk-up cues at 20 s and 10 s left pulse the clock and set an sr-only status line, only when the countdown genuinely crosses the threshold.

**Push to talk** (`PushToTalk`): pointer events with capture (a finger sliding off keeps the mic open until lift), `Space` anywhere except in a text field or inside a dialog/menu/toast/sortable handle (`isTypingTarget`, `isOverlayTarget`); `Enter` on the focused pad also works; window blur or the tab hiding releases the mic. A focused button does not get a click from Space keyup. "Keep mic on" latches (`L`). `MicMeter` is a 40-segment dBFS peak meter (floor -60 dB) tapping the `MediaStream` before the talk gain, so the level can be checked with the mic closed (grey when closed, sky when open, clip at -1 dB). `MicSettings` popover: music level (Under you / Low / Silent), fade (Instant / Smooth / Slow), Broadcast voice switch.

**Keyboard** (bound in `studio/page.tsx`, ignored with modifiers, repeats, typing targets and overlays): `K` play/pause, `N` next and `P` previous (only when the queue has more than one track), `R` cycle repeat, `M` monitor, `L` latch (not in music-only). `Space` is push-to-talk (in `PushToTalk`).

**Running order** (`FileQueue`): drag-and-drop reorder (dnd-kit with pointer, touch (150 ms hold) and keyboard sensors), drop audio files anywhere on the panel or use Add files (`accept="audio/*"`), per-row remove, Clear upcoming, per-row projected air time (wall clock, null while nothing plays or in repeat-one; drifts after any skip/pause/mic), total duration and bytes vs the 2 GiB cap (emphasised above 90 %), repeat toggle.

**Side rail** (`StreamPanel`, wide screens only): listeners now, peak and a 24-sample sparkline; player link with Copy; Embed (Pro; Free sees a Pro badge that opens the upgrade request) and QR code; "This broadcast" (started time, data sent); collapsible shortcut list; link to `/help/using-the-studio`; End broadcast.

**Statistics** (`useBroadcastStats`): listeners come from the **public** endpoint `GET /public/stations/{slug}/listeners` via the shared feed in `usePublicStationStats.ts` (one timer per slug per tab, `POLL_MS` = 10 s, `pauseWhenHidden: false` here as the one exception). Peak and history are module-scope, keyed `slug:liveSince`, so a trip to the library and back resumes the same numbers; `HISTORY_LENGTH` = 24 samples with `MIN_SAMPLE_GAP_MS` = 5000 between them. It toasts "First listener tuned in" and milestone counts once per show (`fireOnce`). The public count is the Redis-backed `ListenerAnalytics::liveCount`; its Icecast half is refreshed by `stations:sync-listeners` once a minute, so the number moves in minute-sized steps however often it is polled. The peak here is the **client's** own; the Recent Broadcasts peak is the server's `peak_listeners`. They can differ.

### 8. Elsewhere in the dashboard while live

- `BroadcastProvider` (`app/dashboard/layout.tsx`; `start()` ignores a second call while one is in flight and stops any previous manager first, so "Try again" always builds a fresh one; the first ever live show fires a one-time "You're live for the first time" toast) wraps the whole dashboard so navigating between dashboard pages (via `<Link>`, never a full load) keeps the show alive. A `beforeunload` handler warns on refresh/close while `live` or `reconnecting`.
- `LiveBanner` (below the header, every page except the studio): the same lamp plus "Open studio" and a **Mic off** button when the mic is latched.
- `BroadcastMiniController` (fixed bottom bar, not on the studio): title, mic/live state, listener count, play/pause and next. It also keeps `useBroadcastStats` polling while the studio is unmounted and sets `data-mini-controller` on `<html>` so toasts lift clear of it.
- `dashboard/error.tsx`: the layout stays mounted, so a page crash mid-show says "Your broadcast is still on air".
- `StationActions` (overview button): if `station.is_live` and this tab is the broadcaster it shows "Open studio"; if live but not from this tab it shows a passive "Live from another browser or encoder."; else it wraps a Go live button in `GoLiveTrigger`.

### 9. End broadcast (`EndBroadcast.tsx`, `BroadcastContext.stop`)

Confirm dialog (not dismissable while ending). Wording depends on `after`: `off_air` (plan has no AutoDJ: `useAutoDjLocked()`), `silence` (AutoDJ plan but `status.playlist_length === 0`, read from a status poll that runs only while the dialog is open), else `autodj`. An unknown plan or status keeps the AutoDJ wording.

On confirm: build a `ShowSummary` (duration from `liveSince`, `getSessionPeak`, `droppedMs`, `after`) and write it to `sessionStorage["gocast:signoff:{slug}"]` **before** `stop()`; then `stop({ releaseStation: autoDjLocked })`; then `router.push` to the overview and `router.refresh()`.

`BroadcastManager.stop()`: sets `stopping` (which aborts any in-flight reconnect), flushes the encoder if the socket is open, closes the socket with code 1000 "broadcast ended" (harbor sees a source disconnect and posts `live_disconnected`), destroys the engine, stops mic tracks, releases the wake lock, state `idle`. `BroadcastProvider.stop` clears `stationSlug`, `liveSince`, mic/engine refs and removes `broadcast:micDisabled:{slug}`.

**Releasing the station** applies only to accounts without AutoDJ: `releaseStation` calls `POST /stations/{slug}/stop`, retrying at `[0, 400, 800, 1500, 2500]` ms because the API refuses a stop with 409 `station_is_live` while a session is still open and harbor's `live_disconnected` lands slightly after the socket closes. Any non-409 answer aborts the retry. With AutoDJ the container stays up and AutoDJ takes over at the next track boundary. The sweep (`stations:sweep`) is the backstop for every other path.

`StationPowerController::stop` refuses (409) while a session is open unless `force` is set **and** the open session is `external` (`station_is_live_external`); a browser broadcast is never force-stoppable from the API.

### 10. Sign-off (`ShowSignOff`)

Read once on mount of the overview: reads and immediately removes the `sessionStorage` entry, shows it only if it is under `FRESH_MS` = 30 minutes old. "That's a wrap." plus On air, Peak listeners, Audio lost ("None" when 0), and one sentence per `after`. Dismissable. Storage failures mean no card; nothing else breaks.

### 11. History pages

- **Recent broadcasts** on the overview (`RecentBroadcasts`, last 5) and the **Broadcasts** page (`/dashboard/broadcasts`) both read `GET /stations/{slug}/sessions` (`StreamSessionController::index`: `authorize('view')`, `latest('started_at')->paginate(20)`). Source label map: `browser` Studio, `electron` Desktop, `external` Encoder; the `client` string is a tooltip. The Broadcasts page uses the caller's single station (`getMyStation`), keeps only finished sessions, shows "Your latest N shows" when `total > page size`, and scales each duration bar to the longest show capped at 3 hours. Empty state shows a Go live action.
- Live airtime only: a station that only ever ran AutoDJ has no rows.

## Endpoints

| Route | Controller | Auth | Notes |
|---|---|---|---|
| `POST /api/auth/broadcast-token` | `BroadcastTokenController` | sanctum + verified, `throttle:30,1` | body `station_slug`; returns `token`, `expires_in` 60, `ingest_url` |
| `POST /api/broadcast/uplink-probe` | `UplinkProbeController` | sanctum + verified, `throttle:20,1` | raw body, returns `{bytes}`; 413 over 256 KB; nothing stored |
| `POST /api/stations/{slug}/uplink-checks` | `UplinkCheckController` | owner (`update`), `throttle:20,1` | the check's verdict → `uplink_check` event; admin monitoring only |
| `POST /api/stations/{slug}/start` | `StationPowerController::start` | owner, `throttle:20,1` | 202; 422 `station_limit_reached`; 503 `station_start_failed` |
| `POST /api/stations/{slug}/stop` | `StationPowerController::stop` | owner, `throttle:20,1` | 409 `station_is_live` / `station_is_live_external`; `force` only cuts encoders |
| `GET /api/stations/{slug}/status` | `StationStatusController` | owner, `throttle:120,1` | `slug`, `state`, `desired_state`, `started_at`, `reachable`, `ready`, `icecast_connected`, `last_ready_at`, `source`, `broadcaster`, `live_source`, `now_playing`, `elapsed`, `remaining`, `playlist_length`, `up_next` (max 5) |
| `GET /api/stations/{slug}/sessions` | `StreamSessionController::index` | owner (`view`) | paginated, 20 |
| `POST /api/stations/{slug}/sessions` | `StreamSessionController::store` | owner (`update`) | **not called by any client here**; see Gaps |
| `DELETE /api/stations/{slug}/sessions/{session}` | `StreamSessionController::destroy` | owner (`update`) | **not called**; does not check the session belongs to the station |
| `POST /api/internal/harbor-auth` | `HarborAuthController` | `X-Internal-Key`, 300/min/IP | 200 allow / 403 refuse |
| `POST /api/internal/station-event` | `StationEventController` | `X-Internal-Key` | opens/closes sessions |
| `POST /api/stations/{slug}/stream-key` | `StreamKeyController::rotate` | Pro, `throttle:6,60` | encoder credential; see [encoder-ingest.md](encoder-ingest.md) |

Config and env: `LIQUIDSOAP_INGEST_URL`, `LIQUIDSOAP_HARBOR_INPUT_PORT` (8090), `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (10.0), `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` (150), `LIQUIDSOAP_SILENT_STOP_SECONDS` (600), `LIQUIDSOAP_LIVE_BROADCAST_TEXT`. Harbor is rendered with `buffer=5., max=10.`, and a further `buffer(buffer=2., max=10.)` sits on the live arm (`station.blade.php`).

**Production routing:** nginx `gocast-stream.conf` maps `location ~ "^/broadcast/([a-z0-9][a-z0-9-]{0,62})$"` to the station-router container with WebSocket upgrade headers, `proxy_read_timeout`/`proxy_send_timeout` 24 h and buffering off. The slug charset constraint is a security boundary (the router turns it into a hostname).

## Surfaces

| Surface | What |
|---|---|
| `GoLiveTrigger` dialog | pick browser vs broadcast app (Pro-locked, opens `EncoderView`; connection details via `EncoderConnection`, a poll every 2 s via `useStationStatus(..., 2000)` to say when an encoder connects) |
| `/dashboard/stations/{slug}/live` | pre-flight, connection steps, lamp, 3 s hold, then redirect to the studio |
| `/dashboard/stations/{slug}/studio` | the studio (redirects to `/live` if idle and never live, to the overview once a live show returns to idle) |
| Every dashboard page | `LiveBanner`, `BroadcastMiniController`, sidebar "Studio Live" marker, tab-close warning |
| Overview | `ShowSignOff`, `RecentBroadcasts`, `StationActions`; `TrackProgress` is the AutoDJ (not studio) progress bar, driven by `useTrackProgress` from the status poll |
| `/dashboard/broadcasts` | session history |
| Help | `/help/go-live-from-your-browser`, `/help/using-the-studio`, `/help/my-encoder-wont-connect` |
| Mobile | separate manager against the same token endpoint; see [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md) |

Related: [realtime-events.md](realtime-events.md) (`StationStateChanged`), [listener-analytics.md](listener-analytics.md) (listener counts and `peak_listeners`), [notifications-and-email.md](notifications-and-email.md) (the live email), [accounts-plans-invites.md](accounts-plans-invites.md) (`canUseEncoder`, `autodj_enabled`).

## Gaps and traps

1. **`StreamSessionController::store` and `destroy` are dead in practice.** No client here calls them (the web studio opens no session; harbor does). The controller docblock says so. `BroadcastStateService` (Redis `broadcast:station:{id}` keys, statuses `starting`/`live`/`reconnecting`, TTLs 60/90/45 s) is used **only** by `store`/`destroy`; `markLive`, `markReconnecting`, `isLive` and `isLiveFromState` are never called anywhere. `EncoderSessionAttributionTest` and `StationNotifySubscriptionTest` exercise `POST /sessions` as a "studio", which the real studio never does. `destroy` also does not check `$session` belongs to `$station`.
2. **`electron` source type is reserved and written by nothing**, but is in the enum, the TypeScript union and the label map ("Desktop").
3. **The studio goes blank when a broadcast dies.** `studio/page.tsx` returns `null` unless `isLive && signal`, and its redirect effect only handles `state === "idle"`. After reconnect exhaustion `fail()` leaves `state = "error"`: the studio renders nothing, no redirect, no banner, and the only notice is on the `/live` page. `BroadcastProvider` also does not clear `engine`/`micStream` on `error` (only on `idle`), so they keep pointing at a destroyed engine.
4. **Each drop can split a show into several `stream_sessions` rows.** A drop that harbor detects closes the session; the reconnect opens a new one with `peak_listeners` reset. The client's `liveSince`, uptime and sign-off duration span the whole show, so sign-off duration and the Broadcasts page can disagree.
5. **`peak_listeners` is sampled once a minute by another command** (`listeners:sweep`, `SweepListenerSessions::recordPeak`), only while the session is open, so a peak that rises and falls between two runs can be missed. The studio rail's peak is the client's own 10 s polling.
6. **Reloading the studio tab strands you for about 10 s.** The socket closes uncleanly; until harbor's timeout (default 10 s) the session stays open, so `station.is_live` is true and the `/live` page shows "Someone is live from another browser or computer" although it was this browser. The queue survives (IndexedDB), the show does not.
7. **Comment/code disagreement on the mic choice.** `GoLiveTrigger.tsx` says the last mic-off choice "survives to the next broadcast", but `BroadcastProvider.stop()` removes `broadcast:micDisabled:{slug}`, so it resets after every show. (`broadcast:resumeFromStart` is never removed.)
8. **The latency claim in the lamp copy is hard-coded** ("about 15–20 seconds") in `signal.ts`. The code shows harbor `buffer=5.`, a further 2 s live buffer, then HLS 4 s segments (`segment_duration = 4.`, `segments = 5`) plus the player's own buffering. That sums to roughly 5 s harbor + 2 s buffer + up to 5 x 4 s HLS window before the player's own buffering; the 15-20 s figure is an estimate that cannot be confirmed without a live Liquidsoap and player.
9. **`useAudioLevels.ts`, `AudioEngine.getAnalyser()`, `AudioEngine.clearQueue()` (the engine method) and `BroadcastManager.getSessionId()` are unused.** The engine builds and connects an analyser nobody reads. The go-live page clears the queue through `queueStore.clearQueue()` directly.
10. **The queue is per browser profile and station, not per account.** Two users who share a browser and open the same station share its queue. Files stay on that machine; a different device starts empty. The 2 GiB cap in `audioEngine.ts` is per engine, so with several stations the real ceiling is the browser's origin quota across all of them.
11. **Repeat mode is not persisted** and paused positions are not saved (only playing state is written every 5 s).
12. **The broadcast token does not check that the station is running or that the caller's plan allows anything**, and the token's `user_id` is never compared to the current owner at harbor-auth (the MAC binds it to the slug for 60 s). Consequences are limited (owner-only mint, 60 s TTL) but the token is a slug bearer, not an ownership proof.
13. **The first-start timeout is silently accepted.** If the container is not `ready` after 20 s the studio publishes anyway; the first seconds can be lost with no message.
14. **Auto-stop interplay.** A no-AutoDJ station is taken off air by the sweep 150 s after its last browser session closed; `RECONNECT_BUDGET_MS` (120 s) must stay below that. The client (`broadcast.ts`) and the API (`StationAudioPolicy`) agree only through comments; nothing enforces the ordering.
15. **Release-on-End is best effort.** `releaseStation` gives up after about 5.2 s of 409 retries or on any other status; the sweep cleans up later. It runs only when the plan lacks AutoDJ; an unknown plan (`usePlan()` null) never releases.
16. **The End dialog's "silence" wording depends on a status poll** that only runs while the dialog is open; if it hasn't returned, the AutoDJ wording is shown and the sign-off card may say the wrong thing.
17. **Mixed content in dev.** With `LIQUIDSOAP_INGEST_URL` unset the studio gets `ws://<bridge-ip>:8090/<slug>`, which a page on `https://` cannot open. `infra/native/README.md` describes leaving it empty, while `api/.env.example` and `infra/native/env/api.env.example` set `wss://stream.gocast.fm/broadcast/{slug}`; the README and the env examples disagree.
18. **Secure context required.** Over plain http on a LAN address `AudioWorklet` and `mediaDevices` do not exist. `assertBroadcastSupported` throws a readable error, but it fires before any step is active, so no step shows the error, only the lamp.
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
- No client unit tests exist for `broadcast.ts`, `audioEngine.ts` or the studio components. `client/tests/e2e` holds only `auth.spec.ts` and `help-screenshots.spec.ts`. The browser path is verified by hand; automation tabs are hidden and HLS/feed behaviour differs there.

## History

History and rationale only, never the spec: `docs/ENCODER-INGEST-PLAN.md` (encoder path). The studio redesign, mic settings, queue resume and harbor latency work were recorded in session notes, not in `docs/`. The code comments cited above carry most of the reasoning.
