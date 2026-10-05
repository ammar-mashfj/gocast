---
feature: Accounts, plans, Pro access, invites and the waitlist
verified: 2026-10-04 against e145a37 plus uncommitted work (named route throttles, session-expiry redirect)
sources:
  - api/app/Http/Controllers/AccountController.php
  - api/app/Http/Controllers/InviteController.php
  - api/app/Http/Controllers/WaitlistController.php
  - api/app/Http/Controllers/UnsubscribeController.php
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Http/Controllers/EmailVerificationController.php
  - api/app/Http/Controllers/AudienceController.php
  - api/app/Http/Controllers/StreamKeyController.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Controllers/PublicEmbedController.php
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Controllers/Admin/AccessRequestController.php
  - api/app/Http/Controllers/Admin/InviteController.php
  - api/app/Http/Controllers/Admin/AccountController.php
  - api/app/Http/Controllers/Admin/StationController.php
  - api/app/Http/Requests/RegisterRequest.php
  - api/app/Http/Requests/StoreWaitlistRequest.php
  - api/app/Http/Requests/StoreProAccessRequest.php
  - api/app/Http/Requests/UpdateProfileRequest.php
  - api/app/Http/Requests/UpdatePasswordRequest.php
  - api/app/Http/Requests/StoreStationRequest.php
  - api/app/Http/Requests/Admin/StoreInviteRequest.php
  - api/app/Http/Requests/Admin/StoreAccountRequest.php
  - api/app/Http/Controllers/TrackController.php
  - api/app/Services/AudienceReport.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Models/Station.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Models/User.php
  - api/app/Models/Plan.php
  - api/app/Models/Invite.php
  - api/app/Models/WaitlistEntry.php
  - api/app/Models/EmailSuppression.php
  - api/app/Services/InviteRedemption.php
  - api/app/Services/InviteException.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/AutoDjScheduler.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Console/Commands/ExpirePlans.php
  - api/app/Console/Commands/NudgeInactiveBroadcasters.php
  - api/app/Notifications/InviteOffer.php
  - api/app/Notifications/InviteRedeemed.php
  - api/app/Notifications/ProAccessGranted.php
  - api/app/Notifications/PlanExpired.php
  - api/app/Notifications/InactiveBroadcasterNudge.php
  - api/app/Notifications/WelcomeNotification.php
  - api/app/Observers/UserObserver.php
  - api/app/Providers/AppServiceProvider.php
  - api/routes/api.php
  - api/routes/console.php
  - api/routes/web.php
  - api/bootstrap/app.php
  - api/config/liquidsoap.php
  - api/database/migrations/2026_04_16_131050_create_plans_table.php
  - api/database/migrations/2026_04_16_131100_add_plan_id_to_users_and_drop_plan_from_stations.php
  - api/database/migrations/2026_08_15_115900_add_feature_columns_to_plans_table.php
  - api/database/migrations/2026_08_18_100000_add_watermark_to_plans_table.php
  - api/database/migrations/2026_08_29_231700_add_silent_since_to_stations_and_drop_idle_stop_hours.php
  - api/database/migrations/2026_09_01_100000_add_analytics_days_to_plans_table.php
  - api/database/migrations/2026_09_02_100000_raise_plan_listener_caps.php
  - api/database/migrations/2026_09_08_100000_add_embed_enabled_to_plans_table.php
  - api/database/migrations/2026_09_15_140000_add_encoder_enabled_to_plans_table.php
  - api/database/migrations/2026_04_18_114446_create_waitlist_entries_table.php
  - api/database/migrations/2026_08_30_120000_add_message_and_social_to_waitlist_entries_table.php
  - api/database/migrations/2026_08_30_130000_add_unique_email_plan_to_waitlist_entries_table.php
  - api/database/migrations/2026_08_31_100000_add_user_id_to_waitlist_entries_table.php
  - api/database/migrations/2026_08_31_120000_add_review_status_to_waitlist_entries_table.php
  - api/database/migrations/2026_09_09_100000_create_invites_table.php
  - api/database/migrations/2026_09_09_100100_add_invite_and_plan_expiry_to_users_table.php
  - api/database/migrations/2026_09_15_120000_add_email_and_sent_at_to_invites_table.php
  - api/database/migrations/2026_09_15_130000_add_recipient_fields_to_invites_table.php
  - api/database/migrations/2026_09_15_130100_create_email_suppressions_table.php
  - api/database/migrations/0001_01_01_000000_create_users_table.php
  - client/interfaces/Plan.ts
  - client/contexts/AccountContext.tsx
  - client/contexts/ProRequestContext.tsx
  - client/components/ProAccessDialog.tsx
  - client/app/dashboard/settings/page.tsx
  - client/app/dashboard/settings/layout.tsx
  - client/app/auth/register/page.tsx
  - client/lib/google-auth.ts
  - client/lib/station-server.ts
  - client/components/homepage/WaitlistButton.tsx
  - client/components/homepage/PricingSection.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/actions/auth.ts
  - mobile/src/app/account.tsx
  - client/components/dashboard/ProRequestDialog.tsx
  - client/hooks/useAccessRequest.ts
  - client/components/dashboard/account/PlanCard.tsx
