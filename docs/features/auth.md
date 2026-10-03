---
feature: Authentication and sessions
verified: 2026-10-01 against f6a201c plus uncommitted work (dashboard design-system rollout R1–R6.3)
sources:
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Http/Controllers/EmailVerificationController.php
  - api/app/Http/Controllers/PasswordResetController.php
  - api/app/Http/Controllers/AccountController.php
  - api/app/Services/GoogleIdTokenVerifier.php
  - api/app/Services/InvalidGoogleIdToken.php
  - api/app/Models/User.php
  - api/app/Models/EmailVerificationCode.php
  - api/app/Models/PasswordResetCode.php
  - api/app/Models/AuthenticationLog.php
  - api/app/Models/Concerns/AuthenticationLoggable.php
  - api/app/Http/Middleware/EnsureEmailIsVerified.php
  - api/app/Http/Middleware/UseAuthTokenCookie.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/app/Listeners/LogAuthenticationEvents.php
  - api/app/Listeners/RecordUserLastLogin.php
  - api/app/Listeners/RecordAdminLastLogin.php
  - api/app/Http/Requests/LoginRequest.php
  - api/app/Http/Requests/RegisterRequest.php
  - api/app/Http/Requests/ForgotPasswordRequest.php
  - api/app/Http/Requests/ResetPasswordRequest.php
  - api/app/Http/Requests/UpdateProfileRequest.php
  - api/app/Http/Requests/UpdatePasswordRequest.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Observers/UserObserver.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Console/Commands/E2EAuthCommand.php
  - api/bootstrap/app.php
  - api/routes/api.php
  - api/config/auth.php
  - api/config/sanctum.php
  - api/config/session.php
  - api/config/cors.php
  - api/config/services.php
  - api/routes/console.php
  - api/app/Http/Controllers/Admin/AuthenticatedSessionController.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/resources/views/liquidsoap/station.blade.php
  - infra/native/nginx/gocast-api.conf
  - api/resources/views/auth/google-callback.blade.php
  - api/app/Services/StationStatusService.php
  - client/actions/auth.ts
  - client/proxy.ts
  - client/app/auth/layout.tsx
  - client/app/auth/login/page.tsx
  - client/app/auth/register/page.tsx
  - client/app/auth/forgot/page.tsx
  - client/app/auth/callback/page.tsx
  - client/components/auth/VerifyEmailDialog.tsx
  - client/lib/session.ts
  - client/lib/cookies.ts
  - client/lib/google-auth.ts
  - client/lib/axios.ts
  - client/lib/api-server.ts
  - client/lib/env.ts
  - client/contexts/AccountContext.tsx
  - client/hooks/useSignOut.ts
  - client/app/dashboard/layout.tsx
  - client/app/dashboard/settings/page.tsx
  - client/interfaces/User.ts
  - client/tests/e2e/auth.spec.ts
  - client/tests/e2e/support/auth.ts
  - mobile/src/lib/auth.tsx
  - mobile/src/lib/api.ts
  - mobile/src/lib/web.ts
  - mobile/src/app/login.tsx
  - mobile/src/app/welcome.tsx
  - mobile/src/app/_layout.tsx
  - mobile/src/app/account.tsx
  - client/hooks/useEmailVerification.ts
  - client/components/dashboard/account/VerifyEmailDialog.tsx
  - client/components/dashboard/account/ProfileForm.tsx
  - client/components/dashboard/account/PasswordForm.tsx
  - client/components/dashboard/account/DeleteAccount.tsx
fingerprint: acbae7b7204ee3a4
---

# Authentication and sessions

Every request to the API is authenticated by one thing: a **Sanctum personal access token** in an `Authorization: Bearer` header. There are no server sessions and no CSRF tokens in the auth path. The web app never handles that token itself. The API puts it in an **HttpOnly `token` cookie**, and a middleware (`UseAuthTokenCookie`) turns the cookie into a bearer header on every API request. The Android app has no cookie jar, so it asks for the token in the response body (by sending `device_name`) and keeps it in the OS secure store. Same tokens, same table, two ways of carrying them.

The thing people get wrong: **the web `user` cookie is not the session.** It is a client-written, non-HttpOnly JSON copy of the account (identity only, 7 days), used so Next.js can print a name and decide redirects without a round trip. The real credential is the HttpOnly `token` cookie (30 days). The two expire on different clocks and can disagree. The API only ever looks at the token. Everything that reads the `user` cookie (`proxy.ts`, the dashboard layout, `getSession()`) is a UI gate, not a security boundary.

This doc covers sign-up, sign-in (password, Google web popup, Google native), email verification, password reset, profile and password changes, account deletion, sign-out, token and cookie lifetimes, throttles, and the shared-secret auth that station containers use against the API. Plans and invites are in [Accounts, plans and invites](accounts-plans-invites.md). The short-lived broadcaster token for the studio is in [Web studio](broadcasting-web-studio.md). WebSocket channel auth is in [Realtime events](realtime-events.md). The admin panel has its own guard and login, see [Admin panel](admin-panel.md). The mobile app shell is in [Mobile app shell and auth](mobile-app-shell-and-auth.md).

## The credential model

| Piece | Where | Detail |
|---|---|---|
| Token | `personal_access_tokens` (Sanctum, `HasApiTokens` on `User`) | Created with `$user->createToken(name)`. Name is `auth` for web logins and for the Google web popup, the client's `device_name` for mobile (`GoCast app (android)`). Abilities are the default `*`. |
| Lifetime | `config/sanctum.php` `expiration` = `SANCTUM_EXPIRATION`, default **43200 minutes (30 days)** | Fixed from creation. Not sliding: using a token does not extend it. |
| Guard | `auth:sanctum` on the route group in `routes/api.php` | `config/sanctum.php` `guard` is `['web']`, but `statefulApi()` is never called in `bootstrap/app.php`, so `EnsureFrontendRequestsAreStateful` is not in the `api` group. The session/stateful-SPA path is unused; only the bearer path runs. |
| Cookie to header | `UseAuthTokenCookie`, prepended to the `api` middleware group in `bootstrap/app.php` | See below. |
| Default guard | `config/auth.php` `defaults.guard` = `AUTH_GUARD` or `web` (session driver) | Only `Auth::attempt()` in `login()` uses it, purely to check the password and to fire the `Login` event. No session is started for the API. A second guard `admin` (session, `Admin` model) belongs to the admin panel. |
| Users provider | Eloquent, `AUTH_MODEL` or `App\Models\User` | `User` is soft-deleted, so a deleted account can no longer authenticate and its tokens resolve to nothing. |

