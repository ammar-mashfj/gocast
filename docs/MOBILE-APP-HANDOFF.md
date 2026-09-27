# Mobile app handoff

State of the GoCast Android app as of **2026-09-27**. Read this before touching `mobile/`, the
`device_name` login change in `api/`, or anything about broadcasting from a phone.

Nothing described here is committed except the bare Expo scaffold (Ammar committed `mobile/` in
`045b494`). **Don't commit unless Ammar asks.** Several Claude sessions share this checkout: check
`git status` before you edit, and leave files alone that another session has dirty.

---

## 1. Why this exists

Customers leave because the **browser studio dies when the browser loses focus**: switching apps
or locking the phone ends the broadcast. The app's job is to keep a live show running with the phone
locked. Everything else (the console, the listener player) comes after the studio.

The plan agreed with Ammar:
- One app, in this repo, at `mobile/`.
- Android first. There is no Apple account or iPhone yet, so the iOS encoder is a stub.
- Build order: phase 0 spike (proved) → studio (mostly built) → station console → listener player →
  production build and store testing.

## 2. Where we are

| Area | State |
|---|---|
| Phase 0 spike: mic → harbor, phone locked | ✅ **Proven on a Galaxy A55**: 30+ min locked, 0 s audio lost, 0 reconnects |
| Audio engine (music + mic mix, ducking, monitor, limiter) | ✅ Works on device; the broadcast is clean on the player page |
| Mic level on phones | ✅ Fixed with a phone-only input gain (default +28 dB, adjustable) |
| Monitor static | ✅ Fixed (library patch, §5) |
| Song tags | ✅ MP3 ID3v1/v2.2–2.4, tested including Arabic. Other formats fall back to the filename |
| Go Live pre-flight screen | ✅ Built. Needs design review on device |
| Studio screen (lamp, deck, mic desk, monitor, running order, End) | 🟡 Built; §3 input bug fixed (not yet verified on device); design fixes pending |
| Show summary ("That's a wrap") and listener milestones | ❌ Not built |
| Station console (power, AutoDJ, schedule, audience) | 🟡 Built 2026-09-27 (§2b). Schedule and Library are read-only; untested on device |
| Listener player | ❌ Not started |
| iOS | ❌ Encoder is a stub that throws "not built yet" |
| Production ingest, and switching Wi-Fi ↔ 4G mid-show | ❌ Untested. Needs a build pointed at prod (§7) |
| Google sign-in | 🟡 Built 2026-09-27 (§4, backend change 2). API tests pass; not yet tried on the phone |
| Splash, icon, login, home, account | 🟡 Built 2026-09-27, awaiting Ammar's device review (§2a) |

## 2a. Shell screens (built 2026-09-27)

- **Icon:** generated from the web's `client/app/icon.svg` into `assets/images/gocast-*.png` (Inkscape).
  `userInterfaceStyle` is `dark`.
- **Splash:** a port of Ammar's concept "GoCast Splash 1c" in `components/AnimatedSplash.tsx`, done with Reanimated.
  - A violet 30-bar waveform, then the `client/public/logo.svg` wordmark wipes in. About 2.5 s; `SPEED`
    shortens it.
  - The native splash is only the ground colour (a transparent `splash-blank.png`). It hides on the animated
    layer's first layout.
  - The layer holds on the wordmark until the fonts are in and auth is checked, then fades out.
  - With reduced motion on, it shows the wordmark with no bars.
  - Changing app.json splash or icon settings needs `prebuild --clean` and a rebuild.
- **Wordmark:** `Brand.tsx` `Wordmark` is the web's GoCast.fm logo. `BrandMark` is the G tile.
- **Login:** labelled fields, a show/hide password toggle, and web links for Forgot password and sign-up
  (`lib/web.ts`, `expo-web-browser`).
- **Home (`stations.tsx`):**
  - A custom top bar with the wordmark and an avatar that opens Account.
  - The LIVE strip, and the plan tag.
  - Station cards with artwork or initials, the state pill, now playing, and Go live / Open studio.
  - Polls every 20 s while focused. Has skeleton, empty and error states.
