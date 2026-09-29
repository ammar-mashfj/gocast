# Mobile app handoff

State of the GoCast Android app as of **2026-09-28**. Read this before touching `mobile/`, the mobile auth
endpoints in `api/`, or anything about broadcasting from a phone.

- **Committed on `main`:** `92af763` (API: token login and native Google sign-in) and `ed2e6a9` (the whole
  `mobile/` app plus this doc).
- **Uncommitted since (2026-09-28 evening):** the whole app re-skinned to the Claude Design comp
  `mobile/GoCast Studio.html`, the stations list removed, and editing added to Library and Schedule. See
  §3c.
- **Deployed:** the API commit is live in production (2026-09-28).
- **Installed:** a production release build is on Ammar's Galaxy A55.
- **Rules:**
  - **Don't commit or push unless Ammar asks.**
  - Several Claude sessions share this checkout. Check `git status` before you edit, and leave alone any
    file another session has dirty.
  - Never start or restart Metro for him.

---

## 1. Why this exists

Customers leave because the **browser studio dies when the browser loses focus**: switching apps or
locking the phone ends the broadcast. The app's job is to keep a live show running with the phone
locked. Everything else (the station console, the listener player) comes after the studio.

The plan agreed with Ammar:
- One app, in this repo, at `mobile/`.
- Android first. There is no Apple account or iPhone yet, so the iOS encoder is a stub.
- Build order:
  1. Phase 0 spike (done)
  2. Studio (done)
  3. Station console (reading done; Library and Schedule editing done, 2026-09-28)
  4. Production build (done)
  5. Live production test (next)
  6. Listener player
  7. Store release

## 2. Where we are

| Area | State |
|---|---|
| Phase 0 spike: mic → harbor, phone locked | ✅ **Proven on a Galaxy A55**: 30+ min locked, 0 s audio lost, 0 reconnects |
| Audio engine (music + mic mix, ducking, monitor, limiter) | ✅ Works on device; the broadcast is clean on the player page |
| Mic level on phones | ✅ Fixed with a phone-only input gain (default +28 dB, adjustable) |
| Monitor static | ✅ Fixed (library patch, §6) |
| Song tags | ✅ MP3 ID3v1/v2.2–2.4, tested including Arabic. Other formats fall back to the filename |
| Design: every screen matches the "GoCast Studio" comp | ✅ Rebuilt 2026-09-28, uncommitted (§3c). Checked on Waydroid, not yet on the A55 |
| Go Live pre-flight (checklist + 3-2-1 countdown) | ✅ Rebuilt to the comp (§3c) |
| Studio (band, now playing, hold-to-talk pad, Focus mode, sheets) | ✅ Rebuilt to the comp (§3c). The React Compiler tap bug stays fixed (§4) |
| One station per account: no stations list | ✅ `app/home.tsx` opens the station page directly (§3c) |
| Station console: Overview, Audience | ✅ Read-only, real data (§3b) |
| Library: upload from phone, select and delete | ✅ Built 2026-09-28 (§3c). Upload tested on Waydroid; delete not yet run |
| Schedule: add, edit, delete show times and AutoDJ slots | ✅ Built 2026-09-28 (§3c). Sheet and clock tested on Waydroid; a real save not yet run. **Open: the "Live show" label** (§3c) |
| Email sign-in (token in body) | ✅ In production |
| Google sign-in (Android's native sheet) | 🟡 In production, and the API tests pass. Not yet confirmed from the phone against production (§5) |
| Production build | ✅ Built and installed 2026-09-28, points at `api.gocast.fm` (§7) |
| Production ingest, and switching Wi-Fi ↔ 4G mid-show | ❌ Not yet tested live. The first live show on the production build is the test (§8 D) |
| Show summary ("That's a wrap") and listener milestones | ✅ Built 2026-09-28 (§3c) |
| Listener player | ❌ Not started |
| iOS | ❌ Encoder is a stub that throws "not built yet" |
| Play Store release | ❌ Needs an upload key and a Play-signing Android OAuth client (§8 D) |

## 3. What the app has

### 3a. Shell

- **Icon:** generated from the web's `client/app/icon.svg` into `assets/images/gocast-icon.png` and
  `gocast-adaptive-foreground.png` with Inkscape. The adaptive background is violet `#8B5CF6`.
  `userInterfaceStyle` is `dark`.
- **Splash:** a port of Ammar's concept "GoCast Splash 1c", in `components/AnimatedSplash.tsx` (Reanimated).
  - Timeline:
    - A violet 30-bar waveform swells under a sine envelope for 1.7 s and fades at 1.75 s.
    - The `client/public/logo.svg` wordmark wipes in from the left (1.65 s + 0.9 s).
    - The finished wordmark **holds for `HOLD_MS` = 1000 ms**.
    - The layer fades out over 280 ms, but not before the fonts are loaded and auth is checked.
  - Ammar asked for the hold ("it's cut directly after finishing"). `SPEED` scales the animation only, not
    the hold.
  - The native splash is only the ground colour (a transparent `splash-blank.png`, now `#0E0D0C` in app.json
    to match the redesign; the installed build still has `#08080d` until the next native rebuild). It hides on
    the animated layer's first layout, so there's no visible jump.
  - With reduced motion on: the wordmark only, no bars.
  - Changing app.json splash or icon settings needs `prebuild --clean` and a native rebuild.
- **Brand:** in `components/Brand.tsx`, `Wordmark` (SVG, used by the splash) is the web's GoCast.fm logo,
  `BrandMark` is the G tile, and `GoogleLogo` is Google's official four-colour G for the sign-in buttons
  (their branding rules forbid recolouring it). Screens use the text `Wordmark` in `ui.tsx`.
- **No stack headers anywhere** (`headerShown: false` in the root Stack). Each screen draws its own top row,
  as in the comp. `AppHeader.tsx` was deleted.
- **Welcome (`app/welcome.tsx`):** the comp's animated waveform (`components/Waveform.tsx`, Reanimated frame
  callback), headline, chips, Continue with Google, Sign in with email, and the Terms/Privacy line (kept for
  Google sign-in).