### The `token` cookie

Written by `AuthController::authCookie()` and duplicated in `GoogleAuthController::authCookie()` (same arguments, two copies).

| Attribute | Value |
|---|---|
| Name | `token` |
| Value | The Sanctum plain-text token (`id\|secret`). Not encrypted (the API group has no `EncryptCookies`; `withCookie` attaches it as-is). |
| Lifetime | `sanctum.expiration` minutes (30 days), so the cookie and the token die together |
| Path | `/` |
| Domain | `config('session.domain')` = `SESSION_DOMAIN`. Production is `.gocast.fm` (`api.env.example`), so the cookie is shared between the API host and the web host. Unset in local dev (host-only; browsers share cookies across ports on `localhost`). |
| Secure | `$request->isSecure()`, which depends on the trusted-proxy headers (`trustProxies(at: '*')` in `bootstrap/app.php`) |
| HttpOnly | true |
| SameSite | `lax` |
| Partitioned | not set |

`UseAuthTokenCookie::handle()`:

1. Reads every `token=` pair from the **raw `Cookie` header** (Laravel's `$request->cookie()` keeps the first duplicate, which is the wrong one).
2. If the request has no bearer token and at least one cookie, sets `Authorization: Bearer <last cookie>`. Last wins: browsers send the older cookie first.
3. An explicit bearer header always wins over the cookie (`AuthCookieShadowingTest`).
4. If more than one `token` cookie was sent, it appends a `Set-Cookie` that expires a **host-only** `token` cookie (no Domain attribute). That cleans up cookies written before `SESSION_DOMAIN` was set, which login and logout could neither overwrite nor clear.

`logout()` clears the cookie with `cookie()->forget('token', '/', session.domain)`. The `token` cookie is HttpOnly, so `clearAuth()` on the client cannot remove it. It is only removed by that `Set-Cookie` from `POST /logout`.

### Cross-domain

The web app and API are separate origins (`gocast.fm` and `api.gocast.fm` in production; `localhost:3000` and `localhost:8000` in dev). This works because:

- **CORS** (`config/cors.php`): paths `api/*`, `sanctum/csrf-cookie`, `broadcasting/auth`; all methods and headers; `supports_credentials` true; origins from `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173,http://localhost:3000`; production references `FRONTEND_URL`). `sanctum/csrf-cookie` is listed but that route is not part of any flow.
- **The cookie is scoped to the parent domain** so the Next.js server sees it too. `proxy.ts`, the dashboard layout and `apiFetch` all read `token` from the incoming request on the web host. If the API were on a different registrable domain, the web host would never see `token`, and every dashboard visit would redirect to login. That deployment shape is unsupported.
- **axios** uses `withCredentials: true`, so the browser attaches the cookie to API calls.
- **Server-side calls** (`client/lib/api-server.ts` `apiFetch`) read `token` from `cookies()` and send it as a bearer header. Base URL is `process.env.INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL`, read directly in `api-server.ts` (axios uses `env.apiUrl` in `client/lib/env.ts`, which on the server also prefers `INTERNAL_API_URL` but treats an empty string as unset; `apiFetch` does not). Timeout 10 s (`ApiTimeoutError`), `cache: "no-store"`.
- **Google's popup** is served from the API origin, so its `Set-Cookie` lands on the API domain, which is what the parent-domain cookie needs.

Because auth is cookie-borne with `SameSite=Lax` and there is no CSRF token, the defence against cross-site request forgery is SameSite plus the CORS allow-list. Requests from a sibling subdomain of `.gocast.fm` count as same-site. There is no `EnsureFrontendRequestsAreStateful` and no `ValidateCsrfToken` on API routes.

## Endpoints

All under `routes/api.php`, prefixed `/api`.

| Method and path | Auth | Throttle | Controller |
|---|---|---|---|
| `POST /auth/register` | none | `auth` | `AuthController::register` |
| `POST /auth/login` | none | `auth` | `AuthController::login` |
| `GET /auth/google` | none | `auth` | `GoogleAuthController::redirect` |
| `GET /auth/google/callback` | none | `auth` | `GoogleAuthController::callback` |
| `POST /auth/google/native` | none | `auth` | `GoogleAuthController::native` |
| `POST /auth/password/forgot` | none | `auth` + `3,1` | `PasswordResetController::forgot` |
| `POST /auth/password/reset` | none | `auth` + `10,1` | `PasswordResetController::reset` |
| `GET /invites/{code}` | none | `auth` | `InviteController::show` (see [accounts doc](accounts-plans-invites.md)) |
| `POST /logout` | sanctum | none | `AuthController::logout` |
| `GET /user` | sanctum | none | `AuthController::user` |
| `POST /invites/redeem` | sanctum | `10,1` | `InviteController::redeem` |
| `POST /email/resend` | sanctum | `6,1` | `EmailVerificationController::send` |
| `POST /email/verify` | sanctum | `10,1` | `EmailVerificationController::verify` |
| `PATCH /account/profile` | sanctum | none | `AccountController::updateProfile` |
| `PATCH /account/password` | sanctum | none | `AccountController::updatePassword` |
| `DELETE /account` | sanctum | none | `AccountController::destroy` |
| everything else product-side (stations, tracks, upload, broadcast token, power, audience, ...) | sanctum + `verified` | per route | various |
| `/internal/*` | `X-Internal-Key` | `internal` (300/min/IP; `metrics` exempt) | see the last section |
| `/broadcasting/auth` | `api` + `auth:sanctum` (`withBroadcasting` in `bootstrap/app.php`) | none | Laravel |

