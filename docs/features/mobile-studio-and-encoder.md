---
feature: Mobile studio and native encoder (broadcasting from the phone)
verified: 2026-09-29 against 360c382 plus uncommitted work
sources:
  - mobile/src/app/live/[slug].tsx
  - mobile/src/app/studio/[slug].tsx
  - mobile/src/app/summary/[slug].tsx
  - mobile/src/audio/engine.ts
  - mobile/src/audio/fileSource.ts
  - mobile/src/audio/id3.ts
  - mobile/src/audio/micPrefs.ts
  - mobile/src/audio/queueStore.ts
  - mobile/src/audio/tags.ts
  - mobile/src/broadcast/BroadcastContext.tsx
  - mobile/src/broadcast/broadcastManager.ts
  - mobile/src/broadcast/hooks.ts
  - mobile/src/components/LiveStrip.tsx
  - mobile/src/components/studio/Band.tsx
  - mobile/src/components/studio/Console.tsx
  - mobile/src/components/studio/Focus.tsx
  - mobile/src/components/studio/Milestone.tsx
  - mobile/src/components/studio/OnAir.tsx
  - mobile/src/components/studio/Sheets.tsx
  - mobile/src/components/studio/model.ts
  - mobile/src/lib/api.ts
  - mobile/src/lib/kv.ts
  - mobile/src/lib/auth.tsx
  - mobile/src/app/_layout.tsx
  - mobile/src/app/account.tsx
  - mobile/modules/gocast-encoder/src/GocastEncoderModule.ts
  - mobile/modules/gocast-encoder/android/src/main/java/app/gocast/encoder/GocastEncoderModule.kt
  - mobile/modules/gocast-encoder/ios/GocastEncoderModule.swift
  - mobile/modules/gocast-encoder/expo-module.config.json
  - mobile/modules/gocast-keepalive/src/GocastKeepAliveModule.ts
  - mobile/modules/gocast-keepalive/android/src/main/java/app/gocast/keepalive/GocastKeepAliveModule.kt
  - mobile/modules/gocast-keepalive/android/src/main/AndroidManifest.xml
  - mobile/modules/gocast-keepalive/expo-module.config.json
  - mobile/app.json
  - mobile/eas.json
  - mobile/package.json
  - mobile/patches/react-native-audio-api+0.13.6.patch
  - mobile/scripts/ingest-proxy.mjs
  - mobile/scripts/start.mjs
  - api/routes/api.php
  - api/app/Http/Controllers/BroadcastTokenController.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Services/BroadcastTokenService.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/resources/views/liquidsoap/station.blade.php
  - infra/native/station-router/nginx.conf
fingerprint: 874fd645305019fd
---

# Mobile studio and native encoder

The phone can broadcast: the Android app mixes a mic and a queue of music files on the device, encodes the mix to AAC with a native module, and sends it to the same harbor WebSocket the [web studio](broadcasting-web-studio.md) uses. It is a port of the web studio's engine and `BroadcastManager` with a different plumbing layer (native AAC instead of lamejs MP3, a foreground service and OS locks instead of a screen wake lock). The show runs with the screen locked, on purpose.

The one thing people get wrong: **broadcasting is Android only.** The encoder's iOS half is a stub that throws `ERR_UNSUPPORTED` on `start`, and the keep-alive module has no iOS half at all. Everything in this doc is verified for Android code paths; iOS would hit the stub on the first PCM chunk (see Gaps). A second easy mistake: the phone does not use the stream key or the encoder path ([encoder-ingest](encoder-ingest.md)); it authenticates with the same 60-second broadcast token as the browser.

Where the app shell, sign-in and the station screens live: [mobile-app-shell-and-auth](mobile-app-shell-and-auth.md), [mobile-station-screens](mobile-station-screens.md). The station power lifecycle the phone calls into: [station-lifecycle](station-lifecycle.md).

## What it actually does: Go Live to bytes on the wire

1. **Pre-flight** (`mobile/src/app/live/[slug].tsx`, route `/live/[slug]`). Reached from the station page's "Go live" buttons. Shows two modes (Mic + music, Music only; the choice is remembered per station), a checklist, and a big "Go live now" button. Checklist rows: Microphone (via `AudioManager.checkRecordingPermissions()`; the row is not rendered at all in Music only), "Keep running when locked" (`GocastKeepAlive.isIgnoringBatteryOptimizations()`), Running order (count and size of the saved queue, with a confirmed Clear that also deletes the saved position and the resume switch's setting), Connection (a timed `GET /stations/{slug}`; under 1500 ms is OK, otherwise "Slow", failure is "Can't reach GoCast" with a Retry). Mic mode is stored per station in kv as `broadcast-mic-disabled-<slug>`. When the station is on air on AutoDJ (`is_on_air` and not `is_live`) on a plan with AutoDJ, a note says AutoDJ fades out when you start. All four re-read on screen focus and whenever the app returns to `active` (the grants happen in system dialogs). None of the rows blocks the button, including the battery one. The button is disabled only when `blocked`: this phone is already live on another station, or the station's `is_live` is already true while this phone's broadcast is idle (someone is live from another device; the API takes one show at a time).
   - If a saved playback position of at least 1 s exists, a "Pick up at m:ss / Start it over" switch appears under Running order (`broadcast-resume-from-start` in kv, global, not per station).
   - Button label: "Go live now", "Allow mic & go live" when the mic is wanted but not granted, "Try again" after a failure. With the mic wanted and not granted, `goLive()` asks first (`askMic`); if it was already `Denied`, it opens system Settings instead.
   - After a failed start whose message contains "microphone", a "Go live without the mic" button appears; it sets Music only and relaunches.