- **Login (`app/login.tsx`):** "Welcome back.", boxed fields with a Show/Hide toggle, the error in coral on
  the field it's about, Forgot password (web), then Continue with Google.
- **Home (`app/home.tsx`):** an account has one station, so this only finds it (`GET /stations`, the first
  one) and `<Redirect>`s to `/station/[slug]`, replacing itself so back leaves the app. It shows a "Create
  your station" card (opens the web) when there is none, and refetches on focus. The old stations list
  (`app/stations.tsx`) was deleted on Ammar's request.
- **Account (`app/account.tsx`):** reached from the avatar in the station header. The avatar, plan, links,
  sign out (asks first if a show is running from this phone).
- **Loading states are skeletons, never spinners** (Ammar asked). `components/Skeleton.tsx` has
  `SkeletonGroup` (one slow opacity breath, still under reduced motion), `Bone`, `BonePanel` and
  `BoneRows`. Every tab has a skeleton in its own shape, in `components/station/parts.tsx`. Spinners are
  kept only for actions in progress: busy buttons, adding files, the Go Live checklist step.
- **Images:** `StationArt` loads artwork through `mediaUrl()` and falls back to initials on error (§9).

### 3b. Station console (`app/station/[slug]/`)

- **Layout:** `_layout.tsx` fetches `GET /stations/{slug}` once and shares it through `StationContext`
  (`lib/station.ts`). This screen is the app's home.
  - JS bottom tabs from `expo-router/js-tabs` with a custom text `tabBar` (the comp's bar over the active
    label). Don't set a fixed tab bar `height`: it breaks the bottom safe-area inset.
  - Header: the account avatar (→ Account), the station name, and **Share** (system share sheet). The coral
    live strip sits above it while broadcasting from this phone.
- **Overview:** a port of the web's `StationPower`, drawn as the comp's hero card: coral while someone is
  live (uptime clock, listeners, Open studio / Hear your stream), violet while AutoDJ is on air (now playing
  with progress, Go live), grey when off (Go live, Start AutoDJ on Pro). Then LISTENING / SHOWS / AIRTIME
  tiles from `station.stats`, Your link, Recent shows (real sessions, bar = length vs the longest), and a
  quiet "Turn station off" at the foot (`usePower` hook holds start/stop/confirm).
  - The headline comes from `GET /stations/{slug}/status`, polled at the web's cadence
    (`useStationStatus`):
    - 2 s while starting or during a handover;
    - 30 s while off;
    - otherwise just after the current track ends.
  - The source chip reads, for example, "Live from this phone", "AutoDJ" or "Handing back to AutoDJ".
  - The buttons follow the web's rules. Free never sees Start AutoDJ.
  - Turning the station off while AutoDJ is on air asks first. `station_is_live_external` offers "Cut it
    off" (`{force:true}`).
  - Also: now playing with a progress bar that runs between polls, and "Up next".
  - Also: listening now (public count, 10 s) and the peak, the share card, and the last 5 broadcasts.
- **Audience:** `GET /stations/{slug}/audience?days=`.
  - Free (locked): the two tiles and a Pro note.
  - Pro:
    - a 7/30/90-day range and the headline tiles;
    - a daily bar chart built from Views;
    - country (flag emoji), device, browser and referrer breakdowns.
- **Schedule:** a Mon–Sun strip for this week, and the selected day's rows: show times (coral) and, on Pro,
  AutoDJ slots (violet), with "All day" for the default playlist when a day has no slots. Editable (§3c).
- **Library:** storage meter, playlists that expand (tracks load on open and refetch on every refresh or
  count change), a "Jingles & IDs" group from `kind: 'jingle'`. Upload, select and delete (§3c).
- **Not ported yet:** the setup checklist, the embed and QR options, playlist membership/order, settings.

### 3c. The redesign and everything after it (2026-09-28, uncommitted)