- **Account (`account.tsx`):** plan facts, links to the dashboard and help, and sign out. Sign out asks
  for confirmation if a show is running from this phone.
- **Shared components:** `TextField`, `PlanTag` and `InitialsTile` in `ui.tsx`, and `Brand.tsx`.

## 2b. Station console (built 2026-09-27)

Tapping a station on Home opens `station/[slug]`. The card's own button still goes straight to Go Live.
- **Layout:** `_layout.tsx` fetches `GET /stations/{slug}` once, shares it through `StationContext`
  (`lib/station.ts`), and shows JS bottom tabs from `expo-router/js-tabs`. No native dependency.
- **Overview:** a port of the web's `StationPower`.
  - The headline comes from `GET /status`, polled at the web's cadence (`useStationStatus`).
  - The buttons follow the web's rules. Free never sees Start AutoDJ.
  - Turning the station off while AutoDJ is on air asks for confirmation. `station_is_live_external`
    offers "Cut it off" (`{force:true}`).
  - Also: now playing with a progress bar and "Up next", listening now (public count), share, and the
    last 5 broadcasts.
- **Audience:** `GET /stations/{slug}/audience?days=`.
  - Locked (Free): the two tiles and a Pro note.
  - Pro: 7/30/90-day range, the headline tiles, a daily bar chart built from Views, and the country,
    device, browser and referrer breakdowns.
- **Schedule (read-only):** show times and AutoDJ slots come from the station payload. Shows what AutoDJ
  is playing now and what's next. Editing links to the web.
- **Library (read-only):** storage meter, playlists that expand to show their tracks, and every track
  (50 at a time). Upload and arranging link to the web.
- **Not ported yet:** the checklist, the embed and QR options, jingles, and editing schedules or the
  library.

## 3. Fixed: taps in the mic desk and mic settings sheet didn't take effect

**Symptom:** **Keep mic on**, every segmented option in the mic settings sheet, and Mic level −/+ did nothing.
**Done**, the deck buttons and scrolling worked.

**Cause (found 2026-09-27): the React Compiler.** It cached `engine.isMicLatched()` and
`engine.getMicPrefs()` against `engine` (`if ($[0] !== engine)`). `engine` never changes, so both values
froze at the first render. `useEngineVersion` did re-render `MicDesk`, but the render reused the frozen values.
- The taps did reach the engine. The screen just never showed the change.
- The latch always called `setMicLatched(!false)`.
- The −/+ always wrote the same `frozen ± 3`.
- `MonitorBar` had the same bug with `isMonitorEnabled`.
- The lamp (`useStudioSignal`) had it too, hidden inside a helper: `computeSignal(state, engine, …)` was cached until `transport` changed, so the lamp lagged mic and play changes by up to 2 s (the health poll interval).
- An earlier note here said "compiled MicDesk has no memoization". That was wrong.

**Fix:** `useEngineValue(engine, e => e.isX())` in `src/broadcast/hooks.ts`, which uses `useSyncExternalStore`.
`Deck` was already safe because it feeds `version` into its `useMemo`.

**Rule:** never call `engine.getX()` / `engine.isX()` in render. Use `useEngineValue`. To audit a file, compile it with
`babel-plugin-react-compiler` and look for `engine.` reads, or helpers called with `engine`, inside `if ($[n] !== engine)` blocks.

**Not verified on device yet.**

## 4. Architecture

