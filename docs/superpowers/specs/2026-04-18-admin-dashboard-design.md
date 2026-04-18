# Admin Dashboard — Design (v1)

**Date:** 2026-04-18
**Status:** Approved design, pending implementation plan
**Scope:** v1 admin panel for GoCast — users, stations, broadcasts, plans, waitlist, logs, and a home dashboard.

---

## 1. Goals & non-goals

### Goals
- Give the founder a production-grade admin panel to manage users, stations, broadcasts, plans, and the waitlist.
- Provide operational visibility: dashboard metrics, activity log, authentication log, Laravel log viewer.
- Support the core destructive actions needed for trust & safety: suspend user, force-stop a live broadcast, soft-delete user/station.
- Lay groundwork for future multi-admin / RBAC without forcing it today.

### Non-goals (explicitly deferred)
- Plan CRUD editing (read-only in v1; seeders remain the source of truth while pricing is unstable).
- Multi-admin RBAC with roles/permissions packages (single-admin reality today; separate `admins` table keeps the door open cheaply).
- In-panel email sending to waitlist (export CSV; email from existing tooling).
- Double opt-in flow for waitlist (schema already supports adding `confirmed_at` later).
- Custom dashboard widget builder or configurable time ranges (hardcoded 30-day windows for v1).
- Impersonation ("log in as user"). If support workload ever demands it, add it as a separate focused project with its own cross-domain token bridge design.

---

## 2. Architecture

### Panel
- **Filament 4** mounted on Laravel 13, served from a dedicated subdomain **`admin.gocast.ai`** via `->domain('admin.gocast.ai')` in the panel provider.
- Same Laravel app as the API — one deploy, one codebase. A single additional nginx server block + DNS record for the subdomain. The API domain (`api.gocast.ai`) serves zero admin routes.
- Admin login at `admin.gocast.ai/login` (session/cookie auth, Laravel `web` middleware group).

### Auth
- **Separate `admins` table.** Admin credentials never share a table with customer credentials. A bug or leak in `users` cannot grant admin access.
- **New `admin` auth guard** in `config/auth.php` using an `admins` provider (Eloquent, `App\Models\Admin`).
- Filament panel configured with `->authGuard('admin')`.
- **2FA required** — TOTP (Google Authenticator) via Filament's built-in 2FA. An admin cannot access any panel page until 2FA is enrolled.
- **No registration page.** First admin seeded via `php artisan admin:create {email}`. Additional admins (post-v1) added via the same Artisan command. No in-panel admin CRUD UI in v1 → no privilege-escalation code paths.
- Admin login uses the existing `throttle:auth` limiter (5/min per IP).
- Admin sessions: 8-hour idle timeout, "remember me" disabled.
- Production-only IP allowlist is **not** enforced at app level in v1 (can be added at nginx/Cloudflare later without app changes — one of the reasons for the subdomain).

### Relay coordination contract (new)
The Node relay gets a minimal internal HTTP control server, same shared-secret auth as the existing relay→API `/internal/*` routes (`INTERNAL_KEY` header).

- `POST {RELAY_CONTROL_URL}/control/kick` — body `{ station_id: int, reason: string }`. Response: `204 No Content`. Server-side behavior: find any active producer WebSocket for that station, send close frame with code `4003` and reason in payload, drop the connection. Idempotent — kicking a non-live station returns 204.

