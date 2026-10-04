---
feature: Mobile app shell and sign-in
verified: 2026-10-04 against e145a37 plus uncommitted work (feat/design-system)
sources:
  - mobile/package.json
  - mobile/app.json
  - mobile/eas.json
  - mobile/.env.example
  - mobile/patches/react-native-audio-api+0.13.6.patch
  - mobile/scripts/start.mjs
  - mobile/scripts/ingest-proxy.mjs
  - mobile/src/app/_layout.tsx
  - mobile/src/app/index.tsx
  - mobile/src/app/home.tsx
  - mobile/src/app/welcome.tsx
  - mobile/src/app/login.tsx
  - mobile/src/app/account.tsx
  - mobile/src/app/summary/[slug].tsx
  - mobile/src/lib/api.ts
  - mobile/src/lib/auth.tsx
  - mobile/src/lib/kv.ts
  - mobile/src/lib/station.ts
  - mobile/src/lib/theme.ts
  - mobile/src/lib/web.ts
  - mobile/src/components/AnimatedSplash.tsx
  - mobile/src/components/Brand.tsx
  - mobile/src/components/LiveStrip.tsx
  - mobile/src/components/Overlay.tsx
  - mobile/src/components/Skeleton.tsx
  - mobile/src/components/StationArt.tsx
  - mobile/src/components/ui.tsx
  - mobile/src/components/Waveform.tsx
  - mobile/modules/gocast-google-auth/src/GocastGoogleAuthModule.ts
  - mobile/modules/gocast-google-auth/android/src/main/java/app/gocast/googleauth/GocastGoogleAuthModule.kt
  - mobile/modules/gocast-google-auth/android/build.gradle
  - mobile/modules/gocast-google-auth/expo-module.config.json
  - mobile/modules/gocast-keepalive/src/GocastKeepAliveModule.ts
  - api/routes/api.php
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Services/GoogleIdTokenVerifier.php
  - api/app/Http/Middleware/EnsureEmailIsVerified.php
fingerprint: de8e083fa137c1bd
---

# Mobile app shell and sign-in

`mobile/` is an Expo SDK 57 / React Native 0.86 app (Expo Router, `src/app/` routes, React Compiler on). This doc covers the skeleton around the station screens and the studio: how the app boots, how a session is created, kept and killed, how it talks to the Laravel API, the shared UI kit, and the build config. The station tabs are in [mobile-station-screens.md](mobile-station-screens.md), the live/studio/encoder code in [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md), the API side of auth in [auth.md](auth.md).

The thing people get wrong: **the app is an Android app.** Google sign-in exists only as an Android native module, there is no `ios/` folder, and the studio's foreground service is Android. `app.json` carries an iOS bundle id and a microphone string, but nothing in the repo has ever built or run an iOS binary, and the login code would fail at import on iOS (see Gaps). The second surprise: the app never uses a browser session. It holds a Sanctum bearer token and sends nothing to the web app, so every "open the web" button lands on a signed-out web page.

## What it actually does

### Boot sequence