**Source:** `mobile/GoCast Studio.html` is a Claude Design bundle (a phone prototype). To read it, decode the
`__bundler/template` script (JSON string of the HTML) and the `__bundler/manifest` (base64, gzip). Ammar's
brief: "exact design, it's perfect, apply". He then asked for **no decoration**: everything on screen must
be real data, or go.

**Tokens (`lib/theme.ts`):** warm greys (`bg #0E0D0C`, `card #181614`, `sheet #1B1916`), **coral `#FF5A4E` =
live**, **violet `#9B7BFF` = AutoDJ**, **amber `#FFB547` = Pro and warnings**, green `#5FD39A` = OK.
`font(weight, size, {mono, tracking, lineHeight})` takes the comp's em tracking. Fonts: Bricolage Grotesque
400–800 and IBM Plex Mono 400–700 (`@expo-google-fonts/ibm-plex-mono`, new, JS only). Onest and JetBrains
Mono are no longer loaded; their packages can be removed. The comp's IBM Plex Sans / Plex Sans Arabic
fallback is **not** implemented: Android draws Arabic/Cyrillic glyphs in the system font (offered, not done).

**Components (`components/ui.tsx`):** `T`, `Heading`, `Wordmark`, `Button` (light/outline/live/liveInk/dark/
subtle/autodj/pro, optional dot), `PillButton`, `TextLink` (`external` adds ↗), `BackButton`, `Card`, `Dot`,
`StateLabel`, `Caption`, `Progress`, `Segmented` (inline/fill), `Switch`, `TextField` (boxed, Show/Hide),
`Divided`. `Overlay.tsx` is now the comp's bottom sheet (grabber, `#1B1916`, radius 30). **Icons are Tabler
only**: the comp's text glyphs (←, ⌄, ›, ×, ▶) render in the system font (Ammar spotted a tiny ⌄), and its
hand-drawn icons were replaced too.

**Go live (`app/live/[slug].tsx`):** mode cards (Mic + music / Music only) and a checklist that is all real:
mic permission (`AudioManager.checkRecordingPermissions`, Allow, or Settings when blocked), battery
exemption (`GocastKeepAlive`), running order (count + size, pick up / start over, Clear), and connection (a
real round trip to the API, "Slow" over 1.5 s). There is no Wi-Fi/4G name: that needs `expo-network`
(native). Tapping **Go live now** starts the broadcast *and* a coral 3-2-1 at once; if the stream isn't up
when the count ends it shows "CONNECTING" and the active step. Back or Cancel stops it. The page fits one
screen (spacing tightened); it scrolls only on short phones or with a warning card.

**Studio (`app/studio/[slug].tsx` + `components/studio/`):**
- `Band`: back, the lamp chip, uptime, End, then one line and "N listening". `model.ts` → `lampFor()`:
  LIVE (coral), LIVE · MIC (deep coral band), SILENCE / RECONNECTING / NOT SENDING / DROPPING AUDIO (amber).
  The delay line says **"~15–20 s late"** (Ammar: harbor is still 15–20 s).
- `Console`: `NowPlaying` (time left, amber under 15 s, pulses at the 20 s/10 s talk-up cues; NEXT opens
  the queue; skip; play/pause), `TalkPad`, `Controls` (Keep mic open, Monitor, mic settings).
- **Hold to talk** (`useHoldToTalk` in `model.ts`) is gesture-handler's `Gesture.LongPress`, 300 ms, 48 pt
  of drift allowed before it opens. Once open, movement doesn't matter; lifting closes. A tap closes a
  latched mic. **Not `Pressable.onLongPress`**: that silently gives up after ~10 pt of movement and can't be
  configured, which left the pad stuck on "Keep holding…".
- **Mic meter**: 30 equal segments over −60…0 dB, amber over −12, coral over −6, and scale marks
  (−48, −24, −12, 0 dB) placed under their real segments. The comp's staircase heights and free-floating
  scale text were decoration and are gone. Waydroid's virtual mic sits around −18 dB in silence.
- `Focus`: a 300 pt ring (track progress, SVG) round a big talk button, "N people are listening", latch
  and monitor pills, Queue / Play / Skip. Talking bars follow the real mic level.
- `Sheets`: running order (tap = `engine.playAt(i)`, long-press drag to reorder, × with Undo, Repeat,
  + Add), mic settings (level, Light/Medium/Deep = under/low/silence, fade, broadcast voice, monitor volume),
  End (says what happens next: AutoDJ / silence / off air).
- `Milestone`: a toast at 1, 5, 10, 25, 50… peak listeners, seeded so re-entering the studio doesn't replay.
- Removed because the comp has none: Share in the studio, previous track, queue air times. The striped
  "ART" placeholders were removed (no cover art is read from files); Overview uses station artwork if set.
- Engine state is read through **`useEngineSnapshot`** (`broadcast/hooks.ts`): one immutable object rebuilt
  per engine version. Compiler-safe (§4) and copies the queue, which the engine mutates in place.