The browser broadcaster (already reconnects on abnormal close) is updated: on close code `4003`, show a non-dismissable banner "Broadcast stopped by a moderator — reason: {reason}" and do **not** auto-reconnect. User must manually start a new broadcast (which may fail if they're also suspended).

---

## 3. Data model

### New tables

**`admins`**
| column | type | notes |
| --- | --- | --- |
| id | bigint PK | |
| name | string | |
| email | string | unique |
| email_verified_at | timestamp nullable | |
| password | string | hashed |
| two_factor_secret | text nullable | encrypted |
| two_factor_recovery_codes | text nullable | encrypted |
| two_factor_confirmed_at | timestamp nullable | |
| last_login_at | timestamp nullable | updated on successful login |
| remember_token | string nullable | |
| timestamps | | |

**`activity_log`** — created by `php artisan vendor:publish --provider="Spatie\Activitylog\ActivitylogServiceProvider"`. `causer_id`/`causer_type` are polymorphic (Admin or User).

**`authentication_log`** — created by `php artisan vendor:publish --tag=authentication-log-migrations`.

### Additive columns

**`users`** — migration adds:
- `suspended_at` — timestamp, nullable, indexed
- `suspension_reason` — text, nullable
- `deleted_at` — timestamp, nullable (soft deletes)
- `last_login_at` — timestamp, nullable (populated by an event listener on login)

**`stations`** — migration adds:
- `deleted_at` — timestamp, nullable (soft deletes)

(`is_featured` / `featured_at` already exist per the current schema — implementation must verify and skip any that already exist.)

**`waitlist_entries`** — no schema changes in v1.

### Models
- New `App\Models\Admin` (extends `Authenticatable`, implements `FilamentUser` + Filament `HasTwoFactorAuthentication`).
- `App\Models\User` — add `SoftDeletes` trait, `suspended_at`/`suspension_reason` fillable, `isSuspended()` helper.
- `App\Models\Station` — add `SoftDeletes` trait.

---

## 4. Filament resources

### UserResource (full)
- **Table columns:** name, email, plan (badge), stations_count (with_count), status (badge: active/suspended/unverified), created_at, last_login_at.
- **Filters:** plan, status (active/suspended/unverified), verified y/n, signup date range.
- **Row actions:** view, edit, suspend/unsuspend, resend verification, mark verified, soft-delete.
- **Bulk actions:** suspend (requires reason), soft-delete.
- **Edit form:** name, email, plan_id, `email_verified_at` toggle.
- **Detail page panels:** profile · stations owned (inline table) · stream session history (inline table, last 50) · activity on this user (inline list from activity_log where `subject=this user`) · auth log (inline list from authentication_log where `user=this user`, last 50).
- **Create disabled** — users register themselves.

### StationResource
- **Columns:** name, slug, owner (linked), live/offline badge, current listener count, is_featured, created_at.
- **Filters:** featured, live/offline, owner (autocomplete).
- **Row actions:** view, edit, feature/unfeature, force-stop (visible only when live), soft-delete.
- **Edit form:** name, slug, description, artwork, `is_featured` toggle.
- **Detail panels:** station metadata · owner link · stream sessions (last 50) · activity log (subject=this station).

### StreamSessionResource (read-only)
- **Columns:** station, owner (via station.user), started_at, duration, peak_listeners.
- **Filters:** date range, station (autocomplete), owner (autocomplete).
- **Detail:** session metadata only. Listener timeline deferred — no per-tick data stored yet.

### PlanResource (read-only)
- **Columns:** name, price, limits (max stations / max listeners — whatever columns the `plans` table exposes), subscriber count.
- No create/edit/delete. Changes go through seeders.

### AdminResource (read-only in v1)
- **Columns:** name, email, 2FA enabled, last_login_at.
- No create/edit/delete in UI. Artisan only.

### WaitlistEntryResource
- **Columns:** email, plan, created_at.
- **Filters:** plan, date range, email search.
- **Row action:** delete (hard — GDPR).
- **Bulk actions:** export selected to CSV (email, plan, created_at), bulk delete.

### ActivityLogResource (read-only)
- **Columns:** timestamp, causer (polymorphic — admin or user), event, subject (polymorphic), description.
- **Filters:** causer admin, subject type, event, date range.
- **Detail:** full `properties` JSON (reason, old values, new values).

### AuthenticationLogResource (read-only)
- **Columns:** timestamp, user (admin-badge or customer-badge), event (login/logout/failed/other-device), ip, user_agent.
- **Filters:** admin-only, failed-only, user (autocomplete), date range.

### Log viewer
- `opcodesio/log-viewer` mounted at `admin.gocast.ai/admin/log-viewer` with a Filament nav link. Reads Laravel log files directly.

---

## 5. Dashboard (home page)

One page with widgets stacked top-to-bottom:

1. **StatsOverview** (4 cards)
   - Total users (with % change vs previous 30d)
   - Total stations (with "live now" count inline)
   - Live right now (stations currently broadcasting)
   - Listener-hours (last 30d)
2. **WaitlistStatsOverview** (3 cards)
   - Total waitlist entries
   - Signups (last 30d, with % change)
   - Breakdown by plan (inline mini bar)
3. **SignupsChart** — line chart, daily new users, last 30 days.
4. **StreamActivityChart** — stacked bar, daily broadcast minutes, last 30 days.
5. **Recent signups** — table, last 10 users.
6. **Currently live** — table, all stations broadcasting right now with listener count, click-through to station detail.

Hardcoded 30-day windows. No configurable range in v1.

---

## 6. Destructive actions — mechanics

Every destructive action uses a Filament confirmation modal that requires the operator to **type the target's identifier** (user's email, station's slug) to enable the confirm button.

### Suspend user
1. `users.suspended_at = now()`, `suspension_reason` required (min 3 chars).
2. Delete all of that user's Sanctum tokens (`$user->tokens()->delete()`) → forces logout on next request.
3. For each of the user's stations currently live: call `POST {RELAY_CONTROL_URL}/control/kick` with reason `"Owner account suspended"`. Log each kick attempt (success or failure) to the activity log.
4. Record activity row: causer=admin, subject=user, event=`suspended`, properties=`{ reason }`.
5. Middleware `EnsureUserNotSuspended` runs on every `auth:sanctum`-protected route. On hit: return 403 with body `{ error: "account_suspended", reason }`. SPA intercepts this specific code → full logout + non-dismissable message screen.

### Unsuspend user
- Null `suspended_at` and `suspension_reason`. Log activity. User can log in again; no token reissue needed.

### Force-stop a live broadcast
- Admin clicks "Force stop" on a live station → confirmation modal (type slug) → `ForceStopStationAction` runs:
  1. Call `POST {RELAY_CONTROL_URL}/control/kick` with 2s timeout.
  2. Set station's live flag false in DB regardless of relay response (so DB state doesn't drift if relay is down).
  3. Log activity — on relay success: event=`force_stopped`. On relay failure: event=`force_stopped_with_relay_error`, properties include the error.