1. `src/app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` and `setOptions({ duration: 0, fade: false })` at module load. The native splash (`app.json`, plugin `expo-splash-screen`, colour `#0E0D0C`, a 1px blank image `splash-blank.png`) is only a ground colour.
2. `RootLayout` loads fonts with `useFonts`: Bricolage Grotesque 400/500/600/700/800 and IBM Plex Mono 400/500/600/700. Nothing else is loaded (the `@expo-google-fonts/jetbrains-mono` and `onest` packages are in `package.json` but never imported).
3. `AuthProvider` mounts immediately (before fonts) and restores the session in parallel (below).
4. Only when `fontsLoaded` does the tree render: `BroadcastProvider` > `OverlayHost` > `StatusBar` (light) + `RootStack`. Everything sits in `GestureHandlerRootView` with the `#0E0D0C` background.
5. `SplashLayer` renders `AnimatedSplash` on top with `ready = fontsLoaded && auth.status !== 'loading'`. It calls `SplashScreen.hideAsync()` from its first `onLayout`, so the native splash goes away only once the animated layer has drawn.
6. `AnimatedSplash` (`components/AnimatedSplash.tsx`): 30 violet bars swell and settle (bar `k` starts `12 ms * k` late, five sequenced steps of about 340 ms, random peaks under a sine envelope), then from 1650 ms the wordmark wipes in from the left over 900 ms (`LOGO_W = 220`). It holds `HOLD_MS = 1000` after that, so `PLAYED_AT = 1650 + 900 + 1000 = 3550 ms` is the **minimum launch time**. When `played && ready` it fades out over `FADE_OUT = 280 ms` and calls `onDone`, after which the layer unmounts. Under reduced motion (`useReducedMotion`) there is no wave and no wipe: the wordmark is shown at full width and `played` flips after 1000 ms. `SPEED = 1` is a tuning constant. The layer is `zIndex/elevation 1000` and blocks touches until `done`.
7. `app/index.tsx` is the gate: `null` while `loading`, otherwise `<Redirect>` to `/home` (signed in) or `/welcome`.

### Navigation structure (Expo Router)

`RootStack` is one `Stack` with `headerShown: false` (every screen draws its own top bar) and a `#0E0D0C` content background. Two `Stack.Protected` groups, keyed on auth state (`null` while loading closes both):

| Group (guard) | Routes |
|---|---|
| always | `index` |
| signed out (`signedIn === false`) | `welcome`, `login` |
| signed in (`signedIn === true`) | `home`, `account`, `station/[slug]` (a folder with its own `_layout`, JS tabs: Overview, Audience, Schedule, Library), `show-times/[slug]`, `live/[slug]`, `studio/[slug]`, `summary/[slug]` (`gestureEnabled: false`) |

No screen navigates on sign-in or sign-out by hand. When the guard flips, Expo Router drops the now-forbidden group from history and falls back to `index`, which redirects. That is why the system Back button cannot return to the station after sign-out or to login after sign-in. There is no `+not-found` route and no custom `ErrorBoundary` in `src/app`; Expo Router's default applies. `app.json` sets `scheme: "gocast"` and `experiments.typedRoutes`; no deep-link handling is written (nothing reads an incoming URL).

Navigation calls found outside these screens: `home` redirects to `/station/[slug]` with `slug` and `name`; `account` back is `router.back()` or `replace('/')`; `login` back is `back()` or `replace('/welcome')`; `summary` "Back to station" and the hardware back both `router.dismissTo('/station/[slug]')`; `LiveStrip` does `router.navigate('/studio/[slug]')`.

### Session and token

All in `src/lib/auth.tsx` and `src/lib/api.ts`.