```
mobile/
  app.json                      identity app.gocast.mobile; react-native-audio-api plugin config
                                (mic + mediaPlayback foreground service, permissions)
  eas.json                      EAS profiles, Node pinned to 24.12.0 (see traps)
  patches/react-native-audio-api+0.13.6.patch   applied by postinstall (patch-package)
  modules/gocast-encoder/       local Expo module: PCM → AAC-LC (ADTS) via Android MediaCodec,
                                plus the master limiter. iOS is a stub.
  scripts/ingest-proxy.mjs      DEV ONLY: LAN → station router proxy (§6)
  src/
    app/                        expo-router screens
      _layout.tsx               fonts, GestureHandlerRootView, Auth → Broadcast → OverlayHost → Stack
      index.tsx, login.tsx      auth gate, email/password sign-in
      stations.tsx              station list; LIVE banner back to the studio while on air
      live/[slug].tsx           Go Live pre-flight (port of the web live/page.tsx)
      studio/[slug].tsx         the studio console
    audio/
      engine.ts                 port of client/lib/audioEngine.ts (see diagram in the file)
      fileSource.ts             thin wrapper over the library's FFmpeg file source (not public API)
      queueStore.ts             queue persistence: files copied into documents/queue + JSON
      micPrefs.ts               web's mic prefs + phone-only inputGainDb
      tags.ts, id3.ts           title/artist from ID3, filename fallback
    broadcast/
      broadcastManager.ts       port of client/lib/broadcast.ts (steps, reconnect, drop accounting,
                                metadata replay, foreground-service notification)
      BroadcastContext.tsx      app-level owner; leaving the studio does not end the show
      hooks.ts                  useEngineVersion, transport health, studio lamp signal, listeners
    components/
      ui.tsx                    T (text), Button, Panel, Pill, Segmented — design tokens applied
      Overlay.tsx               in-tree sheets/dialogs (replaces RN Modal)
      studio/                   Lamp, Deck (track dial), MicDesk (pad/latch/meter/settings),
                                MonitorBar, RunningOrder (sortable), EndBroadcast
    lib/                        api.ts (fetch + bearer), auth.tsx, kv.ts (JSON in documents/), theme.ts
```

**Audio path:**
```
file source ─→ fileGain ─┬─→ mixer ─→ tap (WorkletNode, 100 ms) ─→ JS ─→ GocastEncoder (limiter + AAC) ─→ WebSocket
                         └─→ monitorGain ─→ speaker
mic ─→ micTrim ─┬─→ micDry ──────────────────────────────┐
                └─→ highpass → presence → voiceComp ─→ micWet ─→ micGain ─→ mixer
```
- The context runs at the device's preferred rate, 48 kHz on the A55.
- Harbor receives stereo AAC at 128 kbps in the same `webcast` WebSocket protocol as the web studio,
  with hello `mime: "audio/aac"`. Harbor decodes AAC natively; this was verified by probing the image.

**Backend change 1:** `POST /api/auth/login` with `device_name` returns `token` in the JSON
body and sets no cookie. The web never sends `device_name` and keeps the cookie-only behaviour.
- Files: `AuthController::login`, `LoginRequest`.
- New test in `tests/Feature/Auth/LoginTest.php`; all 4 tests pass.
- The login response is the bare model, so the app calls `GET /user` afterwards to get
  `plan.autodj_enabled`.

**Backend change 2, native Google sign-in** (`POST /auth/google/native`, `GoogleAuthController::native`,
`App\Services\GoogleIdTokenVerifier`). Tests are in `tests/Feature/Auth/GoogleNativeSignInTest.php` (11
passing), and the 14 web Google tests still pass.
- **App:** Android's Credential Manager "Sign in with Google" bottom sheet, from the local module
  `modules/gocast-google-auth` (Kotlin, `GetSignInWithGoogleOption`). It returns Google's ID token.
- **API:** verifies the token locally with `firebase/php-jwt`, which Socialite already installs. It checks
  the RS256 signature against Google's key set (cached for 1 h, refetched once on an unknown key), the
  issuer, the audience (it must equal `services.google.client_id`, the web client), and `email_verified`.
- **Account handling:** the same find, link or create, invite and verify logic as the web callback,
  shared through `signInGoogleUser()`. Returns `{data: UserResource, token, invite}`.
- **Google Cloud:** needs an **Android** OAuth client for `app.gocast.mobile` plus the signing SHA-1.
  - Debug builds use React Native's standard debug keystore:
    SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Ammar created this client
    on 2026-09-28.
  - Release and Play builds need another Android client with the Play App Signing SHA-1.
  - The app passes the **web** client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) as the server client ID.
- **Sign out** also calls `clearCredentialState`, so the account chooser appears again next time.
- **History:** a browser-based flow (Custom Tab, PKCE code exchange, `adb reverse` for localhost) was built
  first on the same day and replaced by this. Nothing of it remains.