Notifications routes and `POST /waitlist/pro` are inside `auth:sanctum` but outside `verified` on purpose (an unverified account can read the "please verify" notification). See [Notifications and email](notifications-and-email.md).

### Throttles, exactly

Defined in `AppServiceProvider::boot()` and inline (`throttle:N,M` means N requests per M minutes):

| Limiter | Limit | Keyed by |
|---|---|---|
| `auth` | **10 per minute** | IP (`$request->ip()`, trusted proxies give the real client IP) |
| `throttle:3,1` on `/password/forgot` | 3 per minute | user id if authenticated, else IP |
| `throttle:10,1` on `/password/reset`, `/email/verify`, `/invites/redeem` | 10 per minute | user id, or IP for reset |
| `throttle:6,1` on `/email/resend` | 6 per minute | user id |
| `internal` | 300 per minute | IP |
| login lockout (below) | 5 failures then 15 min | email + IP |

The named `auth` limiter is **one shared bucket per IP across register, login, both Google redirects, the Google callback, native sign-in, forgot, reset and the invite lookup**. An office behind one NAT address shares 10 auth-route calls a minute. The e2e suite works around this with a fake `X-Forwarded-For` per test (`isolateAuthRateLimit`).

## Register

`AuthController::register` (`RegisterRequest`):

| Field | Rule |
|---|---|
| `name` | required, string, max 255 |
| `email` | required, string, email, max 255, `unique:users` |
| `password` | required, string, min 8, `confirmed` (needs `password_confirmation`) |
| `invite_code` | nullable, string, max 40 (shape only) |

Steps, in one DB transaction: `User::create` (password hashed with `Hash::make`; the `hashed` cast would also hash it), then `InviteRedemption::redeem($code, $user)` if a code was sent. An `InviteException` rolls the insert back and is rendered as a 422 on `invite_code` (`bootstrap/app.php`). After the transaction: `sendEmailVerificationNotification()`, then `createToken('auth')`, then the response.

Response: `201`, body `{data: UserResource (plan eager-loaded), message}`, plus the `token` cookie. **The token is only in the cookie.** There is no `device_name` branch on register, so the mobile app cannot register. It sends people to the web (`openWeb('/auth/register')`).

Notes:
- The `Registered` event is never fired, so Laravel's built-in `SendEmailVerificationNotification` listener (visible in `event:list`) is inert. The code email comes from the explicit call.
- `User::created` triggers an admin Telegram alert (`AppServiceProvider`).
- The email is stored as typed; `unique:users` does not lower-case. Lookups elsewhere (`forgot`, `reset`) lower-case. This is harmless only while the DB collation is case-insensitive.
- The `data` payload is `UserResource` with `plan` loaded, the same shape as `GET /user` (since 2026-09-29; it used to be the raw model).
- The new account is signed in but unverified. Every route inside the `verified` group returns 403 until the code is entered.

## Login (email and password)

`AuthController::login` (`LoginRequest`: `email` required string email, `password` required string, `device_name` nullable string max 255).

1. **Lockout check.** Key is `login:<lowercased email>|<ip>`. `RateLimiter::tooManyAttempts($key, 5)` true gives `ValidationException` on `email` with "Too many login attempts. Try again in N seconds.", HTTP **429**. Checked before the password, so a correct password is also refused while locked.
2. `Auth::attempt(email, password)`. Failure: `RateLimiter::hit($key, 900)` and `401 {"message":"Invalid credentials."}` (same message whether the email exists or not).
3. Success: `RateLimiter::clear($key)`; create a token named `device_name` or `auth`.
4. If the account is unverified, issue a **fresh verification code** (so the modal the client opens has a live code).
5. Response shape depends on `device_name`:
   - **Present (mobile):** `200 {data: UserResource (with plan), token, message}`, no cookie.
   - **Absent (web):** `200 {data: UserResource (with plan), message}` plus the `token` cookie.