- **Storage:** `expo-secure-store`, key `auth-token`, holds the raw Sanctum plain-text token. `api.ts` also keeps it in a module variable (`setApiToken`) that every request reads.
- **Restore on launch:** read `auth-token`; none means `signedOut`. Otherwise set it, call `GET /user` (`AuthController::user`, returns `{data: UserResource}` with the plan loaded). Success is `signedIn`. A **401** deletes the stored token and clears it. **Any other failure (offline, 5xx, timeout) also ends in `signedOut`**, but keeps the stored token in SecureStore and in the `api.ts` module variable (see Gaps: the comment says the phone "stays signed in", the code does not).
- **Email/password sign-in:** `POST /auth/login` with `{email, password, device_name: "GoCast app (android)"}`. `device_name` is what makes `AuthController::login` return `token` in the body instead of setting the web cookie; it also becomes the token's name. The response's `data` is `UserResource` (with the plan) since 2026-09-29, but the app still ignores it and calls `GET /user` through `adoptToken`, the one path that seeds a session. Route is under `throttle:auth` (10/min per IP, `AppServiceProvider`) plus `AuthController` per email+IP lockout (`MAX_LOGIN_ATTEMPTS = 5` wrong passwords, then 429 for `LOCKOUT_SECONDS = 900`, 15 minutes; message "Too many login attempts. Try again in N seconds."); wrong credentials are 401 "Invalid credentials.". The token is saved to SecureStore before `/user` is called.
- **Google sign-in:** `signInWithGoogle` refuses with "Google sign-in isn’t set up in this build." if `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is empty. Otherwise `GocastGoogleAuth.signIn(webClientId)` shows Android's Credential Manager sheet (`GetSignInWithGoogleOption`, explicit button flow, not auto-select). A dismissed sheet resolves `null` and `signInWithGoogle` returns `false` (the screens ignore the value, so a cancel does nothing and shows no message). Otherwise it `POST /auth/google/native` `{id_token, device_name}` (same `throttle:auth` group, 10/min per IP). The API (`GoogleAuthController::native`) validates `id_token` (max 8192), `device_name` (required, max 255), optional `invite` (max 40; **the app never sends one**), verifies the JWT in `GoogleIdTokenVerifier` (issuer, `aud` equals the API's `services.google.client_id`, `email_verified` true, `sub` and `email` present; Google's signing keys are cached for an hour and only an unknown `kid` triggers a rate-limited refetch, see [auth.md](auth.md)), then links, creates or signs in the account exactly like the web callback, and returns `{data, token, invite}`. So **Google both signs in and creates the account**; that is why Welcome leads with it. Token gets stored and `/user` is refetched, same as email.
- **Native module errors:** no foreground activity gives "The app isn't in the foreground."; no Google account gives "There's no Google account on this phone. Add one in Settings, or sign in with email."; other Credential Manager failures pass Google's message through, or "Google sign-in failed."; a non-Google credential gives "Google returned an unexpected credential.". Google only opens the sheet for an Android OAuth client registered for `app.gocast.mobile` plus the signing certificate's SHA-1 (comment in the `.kt` file and `.env.example`); a mismatch surfaces as one of these errors. Server-side rejection is a 422 "Google sign-in failed. Please try again.".
- **Sign out:** `POST /logout` (deletes the current token; failure is swallowed), then `endSession`: clear the module token, set `signedOut`, delete the SecureStore entry, and `GocastGoogleAuth.signOut()` (`clearCredentialState`) so the next Google sign-in shows the chooser again.
- **Mid-session 401:** `api()` and `apiUpload()` call the registered unauthorized handler when a 401 arrives for the **same token still in use** (`sent === token`), which runs `endSession` without calling `/logout`. A slow response from a replaced session cannot sign out the new one. Token lifetime is the API's `sanctum.expiration` (default 43200 minutes = 30 days, env `SANCTUM_EXPIRATION`); after that the next request 401s and the app drops to Welcome.
- **`useAutoDjLocked()`** is true only when the plan is known and `autodj_enabled` is false, so an unknown plan behaves as unlocked (mirrors the web hook).
- The `User` type carries `plan { slug, name, autodj_enabled, max_listeners, expires_at }`.

### API client (`src/lib/api.ts`)

| Piece | Behaviour |
|---|---|
| Base URL | `EXPO_PUBLIC_API_URL`, inlined at bundle time, `''` if unset (requests then go to a relative path and fail as "Could not reach the server at "). Must include `/api`. |
| `api<T>(path, {method, body})` | Global `fetch`, headers `Accept` + `Content-Type: application/json` on every call (GET too) + `Authorization: Bearer`. JSON body. No timeout, no abort, no retry. |
| Errors | Network/throw: `ApiError(0, "Could not reach the server at <URL>")`. Non-2xx: `ApiError(status, body.message ?? "Request failed (N)", body)`. The API's `message` is shown to people verbatim. Non-JSON bodies parse to `null`. |
| `apiUpload(path, FormData)` | POST multipart, no `Content-Type` (RN sets the boundary), returns `{status, body}` for any 2xx including 207. Throw becomes `ApiError(0, "Upload didn’t go through: <reason>")` because expo/fetch also throws on bodies it can't encode. |
| `mediaUrl(url)` | Returns null for empty. If the URL host is `localhost`, `127.0.0.1` or `0.0.0.0`, swaps it for the origin of `EXPO_PUBLIC_API_URL`; real hosts pass through. Needed because the dev API stores artwork/avatars as `http://localhost:8000/...`. Used for avatars and `StationArt`. |

