---
feature: Admin panel (/admin Blade back office)
verified: 2026-10-04 against e145a37 plus uncommitted work
sources:
  - api/routes/admin.php
  - api/bootstrap/app.php
  - api/config/auth.php
  - api/config/session.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Http/Controllers/Admin/AuthenticatedSessionController.php
  - api/app/Http/Controllers/Admin/StationController.php
  - api/app/Http/Controllers/Admin/AccessRequestController.php
  - api/app/Http/Controllers/Admin/AccountController.php
  - api/app/Http/Controllers/Admin/InviteController.php
  - api/app/Http/Controllers/Admin/AnnouncementController.php
  - api/app/Http/Controllers/Admin/RawEmailController.php
  - api/app/Http/Controllers/Admin/WatermarkClipController.php
  - api/app/Http/Requests/Admin/LoginRequest.php
  - api/app/Http/Requests/Admin/StoreAccountRequest.php
  - api/app/Http/Requests/Admin/StoreInviteRequest.php
  - api/app/Http/Requests/Admin/StoreAnnouncementRequest.php
  - api/app/Http/Requests/Admin/SendRawEmailRequest.php
  - api/app/Http/Requests/Admin/StoreWatermarkClipRequest.php
  - api/app/Models/Admin.php
  - api/app/Models/WaitlistEntry.php
  - api/app/Models/Invite.php
  - api/app/Models/StationEvent.php
  - api/app/Models/Station.php
  - api/app/Listeners/RecordAdminLastLogin.php
  - api/app/Listeners/LogAuthenticationEvents.php
  - api/app/Console/Commands/AdminCreateCommand.php
  - api/app/Console/Commands/AdminResetPasswordCommand.php
  - api/app/Console/Commands/SendAnnouncement.php
  - api/app/Console/Commands/ExpirePlans.php
  - api/app/Services/AnnouncementSender.php
  - api/app/Services/AnnouncementInProgressException.php
  - api/app/Services/RawEmailSender.php
  - api/app/Services/AdminTelegram.php
  - api/app/Services/WatermarkClipLibrary.php
  - api/app/Services/InviteRedemption.php
  - api/app/Jobs/SendAdminTelegramAlert.php
  - api/app/Services/UserAgentParser.php
  - api/app/Jobs/ReloadWatermarkClips.php
  - api/app/Notifications/ProAccessGranted.php
  - api/app/Notifications/ProductUpdate.php
  - api/app/Notifications/RawEmail.php
  - api/app/Notifications/RawEmailDraft.php
  - api/app/Observers/UserObserver.php
  - api/resources/views/admin/layout.blade.php
  - api/resources/views/admin/login.blade.php
  - api/resources/views/admin/stations.blade.php
  - api/resources/views/admin/station.blade.php
  - api/resources/views/admin/upgrade-preview.blade.php
  - api/resources/views/admin/requests.blade.php
  - api/resources/views/admin/accounts.blade.php
  - api/resources/views/admin/invites.blade.php
  - api/resources/views/admin/announcements.blade.php
  - api/resources/views/admin/announcement-preview.blade.php
  - api/resources/views/admin/emails.blade.php
  - api/resources/views/admin/email-preview.blade.php
  - api/resources/views/admin/watermark.blade.php
  - api/resources/css/admin.css
  - api/routes/console.php
  - api/app/Webhooks/Resend/EmailReceived.php
  - api/app/Notifications/ProductUpdate.php
  - api/app/Services/EmailMarkdown.php
  - api/config/liquidsoap.php
  - api/config/services.php
  - api/config/station_events.php
  - api/config/notifications.php
fingerprint: 379b25c5040bdcbc
---

# Admin panel

`/admin` is a server-rendered Blade back office on the API host, for the one or two operators of GoCast. It is the only place an account can be moved onto a paid plan on purpose (there is no checkout), and it is where support looks at a station's history. It has its own guard, its own user table (`admins`), its own routes file, its own views and its own CSS bundle, and nothing a customer holds can authenticate into it.

The thing people get wrong: **the "preview, then send" steps are a UI convention, not a server-enforced state machine.** `announcements`, `emails` and `stations/{station}/upgrade` each have a `store`/`upgrade` route that re-validates and acts on whatever is POSTed; nothing checks that a preview happened first. Any signed-in admin session can POST straight to them. The second thing: the panel only shows a flash string (`status`/`error`) and per-field `@error` messages, so several refusals are deliberately "redirect with a sentence" rather than validation errors.

## Access and auth

