# Admin Dashboard — Design (v1)

**Date:** 2026-04-18
**Status:** Approved design, pending implementation plan
**Scope:** v1 admin panel for GoCast. **All changes live in the `api/` Laravel folder only.** No changes to the `client/` Next.js app or the `relay/` Node service are in scope.

---

## 1. Goals & non-goals

### Goals
- Give the founder a production-grade admin panel to manage users, stations, broadcasts, plans, and the waitlist.
- Provide operational visibility: dashboard metrics, activity log, authentication log, Laravel log viewer.
- Support safe, reversible destructive actions: soft-delete user, soft-delete station.
- Lay groundwork for future multi-admin / RBAC without forcing it today.

### Non-goals (explicitly deferred)
- **Touching anything outside `api/`** — no SPA changes, no relay changes. Anything that requires them is out of scope.
- **User suspension / ban.** Intentionally deferred. When added, it needs its own design: a `suspended_at` column, a middleware, a client-side 403 interceptor, and a `/suspended` page. Keeping it out of v1 keeps this release `api/`-only.
- **Force-stop a live broadcast.** Requires relay coordination — out of scope by the api-only constraint.
- **Impersonation ("log in as user").** Requires cross-domain token bridge and SPA changes — out of scope.
- **Plan CRUD editing** (read-only in v1; seeders remain the source of truth while pricing is unstable).
- **Multi-admin RBAC** with roles/permissions packages (single-admin reality today; separate `admins` table keeps the door open cheaply).
- **In-panel email sending to waitlist** (export CSV; email from existing tooling).
- **Double opt-in flow for waitlist** (schema can add `confirmed_at` later).
- **Custom dashboard widget builder or configurable time ranges** (hardcoded 30-day windows for v1).

---

## 2. Architecture

### Panel
- **Filament 4** mounted on Laravel 13, served from a dedicated subdomain **`admin.gocast.ai`** via `->domain('admin.gocast.ai')` in the panel provider.
- Same Laravel app as the API — one codebase, one deploy. A single additional nginx server block + DNS record for the subdomain. The API domain (`api.gocast.ai`) serves zero admin routes.
- Admin login at `admin.gocast.ai/login` (session/cookie auth, Laravel `web` middleware group).

### Auth
- **Separate `admins` table.** Admin credentials never share a table with customer credentials. A bug or leak in `users` cannot grant admin access.
- **New `admin` auth guard** in `config/auth.php` using an `admins` provider (Eloquent, `App\Models\Admin`).
- Filament panel configured with `->authGuard('admin')`.
- **2FA required** — TOTP (Google Authenticator) via Filament's built-in 2FA. An admin cannot access any panel page until 2FA is enrolled.
- **No registration page.** First admin seeded via `php artisan admin:create {email}`. No in-panel admin CRUD UI in v1 → no privilege-escalation code paths.
- Admin login uses the existing `throttle:auth` limiter (5/min per IP).
- Admin sessions: 8-hour idle timeout, "remember me" disabled.
- Production-only IP allowlist is **not** enforced at app level in v1 (can be added at nginx/Cloudflare later without app changes — one of the reasons for the subdomain).

### Relay & client: not touched
The admin panel is a pure read/manage layer on top of the existing database. It does **not** talk to the Node relay, does **not** modify `stations.is_live` (which remains owned exclusively by the relay via `/internal/validate-stream` and `/internal/stream-ended`), and does **not** require any changes to the Next.js client.

**Known v1 limitation (documented, accepted):** if an admin soft-deletes a user while that user is actively broadcasting, the open WebSocket → relay → Icecast pipeline keeps flowing audio to listeners until the broadcast ends naturally (tab closed, network drop, etc.). Token revocation blocks *new* broadcasts but does not interrupt the active session. This is the explicit cost of keeping v1 `api/`-only; revisit when suspension or relay control is added.

---

## 3. Data model

All changes are Laravel migrations in `api/database/migrations/`.

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
- `deleted_at` — timestamp, nullable (soft deletes)
- `last_login_at` — timestamp, nullable (populated by an event listener on login)

**`stations`** — migration adds:
- `deleted_at` — timestamp, nullable (soft deletes)

(`is_featured` / `featured_at` already exist per the current schema — implementation must verify and skip any that already exist.)

**`waitlist_entries`** — no schema changes in v1.

### Models
- New `App\Models\Admin` (extends `Authenticatable`, implements `FilamentUser` + Filament `HasTwoFactorAuthentication`).
- `App\Models\User` — add `SoftDeletes` trait.
- `App\Models\Station` — add `SoftDeletes` trait.

---

## 4. Filament resources