### Shared helpers

- `lib/station.ts` (shape and hooks shared by station screens; the screens are in [mobile-station-screens.md](mobile-station-screens.md)): TypeScript mirrors of the API resources (`Station`, `StationStatus`, `Track`, `Playlist`, `Audience`, `StreamSession`, schedule/slot shapes), `StationContext`/`useStation`, `useApiData(path, pollMs)` (GET on focus, optional poll only while `AppState` is `active`), `useStationStatus(slug)` (polls `/stations/{slug}/status`: 2 s while `starting` or a live-handover is under way, 30 s while `offline`, otherwise `remaining*1000+750` clamped to 3-10 s, default 10 s; on failure exponential 2 s doubling to 30 s; refreshes on foreground; exposes `failed`), `useTicker(ms)`, `errorText`, and formatters (`formatDays`, `formatDuration`, `formatAgo`, `formatWhen`, `trackCount`, `formatBytes`, `DAY_SHORT`, `SOURCE_LABEL`).
- `lib/kv.ts`: JSON key/value files in `Paths.document` (`<key with every character outside [a-z0-9._-], case-insensitive, replaced by _>.json`) via `expo-file-system`. `readJson`, `writeJson`, `removeJson`, each in try/catch: missing or corrupt reads as the fallback, a failed write is silent. Used by `audio/queueStore.ts`, `audio/micPrefs.ts` and `app/live/[slug].tsx` (studio side), not by auth (the token is in SecureStore).
- `lib/web.ts`: `webUrl(path)` = `EXPO_PUBLIC_APP_URL + path`; `openWeb(path)` opens it in an in-app browser tab (`expo-web-browser`, toolbar `#0E0D0C`, controls violet); `shareStation(slug, name)` opens the system share sheet with `"Listen to <name>: <APP_URL>/station/<slug>"`.
- `lib/theme.ts`: colour tokens and the `font(weight, size, {mono, tracking, lineHeight})` helper. Semantics: coral `live` = a person on air, violet `autodj`, amber `pro` (also warnings), green `ok`, warm greys otherwise. `SWATCHES` = pro, autodj, ok, live. Font families are named per weight (`BricolageGrotesque_800ExtraBold`); weight 800 mono maps to Plex 700. The comment says never pair with `fontWeight` or Android ignores the family.

### Screens and their states

**Welcome (`welcome.tsx`)** shown to any signed-out user. Wordmark, animated `Waveform` (30 bars, first 10 coral, rest violet, redrawn by a `useFrameCallback` every `STEP_MS = 200` phase step; frozen under reduced motion), headline "Your station. / Live from your pocket.", three chips ("Mic ducks the music", "Screen off, still live", "AutoDJ PRO"), then:
- "Continue with Google" (busy shows "Signing in…", spinner). Failure shows the error text in coral above the buttons (`accessibilityRole="alert"`); success is silent, the guard swaps the group. Cancel is silent.
- "Sign in with email" pushes `/login` (disabled while Google is busy).
- "Create a free station" opens `<APP_URL>/auth/register` in the in-app browser. There is no in-app registration.
- "Terms" and "Privacy Policy" open `/terms` and `/privacy` on the web.

**Login (`login.tsx`)** Back button, "Welcome back.", `TextField`s for Email and Password (Show/Hide toggle), a reserved error line, "Forgot password?" (opens web `/auth/forgot`), "Sign in" button (dark and dimmed until both fields are non-empty, then light), "or", and "Continue with Google". Client checks: email must contain `@` ("Enter the email you signed up with.", edge on the email field), password non-empty ("Enter your password."). Server errors (any, including 401 "Invalid credentials.", the 429 lockout text, network) are shown on the password field. Editing either field clears the error. Google failure shows the error with no field edge. Either button being busy disables the other. Return key on Email focuses Password; on Password submits. Keyboard handling: `padding` on iOS, `height` on Android.