The lockout counter counts hits for 15 minutes from the first failure (Laravel's limiter sets the TTL on the first hit). It is per email and IP, so an attacker on another IP cannot lock the real owner out, and a distributed attack is only slowed by the 10/min IP limiter.

`Auth::attempt` fires Laravel's `Failed` and `Login` events, which drive two listeners (see Audit trail).

Every login creates a new token row. Web logs in as `auth`, so one user accumulates many `auth` tokens. Nothing prunes them (see gaps).

## Google sign-in

Google both signs in and creates accounts. Account resolution is shared by both flows in `GoogleAuthController::signInGoogleUser()`:

1. Find a user with `google_id` equal to the Google subject.
2. Else find a user with the same **email** and **link** it: set `google_id`, set `avatar_url` if empty. It does not touch the password.
3. Else create one: name is the Google name or the email's local part, `password = null`, `avatar_url` from Google.
4. If an invite code was carried and matches `^[A-Za-z0-9-]{1,40}$`, call `InviteRedemption::redeem` (best effort: an `InviteException` becomes `{applied:false, message}` and the account still stands). This happens **before** the verify step so a new account's single welcome email is the Pro welcome.
5. If unverified, `markEmailAsVerified()` and fire `Verified`, which sends the welcome email (`AppServiceProvider`, see Email verification).

`avatarUrl()` drops a Google photo URL longer than 2048 bytes instead of truncating it (the column is widened to hold it; a longer value used to crash the callback).

### Web popup flow (redirect and callback)

`client/lib/google-auth.ts` `signInWithGoogle({invite?})` opens a 500x600 popup named `gocast-google-oauth` at `${apiUrl}/auth/google[?invite=...]`. It resolves `{error:"popup_blocked"}` if the popup is blocked, `{dismissed:true}` if the popup closes (polled every 500 ms), `{authenticated:true, invite?}` or `{error}` from a `postMessage`. It ignores any message whose `event.origin` is not the API origin or whose `type` is not `gocast-oauth`.

`GoogleAuthController::redirect`:
- Stateless Socialite driver, `state` = 40 random chars sent to Google.
- Stores `sha256(state)` in cookie `gocast_oauth_state` (10 minutes, HttpOnly, SameSite lax, secure by request, no domain).
- If `?invite=` matches `^[A-Za-z0-9-]{1,40}$`, parks it in cookie `gocast_oauth_invite` (same flags, 10 minutes).

`GoogleAuthController::callback`:
- Compares `hash_equals(cookie, sha256(state query param))`. Mismatch, or any `Throwable` from `Socialite::user()`, renders the callback page with `{type:'gocast-oauth', error:'google_auth_failed'}`.
- Otherwise `signInGoogleUser`, then `createToken('auth')`, then the callback page with `{type, authenticated:true, invite?}` and the `token` cookie. Both flow cookies are deleted on every outcome.
- `signInGoogleUser` runs **outside** the try/catch: a database error there is a plain 500 page, not a `google_auth_failed` message.
- The web flow does not check Google's `email_verified` claim. The native flow does (below).

`resources/views/auth/google-callback.blade.php` is a tiny HTML page (CSP `default-src 'self'; script-src 'unsafe-inline'`). If `window.opener` exists it `postMessage`s the payload to the **origin of `services.frontend_url`** (never `*`; `frontendOrigin()` aborts 500 if the URL is invalid) and closes. With no opener (full-page flow) it redirects to `<frontend>/auth/callback?authenticated=1` or `?error=...`.

After the message, the web pages call `GET /user` (login and register pages via axios) and `saveAuth` the result into the `user` cookie. `/auth/callback` (`client/app/auth/callback/page.tsx`) is the no-opener fallback: it reads `?authenticated=1` or `?error=`, fetches `${apiUrl}/user` with `credentials: include` (10 s timeout), saves the user cookie, toasts "Welcome back" and goes to `/dashboard`.

### Native flow (Android app)

`POST /auth/google/native`: body `id_token` (required, string, max 8192), `device_name` (required, max 255), `invite` (nullable, max 40).

`GoogleIdTokenVerifier::verify()` decodes locally with `firebase/php-jwt` against Google's JWKS:
- Keys from `https://www.googleapis.com/oauth2/v3/certs`, cached 1 hour under `google-id-token-jwks` (5 s HTTP timeout). Key rotation is handled by reading the token's `kid` header first: only a `kid` missing from the cached set triggers a refetch, and that refetch is rate-limited (`mayRefetch`: once a minute per `kid` via a `Cache::add` marker, and at most `JWKS_REFETCHES_PER_MINUTE` = 10 across all key IDs via `RateLimiter`). The cached set is only replaced once the new one is in hand (`refetchKeys`), so a Google outage does not evict good keys, and a failed refetch hands back both the per-`kid` marker and the shared attempt. A junk, expired or badly signed token with a known `kid` costs no outbound call.
- Leeway 60 s, so expiry and issued-at are checked with a minute of slack.
- `iss` must be `accounts.google.com` or `https://accounts.google.com`.
- `aud` must equal `services.google.client_id` (`GOOGLE_CLIENT_ID`) exactly, and that value must be non-empty. This is the check that rejects tokens minted for other apps. The mobile app sends the same web client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) as the audience it asks for.
- `email_verified` must be `true` (strict), and `email` and `sub` must be present.
- Any failure throws `InvalidGoogleIdToken`; the controller `report()`s it and returns a 422 on `id_token`: "Google sign-in failed. Please try again."

On success: `signInGoogleUser`, then `200 {data: UserResource (with plan), token, invite}`. No cookie. `invite` is `null`, `{applied:true, plan, message}` or `{applied:false, message}`. The mobile app does not send `invite` (only the API accepts it).

## Email verification

- The account has `email_verified_at`. `User implements MustVerifyEmail`; `sendEmailVerificationNotification()` is overridden to send a **6-digit code**, not a signed link.
- Code: `random_int(100000, 999999)`, stored as `Hash::make(code)` in `email_verification_codes` (PK `user_id`, one row per user, upserted so a resend replaces the old code and resets `attempts` to 0). TTL **15 minutes** (`EmailVerificationCode::CODE_TTL_MINUTES`), **5 attempts** (`MAX_ATTEMPTS`). Emailed through `VerifyEmailCode` (queued, `ShouldQueue`).
- Issued by: register, login of an unverified account, `POST /email/resend`, and an email change.
- `POST /email/resend` (6/min): already verified returns `200 {data: user, message:"Email already verified."}` so a stale client can catch up; otherwise sends a new code.
- `POST /email/verify` (10/min), `code` required string `digits:6`. Order of checks: already verified returns 200; no row or expired returns 422 "Code expired. Request a new one."; `attempts >= 5` returns 422 "Too many attempts. Request a new code."; wrong code increments `attempts` and returns 422 "Invalid code."; correct: `markEmailAsVerified()`, fire `Verified`, delete the row (single use), return `{data: fresh user, message}`.
- `Verified` listener (`AppServiceProvider`): a user with `invite_id` and a plan gets the `InviteRedeemed` (Pro welcome) notification; everyone else gets `WelcomeNotification`. Anchored on verification, not registration.
- **Gate:** the `verified` route alias is `EnsureEmailIsVerified`. An unverified caller gets `403 {message:"Your email address is not verified.", code:"email_unverified"}`. The web axios interceptor toasts "Verify your email to continue." on that code.

### Web UI

There is **no standalone verify page**. The flow is `client/hooks/useEmailVerification.ts`, drawn by two dialogs: `components/auth/VerifyEmailDialog.tsx` (marketing kit) on the login and register pages, and `components/dashboard/account/VerifyEmailDialog.tsx` (dashboard ds kit) on the Account page. Neither can be dismissed by outside click or Esc. On open it calls `GET /user`, always saves the result into the `user` cookie, and if the server already says verified goes to `/dashboard`. Typing the sixth digit submits (a code typed mid-request is queued). "Resend code" calls `/email/resend`; "Use a different account" calls `POST /logout` then `clearAuth()`.

The login and register pages open the dialog when the `user` cookie shows an unverified account, so a person returning with a dangling unverified session lands on the modal, not on a form.

## Password reset

Two steps, all public. `PasswordResetCode` rows are keyed by **email** (not user id), one per email, **15 minute** TTL, **5 attempts**.