**Session stats (`BroadcastContext.session`):** listeners (public count, 10 s), peak and tracks started,
kept above the screens so they survive leaving the studio. End passes them to **`/summary/[slug]`**
("That's a wrap": on air for, peak, tracks played, audio lost from the transport, and what happens after).

**Library upload:** `POST /stations/{slug}/tracks`, one file per request (honest progress, stops at a quota
error), Pro only (the API enforces it), lands in the default playlist. **Trap:** since SDK 57 the global
`fetch` is `expo/fetch`, which rejects React Native's `{ uri, name, type }` FormData parts with
"Unsupported FormDataPart implementation", thrown before any request. Append an `expo-file-system` `File`
instead; `uploadable()` first moves the picker's cached copy (generated name) into a temp folder under the
original name, because the API titles untagged tracks by filename. `apiUpload()` in `lib/api.ts` now shows
the real error instead of "could not reach the server".

**Library delete:** long-press a track to start selecting (no Select button), tap to tick more in any
playlist, **Done** or unticking the last one ends it. A coral "Delete N tracks" bar, then the standard
bottom-sheet confirm. `DELETE /stations/{slug}/tracks` with `{track_ids}` removes tracks from the library
and every playlist; allowed on every plan.

**Schedule editing (`components/station/ScheduleEditor.tsx`):** + Add, or tap a row. The sheet has
Live show / AutoDJ (Pro), a note on what each does, name, day toggles, time wells, and for AutoDJ an end
time ("Ends (next day)" when it crosses midnight) and a playlist picker. Saves are the API's full-list
`PUT /stations/{slug}/schedules` and `PUT /stations/{slug}/autodj-slots`: the app sends the whole list with
the one change. If the station has no timezone, the phone's is sent (the API refuses show times without
one). **Time picker:** `@expo/ui/jetpack-compose` `DateTimePicker` (`hourAndMinute`, 24 h), Material 3's
clock dial coloured coral or violet. It is already in the installed build. **Trap:** the native picker
resets whenever `initialDate` changes, so the seed is fixed when the dial opens.

**Open decision: the "Live show" label.** Show times (`station_schedules`) are advertising only: a line on
the player page, converted to the listener's clock. They start nothing, remind no one, have no end time,
and don't affect AutoDJ. Ammar found "Live show" misleading. Proposed: (1) rename to what it is, e.g. "On
your player page / What AutoDJ plays" or "Show times / AutoDJ"; (2) later, make it real (a reminder to the
broadcaster before the show, "Live tonight at 22:00" on the player page), which needs push notifications.
Awaiting his choice. The web's "When you're live" lane gained one sentence: "Nothing starts on its own: you
still go live yourself." (`client/app/dashboard/stations/[slug]/schedule/SchedulePlanner.tsx`).

**Other copy/data decisions:** "Free during beta" removed from the Pro upsell; audience countries card is
hidden while empty (geo needs Cloudflare); AIRTIME shows hours with the remainder in minutes; the peak tile
names the day it happened; "1 track" vs "N tracks" via `trackCount()` in `lib/station.ts`.

## 4. Fixed: taps that "did nothing" (React Compiler)

- **Symptom:** **Keep mic on**, every option in the mic settings sheet, and Mic level −/+ did nothing.
  **Done**, the deck buttons and scrolling worked. Confirmed fixed on device by Ammar on 2026-09-27.
- **Cause:** the React Compiler (`experiments.reactCompiler: true`) cached `engine.isMicLatched()` and
  `engine.getMicPrefs()` against `engine` (`if ($[0] !== engine)`). The engine object never changes, so
  both values froze at the first render. `useEngineVersion` re-rendered `MicDesk`, but the render reused
  the frozen values.
  - The taps did reach the engine. The screen just never showed the change.
  - The latch always called `setMicLatched(!false)`, and −/+ always wrote the same `frozen ± 3`.
  - `MonitorBar` had the same bug with `isMonitorEnabled`.
  - **The lamp** had it too, hidden inside a helper: `computeSignal(state, engine, …)` was cached until
    `transport` changed. So the banner lagged mic and play changes by up to 2 s, the health poll interval.
    Ammar reported this as "the banner on top has a long delay".
- **Fix:** `useEngineValue(engine, e => e.isX())` in `src/broadcast/hooks.ts`, built on
  `useSyncExternalStore`. It accepts a null engine with a fallback. `Deck` was already safe, because it feeds
  `version` into its `useMemo`.
- **Rule:** never call `engine.getX()` / `engine.isX()` in render, and never pass `engine` into a helper
  that reads it. Use `useEngineValue`.
- **To audit a file:** compile it with `babel-plugin-react-compiler` (run `node` with
  `NODE_PATH=mobile/node_modules` on `@babel/core`). Look for `engine.` reads, or helpers called with
  `engine`, inside `if ($[n] !== engine)` blocks.

## 5. Backend changes (commit `92af763`, deployed)

**1. Token login.** `POST /api/auth/login` with `device_name` returns `token` in the JSON body and sets no
cookie. The web never sends `device_name` and keeps the cookie-only behaviour.
- Files: `AuthController::login`, `LoginRequest`. Tests are in `tests/Feature/Auth/LoginTest.php`.
- The login response is the bare model, so the app calls `GET /user` afterwards to get the plan.

