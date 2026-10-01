---
feature: API reference (HTTP routes, middleware, scheduled commands)
verified: 2026-10-01 against f6a201c plus uncommitted work (dashboard design-system rollout R1–R6.3)
sources:
  - api/routes/api.php
  - api/routes/admin.php
  - api/routes/web.php
  - api/routes/channels.php
  - api/routes/console.php
  - api/bootstrap/app.php
  - api/config/cors.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Http/Middleware/EnsureEmailIsVerified.php
  - api/app/Http/Middleware/UseAuthTokenCookie.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/app/Http/Controllers/AccountController.php
  - api/app/Http/Controllers/AudienceController.php
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Controllers/AutodjSlotController.php
  - api/app/Http/Controllers/BroadcastTokenController.php
  - api/app/Http/Controllers/EmailVerificationController.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Controllers/InviteController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Http/Controllers/ListenerSessionController.php
  - api/app/Http/Controllers/MetricsController.php
  - api/app/Http/Controllers/NextTrackController.php
  - api/app/Http/Controllers/NotificationController.php
  - api/app/Http/Controllers/NowPlayingController.php
  - api/app/Http/Controllers/PasswordResetController.php
  - api/app/Http/Controllers/PlaylistController.php
  - api/app/Http/Controllers/PlaylistTrackController.php
  - api/app/Http/Controllers/PublicEmbedController.php
  - api/app/Http/Controllers/PublicStationController.php
  - api/app/Http/Controllers/ResendWebhookController.php
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Controllers/StationNotifyController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/StationScheduleController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/StreamKeyController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/TrackController.php
  - api/app/Http/Controllers/UnsubscribeController.php
  - api/app/Http/Controllers/UploadController.php
  - api/app/Http/Controllers/WaitlistController.php
  - api/app/Http/Controllers/Admin/AccessRequestController.php
  - api/app/Http/Controllers/Admin/AccountController.php
  - api/app/Http/Controllers/Admin/AnnouncementController.php
  - api/app/Http/Controllers/Admin/AuthenticatedSessionController.php
  - api/app/Http/Controllers/Admin/InviteController.php
  - api/app/Http/Controllers/Admin/RawEmailController.php
  - api/app/Http/Controllers/Admin/StationController.php
  - api/app/Http/Controllers/Admin/WatermarkClipController.php
  - api/app/Http/Requests/DestroyTracksRequest.php
  - api/app/Http/Requests/ForgotPasswordRequest.php
  - api/app/Http/Requests/LoginRequest.php
  - api/app/Http/Requests/PlaylistTracksRequest.php
  - api/app/Http/Requests/RegisterRequest.php
  - api/app/Http/Requests/ReorderPlaylistTracksRequest.php
  - api/app/Http/Requests/ReorderTracksRequest.php
  - api/app/Http/Requests/ReplaceAutodjSlotsRequest.php
  - api/app/Http/Requests/ReplaceStationSchedulesRequest.php
  - api/app/Http/Requests/ResetPasswordRequest.php
  - api/app/Http/Requests/StorePlaylistRequest.php
  - api/app/Http/Requests/StoreProAccessRequest.php
  - api/app/Http/Requests/StoreStationRequest.php
  - api/app/Http/Requests/StoreTrackRequest.php
  - api/app/Http/Requests/StoreWaitlistRequest.php
  - api/app/Http/Requests/UpdatePasswordRequest.php
  - api/app/Http/Requests/UpdatePlaylistRequest.php
  - api/app/Http/Requests/UpdateProfileRequest.php
  - api/app/Http/Requests/UpdateStationRequest.php
  - api/app/Http/Requests/UpdateTrackRequest.php
  - api/app/Http/Requests/UploadRequest.php
  - api/app/Http/Requests/Admin/LoginRequest.php
  - api/app/Http/Requests/Admin/SendRawEmailRequest.php
  - api/app/Http/Requests/Admin/StoreAccountRequest.php
  - api/app/Http/Requests/Admin/StoreAnnouncementRequest.php
  - api/app/Http/Requests/Admin/StoreInviteRequest.php
  - api/app/Http/Requests/Admin/StoreWatermarkClipRequest.php
  - api/app/Http/Resources/AutodjSlotResource.php
  - api/app/Http/Resources/NotificationResource.php
  - api/app/Http/Resources/PlaylistResource.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Resources/StationScheduleResource.php
  - api/app/Http/Resources/TrackResource.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Policies/PlaylistPolicy.php
  - api/app/Policies/StationPolicy.php
  - api/app/Policies/TrackPolicy.php
  - api/app/Services/InviteException.php
  - api/app/Services/InviteRedemption.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/BroadcastTokenService.php
  - api/app/Services/StationStatusService.php
  - api/app/Services/TrackImporter.php
  - api/app/Services/PlaylistTracks.php
  - api/app/Services/AudienceReport.php
  - api/app/Events/StationStateChanged.php
  - api/app/Observers/StationObserver.php
  - api/app/Observers/UserObserver.php
  - api/app/Jobs/HandleResendWebhook.php
  - api/app/Webhooks/Resend/EmailReceived.php
  - api/app/Console/Commands/AdminCreateCommand.php
  - api/app/Console/Commands/AdminResetPasswordCommand.php
  - api/app/Console/Commands/AnalyzeTracksCommand.php
  - api/app/Console/Commands/E2EAuthCommand.php
  - api/app/Console/Commands/ExpirePlans.php
  - api/app/Console/Commands/NudgeInactiveBroadcasters.php
  - api/app/Console/Commands/PruneDeletedStations.php
  - api/app/Console/Commands/PruneListenerSessions.php
  - api/app/Console/Commands/PruneNotifications.php
  - api/app/Console/Commands/PruneStationEvents.php
  - api/app/Console/Commands/ReconcileStations.php
  - api/app/Console/Commands/RelaunchStations.php
  - api/app/Console/Commands/RollupListenerStats.php
  - api/app/Console/Commands/SendAnnouncement.php
  - api/app/Console/Commands/SweepListenerSessions.php
  - api/app/Console/Commands/SweepStations.php
  - api/app/Console/Commands/SyncListenerCounts.php
  - api/config/analytics.php
  - api/config/liquidsoap.php
  - api/config/notifications.php
  - api/config/station_events.php
  - api/config/sanctum.php
  - api/config/services.php
  - api/app/Models/StationEvent.php
  - api/app/Models/Station.php
  - api/app/Models/User.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Services/AutoDjScheduler.php
  - api/app/Services/ListenerAnalytics.php
  - api/app/Services/AutoDjProgramme.php
  - api/app/Http/Controllers/UplinkProbeController.php
  - api/app/Http/Controllers/UplinkCheckController.php
  - api/app/Http/Controllers/StudioDropController.php
  - api/app/Services/BroadcastOrigin.php
fingerprint: 424f56a0efde5fa7
---

# API reference

Every HTTP route the Laravel app in `api/` exposes, what guards it, what it accepts and returns, and what it does to the rest of the system. Also the scheduled and manual artisan commands. Cross-checked against `php artisan route:list` (111 routes including vendor ones) on 2026-09-29.

**The one thing people get wrong:** there is no global throttle on authenticated routes. The comment above the `auth:sanctum` group in `api/routes/api.php` says "Laravel's global limiter applies", but `api/bootstrap/app.php` never calls `throttleApi()`, so an authenticated route is rate-limited only when it names a limiter itself (see the tables). The second most common mistake is thinking one auth mechanism covers everything: there are four (Sanctum bearer or cookie for customers, the `admin` session guard for the panel, the `X-Internal-Key` header for containers, and Svix signatures / Laravel signed URLs for webhooks and unsubscribe).

## How requests are wired (`api/bootstrap/app.php`)

- **Route files.** `web.php` (web group), `api.php` (auto-prefixed `/api`, api group), `console.php`, health at `/up`. `routes/admin.php` is registered in the `then:` closure with the `web` middleware group, prefix `admin`, name prefix `admin.`. Broadcasting is registered with `withBroadcasting(channels.php, ['middleware' => ['api', 'auth:sanctum']])`, so `/broadcasting/auth` (GET|POST|HEAD) is on the `api` stack, not `web`; this is what lets the `token` cookie authenticate channel subscriptions.
- **Proxies.** `trustProxies(at: '*', headers: X-Forwarded-For|Host|Port|Proto)`. `$request->ip()` is the client IP as forwarded by Caddy (and Cloudflare in front of it).
- **Middleware aliases.** `internal` = `VerifyInternalKey`; `verified` = `EnsureEmailIsVerified` (overrides Laravel's).
- **`UseAuthTokenCookie` is prepended to the `api` group only.** If no bearer header is present and the raw `Cookie` header contains one or more `token=` values, it sets `Authorization: Bearer <last value>` (duplicates are parsed from the raw header because `$request->cookie()` keeps the first, which is the stale one). When more than one `token` cookie arrived it also appends a `Set-Cookie: token=; Max-Age expired; Path=/` with no domain, which expires the legacy host-only cookie that pre-dated `SESSION_DOMAIN`.
- **CSRF.** `validateCsrfTokens(except: ['unsubscribe'])`. API routes have no CSRF; the admin panel and `unsubscribe` are on the `web` group (session + CSRF), `unsubscribe` is exempted because mailbox providers POST to it with no cookie.
- **Guest redirects.** `redirectGuestsTo`: `admin` and `admin/*` go to `route('admin.login')`, everything else returns null (so JSON callers get 401). `redirectUsersTo`: admin paths go to `admin.stations.index`, everything else to `/`.
- **CORS (`api/config/cors.php`).** Paths `api/*`, `sanctum/csrf-cookie`, `broadcasting/auth`; origins from `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173,http://localhost:3000`); all methods and headers; `supports_credentials: true`; `max_age: 0`.
- **Exception rendering.**
  - `StationLifecycleException` (public props `errorCode`, `status`): rendered only for `expectsJson()` requests as `{message, code}` with `status`; reported (Sentry) only when `status >= 500`.
  - `InviteException`: rendered as JSON regardless of `Accept`: `{message, code, errors: {invite_code: [message]}}`; reported only when `status >= 500`.
  - Everything else uses Laravel defaults: `ValidationException` is 422 `{message, errors}`, `AuthorizationException` is 403 `{message: "This action is unauthorized."}`, model-not-found is 404.
  - `Sentry\Laravel\Integration::handles` is wired in.