- `POST /auth/password/forgot` (`ForgotPasswordRequest`: `email` required string email max 255): lower-cases the email; if a user exists, upserts a hashed 6-digit code (`attempts` reset to 0) and notifies via `App\Notifications\PasswordResetCode`. **Always** returns `200 "If that email is registered, we've sent a reset code."`, so it does not reveal which emails exist.
- `POST /auth/password/reset` (`ResetPasswordRequest`: `email`, `code` `digits:6`, `password` min 8 `confirmed`): no row or expired gives 422 "Code expired..." (same message as a nonexistent email); `attempts >= 5` gives 422 "Too many attempts..."; wrong code increments attempts and gives "Invalid code."; a missing user gives "Invalid code.". Success, in a transaction: set the password, **delete every Sanctum token for the user** (`$user->tokens()->delete()`, all devices), delete the code row. Then a `PasswordChangedNotification` with the caller's IP. Returns 200; the client sends the person to `/auth/login`. Reset does **not** sign anyone in.

Web: `/auth/forgot` (`ForgotPasswordPage`) has two steps in one component, "request" then "reset". After the request step it always advances (the always-200 contract), with a "Resend code" link that re-calls forgot. Client validation: code must be 6 digits, password 8+, confirmation matches; server field errors are mapped onto inputs. Mobile does no reset in-app: "Forgot password?" opens `<APP_URL>/auth/forgot` in an in-app browser (`openWeb`).

A reset works on a Google-only account too (it has no password; the reset sets one). It also does not mark the email verified.

## Account changes

`AccountController` (all `auth:sanctum`, deliberately **outside** `verified` so someone who mistyped their email at sign-up can fix it or delete the account).

### Profile: `PATCH /account/profile` (`UpdateProfileRequest`)
- `name`: `sometimes|required|string|max:255`. `email`: `sometimes|required|string|email|max:255`, unique ignoring self. `current_password`: required **only when the email is changing**, and must satisfy Laravel's `current_password` rule.
- On email change: `email_verified_at = null`, new verification code sent, and an `EmailChangedNotification` sent on demand to the **old** address (`Notification::route('mail', $previousEmail)`).
- Existing tokens are **not** revoked on an email change.
- A Google-only account has no password, so it **cannot change its email** through this endpoint (`current_password` is required and cannot pass). The web Account page shows the "Current password" field as soon as the email is edited; a Google user must first use "Set a password".
- Response: `{data: $user->fresh(), message}` (raw model).
- Web: `client/components/dashboard/account/ProfileForm.tsx` (on `/dashboard/settings`). After an email change it saves the new cookie and, when the new address is unverified, opens the dashboard's `VerifyEmailDialog`.

### Password: `PATCH /account/password` (`UpdatePasswordRequest`)
- `current_password` required only if the account has a password (`password !== null`), must pass `current_password`; `password` required, min 8, `confirmed`, `different:current_password`.
- Sets the password, then deletes **every other** token (`id != current`), then sends `PasswordChangedNotification`. The current session stays alive.
- A Google-only user can use this to **set** a password (no current password needed). The UI relabels the card "Set password" when `has_password === false`. `has_password` is an appended attribute on `User` (`password !== null`) and rides on every user payload.

### Delete: `DELETE /account`
- Requires `confirmation` equal (trimmed, case-insensitive) to the account email. No password is asked, on purpose, so Google accounts can delete.
- Revokes all tokens, then rewrites `email` to `deleted-<id>-<uuid>@deleted.gocast.local`, nulls `google_id`, `avatar_url`, `email_verified_at`, then soft-deletes. That frees the email and the Google ID for re-registration. `UserObserver::deleting` soft-deletes each station (firing `StationObserver` to stop its container). The row and its stations remain in the database. The UI copy says "lose access to", not "erased", for that reason. See [Accounts, plans and invites](accounts-plans-invites.md) and [Station lifecycle](station-lifecycle.md).

## Sign-out

`POST /logout` deletes **only the current token** (`currentAccessToken()->delete()`), and clears the `token` cookie. Other devices stay signed in. **It does not fire Laravel's `Logout` event**, so nothing sets `logout_at` (see gaps).

- Web: `useSignOut()` is the single path (sidebar menu, homepage user menu). If a broadcast is `live`, `reconnecting` or `connecting` and the caller has not already confirmed, it asks `window.confirm` first ("Sign out will end your broadcast."). The dashboard sidebar asks with its own dialog ("Sign out and end your broadcast?") and passes `confirmed`. It posts `/logout` best-effort, calls `clearAuth()` (removes the `user` cookie and a legacy JS-readable `token`), toasts, and pushes to `/` (a shared module-level flag disables every sign-out button while in flight).
- Mobile: `signOut()` posts `/logout` ignoring errors, then `endSession()`: drops the token from memory and SecureStore, sets state to `signedOut`, and calls the native Google module's `signOut()`. The Account screen stops a live broadcast first and confirms if on air.

## Web: how the browser stays signed in

Files: `client/actions/auth.ts`, `client/lib/cookies.ts`, `client/lib/session.ts`, `client/proxy.ts`, `client/lib/axios.ts`, `client/app/dashboard/layout.tsx`, `client/contexts/AccountContext.tsx`.

### The `user` cookie
`saveAuth(_token, user)` (the token argument is ignored) writes cookie `user` = `encodeURIComponent(JSON.stringify(user))` **without `plan`** (stripped so a stale plan can never be read), `expires` 7 days, `path=/`, `SameSite=Lax`, `Secure` when the page loads over HTTPS (evaluated once at module load). It is written on: login success, register success, Google finish (after `GET /user`), the callback page, verify success, and profile save. It is not refreshed otherwise. `getUser()` parses it (throws on malformed JSON). `clearAuth()` removes `user` and any legacy `token` cookie.