**2. Native Google sign-in.**
- **Endpoint:** `POST /auth/google/native` (`GoogleAuthController::native`, `App\Services\GoogleIdTokenVerifier`).
- **Tests:** `tests/Feature/Auth/GoogleNativeSignInTest.php`, 11 of them. The 14 web Google tests still pass.
- **App:** Android's Credential Manager "Sign in with Google" bottom sheet, from the local module
  `modules/gocast-google-auth` (Kotlin, `GetSignInWithGoogleOption`).
  - It returns Google's ID token for the **web** client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).
  - The free React Native Google library was skipped because it uses Google's deprecated account picker,
    not the sheet.
- **API:** verifies the token locally with `firebase/php-jwt` (already installed by Socialite, so there's no
  new dependency). It checks:
  - the RS256 signature against Google's JWKS (cached 1 h, refetched once on an unknown key);
  - the issuer;
  - the **audience** (must equal `services.google.client_id`);
  - `email_verified`.
- **Accounts:** the same find, link or create, invite and verify logic as the web callback, shared through
  `signInGoogleUser()`. Returns `{data: UserResource, token, invite}`.
- **Google Cloud:**
  - Web client, used by both dev and prod: `285604660745-ba5s74u358gkkdvae2nq0setv46oa1a9.apps.googleusercontent.com`.
  - An **Android** OAuth client in the same project, for `app.gocast.mobile` with the debug-keystore SHA-1
    `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Ammar created it on 2026-09-28.
    This is React Native's standard debug keystore, which is identical after every `prebuild --clean`.
  - A Play release needs another Android client with the Play App Signing SHA-1.
- **Sign out** also calls `clearCredentialState`, so the account chooser shows again next time.
- **History:** a browser flow (Custom Tab, PKCE code exchange, `adb reverse` for `localhost`) was built
  first. Ammar asked whether it was "the native way", and it was replaced the same night. Nothing of it
  remains (and `expo-crypto` was removed).

## 6. Architecture

```
mobile/
  app.json                      identity app.gocast.mobile; icon + blank splash; react-native-audio-api
                                plugin (mic + mediaPlayback foreground service, permissions)
  eas.json                      EAS profiles, Node pinned to 24.12.0 (see traps)
  .env / .env.production.local  gitignored: dev LAN values / production values (§7)
  patches/react-native-audio-api+0.13.6.patch   applied by postinstall (patch-package)
  modules/
    gocast-encoder/             PCM → AAC-LC (ADTS) via Android MediaCodec, plus the master limiter. iOS stub.
    gocast-google-auth/         Credential Manager "Sign in with Google" sheet → ID token. Android only.
  scripts/ingest-proxy.mjs      DEV ONLY: LAN → station router proxy (§7)
  scripts/start.mjs             `npm start`: Metro + the ingest proxy together
  src/
    app/                        expo-router screens
      _layout.tsx               fonts, splash layer, Auth → Broadcast → OverlayHost → Stack (no headers)
      index.tsx                 auth gate → /home or /welcome
      welcome.tsx, login.tsx, account.tsx
      home.tsx                  finds the account's station and redirects to it
      station/[slug]/           _layout (header, text tab bar, context), index (Overview), audience, schedule, library
      live/[slug].tsx           Go live: checklist + 3-2-1 countdown
      studio/[slug].tsx         the studio (standard + Focus)
      summary/[slug].tsx        "That's a wrap"
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
      hooks.ts                  useEngineVersion, useEngineValue, useEngineSnapshot, transport health, lamp signal, listeners
    components/
      ui.tsx                    the comp's primitives (§3c)
      AnimatedSplash.tsx, Brand.tsx (+ GoogleLogo), Skeleton.tsx, StationArt.tsx, Waveform.tsx, LiveStrip.tsx
      Overlay.tsx               in-tree sheets/dialogs (replaces RN Modal)
      station/parts.tsx         StationScreen, Section, StatTile, TileRow, BarRow, EmptyNote, tab skeletons
      station/ScheduleEditor.tsx  add/edit/delete show times and AutoDJ slots
      studio/                   Band, Console (NowPlaying, TalkPad, Controls), Focus, Sheets
                                (Queue, Mic, End), Milestone, model.ts (lamp, hold-to-talk, meter, clock)
    lib/
      api.ts                    fetch + bearer, apiUpload() (multipart), ApiError, mediaUrl()
      auth.tsx                  AuthProvider: restore, signIn, signInWithGoogle, signOut
      station.ts                station API types, StationContext, useApiData, useStationStatus, formatters
      web.ts                    webUrl(), openWeb() (in-app browser tab), shareStation()
      kv.ts, theme.ts           theme = the comp's tokens and font()
```

**Audio path:**
```
file source ─→ fileGain ─┬─→ mixer ─→ tap (WorkletNode, 100 ms) ─→ JS ─→ GocastEncoder (limiter + AAC) ─→ WebSocket
                         └─→ monitorGain ─→ speaker