- **Prod:** deploy the API with this change.

## 5. Library patches and non-obvious fixes (don't undo)

1. **Fan-out aliasing, which made the broadcast silent.** `react-native-audio-api` hands a node's own buffer
   to all its consumers, and gain nodes multiply it in place. So `fileGain → monitorGain(0)` zeroed the mix.
   Every engine node is therefore created with `channelCountMode: 'explicit'`, which gives each node its own
   buffer.
2. **Monitor static.** The library's output stream is low-latency *exclusive* (about 3 ms of slack), and
   the tap's work every 100 ms caused clicks. The patch makes it **shared, PerformanceMode::None, full
   buffer** (`AudioPlayer.cpp`).
3. **Quiet mic.** Oboe's default input preset is VoiceRecognition, which is about 30 dB under a laptop mic.
   The patch sets **VoicePerformance** (`AndroidAudioRecorder.cpp`), and the engine adds `micTrim`
   (`inputGainDb`, default 28).
4. **No compressor node exists.** The master limiter is in Kotlin (`GocastEncoderModule.kt`), using the
   web's settings and Web Audio's automatic makeup gain. The voice compressor is an audio-thread worklet
   whose gain is computed per 16-sample block. Per-sample `log`/`pow` made the audio thread late.
5. **MP3 in JS was rejected.** lamejs under `node --jitless` (a proxy for Hermes) runs at 1.6× real time on
   the laptop, too slow for a phone.
6. **Android `elevation` lifts panels above siblings.** That put them over the sticky lamp. `panelShadow`
   no longer sets elevation, and the lamp has an opaque base.

## 6. Dev setup and runbook

- **Local Android builds (no EAS quota):**
  - SDK is at `~/Android/Sdk`. It was installed with the new `android sdk install` CLI; `sdkmanager` is
    deprecated, and package ids use slashes, e.g. `ndk/27.1.12297006`.
  - `JAVA_HOME` is Temurin 21, set in `~/.bashrc`.
  - Build:
    ```bash
    cd mobile/android && ANDROID_HOME=~/Android/Sdk JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64 \
      ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a
    ```
    About 15–40 s incremental. The first build took 23 min and downloaded about 3 GB into `~/.gradle`.
  - After changing `app.json` or native dependencies: `npx expo prebuild --platform android --clean --no-install` first.
- **Install:** `adb -s adb-R5CXC0R3ZAB-DcnvaS._adb-tls-connect._tcp install -r android/app/build/outputs/apk/debug/app-debug.apk`
  - The wireless adb port changes on every reconnect, so use that mDNS serial rather than IP:port.
  - When pairing, the port on the Wireless debugging screen is the *connect* port. `adb mdns services`
    shows the pairing port.
  - Android turns Wireless debugging off by itself from time to time; ask Ammar to re-enable it.
- **Metro:** Ammar runs `npx expo start --dev-client` in `mobile/`. Don't start or restart it for him.
  After changing `.env` or native deps, he has to restart it.
- **Env (`mobile/.env`, gitignored):**
  - `EXPO_PUBLIC_API_URL=http://192.168.1.4:8000/api`
  - `EXPO_PUBLIC_INGEST_URL=ws://192.168.1.4:18091/broadcast/{slug}`
  - `EXPO_PUBLIC_APP_URL=http://192.168.1.4:3000`
- **Ingest in dev:**
  - The API's `ingest_url` is the station container's Docker bridge IP, which a phone can't reach.
  - The station router proxies every station at `127.0.0.1:8091/broadcast/{slug}`, but only on loopback.
  - `node scripts/ingest-proxy.mjs` exposes that on `0.0.0.0:18091`. With `DUMP_DIR=…` it records
    phone→server bytes. Decode a dump by un-masking the WebSocket frames, then run ffmpeg `volumedetect`.
    This is how the silent-broadcast bug was found.
  - Restarting the proxy drops the phone's connection, so harbor briefly falls back to AutoDJ.
- **Laravel** must run with `--host=0.0.0.0`.
- **Checks before calling anything done:** `npx tsc --noEmit` and `npx expo lint`, both clean right now.
  The API suite is slow, so run targeted files only.