### `proxy.ts` (Next.js middleware)
Matcher excludes `api`, `embed`, `_next/static`, `_next/image`, `.png`, `.svg`. It reads `token` and the parsed `user` cookie:
- `/auth/login` or `/auth/register` with a token **and** a verified `user` cookie: redirect to `/dashboard/stations`.
- `/dashboard*` without a token or without a verified `user` cookie: redirect to `/auth/login`.
It never validates the token, and `email_verified_at` comes from a cookie the visitor can edit. It is a UX redirect only.

### Dashboard layout (server)
`app/dashboard/layout.tsx` requires both cookies, `JSON.parse`s the user cookie **without a try/catch**, redirects an unverified user to `/auth/login` (which reopens the dialog), then calls `GET /user` and the station lookup in parallel. A failed `/user` is not fatal: `Account = {email, plan: null}`, and consumers must treat `null` as "unknown", not "free" (`usePlan()`, `useAutoDjLocked()` and siblings in `AccountContext.tsx`). `RealtimeProvider` gets `userId` from the cookie.

### `getSession()` (`lib/session.ts`)
For server components (marketing navbar and hero CTA). Signed in only if **both** `token` and `user` cookies are present and the user cookie parses; any disagreement is "signed out" so a stranger is never shown "Open dashboard". A parse error returns null instead of throwing, because it runs in the marketing layout.

### axios (`lib/axios.ts`)
- Request interceptor: reads `token` with `document.cookie` and sets a bearer header. Since `token` is HttpOnly this is always empty in a current session; the cookie itself is what authenticates (via `UseAuthTokenCookie`). It is a leftover from the era of a JS-readable token.
- Response interceptor: a **401** on a URL that does not contain `/login` or `/register`, when no redirect is already in flight, calls `clearAuth()` and navigates in-app (`navigate()` from `lib/navigation.ts`, backed by `RouterBridge`) to `/auth/login?expired=1`. The login page toasts "Your session expired. Please sign in again." A **403 `email_unverified`** toasts "Verify your email to continue."

### Login, register and Account UIs
- `/auth/login`: email and password, "Forgot password?", "Continue with Google". On load, `getUser()` redirects a verified cookie to `/dashboard/stations` or opens the verify dialog for an unverified one. Errors toast the API `message` ("Invalid credentials.", or the lockout text).
- `/auth/register`: name, email, password, confirm, Google button. Reads `?invite=` and calls `GET /invites/{code}` on load to show a banner (`valid`, `closed used/expired`, `invalid`, or `unchecked` when the lookup failed for a non-404 reason). The submit button is disabled while checking. `invite_code` is only sent when the state is `valid` or `unchecked`. The Google button passes the code on the popup URL only in those states. Field errors from the API are placed under their inputs, and an email "taken" error offers "Sign in instead". Password 8-char rule is client-validated too.
- `/auth/layout.tsx`: `robots: noindex, follow`, logo, dark background.
- `Account` page (`/dashboard/settings`, "Account", `components/dashboard/account/`): plan card, profile (Save disabled until something changed), password ("Password": current + new, or "Set a password": new only; one new-password field with Show/Hide, `password_confirmation` sent equal to it), and "Delete account…" with a typed-email `ConfirmDialog`. It seeds its forms from the `user` cookie after mount, not from the API.

## Mobile

`mobile/src/lib/auth.tsx` (`AuthProvider`), `lib/api.ts`, `app/welcome.tsx`, `app/login.tsx`, `app/_layout.tsx`, `app/account.tsx`.