**Home (`home.tsx`)** the post-login landing, effectively a redirector. Loads `GET /stations` on every focus, takes **`data[0]` only**, and `<Redirect>`s to `/station/[slug]` (passing `name`). States: loading shows `OverviewSkeleton`; none shows a top row (wordmark + "Account") and a card "Create your station" ("It takes a name and a minute on the web. Come back here and it opens on its own.") with "Create on the web" (opens `/dashboard`); error shows the same top row and card titled "Couldn’t reach GoCast" with the API message and "Try again". An account whose email is unverified gets this error state with the API's 403 text "Your email address is not verified." (`stations` is inside the `verified` route group; `EnsureEmailIsVerified` also returns `code: "email_unverified"`, which the app never reads), and the app has no verify flow.

**Account (`account.tsx`)** Back button, avatar (`avatar_url` through `mediaUrl`, else the first initial in amber), name and email. If the user has a `plan`: a "Your plan" card with a pill (`plan.name` uppercased, amber when slug is not `free`), "Listeners at once" (`Up to N`, or an en dash when `max_listeners` is 0), "AutoDJ" ("Plays your library between shows" or "Not on this plan"), "Ends" (only when `expires_at`, formatted with the phone locale), and for non-Pro a "Request Pro" button that opens the web `/dashboard` (it does not request anything itself). Then a card of web links: "Open the web dashboard", "Help" (`/help`), "Privacy Policy". "Sign out" button. Footer `GoCast <expoConfig.version>` (from `app.json` version `1.0.0`; `eas.json` `appVersionSource: remote` means the store version code is managed by EAS). If the phone is broadcasting (`broadcast.state` `live` or `reconnecting`), Sign out first opens a bottom `Overlay` "End the show and sign out?" with "End and sign out" (stops the broadcast, then signs out) and "Stay live". Returns null unless signed in.

**Summary (`summary/[slug].tsx`)** "That's a wrap." shown right after a show ends. It does no fetching: everything comes from route params set by the studio (`name`, `seconds`, `peak`, `tracks`, `lost`, `after`). Four stat cards: ON AIR FOR (`formatClock`), PEAK LISTENERS, TRACKS PLAYED, AUDIO LOST (`N s`, green at 0, amber above). One paragraph by `after`: `autodj` (AutoDJ picked up), `silence` (library empty, goes quiet and switches off), `off_air` (also the fallback for any other value). "Back to station" and the Android hardware back both dismiss to the station. Swipe-back is disabled. Reloading or deep-linking with no params shows zeros.

### UI kit

- `ui.tsx`: `T` (text with tone/mono/weight/size/tracking), `Heading`, `Wordmark` (text "GoCast.fm" in the display face, distinct from the SVG one), `Button` (variants light, outline, live, liveInk, dark, subtle, autodj, pro; default 58 high, 18 radius; `busy` swaps the label for a spinner and disables; `dot`, `icon`), `PillButton`, `TextLink`, `BackButton` (44 touch target), `Card`, `Chip` (the mono feature tags on Welcome), `Dot`, `StateLabel`, `Caption`, `Progress`, `Segmented` (fill or inline look), `Switch` (display only, no handler), `TextField` (boxed, label inside, `secret`, `invalid`), `Divided`.
- `Brand.tsx`: `BrandMark` (violet tile with white G, the web favicon), `Wordmark` SVG (the web `logo.svg`, "Cast" violet), `GoogleLogo` (four-colour, must not be recoloured per Google branding rules), `LOGO_WIDTH/HEIGHT`.
- `Overlay.tsx`: `OverlayHost` renders a portal layer (`zIndex/elevation 100`) above the navigator; `Overlay` (`placement` center or bottom sheet with grabber, max height 86%, `dismissable`) registers its children into it. It exists on purpose instead of React Native `<Modal>`: a `Modal` opens a second Android window, and a closed one could stay invisible and swallow touches (the studio looked frozen after the mic settings sheet). While visible it takes the hardware Back button (closes if dismissable, otherwise swallows it). 180 ms fade-in.
- `Skeleton.tsx`: `SkeletonGroup` (one 900 ms opacity breath 1 to 0.45, static under reduced motion), `Bone`, `BonePanel`, `BoneRows`.
- `StationArt.tsx`: artwork image (`expo-image`, 150 ms transition, radius 25% of size) or a swatch tile with up to two initials when there is no URL or the image errors. `swatchFor(slug)` is a stable string hash into `SWATCHES`; `initialsOf`.
- `LiveStrip.tsx`: coral bar under the safe area, only while this phone is `live` or `reconnecting` and `broadcast.stationSlug` is set: dot, LIVE / RECONNECTING (amber), uptime clock (`useNow(1000)`), "Back to studio". Rendered by the station layout, not by Home or Account.
- `Waveform.tsx`: described under Welcome.