### Stable error codes

| `code` | Status | Thrown by |
|---|---|---|
| `email_unverified` | 403 | `verified` middleware (`EnsureEmailIsVerified::CODE`) |
| `station_limit_reached` | 422 | `StationLifecycleException::concurrencyLimit` (start with `max_running_stations` already on air; default limit 1 if plan missing) |
| `station_is_live` | 409 | `liveBroadcast()`: stop while a browser broadcast is open |
| `station_is_live_external` | 409 | same, when the open session is `source_type=external` and `force` is not set |
| `station_start_failed` | 503 | `LiquidsoapSupervisor::verifyStarted()`, called at the end of `up()`: waits `liquidsoap.start_verify_delay_ms` (750; 0 skips the check), and if the container is not `running` throws it, with the message "The station ran out of memory while starting." when Docker says OOM-killed, else the generic retry message. `desired_state` is already `running` by then, so the reconciler retries |
| `autodj_not_available` | 403 | `autoDjUnavailable()`: plan without `autodj_enabled` |
| `station_not_running` | 409 | `POST skip` on an off-air station (inline JSON) |
| `station_unreachable` | 503 | `POST skip` when the telnet command fails |
| `station_already_live` | 409 | `POST stations/{slug}/sessions` |
| `encoder_not_available` | 403 | `POST stream-key` for a plan without `encoder_enabled` |
| `invite_not_found` (404), `invite_used`, `invite_expired`, `invite_already_redeemed`, `invite_plan_already_held` (all 422) | | `InviteException` |

### Rate limiters (`AppServiceProvider::boot`)

| Name | Limit | Keyed by | Used on |
|---|---|---|---|
| `auth` | 10/min | IP | whole `/auth/*` prefix group (register, login, google x3, password x2) and `GET /invites/{code}` |
| `public` | 60/min | IP; **`Limit::none()`** when header `X-Render-Key` matches `RENDER_API_KEY` (`hash_equals`, and only if the key is non-empty) | the `/public/*` group (except listener beacons) |
| `internal` | 300/min | IP | the `internal` group; removed from `/internal/metrics` |
| `uploads` | 20/min | user id | `POST /upload/{type}`, `POST /stations/{slug}/tracks` |
| `listener-start` | 30/min | IP | `POST /public/stations/{slug}/listen` |
| `listener-beat` | 20/min | route param `token` (not IP, on purpose) | `beat` and `end` |
| `notification-poll` | 30/min | user id | `GET /notifications/unread-count` |

Inline limiters use Laravel's `throttle:max,minutes`. Beware `throttle:6,60` on `stream-key`: six per **sixty minutes**.

## Authentication surfaces