fingerprint: a0b7bc3ca846c251
---

# Accounts, plans, Pro access, invites, waitlist

An account is a `users` row with one `plan_id`. Everything a plan gives or withholds is a column on the `plans` row (or a hard-coded default in code), read through five small helpers on `User` and two direct reads. There are only two real plans, **Free** and **Pro**, both created by a migration (not a seeder). Nobody buys anything: there is no billing code. Pro is handed out by an admin, either by approving a request from the dashboard or by minting an invite link, and **every hand-out except a no-expiry invite or a no-end admin upgrade has an end date** that `plans:expire` enforces hourly.

The thing people get wrong: **`plans.max_listeners` is never enforced.** It is printed in the UI and in emails, and nothing refuses the 101st listener on Free. The second is that a plan change never restarts a container; it is pushed live, or picked up at the next track boundary (see the gate table).

Boundaries: sign-in, tokens, email verification and password reset are in [auth](auth.md). The admin screens that grant and revoke are in [admin-panel](admin-panel.md); this doc describes what they write. How notifications are rendered and delivered is in [notifications-and-email](notifications-and-email.md).

## Plans: exact values

Source of truth is the migration chain, not a seeder (`database/seeders/DatabaseSeeder.php` seeds one test user and no plans). Values below are what a fresh `migrate` produces. A production database can have been edited by hand (`Plan` is `$guarded = []` and logs activity), so verify against the table when it matters.

| Column | Free (id 1) | Pro (id 2) | Set by |
|---|---|---|---|
| `slug` / `name` | `free` / `Free` | `pro` / `Pro` | `2026_04_16_131050_create_plans_table` |
| `max_stations` | 1 | 5 | same |
| `max_listeners` | 100 | 1000 | created as 25 / 500, raised by `2026_09_02_100000_raise_plan_listener_caps` |
| `max_running_stations` | 1 | 5 | `2026_08_15_115900_add_feature_columns_to_plans_table` |
| `autodj_enabled` | false | true | same |
| `watermark_enabled` | true | false (column default) | `2026_08_18_100000_add_watermark_to_plans_table` |
| `analytics_days` | 0 | 90 | `2026_09_01_100000_add_analytics_days_to_plans_table` |
| `embed_enabled` | false | true | `2026_09_08_100000_add_embed_enabled_to_plans_table` |
| `encoder_enabled` | false | true | `2026_09_15_140000_add_encoder_enabled_to_plans_table` |