mic ─→ micTrim ─┬─→ micDry ──────────────────────────────┐
                └─→ highpass → presence → voiceComp ─→ micWet ─→ micGain ─→ mixer
```
- The context runs at the device's preferred rate, 48 kHz on the A55.
- Harbor receives stereo AAC at 128 kbps over the same `webcast` WebSocket protocol as the web studio, with
  hello `mime: "audio/aac"`. The **dev** image was probed and decodes AAC natively. Production uses
  the same image, but it hasn't been tested live yet.

### Library patches and non-obvious fixes (don't undo)

1. **Fan-out aliasing, which made the broadcast silent.** `react-native-audio-api` hands a node's own buffer
   to all its consumers, and gain nodes multiply it in place. So `fileGain → monitorGain(0)` zeroed the mix.
   Every engine node is created with `channelCountMode: 'explicit'`, which gives each node its own buffer.
2. **Monitor static.** The library's output stream is low-latency *exclusive* (about 3 ms of slack), and
   the tap's work every 100 ms caused clicks. The patch makes it **shared, PerformanceMode::None, full
   buffer** (`AudioPlayer.cpp`).
3. **Quiet mic.** Oboe's default input preset is VoiceRecognition, about 30 dB under a laptop mic. The
   patch sets **VoicePerformance** (`AndroidAudioRecorder.cpp`), and the engine adds `micTrim`
   (`inputGainDb`, default 28).
4. **No compressor node exists.** The master limiter is in Kotlin (`GocastEncoderModule.kt`), with the
   web's settings and Web Audio's automatic makeup gain. The voice compressor is an audio-thread worklet
   whose gain is computed per 16-sample block. Per-sample `log`/`pow` made the audio thread late.
5. **MP3 in JS was rejected.** lamejs under `node --jitless` (a proxy for Hermes) runs at 1.6× real time on
   the laptop, too slow for a phone.
6. **Android `elevation` lifts panels above siblings.** That put them over the sticky lamp. `panelShadow`
   no longer sets elevation, and the lamp has an opaque base.

## 7. Dev setup and runbook

**Local Android builds (no EAS quota):**
- SDK at `~/Android/Sdk`, installed with the new `android sdk install` CLI. `sdkmanager` is deprecated, and
  package ids use slashes, e.g. `ndk/27.1.12297006`.
- `JAVA_HOME` is Temurin 21.
- Dev build:
  ```bash
  cd mobile/android && ANDROID_HOME=~/Android/Sdk JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64 \
    ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a
  ```
  About 15–40 s incremental. The first ever build took 23 min and about 3 GB into `~/.gradle`.
- After changing `app.json` or adding or removing native deps, run
  `npx expo prebuild --platform android --clean --no-install` first.
- A new local module under `modules/` is autolinked with a plain Gradle build; no prebuild needed.
- JS-only changes need no build: Metro serves them, and pressing `r` reloads.

**Production build (no dev tools, no Metro):**
- Values in `mobile/.env.production.local` (gitignored, matched by `.env*.local`). Expo loads it ahead of
  `.env` for release bundles, so the dev `.env` stays as it is:
  ```
  EXPO_PUBLIC_API_URL=https://api.gocast.fm/api
  EXPO_PUBLIC_APP_URL=https://gocast.fm
  EXPO_PUBLIC_INGEST_URL=            # empty → the API's own wss://stream.gocast.fm/broadcast/{slug}
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=285604660745-ba5s74u358gkkdvae2nq0setv46oa1a9.apps.googleusercontent.com
  ```
  Check what the bundle will get with `@expo/env`'s `parseProjectEnv(cwd, {mode: 'production'})`.
- Build:
  ```bash
  cd mobile/android && NODE_ENV=production ANDROID_HOME=~/Android/Sdk \
    JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64 ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a
  ```
  The first build took about 15 min. Output: `app/build/outputs/apk/release/app-release.apk`, about 63 MB.
- **Check before installing:** grep `app/build/generated/assets/react/release/index.android.bundle` for
  `192.168` and `localhost:8000`.
  - The only hits should be comments: Expo Router's `exp://192.168.87.39` example and `mediaUrl()`'s doc.
  - It should contain `https://api.gocast.fm/api` and the client ID.