### Config and build

| File | What it sets |
|---|---|
| `app.json` | name GoCast, slug `gocast`, owner `ammarmashfj`, version 1.0.0, portrait, `userInterfaceStyle: dark`, scheme `gocast`, icon `gocast-icon.png`. Android package `app.gocast.mobile`, adaptive icon (violet `#8B5CF6` background, monochrome layer), `predictiveBackGestureEnabled: false`. iOS bundle id `app.gocast.mobile`, icon `assets/expo.icon`. `web.output: static`. `experiments.typedRoutes` and **`reactCompiler: true`**. EAS project id in `extra.eas`. |
| Plugins | `expo-router`, `expo-splash-screen`, `expo-secure-store`, `react-native-audio-api` with `iosBackgroundMode`, an iOS microphone string, `androidForegroundService: true`, `androidFSStopWithTask: false` (the foreground service outlives the task being swiped away), `androidFSTypes: [microphone, mediaPlayback]`, and Android permissions `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`. The two local modules (`gocast-google-auth`, `gocast-keepalive`, plus `gocast-encoder` in [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md)) are autolinked from `mobile/modules/` and are not plugins. |
| `eas.json` | CLI `>= 16.0.0`, `appVersionSource: remote`. Profiles: `base` (Node 24.12.0), `development` (dev client, internal, APK), `preview` (internal, APK), `production` (auto-increment). `submit.production` is empty. No env, channel or credentials configured in the file. |
| `package.json` | Scripts: `start` (`scripts/start.mjs`), `android` (`expo run:android`), `ios`, `web`, `lint`, `postinstall: patch-package`. Key deps: `expo ~57.0.25`, `expo-router ~57.0.23`, `react 19.2.3`, `react-native 0.86.3`, `react-native-audio-api ^0.13.6`, `react-native-reanimated 4.5.1`, `react-native-worklets`, `expo-secure-store`, `expo-web-browser`, `expo-file-system`, `expo-image`, `@expo/ui` (Compose date/time picker), `react-native-sortables`, `@tabler/icons-react-native`. |
| `.env.example` / env files | `EXPO_PUBLIC_API_URL` (must include `/api`), `EXPO_PUBLIC_INGEST_URL` (dev only, `{slug}` placeholder, empty in production to use the API's `ingest_url`), `EXPO_PUBLIC_APP_URL` (web base for share and open-web links), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the API's `GOOGLE_CLIENT_ID`). `.env` and `.env.production.local` exist locally and are gitignored (`.env*.local`, `.env`); the latter overrides for release bundles. All are `EXPO_PUBLIC_*`, so they are baked into the JS bundle at build time: changing one needs a rebuild/reload, and an EAS cloud build does not see the gitignored files (they must be supplied as EAS env vars; nothing in the repo does that). |
| `patches/react-native-audio-api+0.13.6.patch` | Applied on `npm install` by `patch-package`. Android recorder input preset set to `VoicePerformance` (default `VoiceRecognition` left the mic about 20 dB under the music); the player switched from exclusive low-latency to shared, no performance mode, with the full buffer size (the studio mix tap's 100 ms bursts clicked through the speakers). Details in the patch header comments. |
| `scripts/start.mjs` (`npm start`) | Spawns `scripts/ingest-proxy.mjs` and `npx expo start` (extra args forwarded); kills the proxy when Metro exits; prints why the proxy isn't running (port 18091 in use). |
| `scripts/ingest-proxy.mjs` | Dev only. Raw TCP forward `0.0.0.0:18091` (`PORT` env) to `127.0.0.1:8091` (the station router's loopback), so a phone can reach `broadcast/{slug}`; WebSocket upgrade passes through untouched. `DUMP_DIR` writes each connection's inbound bytes to a file. |
| `android/` | Gitignored generated prebuild output (`.gitignore` lists `android`). Its release build type is signed with the debug keystore (the stock template), so it is only good for local testing; real signing is expected to come from EAS-managed credentials. |

### Native modules in this scope

- `gocast-google-auth`: Android only (`expo-module.config.json` `platforms: ["android"]`). Kotlin, `androidx.credentials` 1.5.0 + play-services-auth + `googleid` 1.1.1. Two async functions, `signIn(webClientId)` and `signOut()`. Nothing secret is in the app.
- `gocast-keepalive`: typed by `GocastKeepAliveModule.ts` with `requireOptionalNativeModule`, so it is `null` off Android. `acquire()`/`release()` hold a Wi-Fi lock and partial wake lock for the length of a broadcast; `isIgnoringBatteryOptimizations()` and `requestIgnoreBatteryOptimizations()`. Used by the studio; see [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md).

### What runs where

| Thing | Android | iOS |
|---|---|---|
| Email sign-in, navigation, station screens, token storage | Yes | Untested; code is platform-neutral except below |
| Google sign-in | Yes (Credential Manager) | No module. `auth.tsx` imports it with `requireNativeModule` at module load |
| Studio foreground service / keep-alive | Yes | Not present |
| iOS native project | n/a | None generated |

## Surfaces

Only the mobile app. On the web side the equivalents are the login and dashboard pages ([auth.md](auth.md), [station-management-dashboard.md](station-management-dashboard.md)). The API endpoints the app uses in this scope: `POST /auth/login`, `POST /auth/google/native`, `GET /user`, `POST /logout`, `GET /stations`.

## Gaps and traps

1. **Offline launch signs you out of the UI.** `auth.tsx` restore: only a 401 clears the token, but every failure sets `signedOut`. The comment above it ("a phone that boots offline stays signed in") is wrong for the UI: the user sees Welcome, though the token stays in SecureStore for the next launch. A person who reopens the app in a tunnel sees the sign-in screen.
2. **Fonts failing to load hangs the app on the splash.** `useFonts` returns `[loaded, error]` but only `loaded` is read; on an error `fontsLoaded` never becomes true, so the tree never renders and the animated splash never finishes.
3. **The 3.5 s minimum splash** (1 s under reduced motion) is a fixed cost on every cold start, regardless of how fast the session check is.
4. **iOS is unbuilt and would break at import.** `GocastGoogleAuth` is `requireNativeModule` (throws when the module is absent) and is imported by `auth.tsx`, which the root layout loads. There is also no iOS project, no Apple sign-in, and nothing in the repo shows an iOS build. Treat `ios` and the `iosBackgroundMode` / microphone keys in `app.json` as unexercised.
5. **"Open the web" is always signed out.** `openWeb` passes no credentials; the app's Sanctum token is never handed to the browser (the web uses an HttpOnly cookie). "Create on the web", "Request Pro", "Open the web dashboard" and "Forgot password?" all land on the web's own login. A user who signed up with Google in the app will have to sign in again on the web, and "Request Pro" itself does nothing in the app.
6. **No registration or email verification in the app.** Email sign-up only exists on the web. An account that registered by email and never verified can sign in (login succeeds, even resends a code) but every `verified` route, including `GET /stations`, 403s, so Home shows "Couldn’t reach GoCast" with "Your email address is not verified." and a Try again button that cannot succeed.
7. **Home uses `data[0]` only.** The app assumes one station per account; extra stations are unreachable from the app. Ordering is whatever `GET /stations` returns.
8. **Google cancel is invisible, and invites are unreachable.** `signInWithGoogle` returns `false` on cancel and the screens ignore it (fine, but no feedback). The API accepts an `invite`, the app never sends one, so an invite link cannot be used from a phone-first sign-up.
9. **No request timeout.** `api()` uses bare `fetch` with no `AbortController`; a hung connection leaves screens in their loading state until the OS gives up.
10. **`Content-Type: application/json` is sent on GETs**, harmless but unnecessary.
11. **Sentry and crash reporting are not installed in the app** (no `@sentry/*` in `package.json`, no reference in `src` or `app.json`). Errors go to `console.error` only. The web and API have Sentry; the app does not, and there is no error boundary. Unknown error paths surface as the Expo Router default error screen.
12. **No unit or e2e tests** exist in `mobile/`. `expo lint` and `tsc --noEmit` are the only checks (`CLAUDE.md` says to run them).
13. **Env values are baked at build time and the release env file is gitignored.** `EXPO_PUBLIC_*` in `.env.production.local` only affects local release builds. `eas.json` has no `env` blocks, so an EAS cloud build has no API URL unless the values are set as EAS environment variables (nothing in the repo sets them). An empty `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` disables Google sign-in with "Google sign-in isn’t set up in this build.".
14. **Google needs three matching things**: web client id == API `GOOGLE_CLIENT_ID` (audience check in `GoogleIdTokenVerifier`), an Android OAuth client for `app.gocast.mobile`, and the SHA-1 of whichever key signed the build. The EAS-signed release build has a different SHA-1 from the debug keystore; each must be registered or the sheet fails.
15. **Unused dependencies**: `expo-device`, `expo-glass-effect`, `expo-symbols`, `expo-linking`, `expo-system-ui`, `expo-dev-client` (only pulled in by the `development` profile's `developmentClient: true`), `expo-font` (only the font packages use it), `react-native-web`/`react-dom` (the `web` script and `web.output` exist but the app uses Android-only modules, so a web build is not a supported target), `@expo-google-fonts/jetbrains-mono` and `onest`. No `src` or `modules` file imports them. Deleting one should be checked against the native build.
16. **`Switch` in `ui.tsx` has no press handler**; it is a display of state only.
17. **`kv.ts` errors are silent by design**; a full disk means the studio queue and mic prefs quietly don't persist.
18. **React Compiler is on** (`experiments.reactCompiler`, `babel-plugin-react-compiler` present in `node_modules`, not listed in `package.json` directly). It caches values read in render that come from non-React objects; anything that reads a mutable engine directly must go through the hooks provided (`useEngineValue`, see [mobile-studio-and-encoder.md](mobile-studio-and-encoder.md)).
19. **The `summary` screen trusts its route params** and shows zeros if opened without them; a non-numeric param renders `NaN:NaN:NaN` for the clock (`formatClock` `Math.max(0, floor(NaN))` stays NaN) and, for `lost`, "NaN s" in green (`NaN > 0` is false).
20. **`Account` "Ends" date** uses the phone's locale and timezone while the API's `expires_at` is a server instant.
21. **`README.md` in `mobile/` is the stock `create-expo-app` file** and says nothing about this app. `mobile/CLAUDE.md` and `AGENTS.md` are instructions for coding agents.

## Tests

None for the mobile app. API-side tests for the endpoints (`AuthController::login` with `device_name`, `GoogleAuthController::native`) live in `api/tests/Feature`; not reviewed for this doc.

## History

- Mobile app built and committed 2026-09-28 (`92af763` API token login and native Google, `ed2e6a9` `mobile/`), handoff in `docs/MOBILE-APP-HANDOFF.md`.
- The "GoCast Studio" redesign that added Welcome, Home, `LiveStrip`, `Waveform`, the animated splash and the Summary screen, and removed `stations.tsx`, `AppHeader.tsx` and the old studio components, is uncommitted as of 2026-09-29.