- Any other slug, if an admin inserts one, was backfilled by those migrations as: autodj/embed/encoder true, `analytics_days` 90, `max_running_stations = max_stations`. `PlanFactory` (tests) randomises `max_stations` 1 to 10 and `max_listeners` 50 to 1000.
- `idle_stop_hours` existed and is dropped (`2026_08_29_231700_...`). Nothing reads it.
- `users.plan_id` is `DEFAULT 1` with a foreign key. New accounts are Free only because row id 1 is Free. `AuthController::register` and Google sign-up never set `plan_id`; the column default does. If plan id 1 were ever not Free, every signup would land on it.
- A user with no plan row is treated as **free** everywhere (`$this->plan?->x ?? false`), with the one exception `analytics`/`max_listeners` display which coalesce to 0.
- `Plan::isFree()` is `slug === 'free'`. `ExpirePlans`, `InviteRedemption`, `NudgeInactiveBroadcasters` and `AccessRequestController::revoke` all find Free by that slug.
- Client-side price: `PRO_PRICE_USD = 15` and `PRO_AVAILABLE = false` in `client/interfaces/Plan.ts`. No server number exists. `PRO_AVAILABLE` is read by `AutoDjUpsell.tsx` and `AudienceUpsell.tsx` (outside this doc's sources) to word the CTA.
- Marketing copy (`PricingSection.tsx`) claims Free "100 concurrent listeners" and Pro "1,000 concurrent listeners", "3 GB" library, "Priority support". The 3 GB is `LIQUIDSOAP_STATION_STORAGE_BYTES` default (`config/liquidsoap.php:716`), a per-station cap that is **the same on every plan**, not a plan column.

## Every place a plan is checked

Nothing else in `api/app` reads a plan. If you add a gate, add it here.

| Gate | Plan field | Enforced at | Behaviour on refusal |
|---|---|---|---|
| Create a station | `max_stations` | `StoreStationRequest::authorize()` (`stations()->count() < plan->max_stations`; soft-deleted stations are not counted) | FormRequest returns the framework default 403 |
| Put a second station on air | `max_running_stations` | `StationLifecycleService::assertCanRunAnother` (line ~291, `?? 1` if no plan). Counts stations with `desired_state = running`, excluding this one | `StationLifecycleException::concurrencyLimit` ("Your plan allows N stations on air at a time...") |
| Upload to the AutoDJ library | `autodj_enabled` | `TrackController` (`assertAutoDjEnabled`, line ~102) | `autodj_not_available` |
| Play the rotation and jingles | `autodj_enabled` | `AutoDjScheduler::next()` (first check, line ~97), returns null before touching the cursor, the jingle rotation or the clock (it only clears `autodj_queued_*`) | `/internal/next-track` answers 204; music and jingles stop at the next track boundary. Jingles are chosen in the same call, so they need no separate gate |
| "Has playable rotation" for auto-stop | `autodj_enabled` | `StationAudioPolicy::hasPlayableRotation` via `StationLifecycleService::autoDjEnabled` | a free owner is never "playable", so the sweeper can power the station down |
| AutoDJ slots (Schedule) | `autodj_enabled` | only at playback, through the same `next()` gate; the PUT is not gated (see [schedule](schedule.md)) | slots save but never play |
| Playlists | none | `PlaylistController` is deliberately not plan-gated | UI locks it, API does not |
| Jingle lists | none | `JingleListController` / `JingleListPolicy` are not plan-gated (ownership only); jingle uploads go through the `TrackController` upload gate above | UI locks it, API does not; lists save but never play |
| Audience history | `analytics_days` | `AudienceController::__invoke` (line 48) | `<= 0` returns `locked: true` with only live count and all-time peak; else `plan_days` is first clamped to `analytics.retention_days` (`AudienceReport::clampWindow`, default 90), and the window is `min(requested, plan_days)` when `requested` is 7, 30 or 90 (`WINDOWS`), otherwise `plan_days` |
| Embed player | `embed_enabled` | `PublicEmbedController::show` (`abort_unless(canEmbed(), 404)`) | 404 to the public, so a pasted snippet goes dark on downgrade |
| Stream key / encoder | `encoder_enabled` | `StreamKeyController::rotate` (403 `encoder_not_available`); `HarborAuthController` line ~112 checks on every connection, refuses with reason `plan`; `StationResource` withholds `encoder` for a locked owner | encoder stops at next reconnect. The browser studio is not gated |
| Watermark | `watermark_enabled` AND env `LIQUIDSOAP_WATERMARK_ENABLED` | `User::watermarked()`, read by `LiquidsoapSupervisor` and `StationResource` | see [watermark-clips](watermark-clips.md) |
| Listener cap | `max_listeners` | **nowhere** | display only |

Helpers on `User`: `canUseAutoDj()`, `canEmbed()`, `canUseEncoder()`, `watermarked()` (all `?? false` on a missing plan), `runningStationsCount()` (counts intent; is not read by the gate, which queries directly).

### What a plan change does live

`UserObserver::updated` fires only when `plan_id` was changed (`wasChanged('plan_id')`); a change to `plan_expires_at` alone does nothing. It first `unsetRelation('plan')` (a loaded relation would still hold the old plan), then for each **running** station calls `LiquidsoapSupervisor::applyWatermarkSettings` in a try/catch that logs and swallows errors. Stopped stations pick up the new values when they next start. Rotation, jingles, encoder, embed and analytics need no push: they are read on each request (jingles are decided by `AutoDjScheduler::next()` at every track boundary).

`UserObserver::deleting` (account deletion): a force delete force-deletes every station including trashed ones; a soft delete soft-deletes each station individually (a mass delete would skip `StationObserver::deleting` and orphan containers).

## What every plan writer does

`plan_id` and `plan_expires_at` are written with `forceFill` in four places. `User`'s `#[Fillable]` list **does** include `plan_id` (comments in `InviteRedemption` say it does not), but no request path passes it: `RegisterRequest`, `UpdateProfileRequest` etc. use `validated()` with a fixed field list.

| Writer | Plan | Expiry | Notification | Where |
|---|---|---|---|---|
| Invite redeemed | invite's plan | `now + duration_days`, or null if the invite has no duration | `InviteRedeemed` (mail + bell) | `InviteRedemption::redeem` |
| Admin approves a request | the entry's `plan` slug | always set: 1 week, 2 weeks, 1/2/3 months (default 3 months) via `AccessRequestController::TERMS` | `ProAccessGranted` | `Admin/AccessRequestController::approve` |
| Admin upgrades from a station page | any non-free plan | the same terms, or `none` (no end) | `ProAccessGranted` with a required note (max 2000) | `Admin/StationController::upgrade` |
| Admin provisions an account | chosen `plan_id` (`StoreAccountRequest`: name, unique email, password min 8, `station_name` max 100) | not set | none; account is created already verified, with a station, in one transaction. Ignores `max_stations`; the password is shown once in a flash | `Admin/AccountController::store` |
| Admin revokes an approved request | Free | null | none | `AccessRequestController::revoke` |
| `plans:expire` | Free | null | `PlanExpired` (mail + bell) | `Console/ExpirePlans` |

The `ExpirePlans` docblock says `plan_expires_at` "is set only by InviteRedemption today". That is stale: three writers set it.

## Invites

**Model** (`invites` table; `App\Models\Invite`). Columns: `code` (unique, 40 chars), `plan_id`, `duration_days` (null = open-ended plan), `label`, `email`, `recipient_name`, `personal_note`, `max_uses` (default 1), `uses` (default 0), `expires_at` (link deadline, null = never), `sent_at`, `created_by` (admin, null on admin delete). `uses` is not mass-assignable; only `InviteRedemption` writes it. Users carry `invite_id` (null on invite delete) and `plan_expires_at` (indexed).

**Minting** (admin only; `Admin/InviteController::store`, validated by `StoreInviteRequest`): `code` optional, 6 to 40 chars of `[A-Za-z0-9-]`, unique; `plan_id` required; `duration_days` 1 to 3650; `max_uses` required 1 to 10000; `link_expires_in_days` 1 to 365 (turned into `expires_at`); `personal_note` max 500; `label`, `email`, `recipient_name` max 255 (`email` must be a valid address). With no `code`, `Invite::codeFor(label, plan)` builds e.g. `DJ-Ammar-GoCast-Pro` (non-alphanumerics become hyphens, base trimmed to fit 40 with the `-GoCast-<Plan>` suffix, `-2`, `-3` on collision) and falls back to `Invite::generateCode()` (20 random chars, about 119 bits) if the label yields nothing. If an `email` is given the invite is mailed immediately. A minting and a send are logged with `activity()`.

**Sending.** `InviteOffer` goes to an `AnonymousNotifiable` (`Notification::route('mail', $email)`), queued, mail only, no bell (the recipient usually has no account). It uses the hand-built views `emails.invite` / `emails.invite-text`, subject "Your GoCast invite", and `List-Unsubscribe` plus one-click headers pointing at the signed `unsubscribe` route. The caption is computed from the invite: "N months/days of Pro, free. No card required." (whole multiples of 30 days are shown as months), or "Pro, free..." with no duration. `Admin/InviteController::deliver` skips any address in `email_suppressions` (returns false, nothing sent), otherwise sends and stamps `email` + `sent_at`. `send` (body `email` required) refuses a closed invite, and otherwise re-sends and overwrites `email`/`sent_at`. `revoke` sets `expires_at = now()`; people who already redeemed keep their plan.

**Unsubscribe** (`routes/web.php`, both verbs `signed`): GET shows the page; POST writes `EmailSuppression::record(email, invite)` (firstOrCreate on email) and returns a bare 200 for the mail-client one-click POST (`List-Unsubscribe=One-Click`; a POST with no `email` query is a 400). The suppression list only stops **invite** emails; nothing else consults it.

**Lookup** `GET /api/invites/{code}` (public, `throttle:auth`): 404 `invite_not_found` for an unknown code, else `{plan:{slug,name}, duration_days, redeemable, reason}` where `reason` is `expired`, `used` or null. It is checked in that order (expired wins over used).

**Redemption** (`InviteRedemption::redeem`, one DB transaction), in order:

1. Code not found: `invite_not_found` (404).
2. `user.invite_id` already set: `invite_already_redeemed` (422). One invite per account, ever, even after the plan expired.
3. Current plan is not Free: `invite_plan_already_held` (422). A paid or admin-granted account keeps what it has.
4. Claim with a single conditional UPDATE (`uses < max_uses` and not expired). Zero rows: `invite_expired` or `invite_used` (422), decided by re-reading.
5. `forceFill` `plan_id`, `invite_id`, `plan_expires_at`; reload `plan`.
6. If the email is already verified, send `InviteRedeemed` now. If not, nothing is sent here (see the Verified listener below).

`InviteException` (`errorCode`, message, status) is rendered by `bootstrap/app.php` as JSON `{message, code, errors:{invite_code:[message]}}` on every request, and only reported to Sentry when status is 500 or above (`dontReportWhen` drops the rest before Sentry's reporter runs).

**Three entry points:**

| Path | Behaviour on a bad code |
|---|---|
| `POST /api/auth/register` with `invite_code` (`RegisterRequest`: nullable string max 40) | The user insert and redemption share a transaction, so a dead code **rolls back the account** and the request 422s on `invite_code`. The web page then remembers the code is dead and retries without it |
| Google web callback: `GET /api/auth/google?invite=` parks the code in cookie `gocast_oauth_invite` (only if it matches `^[A-Za-z0-9-]{1,40}$`), the callback redeems it | Best effort: the account stands, and the popup message carries `invite:{applied:false,message}` |
| `POST /api/auth/google/native` (`invite`, max 40) | Same best-effort behaviour, returned in the JSON |
| `POST /api/invites/redeem` (`auth:sanctum`, outside `verified`, `throttle:10,1,invite-redeem`, body `code` max 40) | Errors as above. Response `{plan, plan_expires_at}` and message "You're on {Plan}." |

Google sign-in links an existing password account by email and then redeems, which is why steps 2 and 3 exist. The callback deletes the `gocast_oauth_invite` cookie after use.

**Verified listener** (`AppServiceProvider`, on `Illuminate\Auth\Events\Verified`): if `invite_id` is set and a plan is loaded, send `InviteRedeemed`; otherwise send `WelcomeNotification`. This is the single welcome email for a new account. Google accounts are marked verified inside `signInGoogleUser` *after* redeeming so this listener sends the one welcome.

## Waitlist and the "Request Pro" flow

`waitlist_entries`: `email`, `plan` (string, 30), `social`, `message`, `user_id` (nullable, null on user delete), `status` (`pending|approved|rejected`, default `pending`, indexed), `reviewed_at`, `reviewed_by` (admin). **Unique on (`email`, `plan`)**; the migration deleted older duplicates before adding it. `status`, `reviewed_*` are not mass-assignable (`markReviewed` and `reopen` use `forceFill`).

| Endpoint | Auth | Throttle | Body | Effect |
|---|---|---|---|---|
| `POST /api/waitlist/pro` | `auth:sanctum` (not `verified`) | global only | `social` required max 255; `message` nullable max 2000 | `WaitlistEntry::updateOrCreate(email = account email, plan = 'pro')`, stores `user_id`. Email and plan are never read from the body |
| `POST /api/waitlist` | public | `throttle:3,60,waitlist` per IP | `email` required; `plan` must be `custom` (`StoreWaitlistRequest::PUBLIC_PLANS`); `social` required; `message` | same upsert with `user_id` null |

- Resubmitting overwrites the same row. If the row was `rejected` it is reopened to `pending` (`reopen()` clears reviewer and time); an `approved` row is left alone.
- A create, or an update that changed `social`, `message` or `status`, fires an AdminTelegram alert if the row is `pending` (hooked on the model in `AppServiceProvider`, `AdminTelegram::accessRequested`; inert without a bot token). An identical resubmit changes nothing and sends nothing; a resubmit that reopens a rejected row does. The DB column `social` is nullable, but both requests require it.
- Only Pro-with-`user_id` requests are grantable (`isGrantable()`: pending and `user_id` not null). Custom enquiries can only be dismissed.
- Admin actions (see [admin-panel](admin-panel.md)): `approve` (locks the row, marks approved, writes the plan and a fixed end date, sends `ProAccessGranted`), `dismiss` (refused for an approved row), `revoke` (approved back to pending, plan to Free, no email), `reopen` (rejected to pending). Approval looks up the plan by `entry.plan`; the account's plan is written even if the user is already on a paid plan, and `invite_id` is left as is.
- **Where the form lives.** Web dashboard: `components/dashboard/ProRequestDialog.tsx` (ds kit; title "Request Pro", copy says Pro is in beta and free; a "Link to your public page" field that must contain a "."; an optional message; the account email shown read-only; amber "Request access"), mounted once by `ProRequestProvider` in the dashboard layout. Every upgrade affordance calls `useProRequest().open()` (sidebar and Account plan cards, AutoDJ/Schedule/Audience upsells, the DJ-software fold, Embed). The form's state, validation, endpoint choice and error mapping are `hooks/useAccessRequest.ts`, shared with the marketing kit's `ProAccessDialog`. `requested` is React state, reset on reload; there is no API to ask "have I already requested". The Custom card on the public pricing page and the homepage waitlist use `ProAccessDialog` (title "Request Pro access", marketing kit) with `plan="custom"`, which posts to the public endpoint with an email field. The pricing page has no Pro request button (removed on purpose). Mobile has none: its account screen's "Request Pro" opens `/dashboard` on the web.
- Error mapping (`useAccessRequest`): 401 session expired, 429 too many attempts, 422 check details, anything else generic.

## Account self-service

`AccountController` (all `auth:sanctum`, deliberately outside `verified`):

| Route | Rules |
|---|---|
| `PATCH /account/profile` | `name` (sometimes, max 255), `email` (sometimes, max 255, unique ignoring self), `current_password` required only when the email actually changes (`Rule::requiredIf`, `current_password` rule). An email change nulls `email_verified_at`, issues a fresh 6-digit code and mails the **previous** address `EmailChangedNotification` on-demand. Returns `user->fresh()` and a message |
| `PATCH /account/password` | `current_password` required only if the account has a password; `password` min 8, confirmed, different from current. Deletes every other Sanctum token, sends `PasswordChangedNotification(ip)`. Google-only accounts can set a first password this way |
| `DELETE /account` | Body `confirmation` must equal the account email (trimmed, case-insensitive); no password needed. Deletes all tokens, rewrites `email` to `deleted-{id}-{uuid}@deleted.gocast.local`, nulls `google_id`, `avatar_url`, `email_verified_at`, then soft-deletes, which soft-deletes every station through `UserObserver` |

`UserResource` (returned by `GET /user`, `login`, `register` and `google/native`, the only places the plan is exposed) returns the account plus `plan: {slug, name, autodj_enabled, analytics_days, max_listeners, embed_enabled, encoder_enabled, watermarked, expires_at}`, a flat block of answers, never the plans row. `max_stations` and `max_running_stations` are deliberately not exposed. `login` carries the same resource since 2026-09-29; mobile still re-fetches `/user` because `adoptToken` is its one session-seeding path.

## Time-limited plans: `plans:expire`

Scheduled hourly, `withoutOverlapping` (`routes/console.php`). It picks users where `plan_expires_at <= now()` with `lazyById(500)` (keyset paging, because the loop nulls the column it filters on), sets `plan_id` to Free and `plan_expires_at` to null on each, one save per user so `UserObserver` fires, then sends `PlanExpired` only if the ended plan differs from Free. Fails with an error if no `free` plan exists.

It deletes and stops nothing. Caps apply only when creating or starting, so a downgraded account keeps its station and library. The visible effects: rotation and jingles stop at the next track boundary, uploads and slot playback are refused, the encoder key stops working on reconnect, the embed 404s, audience history locks, and a second running station cannot be started. `PlanExpired` copy promises the station and uploads are untouched, and says the AutoDJ library "no longer accepts new uploads" only when the ended plan had AutoDJ and Free does not.

## Notifications owned by this feature

All except `InviteOffer` extend `BellNotification` (bell row plus an extra `mail` channel via `alsoVia`) and are queued. Rendering and delivery are in [notifications-and-email](notifications-and-email.md).

| Class | Trigger | Content notes |
|---|---|---|
| `WelcomeNotification` | Verified event, account has no invite | "Your GoCast account is ready", link to create a station |
| `InviteRedeemed(plan, until)` | redemption on a verified account, or Verified event for an invite account | Lists `max_listeners`, and the AutoDJ and Jingles points only if the plan has `autodj_enabled`. Category plan, action "Create your station" |
| `ProAccessGranted(plan, until, term, note)` | admin approve or admin upgrade | Two wordings: `note === null` is "Your request was approved", a note means "We've upgraded your account" and the note leads the email. Says the account returns to Free automatically when `until` is set. Includes three social URLs always, and the public station link only when the owner already has a station (first station, unordered `stations()->first()`); with AutoDJ and a station the CTA is "Open AutoDJ" (library), else "Open your dashboard" |
| `PlanExpired(ended, new)` | `plans:expire` | Level warning, "Your {Plan} period has ended" |
| `InactiveBroadcasterNudge(stationSlug)` | `app:nudge-inactive-broadcasters` | Links to go-live, or to create a station if none |
| `InviteOffer(invite, email)` | admin mint/send | see Invites |

None of these quote `max_stations`.

## Inactive-broadcaster nudge

`app:nudge-inactive-broadcasters [--dry-run]`, daily 16:00 (`withoutOverlapping`). Candidates must match **all** of:

- `email_verified_at` not null (checked at run time);
- `created_at` between `now - 8 days` and `now - 7 days` (a one-day window; a user who verifies after day 8 is never nudged, since the window is on creation);
- plan slug is `free` (paid accounts are never nudged);
- no station, **including soft-deleted ones** (`withTrashed`), has a stream session with `ended_at` set. Only humans connecting write `stream_sessions`, so AutoDJ airtime is invisible, and a free account that is live right now still counts as never having broadcast because its session has no `ended_at`.

Idempotency is "has a notification of this class ever been stored for the user" (`$user->notifications()->where('type', ...)`). If the user deletes that bell row (`DELETE /notifications/{id}`) or `notifications:prune` removes it, the check no longer sees it; in practice the one-day window means it will not re-fire. The notification is queued (`ShouldQueue`); `--dry-run` prints "would nudge: email (station: slug|none)". The result line is `Nudged X of Y candidates.`

## Surfaces

| Surface | What it does with this feature |
|---|---|
| Web `/dashboard/settings` ("Account") | `components/dashboard/account/`: `PlanCard` (nothing while the plan is unknown; Pro = `slug !== "free"`: amber card, PRO tag, "You're on {name}" and what the plan includes from its flags (`planIncludes`: listener cap, AutoDJ, embeds, own DJ software, N days of audience history), plus "Ends {date}, then your account moves to Free." when `expires_at` is set; no billing button. Free: plain card, "Your station plays only while you're live.", Request Pro), `ProfileForm`, `PasswordForm` ("Password" or "Set a password"; one new-password field with Show, the `confirmed` rule sent the same value), `DeleteAccount` (typed email). Reads `user` from the cookie via `getUser()` after mount, not from the API, so name and email are as of last `saveAuth` |
| Web dashboard layout | Fetches `/user` once server-side and provides it through `AccountProvider`; `usePlan()` is null on a failed fetch, and the `use*Locked()` hooks treat null as "not locked" (`useAutoDjLocked`, `useAudienceLocked`, `useEmbedLocked`, `useEncoderLocked`) so a timeout never paints an upsell on a paying user. The API is the real gate |
| Web sidebar | An amber PRO tag on items with `lock: "autodj"` (AutoDJ and Schedule, since Schedule is AutoDJ slots only) or `"audience"` (Audience); the links stay live on purpose. Plan card with "Request Pro" when AutoDJ locked, "Requested" state per session; a paid plan shows a PRO tag next to the user's name in the footer instead |
| Web `/auth/register?invite=CODE` | `useInvite` calls `GET /invites/{code}` and shows a banner: valid (plan and days), closed used/expired, invalid, or unchecked (lookup failed, code is still sent). Submit is disabled while the lookup is `checking`. The code is only sent when the state is valid or unchecked. `invite_used`, `invite_already_redeemed`, `invite_expired`, `invite_not_found` errors flip the banner so a retry goes without the code. Google button passes `invite` on the popup URL; the outcome toast comes from the popup message |
| Mobile | `account.tsx` shows plan name, listeners, AutoDJ and an "Ends" date from `expires_at`; "Request Pro" (shown only when `plan.slug === 'free'`) opens the web dashboard. No invite entry anywhere; native Google sign-in supports an `invite` field but the app does not send one (no file under `mobile/src` mentions invites). |
| Admin (boundary) | Requests queue, invites page, provision account, station upgrade: [admin-panel](admin-panel.md) |

## Gaps and traps

1. **`max_listeners` is decorative.** No API, Liquidsoap or harbor code refuses listeners over the cap; UI, emails and marketing all advertise it (`UserResource`, `InviteRedeemed`, `PlanExpired`, `ProAccessGranted`, `PricingSection.tsx`).
2. **No UI to redeem an invite for an existing account.** `POST /invites/redeem` has no web or mobile caller. A signed-in user who opens an invite link is redirected to `/dashboard` by the register page (verified users; an unverified one gets the verify modal instead) and the code is lost. Login and password sign-in never carry a code.
3. **Free-plan invite plus expired-invite edge:** an account that already redeemed once (`invite_id` set) can never redeem again, even after its plan expired, and there is no way to clear it.
4. **A dead code on the email sign-up path costs nothing only because the web page drops it.** Sent directly, a used/expired/unknown `invite_code` returns 422 and creates no account (transaction rollback); the Google paths instead create the account and report failure.
5. **Welcome email re-fires.** `EmailVerificationController::verify` dispatches `Verified` on every successful code check (only skipped if the account is already verified). Changing your email nulls verification (`AccountController::updateProfile`), so verifying the new address sends `WelcomeNotification` (or `InviteRedeemed` with whatever plan you are on now) again.
6. **`plan_id` is in `User`'s `#[Fillable]`** although `InviteRedemption` and the migration comments say it is not. Safe today because every request path uses fixed `validated()` lists; a future `$request->all()` would be a privilege escalation.
7. **`users.plan_id DEFAULT 1`** relies on Free being row 1. No seeder creates plans; a database not built through the migrations has none and `StoreStationRequest` would fail on `$user->plan->max_stations` (null plan, no null-safe operator).
8. **`max_stations` = 5 on Pro but the product is one station.** The web resolves "the" station as the oldest (`client/lib/station-server.ts`), and the emails do not quote it. A Pro user can create 5 through the API. Web deletion copy also says stations "you won't be able to bring back", but deletion is soft (rows and files survive until `stations:prune-deleted`, retention `deleted_station_retention_days`, default 30, `config/liquidsoap.php`).
9. **The 403 for over-limit station creation is the framework default** (no `code` field), unlike lifecycle refusals.
10. **`PlanCard` and the sidebar hide the plan end date.** `expires_at` is in `/user` and shown only on mobile. A trial user gets no warning before `plans:expire` runs, only the email after.
11. **`plan_expires_at` docs are stale.** `ExpirePlans` and the invites migration say only `InviteRedemption` sets it; admin approve and admin upgrade do too. Approve always sets an end (max 3 months): there is no permanent Pro through a request. Only an invite without `duration_days`, an admin upgrade with term `none`, or admin provisioning yields an open-ended plan.
12. **Revoke is silent.** `AccessRequestController::revoke` moves the account to Free with no email and no bell; only `plans:expire` notifies.
13. **Downgrade is soft.** Extra stations, playlists, tracks and slots survive and are only blocked at playback/creation. `PlaylistController` is not plan gated, and slot saves are not gated (the UI locks them).
14. **Plan client comments are stale.** `client/interfaces/Plan.ts` says `autodj_enabled` "gates uploading to the AutoDJ library and nothing else"; it also gates rotation playback, jingles and the sweeper. Its `watermarked` note ("built, never switched on") disagrees with code: `User::watermarked()` is true for Free while `LIQUIDSOAP_WATERMARK_ENABLED` defaults to true (see [watermark-clips](watermark-clips.md)).
15. **`UserResource` exposes `stripe_customer_id`**, a `users` column from the original create migration that nothing writes (`2026_04_16_131100...` dropped only the stations copies). It is always null; there is no Stripe code.
16. **Nudge blind spots** (`NudgeInactiveBroadcasters`): paid accounts are never nudged; a free account live at run time is nudged; the one-day `created_at` window means unverified-at-day-7 accounts miss it; AutoDJ airtime cannot mislead it only because AutoDJ is paid and paid accounts are excluded.
17. **Unsubscribe scope:** `email_suppressions` is consulted only by admin invite sending. A suppressed address can still receive every other email.
18. **Access request state is per session on the client.** `ProRequestContext.requested` resets on reload, so the button re-enables; a resubmit silently overwrites the earlier message (by design, `updateOrCreate`).
19. **Approval does not check the current plan or invite.** Approving a request for an account already on Pro overwrites its plan and expiry (possibly shortening an open-ended plan).
20. **Custom enquiries are unauthenticated free text** stored as-is and can only ever be dismissed, never approved.

## Tests

- `api/tests/Feature/Auth/InviteRedemptionTest.php` (redemption rules, register/Google paths), `api/tests/Feature/Auth/GoogleOAuthCallbackTest.php`, `GoogleNativeSignInTest.php`
- `api/tests/Feature/Admin/InviteTest.php` (mint, send, revoke), `AccessRequestIndexTest.php`, `AccessRequestReviewTest.php`, `StationUpgradeTest.php`
- `api/tests/Feature/Console/ExpirePlansTest.php`, `NudgeInactiveBroadcastersTest.php`, `UnsubscribeTest.php`, `WaitlistControllerTest.php`
- `api/tests/Feature/Auth/UserEntitlementsTest.php` (plan block on `/user`)
- `api/tests/Feature/Account/AccountDeletionConfirmationTest.php`, `AccountDeletionCascadeTest.php`, `PasswordChangeNotificationTest.php`
- Gate tests: `PublicEmbedTest.php`, `HarborAuthTest.php`, `AudienceControllerTest.php`, `NextTrackControllerTest.php`, `WatermarkTest.php` (also covers `plans:expire` pushing the watermark), `JingleListControllerTest.php`, `Notifications/BellContractTest.php`

Targeted runs only; the full API suite takes minutes.

## History

History, not spec: `docs/auth-flow.md`, `docs/USER-FLOW-UPGRADES.md`, `docs/NOTIFICATIONS-PLAN.md`. Invites, the admin upgrade button and `plans:expire` were built 2026-09-08 to 2026-09-23; the migration docblocks and `InviteRedemption` explain why they are shaped this way.