- Admin sees a notification reflecting success or the partial-failure case. No silent failures.

### Soft-delete user
- Runs suspend flow first (tokens revoked, lives kicked).
- Soft-deletes the user and cascades to their stations (`$user->stations()->delete()` on the soft-deleted relation).
- **No UI-level "restore"** in v1. Recovery via `php artisan user:restore {id}` — keeps mis-click recovery out of the same interface that caused the mis-click.

### Soft-delete station
- If live, kick first.
- Soft-delete. Owner's `stations_count` goes down accordingly.
- No UI restore; `php artisan station:restore {id}`.

---

## 7. Audit & auth logging

### Activity log (spatie/laravel-activitylog)
- Globally enabled on `User`, `Station`, `Admin`, `Plan` (log name `default`, logs `created`, `updated`, `deleted`, `restored`).
- Explicitly called in every custom Filament action (suspend, unsuspend, force-stop, feature/unfeature, etc.) with a hand-chosen event name.
- Causer morph map defined so DB stores short keys (`admin`, `user`) not FQCNs.
- Surfaced via `ActivityLogResource` and inline on User / Station detail pages.

### Authentication log (rappasoft/laravel-authentication-log)
- Enabled on both `User` and `Admin` models.
- Records: login success, login failed, logout, login from new device/IP.
- Surfaced via `AuthenticationLogResource`.

### Alerting (v1 simple)
- Scheduled job `DetectAdminLoginAbuse` every 5 minutes: if any IP has >10 failed admin login attempts in the last hour, log a critical Sentry error and fire a Laravel notification to all admins (database channel → shown in panel header bell icon). No SMS/email paging in v1.

---

## 8. Frontend SPA changes (Next.js client)

Small, targeted changes only:

- **Suspension response handler** — a response interceptor in the existing API client: on 403 with `{ error: "account_suspended" }`, clear auth state, redirect to `/suspended` page showing the reason.
- **New `/suspended` page** — server component that reads the reason from query param (sanitized).
- **Broadcaster close code 4003 handler** — in the existing broadcaster reconnect logic, treat 4003 as terminal: stop reconnect, show banner with reason from the close payload.

No admin UI in the client. The panel is entirely on `admin.gocast.ai`.

---

## 9. Packages

| package | purpose |
| --- | --- |
| `filament/filament` (^4) | admin panel |
| `spatie/laravel-activitylog` | audit trail |
| `rappasoft/laravel-authentication-log` | login tracking |
| `opcodesio/log-viewer` + Filament plugin | in-panel Laravel log reader |

---

## 10. Testing strategy

- **Pest feature tests** for every admin action that has side effects:
  - Suspend → user cannot make authenticated requests, tokens revoked, live stations kicked (relay call mocked).
  - Unsuspend → user can log in again.
  - Force-stop → relay called, DB flag updated, activity logged. Both success and relay-failure paths.
  - Soft-delete user → cascades to stations, tokens revoked.
- **Policy tests** — non-admin User with valid Sanctum token cannot access any `admin.gocast.ai` route (returns 403 or redirect).
- **Pest browser smoke tests** (Pest 4) — login page loads, dashboard loads, each resource's list page loads, no JS errors.
- **Pest arch tests** — no admin code imports `App\Models\User` except through approved boundaries; `admins` table is only referenced by the `admin` guard.
- Targeted **middleware test** for `EnsureUserNotSuspended` — suspended user receives the documented 403 shape.

---

## 11. Rollout

1. All work lands on a feature branch (`feature/admin-panel`) and stays there until complete.
2. DNS record for `admin.gocast.ai` + nginx config added in production only after code is ready.
3. First admin created via `php artisan admin:create` on the server after deploy.
4. 2FA enrolled at first login; no panel access before enrollment.
5. Existing users unaffected — only schema additions + one new middleware that's a no-op for un-suspended users.

---

## 12. Open questions

None. All decisions explicit above. Plan phase produces the step-by-step execution order.