- **The harbor `EPIPE` every 15 s is not the app.** It's the station container's own healthcheck, which
  reads only the first line of `/healthz`.

## 7. Work that can run in parallel

These avoid each other's files. Claim one, then check `git status` before starting.

**A. Studio design pass** (the §3 bug is fixed) (`src/components/studio/*`, `src/components/ui.tsx`,
`src/components/Overlay.tsx`, `src/app/studio/*`).
- Ammar has design fixes pending; ask him for the list or screenshots.
- `adb exec-out screencap -p` works for looking at the screen.

**B. Step 4 of the studio: show summary and milestones** (`src/app/stations.tsx` or a new `src/app/signoff/*`,
`src/broadcast/BroadcastContext.tsx`).
- Port the web's `ShowSummary` from `EndBroadcast.tsx` / `ShowSignOff`: duration, peak listeners, seconds
  lost, and what happened after.
- Port listener milestones `[1,5,10,25,50,100,250,500,1000]` from `lib/milestones.ts`.

**C. Phone-call and interruption handling** (`src/audio/engine.ts`, `src/broadcast/broadcastManager.ts`).
- Audio focus loss (a phone call takes the mic), Bluetooth mic changes.
- `AudioManager.observeAudioInterruptions` in the library.
- Decide what the lamp says.

**D. Production build and the Wi-Fi ↔ 4G test.**
- Needs:
  - an EAS `preview` profile, or a local release build, pointing `EXPO_PUBLIC_API_URL` at prod;
  - the prod API to have the `device_name` login change deployed;
  - prod's `ingest_url` to be a public `wss://`, unset `EXPO_PUBLIC_INGEST_URL` there.
- Expect about 10–15 s of lost audio on a network switch: harbor holds the dead source for
  `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (10 s). Measure it before optimising, for example by having the server
  kick the stale source.

**E. Station console: editing** (`src/app/station/*`). The read views are built (§2b). Still to do: editing the
schedule (both saves are full-list PUTs), the library (upload with expo-document-picker, playlist
membership and order), and settings.

**F. Listener player** (new routes). Public station page and background playback with lock-screen controls.

**G. Performance** (`src/audio/engine.ts`, `src/components/studio/MicDesk.tsx`).
- The JS thread runs at about 55% while live, and native heap is about 870 MB.
- Likely suspects:
  - the mic meter re-rendering 40 Views at 20 fps;
  - the tap's `scheduleOnRN` copies;
  - RN WebSocket base64-encoding binary sends.

**H. iOS encoder** (`modules/gocast-encoder/ios`). Blocked until Ammar has an Apple account and an iPhone.

## 8. Other traps

- **EAS cloud builds count against the 15/month Free quota, dev builds included.** Build Android locally.
  Local debug builds and EAS builds are signed differently, so switching between them needs an uninstall.
- **The first EAS build failed at `npm ci`:** the lockfile was out of sync over `@emnapi/*`. Fixed by
  regenerating the lockfile and pinning Node in `eas.json`.
- **When regenerating the patch, exclude build output and downloaded binaries:**
  ```bash
  npx patch-package react-native-audio-api \
    --exclude '^package\.json$|/build/|\.cxx/|/\.gradle/|node_modules/|/jniLibs/|/external/|\.DS_Store'
  ```
- **Never `pkill -f` a pattern that appears in your own command line.** It kills your own shell (exit 144).
- **Disk is tight** (about 14 GB free). `mobile/android` and `node_modules/*/android/build` hold several GB
  of rebuildable output. Keep `~/.gradle`, since re-downloading it costs Ammar's 4G data.
- **Uploaded images are stored as absolute `localhost` URLs in dev.** Artwork and avatars are saved from
  the API's `APP_URL` (`http://localhost:8000`), which on the phone points at the phone itself. Always
  load them through `mediaUrl()` (`lib/api.ts`), which swaps a loopback host for the API's; `StationArt`
  does this and falls back to initials. In prod `APP_URL` is the real domain, so the swap does nothing.
- **The lamp copy deliberately differs from the web** in one line: the phone *can* be locked.