| Surface | Mechanism | Where |
|---|---|---|
| Customer (web) | HttpOnly cookie `token` (Sanctum plain-text token) turned into a bearer header by `UseAuthTokenCookie` | `api` group |
| Customer (mobile) | `Authorization: Bearer` from `login` with `device_name` or `google/native` | `api` group |
| Admin | session guard `admin` (provider `admins`), `guest:admin` / `auth:admin` | `admin.*` routes |
| Containers | header `X-Internal-Key` == `services.internal_api_key` (`INTERNAL_API_KEY`), `hash_equals`; throws `RuntimeException` (500) if unset; 401 `{message:"Unauthorized."}` on mismatch | `internal` group |
| Resend | Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`) against `services.resend.webhook_secret` | `POST /api/webhooks/resend` |
| Unsubscribe | Laravel `signed` URL middleware | `web.php` |
| Broadcast token | HMAC-signed `payload.signature` with `APP_KEY`, TTL `BroadcastTokenService::TTL_SECONDS = 60`, payload `{u: user id, s: slug, e: expiry}` | used as the harbor password, verified by `HarborAuthController` |

Token cookie: name `token`, lifetime `config('sanctum.expiration', 43200)` minutes (30 days), path `/`, domain `config('session.domain')`, secure iff request is secure, HttpOnly, SameSite `lax`. Login, register and Google callback set it; logout forgets it.

## Public and auth routes

Paths are relative to `/api`. All auth routes are inside `throttle:auth` (10/min/IP) in addition to whatever is listed.

| Method | Path | Extra middleware | Controller | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | | `AuthController@register` | see below |
| POST | `/auth/login` | | `AuthController@login` | see below |
| GET | `/auth/google` | | `GoogleAuthController@redirect` | 302 to Google |
| GET | `/auth/google/callback` | | `GoogleAuthController@callback` | HTML page |
| POST | `/auth/google/native` | | `GoogleAuthController@native` | mobile |
| POST | `/auth/password/forgot` | `throttle:3,1`, name `password.forgot` | `PasswordResetController@forgot` | always 200 |
| POST | `/auth/password/reset` | `throttle:10,1`, name `password.reset` | `PasswordResetController@reset` | |
| GET | `/invites/{code}` | `throttle:auth`, name `invites.show` | `InviteController@show` | public invite lookup |

### `POST /auth/register`
Validation (`RegisterRequest`): `name` required string max 255; `email` required email max 255 `unique:users`; `password` required string min 8 `confirmed` (needs `password_confirmation`); `invite_code` nullable string max 40. Inside one DB transaction: create user (password hashed), and if `invite_code` is present `InviteRedemption::redeem` (an `InviteException` rolls the insert back and renders as 422/404 on `invite_code`). After commit: sends the 6-digit verification email, mints a Sanctum token named `auth`, returns **201** `{data: UserResource (plan loaded), message}` and sets the cookie. `User::created` also fires an admin Telegram alert (`AppServiceProvider`).

### `POST /auth/login`
Validation (`LoginRequest`): `email` required email, `password` required, `device_name` nullable string max 255.
- Lockout: key `login:<lower(email)>|<ip>`, `MAX_LOGIN_ATTEMPTS = 5`, `LOCKOUT_SECONDS = 900`. Too many: `ValidationException` with `errors.email` = "Too many login attempts. Try again in N seconds.", status **429**. A failed `Auth::attempt` returns **401** `{message: "Invalid credentials."}` and hits the limiter; success clears it.
- Success token is named `device_name` or `auth`. If the email is unverified a fresh verification code is emailed.
- With `device_name` (mobile): body `{data: UserResource (plan loaded), token, message}` and **no cookie**. Without it (web): `{data: UserResource, message}` plus the cookie. Register returns the same resource shape (201).

### Google
- `redirect`: makes a 40-char random `state`, stores its sha256 in cookie `gocast_oauth_state` (10 min, HttpOnly, lax), and, if query `invite` matches `^[A-Za-z0-9-]{1,40}$`, stores it in cookie `gocast_oauth_invite`. Socialite `google` stateless.
- `callback`: verifies the state cookie (`hash_equals` of sha256) and fetches the Google user; any failure renders view `auth.google-callback` with payload `{type:'gocast-oauth', error:'google_auth_failed'}`. Success: link by `google_id`, else by email (sets `google_id`, keeps existing avatar), else create (password null); avatar URLs over 2048 bytes are dropped to null. Redeems the parked invite best effort (an `InviteException` becomes `{applied:false,message}` in the payload, the account stands). Marks email verified and fires `Verified` (which sends the welcome, or the Pro welcome when `invite_id` is set). Sets the cookie and renders the page, which `postMessage`s `{type, authenticated:true, invite?}` to `FRONTEND_URL`'s origin and closes the popup, or (no opener) redirects to `<origin>/auth/callback?authenticated=1`. Both flow cookies are forgotten.
- `native`: validation `id_token` required string max 8192, `device_name` required string max 255, `invite` nullable string max 40. `GoogleIdTokenVerifier::verify`; an `InvalidGoogleIdToken` is reported and returned as 422 `errors.id_token`. Same account linking as the callback. Returns 200 `{data: UserResource, token, invite}`.

### Password reset
- `forgot` (`ForgotPasswordRequest`: `email` required email max 255): lower-cases the email; if a user exists, upserts `PasswordResetCode` (6-digit `random_int(100000, 999999)`, hashed, `attempts=0`, expires in `CODE_TTL_MINUTES = 15`) and emails it. Always 200 `{message: "If that email is registered, we've sent a reset code."}`.
- `reset` (`ResetPasswordRequest`: `email`, `code` required string `digits:6`, `password` required min 8 `confirmed`): missing or expired record is 422 `errors.code` "Code expired. Request a new one."; `attempts >= MAX_ATTEMPTS (5)` is "Too many attempts. Request a new code."; wrong code increments attempts, "Invalid code.". Success: in a transaction sets the password, deletes **all** the user's Sanctum tokens, deletes the code; then emails `PasswordChangedNotification`. 200 `{message}`.

### `GET /invites/{code}`
No auth. 404 (`InviteException::notFound`) if unknown, else 200 `{data: {plan: {slug,name}, duration_days, redeemable, reason}}` where `reason` is `expired`, `used` or null.

## Authenticated, verification not required

Group `auth:sanctum`. Unverified accounts can reach these.

| Method | Path | Extra | Controller | Purpose |
|---|---|---|---|---|
| POST | `/logout` | | `AuthController@logout` | deletes the current access token, forgets cookie; `{message:"Logged out."}` |
| GET | `/user` | | `AuthController@user` | `{data: UserResource}` (plan eager-loaded) |
| POST | `/invites/redeem` | `throttle:10,1`, `invites.redeem` | `InviteController@redeem` | body `code` required string max 40; `InviteRedemption::redeem`; 200 `{data:{plan:{slug,name}, plan_expires_at}, message:"You're on <Plan>."}` |
| POST | `/email/resend` | `throttle:6,1`, `verification.send` | `EmailVerificationController@send` | already verified: `{data,message:"Email already verified."}`; else sends a code, `{data, message:"Verification email sent."}` |
| POST | `/email/verify` | `throttle:10,1`, `verification.verify` | `EmailVerificationController@verify` | body `code` required `digits:6`; errors as in password reset (expired, 5 attempts, invalid); on success marks verified, fires `Verified`, deletes the code; `{data: fresh user, message:"Email verified."}`. An already verified account gets 200 `Email already verified.` before any code check |
| GET | `/notifications` | | `NotificationController@index` | see below |
| GET | `/notifications/unread-count` | `throttle:notification-poll` | `@unreadCount` | `{data:{unread_count, capped_at}}` |
| POST | `/notifications/read-all` | | `@markAllRead` | `{data:{unread_count:0}}` |
| POST | `/notifications/{notification}/read` | | `@markRead` | one `NotificationResource` + `meta.unread_count` |
| DELETE | `/notifications/{notification}` | | `@destroy` | `{data:{unread_count}}` |
| PATCH | `/account/profile` | | `AccountController@updateProfile` | |
| PATCH | `/account/password` | | `AccountController@updatePassword` | |
| DELETE | `/account` | | `AccountController@destroy` | |
| POST | `/waitlist/pro` | `auth:sanctum` group (a second, separate group in the file) | `WaitlistController@storePro` | see Waitlist |

### Notifications
`index` validates `filter` (`all`|`unread`, nullable) and `category` (`station`|`account`|`plan`|`system`, nullable, matched with a `LIKE '%"category":"x"%'` on the JSON `data` column). Ordered `created_at desc, id desc`, cursor-paginated with `config('notifications.per_page', 20)` (`NOTIFICATION_PER_PAGE`), cursor param `cursor` is validated by shape (`_pointsToNextItems`, `created_at`, `id`) and silently reset to the first page if malformed. Response is `NotificationResource::collection` plus `meta.unread_count`. The `{notification}` segment is a plain string, always looked up through `$request->user()->notifications()->findOrFail()`, so another user's id is a 404. `unread_count` is **not** capped (`capped_at` is `config('notifications.unread_count_cap', 99)` for the client to render "99+"). Resource fields: `id, type, title, body, icon, level, category, action {mode,label,url,detail{heading,points}}|null, meta (object), read_at, created_at`. Defaults: title "Notification", icon `bell`, level `info`, category `system`, action label "Open".

### Account
- `updateProfile` (`UpdateProfileRequest`): `name` sometimes required string max 255; `email` sometimes required email max 255 unique (ignoring self); `current_password` required only when the email is changing, and validated with the `current_password` rule whenever it is sent (a Google-only account has a null password, so it has nothing to satisfy the rule with and cannot change its email here). On email change: sets `email_verified_at = null`, emails a new verification code and sends `EmailChangedNotification` to the **old** address. Response 200 `{data: fresh raw User, message}`.
- `updatePassword` (`UpdatePasswordRequest`): `current_password` required (and correct) only if the account has a password (Google-only accounts skip it); `password` required min 8 `confirmed` and `different:current_password`. Deletes all tokens except the current one, emails `PasswordChangedNotification`. 200 `{message:"Password updated."}`.
- `destroy`: `confirmation` required string; must equal the account email (trimmed, case-insensitive) else 422 `errors.confirmation`. Deletes all tokens, rewrites the row to `deleted-<id>-<uuid>@deleted.gocast.local` with `google_id`/`avatar_url`/`email_verified_at` cleared, then soft-deletes the user. `UserObserver::deleting` soft-deletes each station (which takes containers down via `StationObserver::deleting`). 200 `{message:"Account deleted."}`.

## Authenticated and verified: stations

All below sit inside `auth:sanctum` + `verified`. Unless stated, the owner check is `StationPolicy` (`view/update/delete` = `$user->id === $station->user_id`), failing with a 403 `{message:"This action is unauthorized."}`. `Station::getRouteKeyName()` is `slug`, so **every `{station}` segment is the slug**, including the `apiResource` routes.

| Method | Path | Extra | Controller |
|---|---|---|---|
| GET | `/stations` | | `StationController@index` |
| POST | `/stations` | | `@store` |
| GET | `/stations/{station}` | | `@show` |
| PUT/PATCH | `/stations/{station}` | | `@update` |
| DELETE | `/stations/{station}` | | `@destroy` |
| GET | `/stations/{station}/sessions` | | `StreamSessionController@index` |
| POST | `/stations/{station}/sessions` | | `@store` |
| DELETE | `/stations/{station}/sessions/{session}` | | `@destroy` |
| POST | `/stations/{slug}/start` | `throttle:20,1` | `StationPowerController@start` |
| POST | `/stations/{slug}/stop` | `throttle:20,1` | `@stop` |
| POST | `/stations/{slug}/skip` | `throttle:30,1` | `@skip` |
| GET | `/stations/{slug}/status` | `throttle:120,1` | `StationStatusController` |
| GET | `/stations/{slug}/audience` | `throttle:60,1` | `AudienceController` |
| POST | `/stations/{slug}/stream-key` | `throttle:6,60` | `StreamKeyController@rotate` |
| PUT | `/stations/{slug}/schedules` | | `StationScheduleController@replace` |
| PUT | `/stations/{slug}/autodj-slots` | | `AutodjSlotController@replace` |
| POST | `/auth/broadcast-token` | `throttle:30,1` | `BroadcastTokenController` |
| POST | `/broadcast/uplink-probe` | `throttle:20,1` | `UplinkProbeController` |
| POST | `/stations/{slug}/uplink-checks` | `throttle:20,1` | `UplinkCheckController` |
| POST | `/stations/{slug}/studio-drops` | `throttle:30,1` | `StudioDropController` |
| POST | `/upload/{type}` | `throttle:uploads`, `type` in `images|sounds` | `UploadController` |

(In the file the non-resource routes are written `{station:slug}`; the effect is identical to the resource routes because the model already keys on slug.)

### `StationResource` (returned by most station routes)
Fields: `id, user_id, name, slug, description, genre, timezone, artwork_url, featured, indexable (only when the `has_broadcast_history` attribute was selected, i.e. via `withIndexability()`), is_live, is_on_air, desired_state, started_at, state, now_playing {title,artist}|null, icecast_mount, hls_url, watermarked (owner only), encoder (only after `->withEncoder()`, owner, plan `encoder_enabled`, and `LIQUIDSOAP_ENCODER_HOST` set: {host, port, mount:"/<slug>", username:"source", password: stream key or null, rotated_at}), jingles_enabled, jingle_mode, jingle_interval_seconds, jingle_every_tracks, social_links, theme_config, created_at, updated_at`, plus relation-gated `schedules`, `autodj_slots`, `programme {playlist{id,name}|null, slot_id, until, next{slot_id,label,playlist{id,name},starts_at}|null}` (present when `autodjSlots` is loaded), `stats {sessions, total_airtime_seconds, peak_listeners, has_listeners}` (present when `streamSessions` is loaded).
- `is_on_air` = `desired_state === 'running'`; `is_live` = on air AND an open `stream_sessions` row; `state` is `offline` / `live` / `on_air` from those two only (it does **not** consult the container; `/status` does). `now_playing` comes from Redis `metadata:{id}` and is null when the station is off air.
- Collections preload live flags and metadata with one `Redis::mget` and one query (`preloadFor`), stashed on the request attributes.
- `hls_url` = `LIQUIDSOAP_HLS_BASE_URL/<slug>/<LIQUIDSOAP_HLS_VARIANT>.m3u8`, null when the base URL is empty.

### `GET /stations`, `POST /stations`, `GET|PUT|DELETE /stations/{station}`
- `index`: `StationResource::collection($user->stations)`, unpaginated.
- `store` (`StoreStationRequest`): `authorize()` is `stations()->count() < plan->max_stations`, else a plain 403. Rules: `name` required string max 100; `description` nullable string; `genre` nullable string max 255; `artwork_url` nullable `url:http,https` max 2048. Creating fires `Station` creating hooks (slug from name via `generateUniqueSlug`, `icecast_mount = /stream/<slug>`, random icecast password and stream key, `desired_state = stopped`, jingle defaults, container index via `StationObserver::creating`) (`Station::booted`: slug limited to 55 chars before the `-2`, `-3` suffix; `StationObserver::creating` only assigns `container_index` = max including trashed + 1) and a `created` hook that creates the default playlist. Also an admin Telegram alert. 201 `StationResource`.
- `show`: `authorize view`; loads `streamSessions, schedules, autodjSlots.playlist, defaultPlaylist`; `->withEncoder()`.
- `update` (`UpdateStationRequest`, `authorize` always true, policy check in the controller): `name` sometimes string max 100; `description`, `genre` (max 255), `timezone` (`timezone:all`), `artwork_url` nullable; `social_links` nullable array max `Station::MAX_SOCIAL_LINKS` (8), each `array:label,url` with `url` required `url:http,https` max 2048 and `label` nullable max 30; `theme_config` nullable array; `jingles_enabled` sometimes boolean; `jingle_mode` in `Station::JINGLE_MODES`; `jingle_interval_seconds` integer 60..14400; `jingle_every_tracks` integer 1..100. An `after` hook refuses `timezone: null` while the station has show times or AutoDJ slots (two separate messages). Turning `jingles_enabled` from false to true requires AutoDJ on the plan (`assertAutoDjEnabled`, 403 `autodj_not_available`). **Slug is not updatable here.** Side effects come from `StationObserver::updated`: jingle columns changed on a running station push settings to the container; `name, slug, description, genre, icecast_mount, icecast_password, artwork_url` changes re-`up()` a running station (slug changes also `downBySlug` the old container and rename the playlist directory); `timezone` is not in that list, so it never restarts a station. Every observer supervisor call is wrapped in `safely()`: a Docker failure is logged and swallowed, never returned to the caller (including on `destroy`).
- `destroy`: soft-deletes; `StationObserver::deleting` brings the container down. 200 `{message:"Station deleted."}`. Permanent erase is `stations:prune-deleted`.

### Power, skip, status
- `start`: authorize update; `StationLifecycleService::start` under a cache lock `station-lifecycle:{id}` (TTL 30 s, wait up to 8 s). If `desired_state` is already `running` and the container is running, it returns immediately: no `up()`, no event, no `started_at` change (a double click must not drop listeners). Otherwise, if the station was not `running`, it checks `max_running_stations` (`concurrencyLimit`, 422; other running stations of the owner are counted), sets `desired_state=running` and `started_at=now()`. A station already marked `running` whose container is gone skips that check and just re-`up()`s. Then it writes playlist files, `supervisor->up()`, records a `started` `StationEvent` and fires `StationStateChanged`. Clears the status cache. **202** `StationResource`. No plan gate on starting a station itself.
- `stop`: optional body `force` (boolean, read as `cutExternal`). If a broadcast is open and it is not an external session being cut, throws `station_is_live` / `station_is_live_external` (409). Otherwise sets `desired_state=stopped`, `started_at=null`, closes every open stream session, brings the container down, deletes `metadata:{id}`, records `stopped`, fires the event. 200 `StationResource`.
- `skip`: 409 `station_not_running` if off air; sends `<LIQ_SOURCE>.skip` over telnet to the container; 503 `station_unreachable` on any failure; 200 `{message:"Skipped."}`.
- `status`: authorize `view`; `StationStatusService::fetch` (returns null without any pull when `desired_state` is not `running`; cache `station-status:{id}`, TTL `liquidsoap.status_ttl_seconds` default 2 s, `status_down_ttl_seconds` default 15 s when Docker confirmed the container is not running). A pull first asks Docker whether the container is `running` (a Docker outage counts as "up"), and only then does an HTTP GET to the container's harbor `/status` with `X-Internal-Key`, timeout `harbor_timeout` 1.5 s. `state` is `offline` when not running; with no harbor answer it is `starting` if Docker says the container is up, else `offline`; `starting` also when harbor says not `ready`; `degraded` when ready but `icecast` is false; else `live` if `source == 'live'`, otherwise `on_air`. Response `{data: {slug, state (offline|starting|on_air|live|degraded), desired_state, started_at, reachable, ready, icecast_connected, last_ready_at, source, broadcaster, live_source {type,client}|null, now_playing, elapsed, remaining, playlist_length, up_next[]}}`. `up_next` is at most 5 `{id,title,artist}`: for shuffle playlists the head of the saved `deck`, for sequential ones the tracks after the one whose title and artist match the current status (or from the start if none match). The playlist is `AutoDjProgramme::resolve($station)['playlist']`.
- `audience`: authorize `view`. Plan `analytics_days <= 0` returns 200 `{data:{locked:true, plan_days:0, range_days:0, live, peak_all_time}}`. Otherwise `days` query (7, 30 or 90 only; anything else uses the plan's value) is capped at the plan's `analytics_days`, and both are clamped to `analytics.retention_days` (90). Body `{data:{locked:false, plan_days, range_days, live, peak_all_time, totals{listener_minutes, peak, sessions, listeners, avg_listen_seconds, finished_listens, qualified_listens}, daily[], countries, devices, browsers, referrers}}`. Detail belongs to [Listener analytics](listener-analytics.md).

### Stream key and broadcast token
- `stream-key`: authorize update; 403 `encoder_not_available` unless plan `encoder_enabled`; `rotateStreamKey()`; records `stream_key_rotated` (source `owner`). 200 `{data: StationResource with encoder card, message}`. No request body.
- `broadcast-token`: also caches the caller's IP and country for the station (`BroadcastOrigin::remember`, 6 h), which harbor's `live_connected` attaches to the session it opens (`stream_sessions.ip_address`, `country`). Body `station_slug` required string max 255. 403 `{message:"You do not own this station."}` for a missing or foreign station (same message for both); 200 `{token, expires_in: 60, ingest_url}`. `ingest_url` from `LiquidsoapSupervisor::ingestUrl`. Not plan gated (browser studio works on Free). Verification at harbor (`BroadcastTokenService::verify`) checks only signature, station slug and expiry; it does not re-check that the user still owns the station.

### Go-live connection check and studio drop reports
- `uplink-probe`: any authenticated, verified user; the raw request body is read and its length returned, `{bytes}`; 413 over 256 KB. Nothing is stored. The web studio times an empty and a 96 KB post to estimate upload speed ([Web studio](broadcasting-web-studio.md)).
- `uplink-checks`: authorize update; body `outcome` required `ok|lowered|blocked|failed`, `kbps`, `bitrate` (0..320), `net_type` (max 16), `net_effective` (max 8), `net_downlink`, `net_rtt`, all nullable. Records an `uplink_check` station event (source `owner`). 200 `{recorded: true}`.
- `studio-drops`: authorize update; body `drops` array 1..20, each with `id` (required, max 40, `[A-Za-z0-9_-]`), `outcome` (`reconnected|gave_up|stopped|page_closed|unknown`), `dropped_at` (date) and optional page/network/socket facts (`down_ms`, `attempts`, `last_error`, `close_code`, `close_reason`, `was_clean`, `visibility`, `hidden_for_ms`, `frozen`, `online`, `net_*`, `buffered_bytes`, `wake_lock`, `bitrate`, `uplink_kbps`, …). Each id is recorded once (`Cache::add` dedupe) as a `studio_drop` event (source `owner`). 200 `{recorded: n}`. Admin monitoring only.

### Sessions (`stations.sessions`)
Only `index` has a caller: the dashboard overview, Your shows (`/dashboard/broadcasts`, with `?finished=1` and paging) and the mobile station home read it. Nothing in `client/` or `mobile/` calls `POST` or `DELETE` on this resource; the web studio and encoders get their session row from harbor's `live_connected` event (`POST /internal/station-event`). `store` is written for a future desktop client (`source_type` `electron`) and is exercised only by tests.
- `index`: authorize view; `streamSessions()->latest('started_at')->paginate(20)`, filtered to `ended_at IS NOT NULL` with `?finished=1`. Laravel paginator JSON (not a Resource) plus `summary: {shows, live_seconds}` computed over **every** finished session (`COUNT(*)`, `SUM(GREATEST(TIMESTAMPDIFF(SECOND, started_at, ended_at), 0))`), not just the page.
- `store`: authorize update; body `device_id` required string max 128, `source_type` sometimes `browser|electron`. Logic in order: (1) if `BroadcastStateService` has an active broadcast from a **different** device: 409 `station_already_live`; same device with a live row: 200 `{data: session, message:"Stream session already active."}`; same device with no row: forget stale state. (2) An open `external` session blocks with 409 `station_already_live` (message names the encoder client), except a "ghost" encoder session on a station that is not running, which is ignored. (3) Closes every other open session, creates a session (`source_type` default `browser`), `markStarting`, and unless the station was already live dispatches `SendStationLiveNotifications` delayed 2 minutes. 201 `{data: session, message:"Stream started."}`.
- `destroy`: authorize update on the **station**; forgets broadcast state, sets `ended_at=now()` on the bound session, deletes `metadata:{id}`. 200 `{data: session, message:"Stream ended."}`. The `{session}` model is not checked against the station (see Gaps).

### Show times and AutoDJ slots
Both are full-list `PUT` replacements, body shapes and rules are documented in detail in [Schedule](schedule.md); summarised:
- `PUT /stations/{slug}/schedules` (`ReplaceStationSchedulesRequest`): `timezone` nullable `timezone:all`; `schedules` present array max 20; each `label` nullable max 60, `days` required array 1..7 of integers 0..6, `start_time` `H:i`. Controller: non-empty rows with no timezone is 422; clearing the timezone while AutoDJ slots exist is 422. In a transaction: saves the timezone if changed, deletes all rows, recreates them with `position` = array index and `days` de-duplicated and sorted. Returns `StationResource` with `schedules`.
- `PUT /stations/{slug}/autodj-slots` (`ReplaceAutodjSlotsRequest`): `timezone` nullable; `slots` present array max 50; each `label` nullable max 60, `playlist_id` required ulid that exists on this station, `days` 1..7 of 0..6, `start_time`, `end_time` `H:i`. After-hook (only if no field errors): refuses clearing the timezone while show times exist; refuses non-empty slots without a timezone; rejects overlaps across the week (windows may touch; an end at or before the start wraps past midnight; week wrap is handled) with an error on `slots.N.start_time`. Returns `StationResource` with `autodj_slots` and `programme`.
- Neither route checks the plan. AutoDJ slots are stored for any plan and only obeyed at playback for plans with `autodj_enabled` (`AutoDjScheduler::next`).

### Upload
`POST /upload/{type}` (`UploadRequest`): `file` required file; `images`: mimes `jpg,jpeg,png,webp,gif` max 5120 KB; `sounds`: mimes `mp3,wav,ogg,flac,aac` max 51200 KB. Stored on the `public` disk under `uploads/{type}`. 201 `{data:{url: asset("storage/<path>")}}`. Not tied to a station, no plan gate, nothing cleans up unreferenced files. The route only accepts `type` `images` or `sounds`. The only caller in `client/` and `mobile/` is `StationFormDialog.tsx` posting to `/upload/images`; nothing uploads `sounds`.

## Authenticated and verified: library and playlists

Owner checks are `TrackPolicy` and `PlaylistPolicy` (owner of the track's or playlist's station). `{track}` and `{playlist}` are ULIDs (`HasUlids`).

| Method | Path | Extra | Controller |
|---|---|---|---|
| GET | `/stations/{slug}/tracks` | | `TrackController@index` |
| POST | `/stations/{slug}/tracks` | `throttle:uploads` | `@store` |
| PATCH | `/stations/{slug}/tracks/reorder` | | `@reorder` |
| DELETE | `/stations/{slug}/tracks` | | `@destroyMany` |
| PATCH | `/tracks/{track}` | | `@update` |
| DELETE | `/tracks/{track}` | | `@destroy` |
| GET | `/tracks/{track}/audio` | | `@audio` |
| GET | `/stations/{slug}/playlists` | | `PlaylistController@index` |
| POST | `/stations/{slug}/playlists` | | `@store` |
| PATCH | `/playlists/{playlist}` | | `@update` |
| DELETE | `/playlists/{playlist}` | | `@destroy` |
| GET | `/playlists/{playlist}/tracks` | | `PlaylistTrackController@index` |
| PUT | `/playlists/{playlist}/tracks` | | `@replace` |
| POST | `/playlists/{playlist}/tracks` | | `@store` |
| PATCH | `/playlists/{playlist}/tracks/reorder` | | `@reorder` |
| DELETE | `/playlists/{playlist}/tracks/{track}` | | `@destroy` |

`TrackResource`: `id, station_id, kind, title, artist, duration_seconds, file_size_bytes, position (playlist position when the pivot is loaded, else the library position), playlist_ids (when `playlists` loaded), original_filename, created_at`. `PlaylistResource`: `id, station_id, name, is_default, order, position, track_count, duration_seconds (float sum), created_at, updated_at`.

### Tracks
- `index`: `kind` (`music|jingle`, default `music`). Response `{data: TrackResource[], meta:{kind, storage_used_bytes, storage_cap_bytes}}`; cap is `LIQUIDSOAP_STATION_STORAGE_BYTES` (default 3 GiB) and usage is the sum over **all** kinds.
- `store` (`StoreTrackRequest`, multipart): `kind` sometimes `music|jingle`; `playlist_id` sometimes nullable ulid existing on this station; `files` required array 1..30; each file required, `max:307200` KB (300 MB), mimes `mp3,m4a,aac,flac,ogg,wav,mpga`; `names` sometimes array, each `names.*` nullable string max 255. A non-blank `names[N]` (`StoreTrackRequest::nameFor`) replaces the part filename of `files[N]` for the stored `original_filename` and the title fallback only; the extension still comes from the file. The mobile library screen sends it because Expo's fetch percent-encodes part filenames; browsers never do. **Plan gate:** `assertAutoDjEnabled` first, so a Free plan gets 403 `autodj_not_available` for any upload including jingles. Files are imported one at a time by `TrackImporter::import` and the loop stops at the first `RuntimeException` (quota exceeded or size unreadable). Status: 201 all imported, 422 none imported, 207 partial. Body `{data: TrackResource[], errors: [{index, message}]}`. Import: row-locks the station, enforces quota inside the lock, moves the file to the station directory, reads tags (getID3), derives `Artist - Title` from the filename if tags are missing (the stem is cut with `Str::afterLast`/`beforeLast`, not `pathinfo`, which can drop leading multibyte characters), appends to the library `position`, attaches music to the target playlist or the default playlist (`PlaylistTracks::attach`), rewrites and reloads the playlist files, queues `AnalyzeTrack` (unless `liquidsoap.analysis_enabled` is false) and records `track_uploaded`.
- `reorder` (`ReorderTracksRequest`): `kind` (invalid values fall back to `music`), `ids` required array min 1 of ulids existing on this station with that kind. Ids not listed keep their relative order after the listed ones. Returns the whole kind's `TrackResource` collection (no `data` wrapper beyond Laravel's default `data`).
- `update` (`UpdateTrackRequest`): `title` sometimes string max 200; `artist` sometimes nullable string max 200. Rewrites and reloads the playlist files. 200 `{data: TrackResource}`.
- `audio`: authorize `view` on the track (owner); streams the file inline (`BinaryFileResponse`, range requests supported, `Cache-Control: private, max-age=3600`); 404 "The audio file is missing on disk." The library's row preview plays it.
- `destroy`: deletes the file, detaches from every playlist, deletes the row, closes the gap in `position`, rewrites and reloads playlist files, records `track_deleted`. **204**.
- `destroyMany` (`DestroyTracksRequest`): `track_ids` required array 1..2000, each ulid distinct and existing on this station. One transaction, one playlist rewrite. Ids may be of any kind (jingles too). 200 in the `index` shape with the `music` kind only, plus `meta.deleted` (count). Authorization is the `deleteAny` policy method.

### Playlists
- `index`: `viewAny`; `{data: PlaylistResource[]}` with `withCount('tracks')` and `withSum('tracks','duration_seconds')`.
- `store` (`StorePlaylistRequest`): `name` required string max 60, unique per station; `order` sometimes in `Playlist::ORDERS` (`sequential`, `shuffle`). `position` = max+1. 201. No plan gate.
- `update` (`UpdatePlaylistRequest`): `name` (same uniqueness, ignoring self), `order`, `is_default` sometimes `accepted` (only `true`-ish is valid; there is no way to unset it directly). Making one default clears the flag on the others in a transaction.
- `destroy`: 409 `{message:"The default playlist cannot be deleted..."}` when `is_default`; otherwise deletes (the FK cascades AutoDJ slots that use it, per `create_autodj_slots_table`). 204.
- Membership: `PlaylistTracksRequest` (`track_ids` **present** array max 2000; each ulid distinct, exists, same station, `kind=music`). `replace` sets the exact ordered list; `store` appends only ids not already members; both return the members collection. `reorder` (`ReorderPlaylistTracksRequest`: `ids` array min 1, each ulid distinct and already in the playlist) puts listed ids first then the rest. `destroy` 404s if the track is not in the playlist, else 204. All use `PlaylistTracks`, which locks the playlist row, and, for `attach`/`replace`, tells `AutoDjScheduler::dealIn` about new tracks (shuffle deck). These membership routes do not rewrite or reload playlist files (AutoDJ pulls the next track over HTTP instead).

## Public routes (no auth)

Group `throttle:public` (60/min/IP, exempt with `X-Render-Key`). Paths under `/api`.

| Method | Path | Controller | Response |
|---|---|---|---|
| GET | `/public/featured` | `PublicStationController@featured` | `StationResource` collection: `featured()->running()`, ordered by open session first, `featured_at` desc, name; limited to `Station::FEATURED_RAIL_SIZE` |
| GET | `/public/stations` | `@index` | paginated (24): optional `q` (LIKE on name or description), `genre` (exact), `sort` (`new` = created desc, otherwise running first, then live, then name) |
| GET | `/public/genres` | `@genres` | `{data: string[]}` distinct non-empty genres |
| GET | `/public/sitemap/stations` | `@sitemap` | `{data:[{slug, updated_at}]}` for `indexable()` stations, up to 50,000, by slug |
| GET | `/public/stations/{slug}` | `@show` | `StationResource` with `schedules` and indexability; 404 if missing |
| GET | `/public/stations/{slug}/listeners` | `ListenerCountController@show` | `{data:{count, state, is_live, is_on_air, now_playing{title,artist}}}`; count from `ListenerAnalytics::liveCount`; now playing prefers the container status, falls back to Redis metadata |
| GET | `/public/stations/{slug}/embed` | `PublicEmbedController@show` | `StationResource`; **404 unless the owner's plan has `embed_enabled`** |
| POST | `/public/stations/{slug}/notify` (extra `throttle:5,60`) | `StationNotifyController@store` | body `email` (trimmed, lower-cased, required email max 255); upserts `StationNotifySubscription` and resets `notified_at` to null; 200 `{message:"We'll email you when <name> goes live."}`; 404 for unknown slug |

Listener analytics beacons (prefix `/public`, **not** in the `public` bucket): 

| Method | Path | Limiter | Behaviour |
|---|---|---|---|
| POST | `/public/stations/{slug}/listen` | `listener-start` | optional `transport` in `hls|icecast`; creates a `ListenerSession` whose id is a 22-char random token and registers it in Redis; **201** `{data:{token, beat_every}}` (`beat_every` = `ANALYTICS_BEAT_INTERVAL`, default 15 s); 404 for unknown slug |
| POST | `/public/listen/{token}/beat` | `listener-beat` | 204; 404 `{message:"Unknown listener session."}` if the token is unknown or already swept. One Redis write, no DB write |
| POST | `/public/listen/{token}/end` | `listener-beat` | always 204 |

Note the public station payload reuses `StationResource`, so it exposes `user_id`, `icecast_mount` and `desired_state` to anonymous callers.

### Waitlist (public)
`POST /waitlist` (`throttle:3,60`, `StoreWaitlistRequest`): `email` required email max 255; `plan` required, must be in `PUBLIC_PLANS = ['custom']`; `social` required string max 255; `message` nullable string max 2000. `WaitlistEntry::updateOrCreate(email+plan)`; a previously `rejected` entry is reopened. 201 `{message:"Request received."}`. `POST /waitlist/pro` (authenticated, not verified-gated; `StoreProAccessRequest`: `social` required max 255, `message` nullable max 2000): same upsert with the account's email, `plan='pro'` and `user_id`. Both fire the admin Telegram `accessRequested` alert on created/updated.

## Internal container callbacks

Group `['internal', 'throttle:internal']` (`X-Internal-Key`; 300/min/IP).

| Method | Path | Controller | Purpose and behaviour |
|---|---|---|---|
| POST | `/internal/harbor-auth` | `HarborAuthController` | Called by each container per broadcaster connection. Body `slug` required max 255, `password` (max 2048), `user`, `address` nullable. **200 empty body = admit; 403 with the reason as the body = refuse** (the container fails closed on anything but 200). Order: empty password refused; unknown station refused; password verifies as a broadcast token for that slug, admit (`allowed('token')`); password equals the station's stream key (`hash_equals`), admit only if the owner's plan has `encoder_enabled`, else refuse with method `plan` (`allowed('key')` otherwise); anything else refused. DB errors refuse. Counts via `IngestMetrics`. |
| POST | `/internal/now-playing` | `NowPlayingController` | Body `slug` required `^[a-z0-9-]+$` max 255, `title`/`artist` nullable max 500 (trimmed, empty becomes null). 404 `{ok:false,error:"unknown station"}`. Both blank: deletes Redis `metadata:{id}`, returns `{ok:true,cleared:true}`; else `SETEX metadata:{id}` 6 hours with `{title, artist}`. Fires `StationStateChanged` `audio_started` / `audio_stopped` only when the key flips between absent and present. |
| GET | `/internal/next-track` | `NextTrackController` | Query `slug` required. 404 empty body for unknown station; `AutoDjScheduler::next`: **204 empty** when the owner's plan lacks AutoDJ, the programme has no playlist, or it has no track; else **200 text/plain** an annotated `annotate:...:<path>` URI. Detail in [AutoDJ](autodj.md). |
| POST | `/internal/station-event` | `StationEventController` | Body `slug` required max 64, `event` required max 32 and one of `boot, shutdown, icecast_connected, icecast_disconnected, icecast_error, live_connected, live_disconnected` (else 422 `{ok:false,error:"unknown event"}`, checked before the slug lookup; old containers still posting `live_silent` / `live_audio` get this 422), `client` nullable max 255, `via` nullable `browser|external`. Unknown slug 404 `{ok:false,error:"station not found"}`. Effects: caches `station-event:{id}` for 3600 s; records a `StationEvent` (source `container`); `icecast_connected` sets `last_ready_at`; `live_connected` opens a `stream_sessions` row if none is open (`source_type` = `via` or `browser`, plus `client`) and queues `SendStationLiveNotifications` after 2 minutes; `live_disconnected` closes all open sessions and deletes `metadata:{id}`; `shutdown`, `icecast_*`, `live_*` also fire `StationStateChanged`. Returns `{ok:true}`. |
| GET | `/internal/metrics` | `MetricsController` | Prometheus text, `Content-Type: text/plain; version=0.0.4`, no throttle. Gauges: `gocast_stations_total`, `_live`, `_trashed`, `_stopped`, `gocast_supervisor_containers_expected|running|total|unhealthy` (-1 when the docker daemon is unreachable), `gocast_stream_sessions_started_last_24h`, `_open`, `gocast_tracks_total`, `_bytes`, `gocast_users_total`, `gocast_queue_jobs_pending`, `gocast_queue_jobs_failed` (-1 on DB error), counter `gocast_harbor_auth_total{outcome,method}`, `gocast_redis_up`. |

## Webhooks and mail links

- `POST /api/webhooks/resend` (`throttle:120,1`, `ResendWebhookController`): 503 `{message:"Webhook not configured."}` when no secret; 401 `{message:"Invalid signature."}` when Svix verification fails; unknown `type` returns `{status:"ignored"}`. `HANDLERS` maps only `email.received` to `App\Webhooks\Resend\EmailReceived`. Dedupe with `Cache::add('resend-webhook:'.svix-id, 1 day)`, returning `{status:"duplicate"}`; otherwise dispatches `HandleResendWebhook` (3 tries, backoff 10 s then 60 s) and returns `{status:"queued"}`. If dispatch throws, the dedupe key is forgotten and it re-throws. `EmailReceived` fetches the message from the Resend API (`services.resend.key`, 15 s timeout) and posts an admin Telegram alert.
- `GET /unsubscribe` and `POST /unsubscribe` (`web.php`, `signed`, names `unsubscribe`, `unsubscribe.store`): `show` renders the confirm page (query `email`; `done` if already suppressed). `store` requires query `email` (400 if empty), optional `invite` code, records an `EmailSuppression`; a body field `List-Unsubscribe=One-Click` (RFC 8058) returns an empty 200, otherwise the confirmation page. CSRF-exempt.
- `GET /` renders the `welcome` view. `GET /up` is Laravel's health check. `GET /sanctum/csrf-cookie`, `/broadcasting/auth`, `storage/{path}` (GET/PUT, vendor local-disk route), and dev-only `POST /_boost/browser-logs` are vendor registrations.

## Realtime channel (`api/routes/channels.php`)
One private channel `user.{id}`, authorised when `(string) $user->id === $id`. `StationStateChanged` (`ShouldBroadcast`, after commit, queue `realtime`, broadcast name `station.state`) publishes `{slug, event, at}` to `private-user.<owner id>`. It is per-account, not per-station, to stay under Ably's 200-concurrent-channel free tier; consequence: an admin viewing someone's station gets no pushes. Event names emitted: `started`, `stopped`, `reconciled`, `audio_started`, `audio_stopped`, and the container events listed above. See [Realtime events](realtime-events.md).

## Admin panel routes (`routes/admin.php`)

Session guard `admin`, `web` middleware group (CSRF, sessions). Prefix `/admin`, route names `admin.*`. The only rate limiting is the login lockout. Every mutating action is a plain form `POST` (no method spoofing). Flash messages go in session key `status` (or `error`).

| Method | Path | Name | Controller@method | Behaviour |
|---|---|---|---|---|
| GET | `/admin/login` | `login` | `AuthenticatedSessionController@create` | `guest:admin` |
| POST | `/admin/login` | `login.store` | `@store` | `Admin\LoginRequest`: email, password, optional `remember`; lockout 5 attempts per `email|ip`, `Lockout` event; failure is a `ValidationException` on `email`; success regenerates the session and redirects intended or `admin.stations.index` |
| POST | `/admin/logout` | `logout` | `@destroy` | logs out, invalidates session, regenerates token |
| GET | `/admin` | `home` | redirect | to `/admin/stations` |
| GET | `/admin/stations` | `stations.index` | `Admin\StationController@index` | filters `search` (name, slug, owner email), `featured=1`, `state` (`running|live`); 25 per page; stats and upgrade-dialog data; Browser and IP columns from the latest broadcast (`last_broadcast_client`, `last_broadcast_ip_address`, `last_broadcast_country` subqueries; `UserAgentParser`) |
| GET | `/admin/stations/{station}` | `stations.show` | `@show` | `withTrashed()`, by slug; timeline with `type` and `source` filters, 50 per page, consecutive identical events collapsed; last-24h counts per type |
| POST | `/admin/stations/{station}/feature` | `stations.feature` | `@feature` | toggles `featured` via `markFeatured`, activity log `featured station`/`unfeatured station`; flash warns when the station is powered off |
| POST | `/admin/stations/{station}/upgrade/preview` | `stations.upgrade.preview` | `@previewUpgrade` | body `note` (1..2000 chars), `plan_id` (any non-free plan), `term` (`1-week|2-weeks|1-month|2-months|3-months|none`); renders the email and bell preview; writes nothing. Bad input (empty or over-long note, unknown plan or term, ownerless station) is not a validation error: it redirects to the stations index with a `status` flash |
| POST | `/admin/stations/{station}/upgrade` | `stations.upgrade` | `@upgrade` | same inputs; sets `plan_id` and `plan_expires_at` (null for `none`), sends `ProAccessGranted` with the note, activity log `upgraded account`; redirects to the stations index filtered to the slug |
| GET | `/admin/requests` | `requests.index` | `AccessRequestController@index` | `search`, `plan`, `status` (`pending` default, `approved`, `rejected`, `all`); 25 per page |
| POST | `/admin/requests/{entry}/approve` | `requests.approve` | `@approve` | `term` in `TERMS` (default `3-months`); refuses entries with no account or plan; under a row lock marks the entry approved, then sets `plan_id` + `plan_expires_at` and sends `ProAccessGranted` |
| POST | `/admin/requests/{entry}/dismiss` | `requests.dismiss` | `@dismiss` | marks rejected (refused if approved); nothing is emailed |
| POST | `/admin/requests/{entry}/revoke` | `requests.revoke` | `@revoke` | approved entry reopened, owner set back to the `free` plan with `plan_expires_at` null; station keeps running |
| POST | `/admin/requests/{entry}/reopen` | `requests.reopen` | `@reopen` | only from rejected |
| GET | `/admin/accounts/create` | `accounts.create` | `Admin\AccountController@create` | shows the form and any `provisioned` credentials flashed by `store` |
| POST | `/admin/accounts` | `accounts.store` | `@store` | `StoreAccountRequest`: `name` max 255, `email` unique (friendlier messages for closed vs existing accounts), `password` min 8, `plan_id` exists, `station_name` max 100. Creates a **verified** user and a station in one transaction, activity log `provisioned account`; the plain password is flashed back once |
| GET | `/admin/invites` | `invites.index` | `Admin\InviteController@index` | 25 per page, counts, suppressed addresses |
| POST | `/admin/invites` | `invites.store` | `@store` | `StoreInviteRequest`: `code` nullable 6..40 chars `[A-Za-z0-9-]` unique, `plan_id`, `duration_days` 1..3650, `label` max 255, `email`, `recipient_name`, `personal_note` max 500, `max_uses` required 1..10000, `link_expires_in_days` 1..365. Mints (`Invite::codeFor` if no code); if an email is given and not suppressed, sends `InviteOffer` and stamps `sent_at`; activity logs `minted invite` / `sent invite` |
| POST | `/admin/invites/{invite}/send` | `invites.send` | `@send` | body `email`; refuses closed invites and suppressed addresses |
| POST | `/admin/invites/{invite}/revoke` | `invites.revoke` | `@revoke` | sets `expires_at = now()` (refused if already closed); activity log `revoked invite`; users who already redeemed keep the plan |
| GET | `/admin/announcements` | `announcements.index` | `AnnouncementController@index` | last 20 sent announcements grouped by payload |
| POST | `/admin/announcements/preview` | `announcements.preview` | `@preview` | `StoreAnnouncementRequest`: `key` (auto `YYYY-MM-<slug>` when blank, max 64, `ProductUpdate::KEY_PATTERN`), `headline` required max 120, `summary` max 300, `detail_heading` max 60, `points` up to 6 lines of max 200, `url` (`https://...` or a path starting `/`) max 500, `link_label` max 40, `level` in `BellPayload::LEVELS` (`info, success, warning, error`), `icon` max 40 `[a-z0-9-]`. Shows audience, pending and skipped counts |
| POST | `/admin/announcements` | `announcements.store` | `@store` | same request; `set_time_limit(0)`; logs `sent announcement`; `AnnouncementSender::send`; an in-progress lock returns a flash error |
| GET | `/admin/emails` | `emails.index` | `RawEmailController@index` | last 15 sends from the activity log |
| POST | `/admin/emails/preview` | `emails.preview` | `@preview` | `SendRawEmailRequest`: `recipients` (split on whitespace, comma, semicolon; de-duplicated case-insensitively; 1..100, each email), `subject` max 150, `body` max 20000, `greeting` 120, `headline` 200, `sign_off` 120, `preheader` 150, `cta_url` `url:http,https` and `cta_label` max 40 (each required with the other), `marketing` boolean |
| POST | `/admin/emails` | `emails.store` | `@store` | sends to non-suppressed recipients (`RawEmailSender`), activity log `sent email` with sent/suppressed lists |
| GET | `/admin/watermark` | `watermark.index` | `WatermarkClipController@index` | clip library, config values, marked-station counts |
| POST | `/admin/watermark` | `watermark.store` | `@store` | `clip` required file, mimes `WatermarkClipLibrary::ALLOWED_EXTENSIONS`, max `LIQUIDSOAP_WATERMARK_CLIP_MAX_BYTES` (KB after division); dispatches `ReloadWatermarkClips` |
| DELETE | `/admin/watermark` | `watermark.destroy` | `@destroy` | body `name` required max 255; dispatches `ReloadWatermarkClips` |