| Piece | What the code does |
|---|---|
| Registration | `api/bootstrap/app.php` `then:` mounts `routes/admin.php` under `Route::middleware('web')->prefix('admin')->name('admin.')`. Not in `web.php`/`api.php`. |
| Guard | `config/auth.php`: guard `admin` = `session` driver on provider `admins` = Eloquent `App\Models\Admin`. A `users` row cannot log in here and an admin cannot use the customer API. |
| Model | `Admin` (`name`, `email`, `password` hashed cast, `last_login_at`, `remember_token`). Fillable is name/email/password only. Logs name/email changes via `LogsActivity`. Morph alias `admin` (`AppServiceProvider` `enforceMorphMap`). |
| Route middleware | Guests-only (`guest:admin`): `GET/POST /admin/login`. Everything else is `auth:admin`. `GET /admin` redirects to `/admin/stations`. |
| Redirects | `bootstrap/app.php`: an unauthenticated request under `admin`/`admin/*` goes to `admin.login`; an authenticated admin hitting a guest route goes to `admin.stations.index`. Any other path keeps the default (401 for JSON, `null` redirect). |
| Login | `AuthenticatedSessionController::store` -> `LoginRequest::authenticate()` -> `Auth::guard('admin')->attempt(email, password, remember)` -> `session()->regenerate()` -> `redirect()->intended('/admin/stations')`. Failures are reported on the `email` field with `auth.failed`. |
| Throttle | `LoginRequest`: 5 attempts per key `lower(email)|ip` (`MAX_ATTEMPTS = 5`), `RateLimiter::hit` on each failure (Laravel default 60 s decay), cleared on success. The 6th attempt fires `Lockout` and returns `auth.throttle` with seconds/minutes. This is the **only** rate limit on the panel. |
| Logout | `POST /admin/logout`: `guard('admin')->logout()`, `session()->invalidate()`, `regenerateToken()`, redirect to login. |
| Session | The normal `web` stack. `config/session.php`: driver `SESSION_DRIVER` (default `database`; `api/.env.example` ships `redis`), lifetime `SESSION_LIFETIME` 120 minutes, `http_only` true, `same_site` lax, `secure` from `SESSION_SECURE_COOKIE`. "Remember me" is a checkbox (`remember=1`) on the login form. `.env.example` sets `SESSION_DOMAIN=.gocast.fm`, so the cookie is scoped to the parent domain. CSRF is on (all forms carry `@csrf`; the only CSRF exemption in `bootstrap/app.php` is `unsubscribe`). |
| Side effects of login | `RecordAdminLastLogin` (guard-scoped `Login` listener) writes `admins.last_login_at`. `LogAuthenticationEvents` (auto-discovered, `handleLogin/handleFailed/handleLogout`) also writes `authentication_logs` rows for admins (ip, user agent, success/failure, logout time); `handleFailed` only fires when the email matches a real admin, because it needs `$event->user`. Confirmed with `php artisan event:list`. |
| Creating admins | Only `php artisan admin:create {email} {--name=} {--password=}` (prompts if omitted; email unique in `admins`, name max 255, `Password::min(12)`). No signup, invite or email verification. |
| Recovering | Only `php artisan admin:reset-password {email} {--password=}` (same 12-character minimum; also nulls `remember_token`, which invalidates remember-me cookies; **does not** delete active sessions). There is no forgot-password page. |
| Authorization | No roles. Every admin can do everything. Form requests `authorize()` returns `$this->user('admin') !== null` (`StoreAccountRequest`, `StoreInviteRequest`, `StoreAnnouncementRequest`, `SendRawEmailRequest`), except `StoreWatermarkClipRequest::authorize()` which returns `true` and relies on the route group. |

## Layout

`admin/layout.blade.php`: a daisyUI drawer. Sidebar links, in order: Stations, Access requests, Create account, Invites, Announcements, Send email, Watermark clips (active state by `routeIs('admin.<x>.*')`). Header has the page title and a Sign out button; the signed-in admin's email is at the bottom of the sidebar. `<meta name="robots" content="noindex, nofollow">` on every page. The layout renders two flash keys only: `status` (green) and `error` (red). It does **not** render the validation error bag; pages that need field errors print `@error` themselves, and controllers that must not lose a refusal flash a `status` string instead.