- **Storage:** the token is in `expo-secure-store` under key `auth-token`, and mirrored in a module variable in `lib/api.ts` that every request reads as `Authorization: Bearer`.
- **Sign in with email:** `POST /auth/login` with `device_name = "GoCast app (<platform>)"`; reads `token` from the body, stores it, then fetches `GET /user` anyway (the login body now carries `UserResource` with the plan, but `adoptToken` is the one path that seeds the session, so it is not read; its comment "Login returns the bare model" is stale).
- **Sign in with Google:** the custom native module `gocast-google-auth` (Android Credential Manager) returns an ID token for `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; the app posts it to `/auth/google/native`. If that env value is empty in the build, it throws "Google sign-in isn't set up in this build." A cancelled sheet resolves `false` (no error).
- **Restore on launch:** reads the token, `GET /user`. A **401** deletes the token and signs out. Any other failure (offline) leaves the token stored but shows signed-out for that launch (state is set to `signedOut` in the catch either way), so a phone that boots offline sees the welcome screen and must retry.
- **Mid-session 401:** `api()` and `apiUpload()` call the unauthorized handler only when the rejected token is still the current one (`sent === token`), so a slow request from a replaced session cannot sign the new one out. The provider then runs `endSession()` with no `/logout` call.
- **Navigation:** `Stack.Protected` groups in `_layout.tsx`: signed-out (`welcome`, `login`) and signed-in (`home`, `account`, station, studio...). While `loading` both are closed, so no screen flashes.
- **Not in the app:** registration, password reset (opens the web page), email verification, changing email or password, deleting the account. There is no handling of `email_unverified`; see gaps.

## Audit trail and last login

- `RecordUserLastLogin` (on `Login` for guard `web`, user is a `User`) sets `users.last_login_at`. `RecordAdminLastLogin` does the same for guard `admin`.
- `LogAuthenticationEvents` (methods `handleLogin`, `handleFailed`, `handleLogout`; discovered by Laravel's event auto-discovery, confirmed by `php artisan event:list`) writes `authentication_log` rows: polymorphic `authenticatable_type/id` (morph map `user` and `admin`, enforced in `AppServiceProvider`), `ip_address`, `user_agent` (500 chars), `login_at`, `login_successful`, `logout_at`. A `Failed` row is written **only when the email matched a real user**. `handleLogout` closes the newest open row or creates a logout-only row.
- Only `Auth::attempt()` (email login, mobile or web, and the admin panel) raises these events. See gaps for what that leaves out. `AuthenticationLog` has `cleared_by_user` and `location` columns nothing writes.
- `User` also uses `LogsActivity` (Spatie) to log changes to `name, email, email_verified_at, plan_id, plan_expires_at, invite_id` (dirty only). `AuthenticationLoggable` only adds the `authentications()` relation.

## Station containers and internal-key auth

Server-to-server calls use a shared secret, not a token.

- **Inbound to the API:** `VerifyInternalKey` (alias `internal`) on the `/internal/*` group in `routes/api.php`: `harbor-auth`, `now-playing`, `next-track`, `station-event`, `metrics` (metrics is exempt from the throttle). It compares `X-Internal-Key` to `services.internal_api_key` (`INTERNAL_API_KEY`) with `hash_equals`. A wrong or missing header is `401 {"message":"Unauthorized."}`. **An empty `INTERNAL_API_KEY` throws a `RuntimeException`** (a 500), so an unset key fails closed. The group is throttled at `internal` (300/min/IP).
- **The key inside the container:** `LiquidsoapSupervisor` renders it into each station's `.liq` as `$internalApiKey` (`station.blade.php` sends it as `X-Internal-Key`), so the secret sits in plain text in rendered scripts on disk and is the same for every station. The template sends it on station-event (`station.blade.php` ~line 127), harbor-auth (~187), next-track (~492) and now-playing (~1267). Rotating `INTERNAL_API_KEY` requires re-rendering and restarting every station.
- **Outbound to the container:** the container's own harbor HTTP server (`/status` and command endpoints) checks the same header with a plain `==` in Liquidsoap (`authorized(req)`); `/healthz` is open. `StationStatusService` sends the key when it polls a container over the Docker network.
- **Broadcaster auth is separate:** whether a live source may connect is decided by `HarborAuthController` (called with this key), not by the key itself (that controller is not in this doc's sources; the container sends the key on that call). See [Web studio](broadcasting-web-studio.md) and [Encoder ingest](encoder-ingest.md).
- **Not the same as the render key:** `RENDER_API_KEY` / `X-Render-Key` only lifts the `public` rate limit for the Next.js server's rendering fetches (`AppServiceProvider`). It does not open `/internal` routes and is not authentication.
- In the native VPS kit, an internal nginx server block for these routes is closed at the firewall (ufw allows only the Docker CIDRs), with the key as the second layer (`infra/native/nginx/gocast-api.conf`, comment above the server block; not in `sources`, read only for that comment). See [Deployment](deployment-infra.md).

## Config and env vars

| Var | Where | Effect |
|---|---|---|
| `SANCTUM_EXPIRATION` | `config/sanctum.php` | Token and `token` cookie lifetime, minutes; default 43200. |
| `SANCTUM_TOKEN_PREFIX` | `config/sanctum.php` | Token prefix, default empty. |
| `SANCTUM_STATEFUL_DOMAINS` | `config/sanctum.php` | Set but unused (stateful API not enabled). |
| `SESSION_DOMAIN` | `config/session.php` | Domain of the `token` cookie. Production `.gocast.fm`. Must cover both API and web hosts. |
| `SESSION_DRIVER`, `SESSION_LIFETIME`, `SESSION_SECURE_COOKIE`, `SESSION_SAME_SITE` | `config/session.php` | Only the `admin` panel's `web` session uses these. `SESSION_DOMAIN` is the only one the token cookie reads. |
| `AUTH_GUARD`, `AUTH_MODEL`, `AUTH_PASSWORD_BROKER`, `AUTH_PASSWORD_TIMEOUT` | `config/auth.php` | Standard. The `passwords` broker block (`password_reset_tokens`, expire 60) is **unused**: reset uses the custom code table. |
| `CORS_ALLOWED_ORIGINS` | `config/cors.php` | Comma list; must contain the web origin. |
| `FRONTEND_URL` | `config/services.php` `frontend_url` | Target origin for the Google popup `postMessage` and the no-opener redirect. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `config/services.php` | Socialite web flow; `GOOGLE_CLIENT_ID` is also the required `aud` for native tokens. |
| `INTERNAL_API_KEY` | `config/services.php` | Container-to-API secret. |
| `RENDER_API_KEY` | `config/services.php` | Public-throttle exemption for Next.js SSR. |
| `NEXT_PUBLIC_API_URL`, `INTERNAL_API_URL` | `client/lib/env.ts` | Browser and server API base URLs. |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | mobile | API base, web base (for `openWeb`), Google audience. |

## Test fixtures

`php artisan e2e:auth {user|delete|email-code|password-code}` (`E2EAuthCommand`) refuses to run outside `local` and `testing`. Options `--email` (required, lower-cased), `--password` (default `Password123!`), `--name`, `--unverified`, `--code` (default `123456`, must be 6 digits). `user` deletes any existing user with that email (force delete with tokens and codes), recreates it, and for `--unverified` seeds a known email code. The Playwright suite in `client/tests/e2e/auth.spec.ts` shells out to it (`support/auth.ts`) and uses a per-test fake `X-Forwarded-For` to dodge the auth limiter.

## Gaps and traps

1. **Logout never fires the `Logout` event.** `AuthController::logout` only deletes the token. `LogAuthenticationEvents::handleLogout` can only run for an admin-panel session logout, so `authentication_log.logout_at` is never set for API users.
2. **Google sign-in (web and native) records no login.** `signInGoogleUser` never calls `Auth::login`, so no `Login` event fires: `users.last_login_at` is not updated and no `authentication_log` row is written. Anything that reads `last_login_at` (for example the inactive-account nudge, see [Notifications](notifications-and-email.md)) undercounts Google users.
3. **Google account linking can be pre-hijacked.** A same-email existing account is linked and marked verified without clearing its password. If someone registered a victim's email with a password of their own and never verified it, the victim's later "Continue with Google" gives the attacker a working password on the victim's account. The fix would be to null the password of an unverified account when linking.
4. **The web Google flow does not check `email_verified`** (only the native flow does). Socialite's `getEmail()` is trusted.
5. **Reset and verify code attempt limits are resettable.** `forgot`, `resend`, register and login all re-issue a code with `attempts = 0`. The 5-attempt cap only bounds one issued code; the real brute-force brake is the throttle (3/min forgot per IP, 10/min reset per IP, 10/min verify per user). A six-digit space is small against a distributed attacker.
6. **No token pruning.** `sanctum:prune-expired` is not scheduled anywhere (`routes/console.php`). Each login adds a token row and expired rows stay forever. Mobile logins pile up as `GoCast app (android)` rows the same way.
7. **Tokens are never refreshed or rotated.** A fixed 30-day life: a signed-in user is signed out on day 30 at a random moment (a 401, the `?expired=1` toast). There is no "list or revoke my sessions" endpoint. The mobile code comments mention "revoked from the web's sessions list"; that list does not exist.
8. **The two web cookies expire on different clocks.** `user` lives 7 days, `token` 30. After 7 days `proxy.ts` and the dashboard layout redirect to login even though the token is valid (an unnecessary re-login). In the other direction, a revoked or expired token with a fresh `user` cookie renders the dashboard shell; server-component `apiFetch` calls then throw `ApiFetchError` 401 (an error page) until a client axios 401 triggers the redirect. `apiFetch` has no 401 handling.
9. **The `user` cookie is client-controlled** and trusted by `proxy.ts` and the layout for `email_verified_at` and `id`. That is safe only because the API re-checks everything; do not put an authorisation decision on it. `RealtimeProvider` takes `userId` from it.
10. **`JSON.parse` on the `user` cookie has no try/catch in `app/dashboard/layout.tsx` and in `getUser()`.** A corrupt cookie throws (`getSession()` is the only guarded reader).
11. **axios reads `token` via `document.cookie`,** which cannot see an HttpOnly cookie. The branch is dead in a current session; auth works through the cookie header alone. Removing the cookie-reading code, or making `token` readable, would change behaviour, so leave it.
12. **Shared `auth` limiter bucket.** All eight `throttle:auth` routes (register, login, both Google redirects, native, forgot, reset, invite lookup) share 10/min per IP. Google's redirect and callback count too, so one sign-in through Google spends two. Shared NAT addresses (a school, an event) can lock each other out of sign-in for the rest of the minute.
13. **`EmailVerificationController` and `AccountController::updateProfile` return the raw `User` model, not `UserResource`.** It includes `plan_id`, `stripe_customer_id`, `google_id`, `invite_id`, `last_login_at`, and has no `plan` block. `login()`, `register()`, `GET /user` and `/auth/google/native` return the resource (login and register were switched on 2026-09-29).
14. **Failed-login audit rows exist only for real accounts.** An unknown email gets the same 401 and lockout counting (so it does not leak existence) but no `authentication_log` row, so credential-stuffing against unknown emails is invisible in the log.
15. **Mobile has no email-verification path.** An unverified email/password account can sign in (and login mails it a fresh code), but every `verified` route then returns 403 `email_unverified`, and nothing in `mobile/src` handles that code or offers a code entry. The message text surfaces as a raw error. Mobile also has no signup, so this only affects an account created on the web and never verified.
16. **Mobile offline start looks signed out.** A non-401 failure of `GET /user` at launch sets `signedOut` (the token stays stored, so the next launch works). The comment says "stays signed in" but the state says otherwise.
17. **Google-only accounts cannot change their email.** `current_password` is mandatory for an email change and a Google-only account has none. They must "Set password" first; the UI does not explain this.
18. **Email change does not revoke other sessions** (a password change does). The old address gets an `EmailChangedNotification`, but a hijacked session keeps working until the token expires.
19. **`Registered` is never dispatched;** `Illuminate\Auth\Listeners\SendEmailVerificationNotification` shows in `event:list` and does nothing. Code that later fires `Registered` would send a second verification email.
20. **The duplicated cookie builder.** `authCookie()` exists in both `AuthController` and `GoogleAuthController` with identical attributes; a change to cookie flags must be made in both, plus `UseAuthTokenCookie::forgetLegacyHostOnlyCookie` and `logout`'s `forgetAuthCookie`.
21. **`config/auth.php` `passwords.users`** (Laravel's token broker) and the `password_reset_tokens` table are unused; do not "fix" the reset flow through them.
22. **Cross-site cookie reliance.** No CSRF token protects cookie-authenticated POSTs. Safety rests on `SameSite=Lax` and the CORS allow-list, which a sibling subdomain of `SESSION_DOMAIN` is not subject to.
23. **`INTERNAL_API_KEY` is one shared secret, in plain text in every rendered `.liq`,** and the Liquidsoap side compares with `==` (not constant time). Rotating it means re-rendering and restarting all stations. The native kit firewalls the internal port as a second layer.
24. **`/auth/callback` (the no-opener fallback) is barely exercised.** The popup path is the normal one; the e2e test only checks that the popup opens and that a blocked popup surfaces an error (`auth.spec.ts`).

## Tests

API (Pest, `api/tests/Feature/Auth` and `Account`): `LoginTest`, `LoginLockoutTest`, `AuthCookieShadowingTest`, `GoogleOAuthCallbackTest`, `GoogleNativeSignInTest`, `EmailVerificationCodeTest`, `EmailVerificationEnforcementTest`, `PasswordResetTest`, `ProfileEmailChangeTest`, `RecordUserLastLoginTest`, `UserEntitlementsTest`, `InviteRedemptionTest`; `Account/AccountDeletionConfirmationTest`, `AccountDeletionCascadeTest`, `PasswordChangeNotificationTest`. Run targeted files only (`php artisan test tests/Feature/Auth`); the full suite takes minutes.

Web: `client/tests/e2e/auth.spec.ts` (Playwright) covers guarded redirects, bad credentials, sign in and out, unverified block, register and verify, reset, email change, password change, deletion, Google popup. Mobile has no automated auth tests.

## History

- The `token` cookie and `UseAuthTokenCookie`: HttpOnly cookie replaced a JS-readable token; the duplicate-cookie handling exists because of the older host-only cookie.
- Mobile token login and native Google sign-in: commit `92af763` (API) and `ed2e6a9` (app). Handoff: `docs/MOBILE-APP-HANDOFF.md`.
- Invite redemption inside register and the Google callback: see [Accounts, plans and invites](accounts-plans-invites.md).
- Google avatar overflow fix and widened `avatar_url` column: migration `2026_09_15_110000_widen_avatar_url_on_users_table.php`.