`{entry}` (`WaitlistEntry`) and `{invite}` (`Invite`) bind by numeric id; `{station}` binds by slug. Admin guard authentication does not authorise `/api/*`; customer tokens do not open `/admin/*`.

## Artisan commands

Scheduling is in `api/routes/console.php`. "bg" = `runInBackground()`, "no-overlap" = `withoutOverlapping()`.

| Command | Signature | Schedule | What it does |
|---|---|---|---|
| `stations:sync-listeners` | none | every minute, no-overlap, bg | GETs Icecast `/admin/stats` (5 s timeout, basic auth), writes `listeners:{stationId}` in Redis with TTL 300 s (0 for stations with no mount entry). Exits failure (nothing written, old counts expire on their TTL) if `ICECAST_ADMIN_PASSWORD` or the URL is empty, Icecast is unreachable, or it answers non-2xx |
| `stations:reconcile` | `--dry-run` | every minute, no-overlap, bg | Compares docker containers with `desired_state=running`: removes orphan and unwanted containers, `up()`s missing ones, recreates unhealthy ones after `unhealthy_passes_before_recreate` passes (default 2) capped at `unhealthy_recreates_per_hour` (default 3); closes a stranded open stream session after `stranded_session_strikes` (default 3) passes where the container reports no broadcaster |
| `stations:sweep` | `--dry-run` | every minute, no-overlap, bg | Auto-stop decision tree via `StationAudioPolicy`; starts or clears `silent_since`, dispatches `StopStation` for `Stop` verdicts; no-op when `LIQUIDSOAP_SILENT_STOP_SECONDS=0` |
| `listeners:sweep` | none | every minute, no-overlap, bg | Closes sessions idle longer than `analytics.idle_close_seconds` (60) or older than `max_session_hours` (12), treats a token as live within `live_window_seconds` (45), samples concurrent listeners into the hourly rollup (the 1-minute cadence makes samples = listener-minutes), records per-session peak |
| `listeners:rollup` | `--hours=13 --days=3` | hourly at :05, no-overlap, bg | Recomputes session-derived hourly and country stats over the trailing window; idempotent |
| `listeners:prune` | `--chunk=1000` | daily 04:20, no-overlap, bg | Deletes `listener_sessions` older than `ANALYTICS_RETENTION_DAYS` (90; 0 disables) |
| `stations:prune-deleted` | `--days= --dry-run` | daily 04:40, no-overlap, bg | Force-deletes stations trashed longer than `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS` (30; 0 disables) |
| `stations:prune-events` | `--chunk=1000` | daily 04:50, no-overlap, bg | Deletes `station_events` older than `STATION_EVENT_RETENTION_DAYS` (30; 0 disables) |
| `notifications:prune` | `--chunk=1000` | daily 05:00, no-overlap, bg | Deletes bell notifications older than `NOTIFICATION_RETENTION_DAYS` (90; 0 disables) |
| `app:nudge-inactive-broadcasters` | `--dry-run` | daily 16:00, no-overlap (foreground) | Emails `InactiveBroadcasterNudge` to verified free-plan users created 7 to 8 days ago with no ended stream session on any station (trashed included), once each |
| `plans:expire` | none | hourly, no-overlap | Moves users with `plan_expires_at <= now` to the `free` plan (clears the expiry, keeps `invite_id`) and sends `PlanExpired` when the old plan differs; fails if no `free` plan exists |
| `stations:relaunch` | `--slug= --include-trashed` | manual | Rewrites playlist files and `up()`s every running station (or one) |
| `tracks:analyze` | `--station= --force --retry-failed --limit=0` | manual | Queues loudness and cue-point analysis jobs for tracks lacking results |
| `notifications:announce` | `{file} --dry-run --force` | manual | Same as the admin announcement page, reading a JSON file; asks for confirmation unless `--force` |
| `admin:create` | `{email} --name= --password=` (min 12 chars) | manual | Creates an admin account |
| `admin:reset-password` | `{email} --password=` (min 12; prompts if omitted) | manual | Resets an admin's password |
| `e2e:auth` | `{action: user|delete|email-code|password-code} --email= --password=Password123! --name="E2E User" --unverified --code=123456` | manual | Test fixture for browser tests; **refuses to run unless the environment is `local` or `testing`** |
| `inspire` | none | manual | Laravel stock command |