CSS is a separate Vite entry, `resources/css/admin.css` (Tailwind v4 with `source(none)` scanning only `resources/views/admin` and Laravel's pagination views, plus the daisyUI plugin with themes `corporate` (default) and `business` (dark)). `vite.config.js` lists it as an input; `@vite('resources/css/admin.css')` throws "Vite manifest not found" if `public/build` was not built (the native deploy builds it, see [Deployment and infrastructure](deployment-infra.md)). Tests call `withoutVite()`. Login uses its own minimal layout (`login.blade.php`), not `layout.blade.php`.

## Routes

All names are prefixed `admin.`. All are `auth:admin` except login.

| Method and path | Controller method | Purpose |
|---|---|---|
| GET `/admin/login`, POST `/admin/login` | `AuthenticatedSessionController@create/store` | sign in (guest only) |
| POST `/admin/logout` | `@destroy` | sign out |
| GET `/admin` | redirect | to `/admin/stations` |
| GET `/admin/stations` | `StationController@index` | station list, tiles, search, filters |
| GET `/admin/stations/{station}` | `@show` (`withTrashed()`) | one station's event timeline |
| POST `/admin/stations/{station}/feature` | `@feature` | toggle homepage curation |
| POST `/admin/stations/{station}/upgrade/preview` | `@previewUpgrade` | step 1 of an upgrade |
| POST `/admin/stations/{station}/upgrade` | `@upgrade` | step 2: write plan and email |
| GET `/admin/requests` | `AccessRequestController@index` | access request queue |
| POST `/admin/requests/{entry}/approve\|dismiss\|revoke\|reopen` | same names | settle a request |
| GET `/admin/accounts/create`, POST `/admin/accounts` | `AccountController@create/store` | hand-provision an account |
| GET `/admin/invites`, POST `/admin/invites` | `InviteController@index/store` | mint invite links |
| POST `/admin/invites/{invite}/send`, `/revoke` | `@send`, `@revoke` | resend / close |
| GET `/admin/announcements`, POST `.../preview`, POST `/admin/announcements` | `AnnouncementController@index/preview/store` | broadcast to every bell |
| GET `/admin/emails`, POST `.../preview`, POST `/admin/emails` | `RawEmailController@index/preview/store` | one-off email |
| GET/POST/DELETE `/admin/watermark` | `WatermarkClipController@index/store/destroy` | watermark clips |

Route model binding: `{station}` binds on `slug` (`Station::getRouteKeyName`), `{entry}` is a `WaitlistEntry` id, `{invite}` an `Invite` id. Only `stations.show` is `withTrashed()`; `feature`, `upgrade` and `upgrade/preview` 404 for a station in the trash. All actions are POST (not PATCH) on purpose: plain Blade forms. The one exception is `DELETE /admin/watermark` (form method spoofing).

## Pages and actions

### Stations (`admin/stations.blade.php`, `StationController@index`)

- **Tiles** (Stations, Powered on, Live now and Featured are links; Powered on/Live now/Featured keep the search and the other filters, clicking the active one clears it; the Stations tile clears the state and featured filters but keeps the search; Users is not a link): Stations (`Station::count()`), Powered on (`desired_state = running`, labelled "owner intent, not containers"), Live now (an open `StreamSession`, `ended_at IS NULL`), Featured (`featured` count, with "N of 4 slots filled" from `Station::FEATURED_RAIL_SIZE = 4` and a note when on-air featured stations exceed the rail or some are powered off; the number turns warning-coloured when featured > 0 and none are on air), Users (`User::count()`, soft-deleted excluded).
- **Filter form** (GET): `search` (`LIKE %..%` on station name, slug, or owner email; `%`/`_` in the term are not escaped), `featured=1` checkbox, hidden `state` carried through. `state` accepts only `running` or `live`; anything else is ignored. Clear link when any filter is active.
- **Table** (25 per page, newest first, `withQueryString`): station name (links to the timeline), slug (opens the public `FRONTEND_URL/station/{slug}` in a new tab), owner email (`-` if the owner is soft-deleted, since the relation excludes trashed users), plan badge (`none` if no plan), Power badge (`desired_state`), Live badge ("on air", from a `withExists` subquery so it is one query per page), **Browser** and **IP** of the latest broadcast (not the latest login: three correlated subqueries pick `client`, `ip_address`, `country` from the station's newest `stream_sessions` row by `started_at`; Browser is `UserAgentParser::browser` + `device`, or the raw agent truncated to 24 chars when the browser is `Other`; IP carries a flag emoji and the country code when `country` is set; `-` when null, which is the case for sessions from before the origin was recorded and for an encoder's IP), track count, created (relative), Featured column.
- **Featured column**: a badge `featured` (primary if running) or `featured · off` (warning outline if powered off; tooltip shows `featured_at`), a Feature/Unfeature button (POST, no confirm), and, when the station has an owner, an **Upgrade** button that opens a per-row `<dialog>`.
- **Upgrade dialog fields**: `plan_id` (every plan except slug `free`, ordered by id, first one preselected), `term` (required, no preselected value: `1-week`, `2-weeks`, `1-month`, `2-months`, `3-months`, or `none` = "No end date"), `note` (required textarea, `maxlength=2000`). A yellow alert appears in the dialog when the owner already has a non-free plan with no `plan_expires_at` ("anything but No end date will send them back to Free"). Submit posts to `upgrade/preview`.
- Soft-deleted stations do not appear in the list (default `SoftDeletes` scope). There is no link to their timeline from the list; you need the URL (or the Telegram alert link).

### Feature toggle (`StationController@feature`)

`Station::markFeatured(!featured)` writes `featured` and `featured_at` (now / null) together with `forceFill`. There is no cap on how many can be featured; the public rail truncates to 4. It is a single column write: `featured` is not in `StationObserver`'s liq-relevant columns, so the container is untouched. Writes an explicit activity entry (`featured station` / `unfeatured station`, causer = admin) because `LogsActivity` resolves its causer from the default guard, which is never `admin`. Flash: "no longer featured", "is featured", or, if `desired_state != running`, a warning that it will only show on the homepage once its owner starts it. See [Public player and embed](public-player-and-embed.md) for the rail itself.

### Station timeline (`StationController@show`, `admin/station.blade.php`)

Reads only `station_events` (`Station::events()` is `hasMany(StationEvent)->latest('created_at')`), 50 per page. It deliberately does **not** merge the `activity_log` (settings edits) into the timeline. Query params: `type` (any string; the dropdown offers `StationEvent::TYPES`) and `source` (`container|owner|admin|system`). Both are applied without validating against the lists, so an unknown value just yields an empty page.

- Header buttons: back to list, "Open station page", and a red "in trash since ..." badge when soft-deleted.
- Stat strip: owner email + plan name, Power (`desired_state`), Live (`isLive()`, open stream session), Tracks (`loadCount('tracks')`), Last ready (`last_ready_at`, "last Icecast accept").
- "Last 24 hours" card: counts per event type over the last day (`reorder()` then `groupBy type`; hidden when there are none). Each chip links to the timeline filtered by that type.
- Table columns: When (relative + `d M H:i:s`; for a collapsed run, "back to <earliest time>"), Event (coloured badge with an English gloss, plus the raw type in monospace, and "x N" for a run; `studio_drop` is a warning badge glossed "Studio lost its connection — the browser's side of it", `uplink_check` is glossed "Go-live connection check" with the default ghost badge), Source (+ causer label: the causer's email or name, else `type#id`), Detail (the `properties` JSON as a key/value list; scalars via `var_export`).
- **Collapse rule** (`collapse()`): consecutive rows with the same `type`, `source` and identical `properties` fold into one row with a count. It runs **within a page only**, so a run that crosses a page boundary shows as two rows.
- Vocabulary and retention live in [Observability and events](observability-and-events.md). Retention is `STATION_EVENT_RETENTION_DAYS` (default 30) via `stations:prune-events` at 04:50 nightly (`routes/console.php`). Container-sourced events are rate-capped per station at `station_events.max_per_minute` (default 60) inside `StationEvent::record`, and `record()` swallows its own failures, so a quiet timeline is not proof nothing happened.

### Upgrade (two POSTs; `StationController@previewUpgrade` and `@upgrade`)

Both call the same private `resolveUpgrade()`, so they cannot disagree about a post. It refuses (redirect to `stations.index?search=<slug>` with a `status` sentence, nothing changed) when: `note` is blank after `trim` or over 2000 chars; the station has no owner (soft-deleted user); `plan_id` does not resolve to a non-free plan; `term` is not one of the five terms or `none`. End date = `now()->addWeeks(w)->addMonthsNoOverflow(m)` (no overflow, so 3 months from 30 Nov is end of Feb), or `null` for `none`.

- **Preview** renders `upgrade-preview.blade.php` and changes nothing. It builds a `ProAccessGranted($plan, $endsAt, $termLabel, $note)` and shows: the actual mail rendered inside a `sandbox` iframe (`srcdoc`), the subject, and the in-app bell payload (`toDatabase`). The right column repeats the plan/term/note fields as an editable form with two buttons: "Upgrade and email" (posts to `upgrade`) and "Update preview" (`formaction` back to preview). Any `input` event disables "Upgrade and email" and shows "Changed - update the preview before sending"; that guard is client-side JS only. It also shows Now vs After and a warning when the account currently has a paid plan with no end date and the new term would add one.
- **Send** (`upgrade`): `user->forceFill(['plan_id', 'plan_expires_at'])->save()`, then `$user->notify(ProAccessGranted)` (queued), then an activity entry `upgraded account` with properties plan slug, `expires_at`, station slug. Redirects to the filtered stations list with "`<email>` is on `<Plan>` until `<date>` (or with no end date), and has been emailed."
- The plan belongs to the **account**, not the station: it covers every station the owner has. The save triggers `UserObserver::updated`, which, if `plan_id` changed, pushes watermark and jingle settings to each of the user's running stations over telnet (errors are logged, not surfaced). Expiry is enforced later by `plans:expire` (hourly, `withoutOverlapping`), which moves the account to Free and sends `PlanExpired`. See [Accounts, plans and invites](accounts-plans-invites.md).
- Email copy differs when a `note` exists: the note replaces "Your request is approved", paragraphs split on blank lines, subject is `You're on GoCast <Plan>` (no term); without a note (request approval) the subject is `You're on GoCast <Plan> - <term> on us`. With `endsAt = null`, there is no term or "goes back to Free" language.

### Access requests (`requests.blade.php`, `AccessRequestController`)

Source: the `waitlist_entries` table, written by the public `WaitlistController` (out of scope; see [Accounts, plans and invites](accounts-plans-invites.md)). A row has `email`, `plan` (slug as submitted), `social`, `message`, `user_id` (set for authenticated Pro requests, null for public Custom enquiries), `status` (`pending|approved|rejected`), `reviewed_at`, `reviewed_by` (an `Admin`). Review columns are not mass-assignable; only `markReviewed()`/`reopen()` write them.

- **Stats**: Pending, Requests (total), Last 7 days, Unique emails (`distinct email`, "one row per plan requested"), From accounts (`user_id` not null: "grantable; the rest are enquiries").
- **Filters** (GET): `search` (LIKE on email, social, message), `status` (`pending` default, `approved`, `rejected` shown as "Dismissed", `all`; unknown value falls back to pending), `plan` (built from `distinct plan` in the table; the dropdown only renders if more than one exists). Clear link when any is non-default. 25 per page, newest first. The empty state text depends on which filter hid the rows (`emptyMessage`).
- **Row**: email (mailto), account (name, station count, current plan or `Free`; "deleted account" if the FK survives a soft delete; `-` for a public enquiry), plan badge + "unknown plan" warning when the slug has no `plans` row, a status badge, "by <reviewer>, <when>" (or "a removed admin"), and for an approved row the account's current `plan_expires_at` ("until <date>" or "no end date - granted before terms existed"). Social is a link only when it contains a `.` and no space (handles like `@show` stay text); `target=_blank rel="noopener noreferrer nofollow"`. Message is `whitespace-pre-line`. "resubmitted <ago>" shows when `updated_at > created_at`.
- **Approve** (`pending` rows with an account): a `term` select (`1-week`, `2-weeks`, `1-month`, `2-months`, `3-months`; `DEFAULT_TERM = 3-months`; no open-ended option) plus a JS `confirm()`; disabled when the plan slug is unknown. Server order: invalid term -> refused (a POST with no `term` at all is taken as `DEFAULT_TERM`, `3-months`); `user_id` null -> refused ("nothing to grant"); user soft-deleted -> refused; plan slug not in `plans` -> refused; then a transaction with `lockForUpdate` that only **claims** the row (`isGrantable()` = pending with an account; stamps `approved`, `reviewed_at`, `reviewed_by`); if lost the race: "already settled". After commit: `user.plan_id = plan`, `plan_expires_at = endsAt` (overwritten, not extended), `notify(ProAccessGranted)` (queued). The plan write is outside the transaction on purpose (the observer telnets to containers with a per-container timeout). A failure between the claim and the plan write leaves `approved` with an unchanged account; the documented fix is revoke then approve.
- **Dismiss**: refuses an approved row ("revoke instead"); otherwise `markReviewed(rejected)` (no lock and no account check, so it also works on a row that is already dismissed and re-stamps the reviewer). Revoke on a non-approved row is refused with "nothing to revoke". Nothing is emailed. Used to close a Custom enquiry answered by email.
- **Revoke** (approved rows, JS confirm): needs a plan with slug `free`; locks and `reopen()`s the entry back to **pending** (not rejected), then sets the user's `plan_id` to Free and `plan_expires_at = null`. Nothing is emailed. Existing stations and tracks are kept; caps are only checked on create/start, never retroactively.
- **Reopen** (rejected rows only): back to pending, clears reviewer.
- Only `feature`/`upgrade` write an explicit `activity()` entry with the admin as causer; approve/dismiss/revoke/reopen rely on `reviewed_by` and on `User`'s own `LogsActivity` row for the `plan_id` change (which has no causer).

### Create account (`accounts.blade.php`, `AccountController`, `StoreAccountRequest`)

Hand-provisioning for a deal agreed off-platform. Fields: `name` (required, max 255), `email` (required, email, max 255, unique in `users`, which includes soft-deleted rows; `withValidator` rewrites the message to "belongs to a closed account" or "already has an account. Move it onto a plan from Access requests instead"), `password` (required, min 8, a **visible text input**, no confirmation), `plan_id` (required, exists in `plans`; options show max stations, max listeners, AutoDJ on/off, watermarked; preselects the `pro` plan by slug or the lowest id), `station_name` (required, max 100).

In one DB transaction it creates a `User` via `forceFill` with `email_verified_at = created_at = updated_at = now()` (so the account is verified and passes the `verified` middleware immediately) and `plan_id`, then `$user->stations()->create(['name' => ...])` (slug, mount and source password derived in `Station::booted`; `desired_state` defaults to stopped, so no container starts). It does **not** set `plan_expires_at` (a provisioned paid plan never expires) and sends no mail (no verification, welcome or plan notice). It writes an activity entry `provisioned account`. The redirect flashes `provisioned` (email, plaintext password, plan name, station name, slug) which the page shows once in a green card above the form.

### Invites (`invites.blade.php`, `InviteController`, `StoreInviteRequest`, `Invite`)

Mint, optionally email, list, resend, close. Redemption (sign-up or `POST /api/invites/redeem`) is `InviteRedemption` and is documented in [Accounts, plans and invites](accounts-plans-invites.md); this section is the admin half.

Mint form fields:

| Field | Rules | Meaning |
|---|---|---|
| `label` | nullable, max 255 | private note; also seeds the code |
| `email` | nullable, email, max 255 | if present, the link is emailed on create |
| `recipient_name` | nullable, max 255 | goes in the greeting ("Hi Rae,") |
| `personal_note` | nullable, max 500 | one paragraph under the greeting |
| `code` | nullable, 6-40, `^[A-Za-z0-9-]+$`, unique in `invites.code` | typed code; else built from label + plan, else random |
| `plan_id` | required, exists | plan granted (default Pro) |
| `duration_days` | nullable int 1-3650 | how long the plan lasts after redeeming; blank = no end date |
| `max_uses` | required int 1-10000 (form default 1) | redemptions allowed |
| `link_expires_in_days` | nullable int 1-365 | when the link itself stops working (`expires_at`), separate from the plan duration |

Code generation: typed code as-is (never lowercased); else `Invite::codeFor(label, plan)` = the label's alphanumeric runs joined by `-` + `-GoCast-<Plan>`, truncated to fit 40 chars, with `-2`, `-3` on collision; if the label yields nothing, `generateCode()` = 20 random alphanumerics (`CODE_LENGTH`). The unique check is case-insensitive under MySQL's default collation. The link is `FRONTEND_URL/auth/register?invite=<code>`.

Actions: `store` creates the row (`created_by` = admin), logs `minted invite`, then if `email` is present calls `deliver()`; `send` (POST `{invite}/send`, required `email`) refuses a closed link, and otherwise delivers (overwrites `email` with the new address, sets `sent_at`, logs `sent invite`); `revoke` sets `expires_at = now()` (row kept, accounts already brought in keep their plan and `invite_id`), logs `revoked invite`, refuses an already-closed one. `deliver()` returns false and writes nothing when `EmailSuppression::suppresses($email)`: mint then flashes that nothing was emailed and the link is still minted. Otherwise `Notification::route('mail', $email)->notify(new InviteOffer(...))` (queued), `sent_at = now()` even though delivery is asynchronous. The address is **not** bound to the invite: redemption never checks it.

Page: after mint, a green card (flashed `minted`) with the link and a Copy button (`navigator.clipboard`, falls back to selected text). Stats: Open (`redeemable()`: uses < max_uses and not expired), Redeemed (`uses > 0`), Minted. Table (25/page): label, sent-to (mailto, recipient name, "unsubscribed" badge, "emailed <ago>" / "not emailed", and an inline Send/Resend form for redeemable links), link + status badge (`closed` if expired, `redeemed` if exhausted, else `open` with expiry), grants (plan, "for N days" / "no end date"), used `uses / max_uses`, redeemed-by list (name, plan, plan expiry, when), minted (ago, by `creator->name` or "a removed admin"), Close button (JS confirm) for redeemable rows only. A revoked link that was already fully used reads "closed" because the expiry check runs first.

### Announcements (`announcements.blade.php`, `announcement-preview.blade.php`, `AnnouncementController`, `StoreAnnouncementRequest`, `AnnouncementSender`)

Writes one `ProductUpdate` database notification into the bell of **every** account. Nothing is emailed. It is not queued (`ProductUpdate` has no `ShouldQueue`) so each row exists before the next iteration. No draft, schedule or undo.

Form fields (all validated by `StoreAnnouncementRequest`, shared by preview and send):

| Field | Rules |
|---|---|
| `headline` | required, max 120 |
| `summary` | nullable, max 300 |
| `points` | textarea, one per line; split on newlines, trimmed, blank lines dropped in `prepareForValidation`; max 6 items, each max 200. With no points the notification is `link` mode; with points it is `expand` mode |
| `detail_heading` | nullable, max 60; blank -> "What's new"; ignored without points |
| `url` | nullable, max 500, either `https?://...` or a `/path`; a path is resolved against `FRONTEND_URL` by `BellPayload::appUrl`; blank -> `/dashboard` |
| `link_label` | nullable, max 40; default "Take a look", or "Open your dashboard" when no url |
| `level` | required, one of `info|success|warning|error` (colours the icon only) |
| `icon` | nullable, max 40, `^[a-z0-9-]+$`; blank -> `megaphone` (unknown icons render as a bell in the client) |
| `key` | required, max 64, `ProductUpdate::KEY_PATTERN` (lower-case letters, digits, dots, dashes); blank -> `YYYY-MM-<slug of headline (48 chars)>` |

Flow: `preview` builds `ProductUpdate::fromArray`, renders `toDatabase(new stdClass)` (what is stored, defaults included), shows the row as the bell clamps it (2 lines), the expanded dialog, the URL/key/level/icon, and calls `AnnouncementSender::plan()` for `audience` (all non-deleted users), `skipped` (users already holding this key, intersected with the current audience) and `pending`. A yellow alert shows when any are skipped, and the Send button is disabled at `pending === 0`. The preview form carries the fields as hidden inputs to `store`. The send button disables itself on submit. `store`: `set_time_limit(0)`; writes the activity entry `sent announcement` **before** sending; calls `AnnouncementSender::send()`; then fills `sent`/`skipped` into the entry's properties. Flash: "Sent to N accounts[, skipped M who already had it]", or "Nothing sent - every account already has [key]".

`AnnouncementSender`: holds `Cache::lock('announcement:<key>', 900)` (non-blocking; a second send of the same key throws `AnnouncementInProgressException`, the controller retitles the activity entry "announcement send refused, already running" and flashes the message). Inside the lock it takes the already-notified set (one `LIKE '%"announcement":"<key>"%'` over `notifications` where `type = ProductUpdate` and notifiable is a `user`) and walks `User::query()->lazyById(500)`, calling `$user->notify($update)` for those not in the set. **Every non-deleted account, including unverified ones,** is in the audience (the notification endpoints sit outside `verified`). An exception mid-run leaves earlier rows written; re-running with the same key resumes. Duplicate protection depends on notification rows still existing: `notifications:prune` (05:00 nightly) deletes rows older than `NOTIFICATION_RETENTION_DAYS` (default 90), after which a reused key sends again; the form text says so.

"Already sent" sidebar: the 20 most recent groups of `notifications` rows of type `ProductUpdate`, grouped by identical `data` (`GROUP BY data`), with recipient count and last sent time. Not paginated, and older ones vanish with retention.

CLI twin: `php artisan notifications:announce {file} {--dry-run} {--force}` (`SendAnnouncement`) reads a JSON file, prints the bell preview, counts, asks to confirm ("It cannot be undone") unless `--force`, shows a progress bar, and calls the same sender (the same lock applies, so a CLI and a panel send of one key cannot overlap). There is no schedule entry for it.

### Send email (`emails.blade.php`, `email-preview.blade.php`, `RawEmailController`, `SendRawEmailRequest`, `RawEmailSender`, `RawEmail`, `RawEmailDraft`)

One-off mail through the GoCast HTML/text template (`emails.raw`, `emails.raw-text`) to an explicit list.

| Field | Rules |
|---|---|
| `recipients` | textarea split on whitespace/commas/semicolons, trimmed, de-duplicated case-insensitively; required, 1 to `MAX_RECIPIENTS = 100`, each a valid email max 255 |
| `subject` | required, max 150 |
| `greeting` | nullable, max 120; typed once, no merge fields |
| `headline` | nullable, max 200 |
| `body` | required, max 20000; Markdown (bold, links, lists, tables); raw HTML escaped, unsafe links and images not rendered (`EmailMarkdown`: `html_input: escape`, `allow_unsafe_links: false`, images render as their alt text only, table extension on); a body that renders to nothing is rejected (`RawEmailDraft`) |
| `sign_off` | nullable, max 120; default "— The GoCast team" with an em dash (`RawEmailDraft::SIGN_OFF`) |
| `preheader` | nullable, max 150; default = summary of the rendered body (140 chars) |
| `cta_url` / `cta_label` | absolute `http(s)` url max 2048 / max 40, each `required_with` the other; both or neither |
| `marketing` | checkbox ("This is outreach, not a reply"); unchecked by default |

Preview shows the rendered HTML in a sandboxed `srcdoc` iframe, the preheader, the plain-text version, the recipient list, and any suppressed addresses. For marketing drafts the footer link in the preview is a **real signed unsubscribe URL for the first recipient** (hence the sandbox). Send re-validates and calls `RawEmailSender::send()`: **one queued `RawEmail` notification per address** (`Notification::route('mail', $email)`), never a multi-recipient message. The `marketing` flag decides three things together: whether `EmailSuppression` is consulted (marketing skips suppressed addresses; operational sends to everyone), whether the footer has an unsubscribe link, and whether `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers are set. The suppression set is recomputed at send time. Records an activity entry `sent email` (also when every address was suppressed and nothing queued) with `subject`, `marketing`, `sent` (the addresses) and `suppressed`; the body is never stored. Flash: "Queued for X", "Queued for N addresses. Skipped M who have unsubscribed", or "Nothing sent - ...". "Already sent" sidebar: the last 15 `sent email` activity rows (subject, recipients in a `<details>` when more than one, when, by, `outreach` badge, skipped count).

### Watermark clips (`watermark.blade.php`, `WatermarkClipController`, `WatermarkClipLibrary`)

Admin side only; audio behaviour is in [Watermark clips](watermark-clips.md). The page lists files in `config('liquidsoap.system_dir')` (`LIQUIDSOAP_SYSTEM_DIR`, default `/var/gocast/system`) filtered to `mp3, ogg, oga, opus, flac, wav, m4a, aac`, with duration (getID3), size and mtime, and read-only settings (feature flag `LIQUIDSOAP_WATERMARK_ENABLED` default true, interval `LIQUIDSOAP_WATERMARK_INTERVAL` 600 s, duck 0.15, fade 1.0 s, max clip 5 MB), the count of stations whose owner's plan has `watermark_enabled` and how many are powered on. Warnings: feature off, no clips (with the marked-station count), directory not writable.

- **Upload** (`clip`, required file, mimes list above, `max` = `watermark_clip_max_bytes / 1024` KB): stored under a slugged, never-overwriting name (`-2`, `-3` suffix), chmod 0644, then `ReloadWatermarkClips::dispatch()`. Flash: "Added <name>. Running stations will pick it up shortly." Only top-level files of the directory are listed; the stored extension comes from the client's original file name, checked by the `mimes` rule.
- **Remove** (`name`, required string max 255; JS confirm): `resolve()` takes `basename`, requires an allowed extension and that the `realpath` is inside the directory, then unlinks; missing -> flashed `error` "That clip is no longer there"; else dispatches the reload.
- `ReloadWatermarkClips` (queued): does nothing if the feature is off; otherwise sends telnet `watermark.reload` to every `desired_state = running` station, logging and skipping failures. Interval/duck changes are config only (not editable here).

## Telegram operator alerts

Not a page, but part of the operator surface. `AdminTelegram` is called from model `created`/`updated` hooks registered in `AppServiceProvider`, so every path that makes the row is covered (admin provisioning included). Messages (HTML parse mode, values escaped; the model hooks are `created` for `User`, `Station`, `StreamSession` and `WaitlistEntry`, plus `updated` for `WaitlistEntry`): new registration (`User::created`; "via Google" if `google_id`, "invite" if `invite_id`), new access request / updated request (`WaitlistEntry::created` / `updated`; only when the entry is `pending` and, on update, `social`/`message`/`status` changed, so an admin **Revoke** or **Reopen** (which set the row back to pending) also posts an "Updated ... access request" alert; includes a Review link to `admin.requests.index`), new station (`Station::created`; link to `admin.stations.show`), every broadcast start (`StreamSession::created`; source type and client, Listen and Admin links; deliberately unthrottled), and inbound email (`emailReceived`, called by `Webhooks/Resend/EmailReceived` after it fetches the message from the Resend API; shows from/to/subject, failed SPF/DKIM-style checks, attachment filenames, body truncated to 3000 chars). Inert when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ADMIN_CHAT_ID` is blank (`services.telegram.*`); otherwise dispatches `SendAdminTelegramAlert` `afterCommit()` (3 tries, backoff 10 s then 60 s, HTTP timeout 10 s, throws on failure). Needs a queue worker. See [Notifications and email](notifications-and-email.md).

## Audit trail

`activity()` entries written explicitly with the admin as causer (needed because `LogsActivity` resolves the causer from the default guard): `featured station`/`unfeatured station`, `upgraded account`, `provisioned account`, `minted invite`, `sent invite`, `revoked invite`, `sent announcement`, `sent email`. `Admin` and `Invite` also log their own attribute changes; `Invite` logs `code, plan_id, duration_days, label, email, recipient_name, max_uses, uses, expires_at, sent_at`. `StationEvent::resolveCauser()` checks `admin` first, so events recorded during an admin request get `source = admin`. Not logged with an admin causer: approve, dismiss, revoke and reopen of access requests (only `waitlist_entries.reviewed_by` and the causer-less `User` plan change), watermark upload/removal, logout.

## Surfaces

- **This panel** is the surface. There is no admin UI in the Next.js client or the mobile app.
- Public site link-outs: station name -> timeline; slug -> `FRONTEND_URL/station/{slug}`; invite links -> `FRONTEND_URL/auth/register?invite=`; announcement URLs point at client routes such as `/dashboard/station/settings`, which exist as a catch-all (`client/app/dashboard/station/[[...path]]`) that resolves the viewer's own station.
- Dashboard bell: receives `ProductUpdate` and `ProAccessGranted` rows (see [Realtime events](realtime-events.md) and [Notifications and email](notifications-and-email.md)).

## Gaps and traps

1. **Two-step confirmation is not enforced server-side.** `POST /admin/announcements`, `/admin/emails` and `/admin/stations/{station}/upgrade` act without a prior preview. Only client-side disabling (`upgrade-preview` JS, announcement button) protects against a stale send.
2. **Sending email has no double-submit guard or lock.** The announcement send disables its button and holds a cache lock; the email `Send it` button does neither, so a double click queues every message twice. The upgrade "Upgrade and email" button disables itself, but nothing server-side prevents a second POST (a second email and activity row).
3. **Provisioning still fires Telegram alerts.** The controller docblock and page say nothing is sent, and it sends no mail, but `User::created` and `Station::created` hooks in `AppServiceProvider` post "New registration" and "New station" alerts to the admin chat if Telegram is configured.
4. **Provisioned accounts on a paid plan never expire** (`plan_expires_at` is not set) and the plaintext password lives in the session store (database/redis) until the next request reads the flash; the password input is also repopulated via `old('password')` on validation failure.
5. **The Custom-plan flows and paid plans without a `plans` row.** Requests whose `plan` slug has no row cannot be approved (button disabled, server refuses). The app files two slugs: `pro` (authenticated, `user_id` set) and `custom` (the public enquiry form, `StoreWaitlistRequest::PUBLIC_PLANS`, no account). No migration in `database/` creates a `custom` plan row (only `free` and `pro`), so unless one was added by hand every Custom enquiry shows "unknown plan" and has no Approve button anyway (see [Accounts, plans and invites](accounts-plans-invites.md)).
6. **Revoke sends no email** to the account; the account silently goes to Free. Expiry via `plans:expire` does email (`PlanExpired`), revoke does not.
7. **Approve is not atomic across the plan write.** Claim commits, then the plan write and notify run. A crash between leaves an `approved` entry on an unchanged account (fix: revoke, approve). Revoke has the mirror gap.
8. **`ProAccessGranted` emails are queued**; nothing in the panel says so. If no queue worker runs, "has been emailed" is false while the plan change is already saved. The flash text is written as if delivery were certain. Same for invites (`sent_at` is stamped at queue time) and raw emails ("Queued for ...").
9. **Timeline collapse is per page**, so runs split across pages; the "Last 24 hours" counts are exact.
10. **Soft-deleted stations and owners:** the stations list excludes trashed stations (their timeline is only reachable by URL), shows `-` and no Upgrade button when the owner is soft-deleted, and `feature`/`upgrade` 404 for trashed stations even though the timeline opens.
11. **Search wildcards** (`%`, `_`) in the stations/requests search box are not escaped.
12. **Admin session cookie scope:** `.env.example` sets `SESSION_DOMAIN=.gocast.fm`, so the admin session cookie is sent to every subdomain of gocast.fm. It is `http_only` and lax; `SESSION_SECURE_COOKIE` is unset in `.env.example`, so `secure` is only on if configured.
13. **No roles, no per-action throttle, no 2FA.** Login is throttled 5/min per email+IP; every other admin route is unthrottled. `admin:reset-password` does not kill existing sessions, only remember-me tokens.
14. **Untrusted text in inline JS.** `requests.blade.php` puts `{{ $entry->email }}` and `{{ $entry->plan }}` inside `onsubmit="return confirm('...')"` strings. Blade HTML-escapes, but the browser decodes the attribute before running the script, so a quote in the value breaks out of the JS string. The email comes from the public access-request form (validated as an email, which permits `'`), so this is a possible stored-XSS vector against an admin session; unverified in a browser, and no test covers it. `watermark.blade.php` does the same with clip file names (slugged on upload, but files can be dropped in over SSH).
15. **Docblock/copy drift.** The accounts view (not the controller) says a lost password needs the sign-in "Forgot password" flow; that is the customer flow (see [Auth](auth.md)), not this panel's. The `AccountController` docblock claims no `created` observer exists on `User`/`Station` (true only for model observers; the `AppServiceProvider` hooks in gap 3 do exist). The `AccessRequestController` docblock says the only effect of a grant on containers is the watermark flag, but `UserObserver::updated` also pushes jingle settings. `ProAccessGranted` docblock calls `max_stations` stale; only listener cap and AutoDJ are quoted in copy.
16. **Announcement history is a text-column `GROUP BY data`** capped at 20 groups and bounded by notification retention; older announcements disappear from "Already sent" and their keys become reusable (a second send of the same key would reach everyone again).
17. **Announcement key check is a `LIKE` on serialized JSON** (`'%"announcement":"<key>"%'`), made safe only by `KEY_PATTERN`. Any change that widens the pattern or the payload shape breaks the duplicate guard.
18. **`StoreWatermarkClipRequest::authorize()` returns `true`** (unlike the other requests); it is protected only because the route group is `auth:admin`.
19. **Announcement and email history sidebars** for emails read the activity log; anyone pruning `activity_log` empties them.
20. **Some refusals are silent.** The inline resend form on Invites (`POST invites/{invite}/send`, `validate()` on `email`) and `DELETE /admin/watermark` (`validate()` on `name`) fail with a redirect carrying the error bag, which the layout does not render and those pages do not print; the browser's `required`/`type=email` normally prevents it.
21. **Revoke and Reopen page the operator's own Telegram** as "Updated ... access request" (see Telegram alerts), because they set the row back to `pending`.
22. **Stations list "Live" and "Powered on" are intent/DB state**, not container health (the tile text says so). A station can read "powered on" with a dead container.

## Tests

`api/tests/Feature/Admin/`: `AuthenticationTest` (login, wrong password, customer refused, 5-attempt lockout, redirects, logout), `StationIndexTest` (does not cover the Browser/IP columns), `StationFeatureTest`, `StationTimelineTest` (order, isolation, collapse, filters, trashed station), `StationUpgradeTest`, `AccessRequestIndexTest`, `AccessRequestReviewTest`, `AccountProvisionTest` (verified email, stopped station, no mail, password shown once), `InviteTest`, `AnnouncementTest` (preview writes nothing, dedupe, lock, history grouping), `RawEmailTest`, `WatermarkClipTest`. Also `tests/Feature/SendAnnouncementTest.php` (sender and command), `tests/Feature/AdminTelegramAlertTest.php`, `tests/Feature/Console/AdminResetPasswordCommandTest.php`. There is no test for `admin:create`, for `plans:expire` interacting with an admin upgrade, or for the inline-JS quoting issue (gap 14).

## History

Plans and handoffs (background, not the spec): announcements (`docs/announcements/`), invite links and the admin upgrade button, station event log, encoder/inbound-email Telegram alert. The `admins` table was dropped and recreated (`2026_08_17_120000_drop_admins_table.php`, `2026_08_18_120000_create_admins_table.php`).