- Release is signed with the **debug keystore** (the Expo template's default). So it installs over a dev
  build, and Google sign-in works with the existing Android client.
- **Going back to dev:** reinstall `app/build/outputs/apk/debug/app-debug.apk`.
- The production API needed no env changes; it reuses `GOOGLE_CLIENT_ID`. The production ingest proxy
  (`infra/native/nginx/gocast-stream.conf`) doesn't filter on `Origin`, and harbor checks the broadcast token.

**Installing on the phone (wireless adb):**
- `adb install` of a 60–110 MB APK kept dropping ("device offline"). This works:
  ```bash
  adb -s <serial> push app-….apk /data/local/tmp/gocast.apk && adb -s <serial> shell pm install -r /data/local/tmp/gocast.apk
  ```
- **Keep only one adb connection to the phone.** Two at once (the mDNS serial *and* `adb connect IP:port`)
  kept knocking it offline. If both show up: `adb kill-server`, then `adb connect <ip:port>` from
  `adb mdns services`.
- The wireless port changes on every reconnect. When pairing, the port on the Wireless debugging screen is
  the *connect* port, and `adb mdns services` shows the pairing port.
- Android turns Wireless debugging off by itself from time to time; ask Ammar to re-enable it.
- A dev build that opens on the Expo launcher isn't connected to Metro (`r` says "no apps connected").
  Tap the server entry, or run
  `adb shell am start -a android.intent.action.VIEW -d "gocast://expo-development-client/?url=http%3A%2F%2F<LAN-IP>%3A8081"`.
- `adb exec-out screencap -p` for screenshots. `screenrecord` fails while the phone is dozing.

**Waydroid (desktop Android, x86_64):** `waydroid status` for the IP (192.168.240.112), then
`~/Android/Sdk/platform-tools/adb connect <ip>:5555` (adb isn't on PATH). The debug APK includes x86_64,
so `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` works as is. `.env` points the API at
`192.168.240.1` (the laptop on the waydroid0 bridge). `adb shell input tap/swipe` and `adb exec-out
screencap -p` for checks; don't tap around while Ammar is using the screen.

**Everything that must run for a dev live show:**
- `php artisan serve --host=0.0.0.0` (API),
- Metro plus the ingest proxy: **`npm start` in `mobile/` runs both** (`scripts/start.mjs`; extra args go to
  `expo start`, e.g. `npm start -- --clear`). Without the proxy, Go live can't reach the station. The proxy's
  lines are prefixed `[ingest-proxy]`; if port 18091 is taken it says so and Metro keeps running,
- `php artisan schedule:work` in `api/` (without it, `stations:reconcile` never closes a live session whose
  disconnect callback was lost, and Go live then says "someone is live from another device"; one-off fix:
  run `php artisan stations:reconcile` three times, it needs three strikes).

**Metro:** Ammar runs `npm start` in `mobile/` (Metro + ingest proxy; `expo-dev-client` makes it a dev-client server by default). Don't start or restart it. After changing
`.env` or native deps, he has to restart it.

**Dev env (`mobile/.env`, gitignored):**
```
EXPO_PUBLIC_API_URL=http://192.168.1.4:8000/api
EXPO_PUBLIC_INGEST_URL=ws://192.168.1.4:18091/broadcast/{slug}
EXPO_PUBLIC_APP_URL=http://192.168.1.4:3000
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=285604660745-ba5s74u358gkkdvae2nq0setv46oa1a9.apps.googleusercontent.com
```
The laptop's LAN IP can change; `.env.example` still shows an older `192.168.1.10`.

**Ingest in dev:**
- The API's `ingest_url` is the station container's Docker bridge IP, which a phone can't reach.
- The station router proxies every station at `127.0.0.1:8091/broadcast/{slug}`, but only on loopback.
- `node scripts/ingest-proxy.mjs` exposes it on `0.0.0.0:18091`. With `DUMP_DIR=…` it records phone→server
  bytes. Decode a dump by un-masking the WebSocket frames, then run ffmpeg `volumedetect`. This is how the
  silent-broadcast bug was found.
- Restarting the proxy drops the phone's connection, so harbor briefly falls back to AutoDJ.

**Laravel** must run with `--host=0.0.0.0`.

**Checks before calling anything done:**
- `npx tsc --noEmit` and `npx expo lint`, both clean as of 2026-09-28 (after the redesign).
- `npx expo export --platform android --output-dir <tmp>` bundles without a dev server and catches
  resolution errors (it also shows the fonts ship).
- A new route needs its entry in `.expo/types/router.d.ts` for `tsc`; Metro regenerates that file, so
  without Metro add it by hand (it's gitignored).
- For the API: targeted `php artisan test --compact <files>` (the full suite is slow), then
  `vendor/bin/pint <files> --format agent`.
- For import and route errors `tsc` misses, fetch the full bundle from Metro:
  `curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false&transform.routerRoot=src%2Fapp"`.

**The harbor `EPIPE` every 15 s is not the app.** It's the station container's own healthcheck, which reads
only the first line of `/healthz`.

## 8. Work that can run in parallel

These avoid each other's files. Claim one, then check `git status` before starting.

**A. Redesign follow-ups** (`src/components/*`, `src/app/*`).
- Decide the show-time label (§3c, open decision).
- Plex Sans / Plex Sans Arabic for non-Latin titles (switch the font when a string has Arabic/Cyrillic).
- Run a real delete, schedule save and schedule delete; check everything on the A55, not only Waydroid.
- Native rebuild to pick up the new splash colour.

**B. Show-time reminders** (needs push notifications): remind the broadcaster before an advertised show;
"Live tonight at 22:00" / "Live now" on the player page.

**C. Phone-call and interruption handling** (`src/audio/engine.ts`, `src/broadcast/broadcastManager.ts`).
- Audio focus loss (a phone call takes the mic), Bluetooth mic changes.
- `AudioManager.observeAudioInterruptions` in the library.
- Decide what the lamp says.

**D. Live production test, then the Play Store.**
- The production build is installed. Test in this order:
  1. Google and email sign-in against production.
  2. Go live on 4G with Wi-Fi off. This is the first proof that the production Liquidsoap takes the app's
     AAC over `wss://stream.gocast.fm`.
  3. Switch Wi-Fi ↔ 4G mid-show. Expect about 10–15 s of lost audio: harbor holds the dead source for
     `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` (10 s). Measure before optimising, for example by having the server
     kick the stale source.
- For the store:
  - generate an upload keystore (Ammar must back it up);
  - add a second Android OAuth client with the Play App Signing SHA-1;
  - build an AAB (`bundleRelease`).

**E. Station console: what editing is left** (`src/app/station/*`).
- Done 2026-09-28: Library upload and delete, Schedule add/edit/delete (§3c).
- Left: playlists (create, rename, membership, order), jingles upload (`kind: 'jingle'`), station settings.
- The response shapes are typed in `src/lib/station.ts`. The web versions to port are in
  `client/app/dashboard/stations/[slug]/*` (`SchedulePlanner`, `ShowTimesEditor`, `AutodjSlotsEditor`,
  `LibraryView`, `useTrackUpload`).

**F. Listener player** (new routes). The public station page, and background playback with lock-screen
controls.

**G. Performance** (`src/audio/engine.ts`, `src/components/studio/MicDesk.tsx`).
- The JS thread runs at about 55% while live, and native heap is about 870 MB.
- Likely suspects: the mic meter re-rendering 40 Views at 20 fps, the tap's `scheduleOnRN` copies, and the RN
  WebSocket base64-encoding binary sends.

**H. iOS** (`modules/gocast-encoder/ios`, plus a Google sign-in module for iOS). Blocked until Ammar has an
Apple account and an iPhone.

## 9. Other traps

- **React Compiler freeze:** see §4. It is the first suspect whenever a control "does nothing" or updates
  late. In the studio, read the engine through `useEngineSnapshot`.
- **`expo/fetch` is the global fetch (SDK 57)** and rejects `{ uri, name, type }` FormData parts (§3c).
  Opt out app-wide with `EXPO_PUBLIC_USE_RN_FETCH=1` if ever needed; the app doesn't.
- **`Pressable.onLongPress` cancels after ~10 pt of movement**, with no setting to change it. For holds
  that must survive a wobbly finger, use gesture-handler's `Gesture.LongPress().maxDistance()`.
- **Text glyphs (← ⌄ › × ▶ ↗) aren't in the comp's fonts** and render small and misaligned in the system
  font. Use Tabler icons.
- **Uploaded images are stored as absolute `localhost` URLs in dev.** Artwork and avatars are saved from the
  API's `APP_URL` (`http://localhost:8000`), which on the phone points at the phone itself. Always load them
  through `mediaUrl()` (`lib/api.ts`), which swaps a loopback host for the API's. `StationArt` does this and
  falls back to initials. In prod `APP_URL` is the real domain, so the swap does nothing.
- **EAS cloud builds count against the 15/month Free quota, dev builds included.** Build locally. Local and
  EAS builds are signed differently, so switching between them needs an uninstall.
- **The first EAS build failed at `npm ci`:** the lockfile was out of sync over `@emnapi/*`. Fixed by
  regenerating the lockfile and pinning Node in `eas.json`.
- **When regenerating the patch, exclude build output and downloaded binaries:**
  ```bash
  npx patch-package react-native-audio-api \
    --exclude '^package\.json$|/build/|\.cxx/|/\.gradle/|node_modules/|/jniLibs/|/external/|\.DS_Store'
  ```
- **Local module build output must stay out of git.** `mobile/.gitignore` ignores `modules/*/android/build`,
  `.cxx` and `.gradle`. Without that, a commit picks up about 280 generated files.
- **Prettier has no project config.** Run it as `npx prettier --single-quote --print-width 120`, or it
  rewrites files to double quotes and 80 columns.
- **The React Compiler lint rules are strict:** no `Date.now()` in render, no `setState` directly in an
  effect body, and no `useCallback` that references itself. Put the logic in the effect, or return the time
  from a ticker hook.
- **Stopping a Gradle build:** killing the command isn't enough. Run `./gradlew --stop`, because the daemon
  keeps building.
- **Never `pkill -f` a pattern that appears in your own command line.** It kills your own shell (exit 144).
- **Disk is tight** (about 16 GB free). `mobile/android` and `node_modules/*/android/build` hold several GB
  of rebuildable output. Keep `~/.gradle`, since re-downloading costs Ammar's 4G data.
- **The lamp copy deliberately differs from the web** in one line: the phone *can* be locked.
- **The Library's playlist card caches its tracks per open**; it refetches on refresh and when the count
  changes. If a list looks stale after an edit, check the `version` prop is bumped.