2. **Countdown.** `launch()` sets `launchedAt` and calls `broadcast.start(slug, name, {skipMic, resumeFromStart})`. A full-screen coral 3-2-1 (`COUNT_FROM` 3, `COUNT_STEP_MS` 800) runs while the connection comes up. It is theatre only: `router.replace('/studio/[slug]')` happens once `phase === 'live'` **and** the countdown has finished, so a fast connect still waits 2.4 s, and a slow one shows "CONNECTING" with the active step's label. Cancel, or hardware Back, calls `broadcast.stop()` (no station release, see below). A stop that lands while `start()` is still running makes the next `throwIfStopped()` check throw `StartCancelled`, and `abandonStart()` tears down whatever came up after `stop()` ran (notification, engine, socket) without reporting an error. A `phase === 'error'` returns to pre-flight, which shows the reason.
3. **`start` in `mobile/src/broadcast/BroadcastContext.tsx`.** The show does not live in React state: `snapshot`, `manager`, the in-flight `starting` promise and the last plan value (`autoDjLocked`) are module-level, and the provider reads them with `useSyncExternalStore`, so a remount of the whole tree (a swipe out of Recents, see Keeping the show alive) finds the running show instead of orphaning it. `start` first waits out any start still in flight (Cancel then a quick Go live) and returns if a manager exists afterwards (a double tap); otherwise it stops any previous manager, resets session stats, builds a `BroadcastManager`, and calls `manager.start`. The provider sits above the navigator in `_layout.tsx`, so leaving the studio screen does not end the show; `LiveStrip` ("Back to studio") is shown on the station screens.
4. **`BroadcastManager.start`** (`mobile/src/broadcast/broadcastManager.ts`) runs four steps, reported to the UI as `steps` (`station`, `mic` (skipped for music only), `engine`, `stream`):
   1. *Station.* `ensureStationOnAir()`: `POST /stations/{slug}/start` (throttle 20/min in `api/routes/api.php`, answers 202; idempotent when already running, `StationLifecycleService::start`). A 422 (`station_limit_reached`, the plan's running-station cap) or a 403 (the `update` policy, i.e. not the owner) surfaces the API's message; anything else, including a 503 `station_start_failed`, becomes "Could not bring the station on air". `start` never raises the AutoDJ-unavailable 403. Then polls `GET /stations/{slug}/status` (throttle 120/min) every 1000 ms until `data.ready`, up to 20 s. **If the deadline passes it returns normally, not with an error**; the flow carries on and opens the socket anyway.
   2. *Mic.* `AudioManager.requestRecordingPermissions()`; anything but `'Granted'` throws `MicPermissionError` ("Microphone access denied ...").
   3. *Engine.* `startForegroundService(withMic)`, then `AudioEngine.create(withMic, onPcm)`, subscribe for metadata, `engine.restoreQueue()`.
   4. *Stream.* `connectWebcast()`: `POST /auth/broadcast-token` `{station_slug}` (throttle 30/min, requires a verified account and station ownership; 403 becomes "You do not own this station", any other failure "Not signed in"), which returns `{token, expires_in: 60, ingest_url}`. Then `openSocket`.
5. **Playback starts last.** After the socket is up, `engine.resumePlayback({fromStart})` runs (fire and forget) and state becomes `live`. Playback therefore does not begin until the connection exists; nothing plays on air during connect.

### The socket

- `new WebSocket(ingestUrl, 'webcast')` (sub-protocol `webcast`), `binaryType = 'arraybuffer'`. Connect timeout 10 s (`SOCKET_CONNECT_TIMEOUT_MS`).
- On open it sends one JSON text frame: `{type:'hello', data:{mime:'audio/aac', user:<slug>, password:<broadcast token>, audio:{channels:2, samplerate:<engine rate>, bitrate:128, encoder:'aac'}}}`. There is no server acknowledgement to wait for, so the promise resolves `HELLO_GRACE_MS` = 600 ms after open if the socket has not closed. A close inside that window is read as a rejection (codes 1008/4001 get "the previous connection may still be closing", anything else "closed the connection before the broadcast started"). A rejection that arrives later than 600 ms is treated as a normal drop and enters reconnect.
- After that, binary frames are raw ADTS AAC bytes (below), and metadata goes as JSON text frames `{type:'metadata', data:{title, artist}}`.
- **URL.** `ingest_url` comes from `BroadcastTokenController` -> `LiquidsoapSupervisor::ingestUrl()`: `LIQUIDSOAP_INGEST_URL` with `{slug}` substituted (prod example `wss://stream.gocast.fm/broadcast/{slug}`), else `ws://<container host>:<harbor_input_port 8090>/<slug>`. The second form is a Docker bridge IP a phone cannot reach; in development `EXPO_PUBLIC_INGEST_URL` (with `{slug}`) overrides it in the app (`INGEST_URL_OVERRIDE`). The override is applied in **every** build that has the env var set, not only dev, so a production build must not carry a stale dev value (the local `mobile/.env.production.local` leaves it empty). `mobile/scripts/ingest-proxy.mjs` (TCP forward `0.0.0.0:18091` (`PORT` overrides) -> `127.0.0.1:8091`, the station router's loopback listener) and `npm start` (`scripts/start.mjs`) exist so a phone on the LAN can reach a local station router.
- **Server side.** In production the station router (`infra/native/station-router/nginx.conf`) matches `/broadcast/<slug>`, strips the prefix and proxies the WebSocket upgrade to `gocast-liquidsoap-<slug>:8090` (`proxy_read_timeout 24h`). Inside the container `input.harbor(slug, port=8090, auth=harbor_auth, buffer=5., max=10., timeout=<LIQUIDSOAP_HARBOR_INPUT_TIMEOUT, default 10>, icy=true)` calls `POST /api/internal/harbor-auth` (`HarborAuthController`): a valid station-scoped token passes with no plan check (`BroadcastTokenService::verify`, HMAC with `APP_KEY`, TTL 60 s); the only database read is that the station row still exists, and the token's user id is not re-checked against the owner. `on_connect` then classifies the connection as `via: browser` if the request has an `Upgrade: websocket` header or a `Sec-WebSocket-Protocol`. **The phone therefore appears as a "browser" / Studio session**, with the socket's user agent as `client` (not observable without a live container; React Native's WebSocket is OkHttp on Android). Consequences: the owner cannot be told apart from a web studio session in `live_source`, the "cut off external broadcast" force-stop does not apply to it (only `external` sessions can be force-stopped, `StationLifecycleService::stop`), and `StationAudioPolicy::studioHasGoneForGood` treats its end like a web studio ending.

### The audio path (`mobile/src/audio/engine.ts`)

```
file source -> fileGain ------------------------------------------> mixer -> tap (worklet, 100 ms) -> sink (gain 0) -> destination
               fileGain -> monitorGain -> destination (speakers)               |
mic -> micTrim -> micDry -----------------------> micGain --------> mixer     +-> JS onPcm -> GocastEncoder.encode (limiter + AAC) -> ws.send
          micTrim -> highpass 80Hz -> presence +3dB@3kHz -> voice compressor (worklet) -> micWet -> micGain
          micTrim -> micAnalyser (level meter) -> sink
```

- Built on `react-native-audio-api` 0.13.x (`AudioContext`, gain/biquad/analyser nodes, `AudioRecorder`, worklets via `react-native-worklets` `scheduleOnRN`). Every node uses `channelCountMode: 'explicit'`, a workaround for that library handing one node's buffer to several consumers and gains overwriting it in place (a monitor at 0 used to silence the broadcast).
- **Sample rate.** `AudioManager.getDevicePreferredSampleRate()` if it is 44100 or 48000, else 48000. The web is pinned at 44.1 kHz for lamejs; here the same rate goes into the AAC encoder and the hello frame.
- **The tap** is a `WorkletNode` with buffer length `round(sampleRate/10)` = 100 ms, stereo, on the `AudioRuntime`. Each hand-off delivers `Float32Array` left and right to `BroadcastManager.onPcm` and to `tickProgress`.
- **Mic.** `startMic()` creates an `AudioRecorder`, feeds it through a recorder adapter and `micTrim` (input gain in dB, default +28, range 0..40, `micPrefs.ts`), then the dry path or the "broadcast voice" chain (high-pass 80 Hz Q 0.707, peaking +3 dB at 3 kHz Q 1, a worklet compressor: threshold -20 dB, knee 6, ratio 3, attack 5 ms, release 150 ms, gain recomputed every 16 samples, makeup about 8 dB). `broadcastVoice` (default on) crossfades dry and wet at 20 ms. The mic gain is 0 when closed and `MIC_BOOST` = 3 while talking, ramped with time constant 20 ms. The patch to the library sets the Oboe input preset to `VoicePerformance` (its default was a flat speech-recognition preset that came out about 20 dB under the music) and moves the output stream to shared, non-low-latency mode with the whole buffer capacity in use (the 100 ms tap burst clicked through a low-latency exclusive stream) (`mobile/patches/react-native-audio-api+0.13.6.patch`, applied by `patch-package` on `npm install`).
- **Push to talk** (`pttDown/pttUp`): opens the mic and ducks the music (`fileGain`). Duck levels `under` 0.2 (labelled Light), `low` 0.08 (Medium), `silence` 0 (Deep); fade time constants `instant` 0.03 s, `smooth` 0.13 s, `slow` 0.5 s. **Latch** (`setMicLatched`, the "Keep mic open" switch) holds the mic open; while latched, `pttUp` is ignored. In the UI the mic opens only after a 300 ms hold (`HOLD_MS`) with up to 48 pt of finger drift (`useHoldToTalk`, gesture-handler LongPress); a tap closes a latched mic. Leaving the screen mid-hold calls `pttUp`.
- **Monitor.** Music (never the mic) to the phone's own speaker/headphones through `monitorGain`; off by default, volume default 0.62, steps of 10% in the mic sheet.
- **Master limiter** is not in JS: it is inside the encoder module (below), because the audio library has no compressor node.
- Mic settings (`duck`, `fade`, `broadcastVoice`, `inputGainDb`) persist as `studio-mic-v1` JSON. Monitor state, repeat mode and latch do not persist.

### The native encoder (`mobile/modules/gocast-encoder`)

Expo module `GocastEncoder` with three synchronous functions.

| Function | Behaviour |
|---|---|
| `start(rate, channels, bitrate)` | Releases any previous codec, requires `rate` to be one of the 13 standard AAC ADTS rates (else `ERR_SAMPLE_RATE`), resets limiter state, creates `MediaCodec` `audio/mp4a-latm`, AAC-LC, `KEY_BIT_RATE = bitrate`, max input 64 KB. Manager passes 128 000 bps and 2 channels. |
| `encode(left, right?)` | Throws `ERR_NOT_STARTED` before `start`. Runs the limiter per frame, converts to 16-bit little-endian PCM, queues it into the codec (blocking up to 10 ms per input buffer, draining output to free one), and returns the concatenation of all output frames each prefixed with a 7-byte ADTS header (MPEG-4, no CRC, profile LC, sample-rate index, channels). May return zero bytes (the encoder primes first); the manager just returns when the length is 0. With a mono encoder and `right` null it uses left; with a stereo encoder and `right` null it duplicates left. |
| `stop()` | Stops and releases the codec. Also on module destroy. The tail still in the codec is not flushed. |

Why ADTS: every frame carries its own header, so harbor can sniff the stream from the first byte and a lost frame costs about 23 ms instead of the stream. Why AAC and not the web's MP3: the phone has a hardware AAC encoder and no MP3 one, and lamejs on Hermes (no JIT) cannot keep up in real time.

Limiter: stereo-linked peak limiter copying the web's compressor settings (`client/lib/audioEngine.ts`): threshold -2 dB, ratio 20, hard knee, attack 1 ms, release 100 ms, makeup `0.6 * (2 - 0.1)` = about 1.14 dB, applied to every sample before quantisation.

The encoder is started **lazily on the first PCM chunk** (`onPcm`, `encoderStarted`), which arrives as soon as the engine's context resumes, before the socket exists. Chunks encoded before the socket is open are dropped (not counted until `countersArmed`).

`encode` runs on the JS thread inside the tap callback. It is synchronous, so ordering (tap -> encode -> `ws.send`) is JS-owned. There is no queue: if the socket is not `OPEN` the frame is discarded, on purpose, so a reconnect does not replay stale audio into a live show.

### Metadata

`BroadcastManager` subscribes to the engine and, whenever the current track's `title\0artist` differs from the last one sent, sends `{type:'metadata', data:{title, artist}}`. If the socket is not open it remembers `lastMetadata`; after a reconnect it resends it. Tags come from `tags.ts` (below). A paused track still counts as the current one, so pausing does not clear the title. With mic-only talking and no track, nothing is sent and the station's live text (`liveBroadcastText` in the `.liq`) shows.

### Reconnect

`ws.onclose` (after `established`, while not `stopping`) starts `reconnect()`: state `reconnecting`, then for up to **30 minutes** (`RECONNECT_BUDGET_MS`), waits `RECONNECT_DELAYS_MS` = 1, 2, 4, 8, 15, 30 s (the last repeats) with +/-20% jitter, and each attempt runs `ensureStationOnAir(8000 ms)` (which re-issues `/start`, bringing the station back if the sweeper stopped it) then `connectWebcast()` with a fresh token. Success: resends metadata, state `live`. Budget exhausted: `fail()` with "Lost the connection to the stream server and couldn't get back on air (<last error>)".

The web's budget is two minutes to stay under the API's `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` (default 150 s, `StationAudioPolicy::studioGoneSeconds`); the phone accepts that a no-AutoDJ station may be stopped by the sweeper during a long outage, because each attempt restarts it.

**Timers.** Android stops React Native JS timers when the app is not in front. `BroadcastManager.after(ms, fn)` therefore races an ordinary `setTimeout` against a clock derived from the engine's PCM (`audioClockMs`, advanced 100 ms per tap callback; the tap keeps firing with the phone locked) and fires whichever comes first, once. It is used for the connect timeout, the hello grace, the readiness poll and the reconnect backoff. Other timers in the app (queue prune, meters, tickers) are ordinary timers; the code that matters for background survival (playback position save) is counted off the tap for the same reason.

### Keeping the show alive with the screen off

- **Foreground service.** `startForegroundService()` calls `AudioManager.requestNotificationPermissions()` (Android 13+; failure ignored, the service still runs) and then `RecordingNotificationManager.show({title: 'Live on <station>', contentText: 'GoCast is broadcasting', usesChronometer, showStopAction: true, stopActionTitle: 'End show'})` for mic shows, or `PlaybackNotificationManager.show({title: 'Live on <station>', artist: 'GoCast is broadcasting', state: 'playing'})` plus `enableControl('stop', true)` (no pause control) for music only. Both subscribe to the library's stop event (`recordingNotificationStop` / `playbackNotificationStop`), which calls the provider's `onNotificationStop` -> `stop({releaseStation: autoDjLocked})`: the notification's End show ends the show with the same release rule as the studio's End (below), but never navigates to the summary. The notification IS the `react-native-audio-api` `CentralizedForegroundService`, declared through the `react-native-audio-api` config plugin in `mobile/app.json` (`androidForegroundService: true`, `androidFSStopWithTask: false`, `androidFSTypes: ['microphone','mediaPlayback']`). `androidFSStopWithTask: false` (the plugin's default is true) makes the service outlive a swipe out of Recents; the code is written so the JS runtime and the module-level show survive that and the notification's End show is the one control left, but that is a device claim, not verified here. It must start while the app is in front and before the mic opens (Android 14 refuses a microphone service from the background), which is why it precedes `AudioEngine.create`. Music-only shows use the playback notification and never need the mic permission. On API 29+ the library's `CentralizedForegroundService` starts the service with the intersection of the types of the notifications currently built and the manifest's types, so a music-only show runs as `mediaPlayback` alone and a mic show as `microphone` alone (read from the library source in `node_modules`).
- **Locks** (`gocast-keepalive`, Android only): `acquire()` takes a non-reference-counted `PARTIAL_WAKE_LOCK` (`GoCast:broadcast`, no timeout) and a Wi-Fi lock (`WIFI_MODE_FULL_LOW_LATENCY` on API 29+, else `FULL_HIGH_PERF`). Released in `stopForegroundService` and on module destroy. Needed because with the screen off Wi-Fi can drop into power save and reassociate, killing the socket, and the CPU can sleep under the encoder.
- **Battery exemption.** `isIgnoringBatteryOptimizations()` and `requestIgnoreBatteryOptimizations()` (opens `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` for the package, or the battery-optimisation settings list if the direct dialog is missing). Used only by the pre-flight "Keep running when locked" row (Samsung calls the result "Unrestricted"). Nothing checks it again during a show, and going live without it is allowed.
- **No visibility handling.** Unlike the web, locking or leaving the app does not pause or end the broadcast.
- `GocastKeepAlive` is loaded with `requireOptionalNativeModule`, so on iOS it is `null` and every call site uses `?.`; the pre-flight assumes `batteryOk = true` there.

### The studio screen (`mobile/src/app/studio/[slug].tsx`, `components/studio/*`)

Route `/studio/[slug]`. If the slug is not the broadcasting station, or the state is `idle`/`error`, it redirects to `/live/[slug]` (unless `endingRef` is set, i.e. End is already navigating to the summary). It renders a blank screen until `onAir && engine && signal` (so also while state is `connecting`, which does not redirect), then hands everything to `OnAir` (`components/studio/OnAir.tsx`), which owns the Focus toggle, the open sheet, the End handler and the milestone toast.

- **Band**: back to the station (the show continues), the lamp chip (LIVE, LIVE - MIC, SILENCE, RECONNECTING, NOT SENDING, DROPPING AUDIO), the show clock (from `liveSince`), End, one status line and the listener count. Fault states pulse three times and every state change is announced to TalkBack.
- **NowPlaying**: title, artist, time left (turns amber under 15 s, `ENDING_SOON_S`), progress bar, "NEXT" line that opens the queue, Skip (disabled with fewer than 2 tracks), Play/Pause (opens the queue sheet when the queue is empty). Spoken/pulsing cues at 20 s and 10 s left (`CUES_S`). The clock polls `engine.getElapsed()` every 250 ms.
- **TalkPad**: hold-to-talk with a 30-segment mic meter (50 ms polling, instant attack, 24 dB/s release, -60..0 dB). The meter works while the mic is closed (a private mic check). Music-only shows show a dead pad.
- **Controls**: Keep mic open switch, Monitor toggle, Mic settings.
- **Focus mode**: the whole screen as the talk button (progress ring, listener count, Queue/Play/Skip).
- **Milestone toast** when the show's peak listeners crosses 1, 5, 10, 25, 50, 100, 250, 500, 1000 (6 s).
- **QueueSheet**: add files (`expo-document-picker`, `audio/*`, multiple, copied to cache), drag to reorder (`react-native-sortables`), tap to play now, remove with 6 s Undo, Repeat the list / Hold this track, size against 2 GB (the figure turns coral above 90%), a single-slot Undo.
- **MicSheet**: mic level stepper (+3 dB steps), duck (Light/Medium/Deep), fade (Instant/Smooth/Slow), Broadcast voice, monitor volume. Mic controls hidden in music-only shows.
- **EndSheet**: wording depends on `after`: `off_air` when the plan has no AutoDJ (`useAutoDjLocked()`), `silence` when AutoDJ is allowed but `GET /stations/{slug}/status` reports `playlist_length === 0`, else `autodj`.

**Signal logic** (`useStudioSignal` in `hooks.ts`, ported from the web): while `live`/`reconnecting`. `reconnecting` -> fault; socket not open -> "not sending"; mic closed and nothing playing -> "silence" (shown only after 4 s of continuous silence, `SILENCE_GRACE_MS`; before that it reads as Live); dropping frames within the last 5 s -> "dropping" (with total `droppedMs`); mic open -> mic; else live. Transport stats are polled every 2 s (`useTransportHealth`). The live copy says listeners hear you about 15-20 s late, matching the harbor buffer 5 s + HLS; it is a fixed string, not measured.

### Ending a show

`End` in the sheet: `broadcast.stop({ releaseStation: autoDjLocked })` then `router.replace('/summary/[slug]')` (a "That's a wrap" screen; its Back and hardware Back go to the station) with stats in the route params (seconds on air, peak listeners, tracks played, seconds of audio lost, and the `after` mode). `stop()` sets `stopping`, closes the socket with code 1000 "broadcast ended", destroys the engine (saves playback, closes recorder and context), stops the encoder, hides the notification and releases both locks.

- **AutoDJ plans:** nothing else is called; harbor's `on_disconnect` makes the station fall through to AutoDJ.
- **No-AutoDJ plans** (`releaseStation`): `POST /stations/{slug}/stop`, retried at 0, 400, 800, 1500, 2500 ms while the API answers 409 (harbor's disconnect callback has not yet closed the session, `StationLifecycleService::stop` refuses a live station). Any other error, or running out of retries, returns silently; the station is then left to the sweeper.
- Cancelling the countdown, a failed start, sign-out (below) and losing the connection for good do **not** release the station. The station may be left running: started by step 1 of `start()` with no broadcaster. Idle cleanup is `stations:sweep` (see [station-lifecycle](station-lifecycle.md)).
- **Notification End show** (above): `stop({releaseStation: autoDjLocked})` with the last plan value the provider mirrored to module scope; no summary screen. If the studio is on screen its redirect effect sends it to `/live/[slug]`.
- **Sign-out.** The account screen stops the show before `signOut()` and warns "Signing out ends the show for your listeners" (`account.tsx`); the signed-in screens are a guarded `Stack.Protected` group in `_layout.tsx`, so signing out unmounts them without a manual navigation. The provider also stops the show if auth becomes `signedOut` underneath it (a 401 on any API call made with the token still in use, `setUnauthorizedHandler` in `api.ts` -> `endSession` in `auth.tsx`), with no release.
- The summary "AUDIO LOST" figure is `droppedMs` from transport stats; "TRACKS PLAYED" counts tracks that start playing (`BroadcastContext` effect on the engine).

### Session stats and listener count

The provider polls `GET /public/stations/{slug}/listeners` (`ListenerCountController`) every 10 s while on air, keeping listeners, peak and tracks played for the lamp, toasts and summary. This lives in the provider, not the studio, so it survives leaving the screen. `count` is null until the first answer (rendered as "-"), never a guessed 0.

## The queue on the phone

- **Storage** (`mobile/src/audio/queueStore.ts`). Picked files are **moved** (`File.move`) from the picker's cache into `Paths.document/queue/<id><ext>` (extension kept if `.[a-z0-9]{1,5}`, lower-cased). The order and tags are JSON in `studio-queue-v1.json`, the playback position in `studio-playback-v1.json`, both in the documents directory via `mobile/src/lib/kv.ts` (`readJson` / `writeJson` swallow every error and fall back). The web equivalent is IndexedDB.
- **Limits.** `QUEUE_BYTE_LIMIT` = 2 GiB. Files whose MIME type is present and does not start with `audio/` are skipped silently (not counted as skipped). Files over the limit, or that fail to import, are returned as `skipped`, and `overLimit` is simply `skipped.length > 0`, so the sheet shows "The running order is full, so N files were skipped" for any skip, including an unreadable file; its "N files couldn't be read and were skipped" branch is unreachable. A file with unknown size (`a.size ?? 0`) counts as 0 bytes toward the limit.
- **Restore.** At go-live `restoreQueue()` loads the queue (dropping entries whose file is missing on disk, without rewriting the JSON) with duration 0, then fills durations in the background (`getAudioDuration`). Nothing plays until `resumePlayback()` runs, and that only happens if a saved playback state exists and its index is in range. Otherwise the queue sits idle until someone taps play.
- **Persistence rules.** The queue is saved on add, remove, move, clear-upcoming and Undo. The playback position (`currentIndex`, `offset`) is saved when a track starts, every 5 s of audio while playing (counted from the tap's frame count because Android stops JS timers), and on `destroy`. Pausing does not save; `resumePlayback` restarts from the last periodic save. Repeat mode and monitor state are not saved.
- **Tags** (`tags.ts`, `id3.ts`): ID3v2.2/2.3/2.4 in the first 256 KB (reads the whole tag if larger, to skip cover art) or ID3v1 in the last 128 bytes. ID3v1 is tried only when the v2 tag has neither title nor artist. A tagged title with no artist keeps an empty artist. Title falls back to the file name; "Artist - Title.mp3" is split on the dash unless the left side is only digits. **Only MP3 is read**; MP4, FLAC and Ogg use the file name.
- **Prune.** Files nothing references are deleted by `pruneFiles`. It is scheduled 15 s (`PRUNE_DELAY_MS`) after every queue mutation, so Undo (6 s) still has its file, and it defers while an import is in flight (`importing > 0`) because the picker holds Android timers and an overdue prune would fire and delete an imported-but-not-yet-queued file. `destroy()` cancels a pending prune; the pre-flight "Clear" (queueStore `clearQueue`) deletes every file immediately.
- **Removing the current track** plays the track that slides into its slot straight away (or stops if the queue is now empty). Only the latest removal has an Undo; removing a second track within 6 s drops the first one's Undo.
- **Auto-play.** `addFiles` starts playing track 0 if the engine is idle with no current track, so adding the first track to an empty queue during a live show puts it on air immediately.
- **Playback** (`FileSource`): each track streams from its file through the audio library's FFmpeg source; the native side never returns `null` for a local path, so a track is treated as unopenable when the source reports no duration **and** the import could not time it either (`track.duration` is the fallback), or when its file no longer exists; it is then skipped, and if every track fails in a row the engine stops instead of spinning (`failedInARow`). On end it goes to the next track, wrapping at the end ("Repeat the list"), or repeats the same one ("Hold this track"). Next/skip wraps; there is no "previous" control in the UI.

## Permissions and build configuration

Declared by the `react-native-audio-api` plugin entry in `mobile/app.json`: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`; iOS gets the microphone usage string and `iosBackgroundMode: true`. The keep-alive module's own manifest adds `WAKE_LOCK` and `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. Both native modules are local Expo modules (`expo-module.config.json`), autolinked, so they exist only in a dev/preview/production native build, never in Expo Go. `mobile/eas.json` has `development` (dev client APK), `preview` (APK) and `production` profiles. Endpoint origins come from `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_INGEST_URL` (baked in at build time; values are not recorded here).

### Play-policy risk

Google Play treats `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` as a restricted permission (allowed only where the app's core function breaks without it) and requires a foreground-service-type declaration with justification for `microphone` and `mediaPlayback`. This app needs the first for unattended overnight shows (the Samsung failure that motivated it) and the second for the show itself; the exemption dialog is user-initiated and never required. Whether Play will accept either declaration is unverified; the handoff at `docs/MOBILE-APP-HANDOFF.md` says a production build waits on the API deploy and production values.

## What is Android only

| Piece | Android | iOS |
|---|---|---|
| `GocastEncoder.start` | MediaCodec AAC | throws `ERR_UNSUPPORTED` "Broadcasting from iOS is not built yet" |
| `GocastEncoder.encode` | works | returns empty `Data` (never reached, since `start` throws first) |
| `GocastKeepAlive` | wake + Wi-Fi lock, battery dialog | not present (`null`) |
| Foreground service | `CentralizedForegroundService` (audio-api) | uses `iosBackgroundMode` background audio; untested |
| Mic input preset patch | yes (Oboe) | n/a |

The iOS pod (`GocastEncoder.podspec`) exists so the module links. On iOS the first tap callback would call `GocastEncoder.start`, which throws inside `onPcm`, i.e. inside the worklet-to-JS callback, not inside `start()`'s try/catch, so it would not produce a clean "could not go live" message. Treat iOS as not shipped.

## Surfaces

- **Mobile:** `/live/[slug]` (pre-flight, countdown), `/studio/[slug]`, `/summary/[slug]`, `LiveStrip` (only in `station/[slug]/_layout.tsx`, so on the station screens, not on `home`), the station overview (shows the on-air block from `broadcast.session` when this phone is live), Account (sign-out guard). Owned by this doc for the broadcast path only; screens are documented in [mobile-station-screens](mobile-station-screens.md).
- **Web:** the same station appears live in the dashboard as a browser session ([broadcasting-web-studio](broadcasting-web-studio.md)); nothing in the web UI says "phone".
- **API:** `POST /auth/broadcast-token`, `POST /stations/{slug}/start`, `POST /stations/{slug}/stop`, `GET /stations/{slug}/status`, `GET /public/stations/{slug}/listeners`, `POST /api/internal/harbor-auth` (container callback). No new endpoints are specific to mobile.

## Gaps and traps

1. **iOS cannot broadcast.** The stub throws on `start`, called lazily from the tap callback (`onPcm`), outside the start flow's error handling; a phone would fail after `live` with an unhandled error rather than a clean message. Nothing in the app hides "Go live" on iOS.
2. **`ensureStationOnAir` does not fail on a readiness timeout.** After 20 s (8 s on reconnect) without `ready` it just returns and the socket is opened anyway; if the container is not accepting connections the failure surfaces as "Could not reach the stream server" or a hello-window close.
3. **The phone is filed as a "browser" session.** harbor's `live_via` decides by the `Upgrade` header, so a phone is indistinguishable from the web studio in `live_source` and gets studio-gone auto-stop semantics; the "force" cut-off (external only) cannot end it from another device. The `client` column holds the RN/OkHttp user agent.
4. **Stations can be left running.** Cancel during the countdown, a failed start, an exhausted reconnect budget and a sign-out all leave a started station with nobody on it; only the `releaseStation` path of End (in the studio or on the notification) stops it, and only for plans without AutoDJ. Cleanup depends on `stations:sweep`.
5. **`releaseStation` gives up silently** after 2.5 s of 409s or on any other error.
6. **Hello has no ack.** A rejection slower than 600 ms is handled as a drop, so a bad token or a plan/auth problem at that moment loops through reconnect for up to 30 minutes instead of failing fast (each attempt mints a fresh token, so a real auth failure repeats).
7. **`EXPO_PUBLIC_INGEST_URL` applies in every build.** It overrides the API's `ingest_url` whenever set; a production build made with the dev value would send every show to a LAN proxy.
8. **Queue file leak.** `destroy()` cancels the pending prune, so a track removed within 15 s of the show ending keeps its file until the next queue mutation. `restoreQueue` never prunes, so files orphaned by a crash are also kept until then.
9. **Adding the first track while live auto-plays it on air** (`addFiles` -> `playIndex(0)`).
10. **Size limit bypass.** Files reported with size 0 by the picker add nothing to the running total, so the 2 GiB limit is advisory for them.
11. **Only MP3 tags are read** (`tags.ts`); everything else shows the file name as the title and, without a "Artist - Title" pattern, no artist.
12. **Frame loss is silent to the user until it is total.** Frames are dropped while the socket is not open and counted (`chunksDropped`, `droppedMs`); the lamp only shows "Dropping audio" if a drop happened in the last 5 s, and the summary reports the total.
13. **No flush on stop.** The encoder's last partial frames are discarded on `stop()`; harmless for a live stream, but it means the last fraction of a second of a show is not sent.
14. **Dead or unused code.** `AudioEngine.clearQueue()` (the pre-flight uses `queueStore.clearQueue` directly), `AudioEngine.clearUpcoming()`, `AudioEngine.prev()`, `AudioEngine.hasMic()` have no callers. `TransportStats.bytesSent`/`chunksSent` are collected but not shown anywhere. The pre-flight `BITRATE_KBPS` (128) duplicates the manager's `BITRATE` instead of importing it. The iOS `encode` body is unreachable.
15. **Fragile private API.** `FileSource` calls `createFileSource`, `createMediaElementSource` and a global `AudioEventEmitter` on `react-native-audio-api`'s native context, none of which are public API; the dependency is `^0.13.6` and the patch file targets exactly 0.13.6, so an upgrade can break playback and the patch silently.
16. **Generated `mobile/android/` is git-ignored and stale.** The generated manifest on disk lacks `WAKE_LOCK` and `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (they come from the keep-alive module's manifest at Gradle merge time) and contains `SYSTEM_ALERT_WINDOW` (dev client). Do not read it as the shipped manifest. (Its audio service line does match `app.json` today: `stopWithTask="false"`, `foregroundServiceType="microphone|mediaPlayback"`.)
17. **Play-policy risk** (above) is unresolved and blocks a production release.
18. **Live delay copy is fixed.** "15-20 s" (studio) is a constant in `hooks.ts` and `model.ts`; if `buffer=5.` in `station.blade.php` or the HLS segment settings change, the text does not.
19. **Notification End show skips the wrap-up.** It stops the show (releasing the station only on no-AutoDJ plans, from a plan value mirrored before the screens went away) and never shows the summary; the show's stats are lost. Force-stopping the app from Settings, or the OS killing the process, still leaves the station on until harbor's `timeout` (default 10 s) and the sweeper act. Whether a swipe out of Recents really keeps the show going (`androidFSStopWithTask: false`) can only be settled on a device.
20. **Mic-only "silence" definition.** The lamp says Silence when the mic is closed and no track is playing; it does not measure output level, so a playing-but-silent file reads as Live.
21. **Every skipped file is reported as "running order is full".** `addFiles` sets `overLimit` whenever anything was skipped, so an unreadable file gets the size message and the "couldn't be read" wording never shows.

## Tests

None. `mobile/` has no test files and `package.json` has no test script (`lint` and `tsc` only). The API pieces are covered elsewhere: `api/tests/Feature/BroadcastTokenControllerTest.php`, `BroadcastTokenServiceTest.php`, `HarborAuthTest.php` (not read for this doc; see [encoder-ingest](encoder-ingest.md)). The ID3 parsers are written as pure functions "so they can be tested without a phone", but no tests exist for them.

## History

- `docs/MOBILE-APP-HANDOFF.md`: the mobile app's state and decisions, including the broadcast path (committed as 92af763 API and ed2e6a9 `mobile/`; not pushed at the time of writing).
- The studio was re-skinned to the "GoCast Studio" comp on 2026-09-28 (uncommitted): `Deck`, `EndBroadcast`, `Lamp`, `MicDesk`, `MonitorBar`, `RunningOrder` were deleted and replaced by `Band`, `Console`, `Focus`, `Milestone`, `OnAir`, `Sheets`, `model`. Committed with the rest of `mobile/` in 360c382.
- Overnight keep-alive (`gocast-keepalive`), the prune/import race fix and the tap-counted timers were added on 2026-09-28 after a Samsung phone dropped an overnight show and Android paused JS timers when the phone was not in front.