### UserResource
- **Table columns:** name, email, plan (badge), stations_count (with_count), verified (badge), created_at, last_login_at.
- **Filters:** plan, verified y/n, signup date range, has-stations y/n.
- **Row actions:** view, edit, resend verification email, mark verified, soft-delete.
- **Bulk actions:** soft-delete.
- **Edit form:** name, email, plan_id, `email_verified_at` toggle.
- **Detail page panels:** profile · stations owned (inline table) · stream session history (inline table, last 50) · activity on this user (inline list from `activity_log` where `subject=this user`) · auth log (inline list from `authentication_log` where `user=this user`, last 50).
- **Create disabled** — users register themselves.

### StationResource
- **Columns:** name, slug, owner (linked), live/offline badge (read from `is_live`), current listener count, is_featured, created_at.
- **Filters:** featured, live/offline, owner (autocomplete).
- **Row actions:** view, edit, feature/unfeature, soft-delete.
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
- **Detail:** full `properties` JSON (old values, new values, hand-annotated context).

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

### Soft-delete user
1. Delete all of the user's Sanctum tokens (`$user->tokens()->delete()`) → forces logout on next request, blocks new broadcast token issuance.
2. Soft-delete the user and cascade to their stations (`$user->stations()->delete()` on the relation — Laravel soft-deletes each).
3. Record activity row: causer=admin, subject=user, event=`deleted`.
4. `stations.is_live` is not modified. If the user is mid-broadcast, the stream continues until natural end; the relay will flip `is_live` to false via the existing `/internal/stream-ended` route at that point.
5. **No UI-level "restore"** in v1. Recovery via `php artisan user:restore {id}` — keeps mis-click recovery out of the same interface that caused the mis-click.

### Soft-delete station
- Soft-delete only. No relay interaction. `is_live` is not modified; natural stream end will flip it.
- Activity logged.
- No UI restore; `php artisan station:restore {id}`.

### Delete waitlist entry
- Hard delete (GDPR). Activity logged.

---

## 7. Audit & auth logging

### Activity log (spatie/laravel-activitylog)
- Globally enabled on `User`, `Station`, `Admin`, `Plan` (log name `default`, logs `created`, `updated`, `deleted`, `restored`).
- Explicitly called in every custom Filament action (feature/unfeature, resend-verify, mark-verified, delete, etc.) with a hand-chosen event name.
- Causer morph map defined so DB stores short keys (`admin`, `user`) not FQCNs.
- Surfaced via `ActivityLogResource` and inline on User / Station detail pages.

### Authentication log (rappasoft/laravel-authentication-log)
- Enabled on both `User` and `Admin` models.
- Records: login success, login failed, logout, login from new device/IP.
- Surfaced via `AuthenticationLogResource`.

### Alerting (v1 simple)
- Scheduled job `DetectAdminLoginAbuse` every 5 minutes: if any IP has >10 failed admin login attempts in the last hour, log a critical Sentry error and fire a Laravel notification to all admins (database channel → shown in panel header bell icon). No SMS/email paging in v1.

---

## 8. Packages

| package | purpose |
| --- | --- |
| `filament/filament` (^4) | admin panel |
| `spatie/laravel-activitylog` | audit trail |
| `rappasoft/laravel-authentication-log` | login tracking |
| `opcodesio/log-viewer` + Filament plugin | in-panel Laravel log reader |

All packages installed via Composer in `api/`. No npm/node dependencies added.

---

## 9. Testing strategy

Tests live in `api/tests/`.

- **Pest feature tests** for every admin action that has side effects:
  - Soft-delete user → cascades to stations, tokens revoked, activity logged, `is_live` untouched.
  - Soft-delete station → soft-deleted, activity logged, `is_live` untouched.
  - Feature/unfeature station → boolean flipped, activity logged.
  - Resend verification / mark verified → correct email / column update, activity logged.
  - Waitlist CSV export → correct columns, correct rows for filter.
- **Access tests** — non-admin user with a valid Sanctum token cannot reach any `admin.gocast.ai` panel page (the panel uses the `admin` web guard, Sanctum tokens don't apply, so this reduces to: unauthenticated browser gets redirected to the admin login page, never the customer login).
- **Pest browser smoke tests** (Pest 4) — admin login page loads, dashboard loads, each resource's list page loads, no JS errors.
- **Pest arch tests** — admin panel code is scoped to `app/Filament/`; only `Admin` is referenced by the `admin` guard.

---

## 10. Rollout

1. All work lands on a feature branch (`feature/admin-panel`) and stays there until complete.
2. DNS record for `admin.gocast.ai` + nginx config added in production only after code is ready.
3. First admin created via `php artisan admin:create` on the server after deploy.
4. 2FA enrolled at first login; no panel access before enrollment.
5. Existing users and existing `api/` behavior unaffected — migrations are purely additive; no existing route, controller, model method, or middleware is changed in a way that alters customer-facing behavior.

---

## 11. Open questions

None. All decisions explicit above. Plan phase produces the step-by-step execution order.