## Surfaces

- **Web dashboard and marketing site** (`client/`) call these routes from server components (with `X-Render-Key` on public reads) and from the browser with the `token` cookie. See [Auth](auth.md), [Station management dashboard](station-management-dashboard.md), [Public player and embed](public-player-and-embed.md).
- **Mobile app** uses bearer tokens from `login` (`device_name`) or `google/native`; see [Mobile app shell and auth](mobile-app-shell-and-auth.md).
- **Station containers** call only the `internal` group; see [Liquidsoap station script](liquidsoap-station-script.md) and [Station lifecycle](station-lifecycle.md).
- **Admin panel** is server-rendered Blade; see [Admin panel](admin-panel.md).

## Gaps and traps

1. **No global throttle on authenticated routes.** The comment in `api/routes/api.php` claims one; `api/bootstrap/app.php` has no `throttleApi()`. Only the routes named in the tables are limited, so, for example, `POST /stations` (creation), playlist and account routes are unthrottled.
2. **Mixed user shapes.** `email/resend`, `email/verify` and `PATCH account/profile` return the raw `User` model (`has_password` appended, no `plan` block), while `register`, `login`, `GET /user` and `google/native` return `UserResource` (with a `plan` block: `slug, name, autodj_enabled, analytics_days, max_listeners, embed_enabled, encoder_enabled, watermarked, expires_at`). Clients that read `plan` from a verify or profile response get nothing. The raw model hides only `password` and `remember_token`, so it also returns every other column as stored (`google_id`, `plan_id`, `invite_id`, `plan_expires_at`, ...) plus the appended `has_password`.
3. **Session binding is unscoped.** `DELETE /stations/{station}/sessions/{session}` authorises the station only; a valid session UUID from another station would be ended (and this station's broadcast state cleared). UUIDs make it hard to exploit, but it is not enforced (`StreamSessionController@destroy`).
4. **`unread-count` `capped_at` is cosmetic.** The count itself is uncapped (`NotificationController::countUnread`).
5. **AutoDJ slots and show times are saved for any plan.** Only `POST /stations/{slug}/tracks` and turning on jingles check `autodj_enabled`; slots are gated at playback (`AutoDjScheduler::next` returns null for non-AutoDJ plans, so `/internal/next-track` answers 204).
6. **Public station JSON leaks internals.** `StationResource` includes `user_id`, `icecast_mount`, `desired_state`, `theme_config` on `/public/*`. `GET /public/stations` lists every station (stopped and never-broadcast included), not only indexable ones; only the sitemap filters by `indexable()`.
7. **`POST /upload/{type}` is not station-scoped or plan-gated.** Any verified user can store up to 5 MB images or 50 MB audio on the public disk at 20 per minute; nothing removes files that end up unreferenced. The `sounds` type is accepted but has no caller in `client/` or `mobile/`.
8. **Playlist creation, editing and membership are not plan gated**, but tracks cannot be uploaded on Free (403 `autodj_not_available`), so a Free station can only have empty playlists.
9. **A start can 503 after the state was already committed.** `StationLifecycleService::start` saves `desired_state=running` before `supervisor->up()`, and `LiquidsoapSupervisor::verifyStarted` throws `station_start_failed` (503) when the container is not running 750 ms after `docker run`. The client sees an error while the DB says the station is on air (it occupies the owner's `max_running_stations` slot until the reconciler brings it up or the owner stops it). Other `up()` failures (docker errors) are not caught either and surface as a 500.
9a. **`POST`/`DELETE /stations/{station}/sessions/...` have no caller** in `client/` or `mobile/`; only `GET` is used. See the Sessions section.
9b. **Google-only accounts cannot change their email** through `PATCH /account/profile`: `current_password` is required for an email change and a null password cannot satisfy the `current_password` rule (from the rules; not exercised by a test I read).
10. **`POST /stations` over the plan's `max_stations`** returns a bare 403 "This action is unauthorized." (no `code`), unlike the start limit which has `station_limit_reached`.
11. **`stations.update` cannot change the slug**, yet `StationObserver` contains full slug-rename handling; that code is reachable only from other writers (admin, tinker).
12. **Login lockout has two layers with different shapes.** The IP limiter (`throttle:auth`, 10/min) returns Laravel's standard 429; the per-account lockout returns a `ValidationException` with status 429 and `errors.email`. Google routes share the same 10/min/IP bucket.
13. **Password reset `forgot` throttling is per IP only.** Nothing limits how many codes are issued for one email across IPs beyond overwriting the previous code.
14. **Admin panel has no rate limit or IP restriction besides the login lockout**; CSRF protects the forms. Approving a request or upgrading an account has no undo other than a revoke/upgrade in the other direction.
15. **`plans:expire` keeps `invite_id`**, so an expired invite account can never redeem another invite (`invite_already_redeemed`).
16. **`Track` upload partial success stops at the first failure** (`break` in `TrackController@store`); later files in the same request are not attempted, so 207 means "some, then stopped".
17. **`internal` key missing config is a 500, not a 401.** `VerifyInternalKey` throws `RuntimeException('INTERNAL_API_KEY is not configured')`.
18. **`station-event` and `now-playing` accept any registered slug** with only the shared key as proof; a leaked key allows forging live sessions (`live_connected`) and now-playing text for every station.
19. **Playlist membership routes do not touch the playlist files** while track edits, reorders and deletes do (`TrackController@update`, `TrackImporter`); the two paths rely on `next-track` being pulled over HTTP.


## Tests

`api/tests/Feature`: `AudienceControllerTest`, `BroadcastAuthTest`, `BroadcastTokenControllerTest`, `HarborAuthTest`, `ListenerSessionTest`, `MetricsControllerTest`, `NextTrackControllerTest`, `NotificationControllerTest`, `NowPlayingControllerTest`, `PlaylistControllerTest`, `PublicEmbedTest`, `PublicFeaturedTest`, `PublicStationSeoTest`, `ResendWebhookTest`, `StationEventControllerTest`, `StationPowerControllerTest`, `StationScheduleTest`, `AutodjSlotTest`, `StationStatusTest`, `StreamKeyRotationTest`, `TrackControllerTest`, `UnsubscribeTest`, `WaitlistControllerTest`, `StationNotifySubscriptionTest`, plus the `Auth/`, `Account/`, `Admin/` and `Console/` folders and command tests (`ReconcileStationsTest`, `StationSweepTest`, `SyncListenerCountsTest`, `SweepListenerSessionsTest`, `RollupListenerStatsTest`, `PruneDeletedStationsTest`, `PruneListenerSessionsTest`, `PruneNotificationsTest`, `NudgeInactiveBroadcastersTest`, `SendAnnouncementTest`). There is no test that asserts the route list itself.

## History

No dedicated plan. Older, partly stale references: `docs/api-reference.md` and `docs/stations-api-reference.md` (not used to write this file; this doc supersedes them).
