---
feature: Notifications and email (bell, transactional mail, outreach, station-live alerts, Resend webhook)
verified: 2026-10-01 against f6a201c plus uncommitted work (dashboard design-system rollout R1–R6.3)
sources:
  - api/app/Notifications/Bell/BellNotification.php
  - api/app/Notifications/Bell/BellPayload.php
  - api/app/Notifications/EmailChangedNotification.php
  - api/app/Notifications/InactiveBroadcasterNudge.php
  - api/app/Notifications/InviteOffer.php
  - api/app/Notifications/InviteRedeemed.php
  - api/app/Notifications/PasswordChangedNotification.php
  - api/app/Notifications/PasswordResetCode.php
  - api/app/Notifications/PlanExpired.php
  - api/app/Notifications/ProAccessGranted.php
  - api/app/Notifications/ProductUpdate.php
  - api/app/Notifications/RawEmail.php
  - api/app/Notifications/RawEmailDraft.php
  - api/app/Notifications/StationLiveNotification.php
  - api/app/Notifications/VerifyEmailCode.php
  - api/app/Notifications/WelcomeNotification.php
  - api/app/Http/Controllers/NotificationController.php
  - api/app/Http/Resources/NotificationResource.php
  - api/app/Http/Controllers/StationNotifyController.php
  - api/app/Models/StationNotifySubscription.php
  - api/app/Models/EmailSuppression.php
  - api/app/Http/Controllers/UnsubscribeController.php
  - api/app/Jobs/SendStationLiveNotifications.php
  - api/app/Jobs/HandleResendWebhook.php
  - api/app/Http/Controllers/ResendWebhookController.php
  - api/app/Webhooks/Resend/EmailReceived.php
  - api/app/Webhooks/Resend/ResendWebhookHandler.php
  - api/app/Services/AdminTelegram.php
  - api/app/Jobs/SendAdminTelegramAlert.php
  - api/app/Models/EmailVerificationCode.php
  - api/app/Models/PasswordResetCode.php
  - api/app/Http/Controllers/AuthController.php
  - api/routes/admin.php
  - api/app/Services/AnnouncementSender.php
  - api/app/Services/RawEmailSender.php
  - api/app/Services/EmailMarkdown.php
  - api/app/Services/InviteRedemption.php
  - api/app/Console/Commands/PruneNotifications.php
  - api/app/Console/Commands/NudgeInactiveBroadcasters.php
  - api/app/Console/Commands/SendAnnouncement.php
  - api/app/Console/Commands/ExpirePlans.php
  - api/app/Http/Controllers/Admin/AnnouncementController.php
  - api/app/Http/Controllers/Admin/RawEmailController.php
  - api/app/Http/Controllers/Admin/InviteController.php
  - api/app/Http/Controllers/Admin/AccessRequestController.php
  - api/app/Http/Controllers/Admin/StationController.php
  - api/app/Http/Requests/Admin/SendRawEmailRequest.php
  - api/app/Http/Requests/Admin/StoreAnnouncementRequest.php
  - api/app/Http/Controllers/AccountController.php
  - api/app/Http/Controllers/PasswordResetController.php
  - api/app/Http/Controllers/EmailVerificationController.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Models/User.php
  - api/app/Providers/AppServiceProvider.php
  - api/bootstrap/app.php
  - api/config/mail.php
  - api/config/notifications.php
  - api/config/services.php
  - api/config/queue.php
  - api/routes/api.php
  - api/routes/web.php
  - api/routes/console.php
  - api/resources/views/emails/invite.blade.php
  - api/resources/views/emails/invite-text.blade.php
  - api/resources/views/emails/raw.blade.php
  - api/resources/views/emails/raw-text.blade.php
  - api/resources/views/unsubscribe.blade.php
  - api/database/migrations/2026_04_18_154524_create_notifications_table.php
  - api/database/migrations/2026_04_20_122249_create_station_notify_subscriptions_table.php
  - api/database/migrations/2026_09_15_100000_add_created_at_index_to_notifications_table.php
  - api/database/migrations/2026_09_15_130100_create_email_suppressions_table.php
  - client/components/dashboard/NotificationItem.tsx
  - client/components/dashboard/NotificationDetailDialog.tsx
  - client/hooks/useNotifications.ts
  - client/lib/notifications.ts
  - client/interfaces/Notification.ts
  - client/app/station/[slug]/NotifyMeForm.tsx
  - api/tests/Feature/Notifications/BellContractTest.php
  - api/tests/Feature/NotificationControllerTest.php
  - api/tests/Feature/StationNotifySubscriptionTest.php
  - api/tests/Feature/UnsubscribeTest.php
  - api/tests/Feature/ResendWebhookTest.php
  - api/tests/Feature/NudgeInactiveBroadcastersTest.php
  - api/tests/Feature/PruneNotificationsTest.php
  - api/tests/Feature/SendAnnouncementTest.php
  - api/tests/Feature/Admin/RawEmailTest.php
  - client/components/dashboard/shell/UpdatesMenu.tsx
fingerprint: bac58f35e016ab8f
---

# Notifications and email

Everything GoCast says to a person outside the page they are looking at. Four separate mechanisms share the Laravel notification system:

1. **The bell**: rows in the `notifications` table (database channel) that the dashboard dropdown reads. Written only by classes that extend `BellNotification`.
2. **Transactional mail** to account holders: verification code, password reset, security alerts, welcome, plan changes. Mail channel only, or bell plus mail.
3. **Outreach mail to strangers/anyone**: admin invite emails (`InviteOffer`) and admin one-off emails (`RawEmail`). Sent to bare addresses, not accounts. The only mail governed by the suppression (unsubscribe) list.
4. **Station-live alerts**: anonymous "notify me when live" subscriptions on the player page, emailed when the station goes live.

Plus one inbound path: a Resend webhook that forwards received email to the admin Telegram chat.

**The one thing people get wrong:** the unsubscribe list (`email_suppressions`) protects almost nothing. It is consulted only by `InviteOffer` (in `Admin/InviteController::deliver`) and by `RawEmail` **when the admin ticked "marketing"**. Station-live emails, the inactive-broadcaster nudge and every transactional mail ignore it, and station-live emails have no unsubscribe link at all. Second: **mobile has no bell**. It is a web-dashboard-only surface; the Android app shows no notification feed and nothing here sends push.

## Catalogue: every email and bell notification

Queued = the class `implements ShouldQueue`. Laravel queues one job per channel, so a bell row and its email are independent jobs. Queue connection default in `api/config/queue.php` is `database`; `.env.example` sets `redis`. With no worker running, no queued mail leaves the system.

| Class | Trigger (file) | Recipient | Channels | Queued | Dedup / throttle |
|---|---|---|---|---|---|
| `VerifyEmailCode` | `User::sendEmailVerificationNotification()`: register (`AuthController` line ~59), login of an unverified user (~100), `POST /email/resend` (answers "already verified" and sends nothing when the account is verified), email change (`AccountController::updateProfile`) | the user | mail | yes | one code per user (`EmailVerificationCode::updateOrCreate`), 15 min TTL (`EmailVerificationCode::CODE_TTL_MINUTES`); `/email/resend` throttled 6/min, `/email/verify` 10/min |
| `PasswordResetCode` (imported as `PasswordResetCodeNotification`) | `POST /auth/password/forgot` (`PasswordResetController::forgot`), only if the account exists (response is identical either way) | the user | mail | yes | one code per email, 15 min TTL; route throttled 3/min |
| `PasswordChangedNotification` | `PasswordResetController::reset` and `AccountController::updatePassword`; carries the request IP | the user | mail | yes | none |
| `EmailChangedNotification` | `AccountController::updateProfile` when the email changed; routed with `Notification::route('mail', $previousEmail)` | the **old** address | mail | yes | none |
| `WelcomeNotification` | `Verified` event listener in `AppServiceProvider` (email code verified, or Google sign-up) unless the account has both `invite_id` and a plan (then `InviteRedeemed`); a Google sign-up that is already verified fires no event | the user | database + mail | yes | fires once per `Verified` event; nothing else prevents a second |
| `InviteRedeemed` | same `Verified` listener when `user->invite_id` and plan are set (replaces Welcome); also `InviteRedemption` for an already-verified account | the user | database + mail | yes | none |
| `ProAccessGranted` | `Admin/AccessRequestController::approve`, and `Admin/StationController::upgrade` (with a required free-text note, 1-2000 chars) | station/account owner | database + mail | yes | none |
| `PlanExpired` | `plans:expire` (`ExpirePlans`), hourly, when a paid account is moved to Free | the user | database + mail | yes | the account's `plan_expires_at` is nulled in the same loop, so it matches once. The move to Free happens for every expired row, but the notification is sent only when the ended plan exists and is not Free; the command fails with no changes if no `free` plan exists |
| `InactiveBroadcasterNudge` | `app:nudge-inactive-broadcasters`, daily 16:00 | the user | database + mail | yes | checks `notifications` for an existing row of this class |
| `ProductUpdate` | `notifications:announce` command and `/admin/announcements` (`AnnouncementSender`) | **every** non-soft-deleted `User` | database only | **no** | per-announcement `key`, checked against existing rows |
| `StationLiveNotification` | `SendStationLiveNotifications` job | the subscribed email (on-demand route) | mail | yes | one email per subscription until re-armed |
| `InviteOffer` | `Admin/InviteController` mint form (only if an address was typed) or "send" action | the admin-typed address (on-demand route) | mail | yes | suppression list checked first |
| `RawEmail` | `/admin/emails` (`RawEmailSender`) | up to 100 typed addresses | mail | yes | suppression list checked for marketing sends only |

All mail goes through Laravel's `MailMessage` with the stock markdown mail template (no `resources/views/vendor` override exists), **except** `InviteOffer` (hand-built `emails/invite.blade.php` plus `invite-text.blade.php`) and `RawEmail` (`emails/raw.blade.php` plus `raw-text.blade.php`). Every mail is signed off "— The GoCast team". Links are built from `config('services.frontend_url')` (`FRONTEND_URL`). There are no `Mailable` classes anywhere in `app/`.

Transport: `config/mail.php` default mailer is `log` (`MAIL_MAILER`); `.env.example` sets `resend` with `RESEND_API_KEY`; sender `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME`. `smtp`, `ses`, `postmark`, `sendmail`, `array`, `failover` (smtp then log) and `roundrobin` are configured but only `resend` is documented for prod.

### Content notes per notification

- **WelcomeNotification** bell: level `success`, category `station`, icon `radio`, mode `expand`, heading "Getting started" with four points, action "Create your first station" to `/dashboard/stations`. Mail subject "Welcome to GoCast — go live in under a minute".
- **InviteRedeemed** bell: level `success`, category `plan`, icon `invite`, expands "What you get" (listener cap from `plan->max_listeners`; AutoDJ lines only when `plan->autodj_enabled`; steps start at creating a station). Includes the end date when `until` is set. Does not quote `max_stations`.
- **ProAccessGranted**: variants by `($until, $note, $term)`. With a note (admin upgrade) the note becomes the opening paragraph(s) of the mail (split on blank lines) and the first bell point; subject is "You're on GoCast {plan}", with " — {term} on us" appended only when there is a term and no note. The bell action is "Open AutoDJ" to the first station's library when the plan has AutoDJ and a station exists, else "Open your dashboard". `stations()->first()` is read **at delivery time** (worker time), for bell and mail. The mail also lists the three hardcoded social links (X, Facebook, Instagram in `SOCIALS`).
- **PlanExpired**: level `warning`, icon `plan-expired`; adds "The AutoDJ library no longer accepts new uploads" only when the ended plan had AutoDJ and the new one does not. Says nothing is deleted.
- **InactiveBroadcasterNudge**: the bell carries only the "hardest part is hitting the button" paragraph, the mail adds the "signed up about a week ago" opener and a reply invitation. Bell mode is `link` (no detail). Action goes to `/dashboard/stations/{slug}/live` if the user has a station, else `/dashboard/stations`. Mail subject "Ready for your first broadcast on GoCast?".
- **ProductUpdate**: bell only. Built from JSON (`fromArray`): `key` and `headline` required, `points` a list of non-empty strings, optional `summary`, `url`, `link_label`, `icon` (default `megaphone`), `level` (default `info`), `detail_heading` (default "What's new"). `key` must match `KEY_PATTERN` (`/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/`). Category is always `system`. With points it is mode `expand`, else `link`. A `url` starting with `/` is prefixed with the frontend origin; no `url` means "Open your dashboard" to `/dashboard`; with a `url` and no `link_label` the label is "Take a look". `meta.announcement` stores the key (this is the dedup handle).

## The bell in detail

### Payload contract (`BellPayload`)

Stored as JSON in `notifications.data`. Fields: `title` (required, non-blank), `body`, `icon` (default `bell`), `level` in `info|success|warning|error`, `category` in `station|account|plan|system`, `action` (`mode` `link|expand`, `label`, `url`, `detail{heading, points[]}`) or `null`, `meta` (object). The constructor throws `InvalidArgumentException` for: blank title, unknown level/category/mode, action label without url (or vice versa), `expand` without an action or without points, points present without `expand`, a heading without points, or any blank/non-string point. `BellPayload::appUrl($path)` joins `FRONTEND_URL` and the path.

`BellNotification::via()` is `final`: always `database` plus whatever `alsoVia()` returns (mail, in the classes above). `toDatabase()` is `final` and calls `toBell()`. `BellContractTest` enforces that nothing reaches the database channel except through this base class, that bell notifications that also mail are queued, and that every expanding notification has points.

### API (all in `api/routes/api.php`, `auth:sanctum`, **outside** the `verified` group so unverified users can read them)

| Route | Controller method | Behaviour |
|---|---|---|
| `GET /notifications` | `NotificationController::index` | Query `filter` (`all`\|`unread`), `category` (one of the four); any other value is a 422, and null/empty means absent. Cursor-paginated (`cursor` param), page size `NOTIFICATION_PER_PAGE` (20). Ordered `created_at desc, id desc`. Response `meta.unread_count` is the exact unread count. The `category` filter is a `LIKE '%"category":"x"%'` on the JSON text. A malformed cursor is silently treated as no cursor (page one). |
| `GET /notifications/unread-count` | `unreadCount` | `{data:{unread_count, capped_at}}`; `throttle:notification-poll` = 30/min per user id (`AppServiceProvider`). `unread_count` is **not** capped; `capped_at` (`NOTIFICATION_UNREAD_COUNT_CAP`, 99) is only a hint for the client to render "99+". |
| `POST /notifications/read-all` | `markAllRead` | Bulk `update(['read_at' => now()])` on unread rows; returns `unread_count: 0`. |
| `POST /notifications/{notification}/read` | `markRead` | Idempotent; returns the row plus new `unread_count`. |
| `DELETE /notifications/{notification}` | `destroy` | Hard delete; returns new `unread_count`. |

Rows are always looked up through `$request->user()->notifications()->findOrFail($id)`, so another user's id is a 404. `NotificationResource` normalises rows defensively (missing fields fall back to title "Notification", icon `bell`, level `info`, category `system`; empty/invalid detail becomes `null`; unknown action mode falls back to `link`).

### Schema and retention

`notifications` (`uuid id`, `type`, `notifiable` morph, `text data`, `read_at`, timestamps) with an added index on `created_at`. `notifications:prune` (`PruneNotifications`, daily 05:00) deletes rows older than `NOTIFICATION_RETENTION_DAYS` (90; `<= 0` disables) in chunks (`--chunk`, default 1000, minimum 100). It deletes read and unread alike.

### Web UI (`client/`)

- The bell is **Updates** (`components/dashboard/shell/UpdatesMenu.tsx`), a text button in the dashboard top bar with an unread count badge (`formatUnreadCount`, capped at the API's `capped_at`, e.g. "99+"). Popover `min(22rem, 100vw − 2rem)` wide (24rem from `sm`), feed max height 26rem, "Mark all read" when there are unread, skeleton while loading, "Couldn't load notifications." with retry (only when nothing was ever loaded), empty state "You're all caught up", "Load older" button for the next cursor page.
- `useNotifications` polls `/notifications/unread-count` every 60 s **only while the tab is visible** (stops on hidden, refreshes on becoming visible if 60 s have passed). The feed loads when the popover opens. Read/mark-all/delete are optimistic with rollback and a sequence guard so an in-flight feed response cannot overwrite a newer mutation. The UI never passes `filter` or `category`.
- `NotificationItem`: a dot before each row coloured by level while unread (`notificationDotClass` in `lib/notifications.ts`), grey once read; a hover "x" dismisses (delete). Click behaviour comes from `resolveNotificationAction`: `expand` (mode `expand` with points) opens `NotificationDetailDialog`; `link` navigates (internal links via Next `Link`, links to another origin open in a new tab with `noopener`); an action URL that is not http(s) or unparsable degrades to `none` (click only marks read). Clicking marks it read first.
- The web dashboard no longer draws the `icon` key (`NotificationIcon` was removed with the old header); the level dot replaces it. `icon` is still stored and sent.
- Level dot colours (`LEVEL_DOTS`): `info` and `warning` off-white, `success` violet, `error` error red.
- No realtime push: the only update paths are the 60 s poll and opening the popover. (`api/routes/channels.php` mentions moving the bell onto the Ably transport as a future idea; it is not done.)

### Mobile

There is no bell, feed or push registration anywhere in `mobile/src`. The only "notification" in the app is the Android foreground-service notification in `mobile/src/broadcast/broadcastManager.ts` (keeps a show alive), which is unrelated. Emails link to the web app.

## Station-live alerts ("Notify me when live")

1. **Subscribe**: `POST /public/stations/{slug}/notify` (`StationNotifyController::store`), public, `throttle:5,60` (5 per 60 minutes per IP). Body `email` (lower-cased, trimmed; `required|string|email|max:255`). Unknown or soft-deleted slug is a 404. It `firstOrNew`s a `station_notify_subscriptions` row (unique on `station_id, email`) and **sets `notified_at = null`**, so re-subscribing re-arms an already-notified address. Always returns `{message: "We'll email you when {name} goes live."}`. There is no double opt-in, no ownership check of the address, no plan gate, and no unsubscribe for the subscriber.
2. **Trigger**: two places dispatch `SendStationLiveNotifications` with a **2-minute delay**: `StreamSessionController::store` (a broadcast session started via the API; skipped if the station was already live, sampled before closing stragglers and excluding a ghost session) and `StationEventController::openSession` (harbor/encoder connect event that opens a new session; not dispatched when an open session already exists).
3. **Send**: the job (`SendStationLiveNotifications::handle`) exits silently if the station is gone or the specific session has ended. Otherwise it sends `StationLiveNotification` (mail only, queued) to every subscription with `notified_at IS NULL` via `Notification::route('mail', $email)` and stamps `notified_at` after handing each to the queue. Each subscription therefore gets one email per (re)subscription, ever.
4. **Email**: subject "{Station} is live on GoCast", "Listen now" button to `{FRONTEND_URL}/station/{slug}`, footer "You asked us to let you know when this station started broadcasting." No unsubscribe link or header.
5. **UI**: `NotifyMeForm` is shown on the player page (`PlayerView`) only in the off-air state. It remembers subscribed slugs in `localStorage` key `gocast:notify-subscribed:v1` and then shows "You'll get an email when this station next goes live." permanently for that slug in that browser.

## Unsubscribe and suppression

- **Table** `email_suppressions`: `email` (unique), `reason` (default and only value `unsubscribed`), nullable `invite_id` (FK, null on delete). `EmailSuppression::suppresses($email)` is an exact `where email =` match; `record()` is `firstOrCreate` (idempotent; the first reason/invite wins).
- **Routes** (`api/routes/web.php`, both behind the `signed` middleware, no expiry): `GET /unsubscribe` shows a confirm page (or "You're unsubscribed" if already suppressed; an empty `email` just renders the form; `unsubscribe.blade.php`, self-contained CSS, `noindex`); `POST /unsubscribe` writes the row. The POST is exempt from CSRF (`bootstrap/app.php`) because the signature replaces it. `email` comes from the signed query string; `400` if empty. An optional `invite` query code is looked up and stored as `invite_id` (an unknown code is silently ignored). A POST body `List-Unsubscribe=One-Click` (RFC 8058) gets a bare `200` instead of the page.
- **Who links to it**: `InviteOffer` (footer link plus `List-Unsubscribe` and `List-Unsubscribe-Post` headers, includes `invite=` code) and `RawEmail` when `marketing` is true (same headers and footer; no `invite`).
- **Who checks it**: `Admin/InviteController::deliver` (drops the send and reports "has unsubscribed"; the invite link is still minted) and `RawEmailSender::plan` (marketing drafts only; compared case-insensitively in PHP against the plucked matches; suppressed addresses are listed on the preview page and in the activity log). The admin invites list also reads it to badge invites whose address has unsubscribed (display only). Nothing else reads the table. Suppression is not the same as Resend's own bounce/complaint suppression, which is not synced (see below).

## Admin-sent mail (senders only; the admin screens are in [Admin panel](admin-panel.md))

- **Raw email** (`/admin/emails`, `RawEmailController`): preview then send (two POSTs). `SendRawEmailRequest`: recipients split on whitespace/comma/semicolon, de-duplicated case-insensitively, max **100** (`MAX_RECIPIENTS`), each a valid email <=255; `subject` <=150, `body` <=20000 (required, Markdown), optional `greeting` <=120, `headline` <=200, `sign_off` <=120 (default "— The GoCast team"), `preheader` <=150 (default: first 140 chars of the plain body), `cta_url` (http/https, <=2048) and `cta_label` (<=40), which must be given together; `marketing` boolean. `RawEmailDraft` also rejects an empty rendered body. One `RawEmail` notification is queued per recipient; the send is logged once via the activity log ("sent email" with `sent`/`suppressed` lists). The preview page renders the HTML and text with the unsubscribe URL of the first sendable recipient. The history list shows the last 15. Body Markdown is rendered by `EmailMarkdown` with inline styles for Outlook: raw HTML is escaped, unsafe links disallowed, images dropped (only their text remains), tables supported, nesting limit 10.
- **Invite email**: sent by `Admin/InviteController` on minting (if an address was entered) or via the send action (only if the invite is still redeemable). `InviteOffer` is routed to a bare address so it reads nothing off `$notifiable`; the greeting uses `recipient_name` (else "Hi there,"), never the admin's private `label`; the plan caption says "N months" when `duration_days` is a multiple of 30, else days, or "{Plan}, free. No card required." with no term; "Open until {date}." only when the link has an expiry. `sent_at` is stamped when queued, not when delivered; each send logs "sent invite" (and minting logs "minted invite").
- **Announcements** (`notifications:announce {file} [--dry-run] [--force]` and `/admin/announcements`): `AnnouncementSender::send` takes `Cache::lock('announcement:{key}', 900 s)`, else throws `AnnouncementInProgressException`. Audience is `User::query()` (every non-soft-deleted user; no verified, plan or activity filter). Users who already hold a `ProductUpdate` row whose `data` contains `"announcement":"{key}"` are skipped. Admin sends log "sent announcement" with `sent`/`skipped`; the index lists the last 20 announcements with recipient counts. It calls `$user->notify()` synchronously per user in lazy 500-row chunks (the web request calls `set_time_limit(0)`); this is deliberate: bell only, not queued. `StoreAnnouncementRequest` limits: key <=64 (auto-generated `YYYY-MM-slug` if blank), headline <=120, summary <=300, `detail_heading` <=60, up to 6 points of <=200, `url` either `https?://...` or a path starting `/` (<=500), `link_label` <=40, level required, `icon` `[a-z0-9-]+` <=40.

## Inbound email and the Resend webhook

`POST /api/webhooks/resend` (`ResendWebhookController`, `throttle:120,1`), public but signed:

1. Empty `RESEND_WEBHOOK_SECRET` returns `503 Webhook not configured`.
2. Svix signature checked with `Resend\WebhookSignature::verify` (`svix-id`, `svix-timestamp`, `svix-signature`); failure returns `401`.
3. `type` is looked up in `ResendWebhookController::HANDLERS`, which contains **only `email.received`** (`EmailReceived`). Any other type returns `200 {"status":"ignored"}`.
4. Dedup: `Cache::add('resend-webhook:{svix-id}', true, 1 day)`; a repeat returns `200 {"status":"duplicate"}`. If dispatch throws, the key is forgotten and the error is rethrown so Resend retries.
5. `HandleResendWebhook` is queued (`tries = 3`, backoff `[10, 60]` seconds) and runs the handler. `EmailReceived` fetches the full message from `https://api.resend.com/emails/receiving/{id}` (15 s timeout, bearer `RESEND_API_KEY`, `->throw()`), merges it with the event data, and calls `AdminTelegram::emailReceived`, which posts from/to/subject, failed SPF/DKIM/DMARC checks, attachment names and up to 3000 characters of body text to the admin Telegram chat. The post is a queued `SendAdminTelegramAlert` job dispatched after commit, and is skipped unless both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` are set. An event without `data.email_id` returns silently. The controller answers `200 {"status":"queued"}` once dispatched. Nothing is stored in the database.

To handle another event, add a class implementing `ResendWebhookHandler` and register it in `HANDLERS`.

## Scheduled commands (`api/routes/console.php`)

| Command | Schedule | Effect |
|---|---|---|
| `app:nudge-inactive-broadcasters` (`--dry-run`) | daily 16:00, no overlap | Candidates: verified users created between 8 and 7 days ago, on the `free` plan, with no station (including soft-deleted) that has any ended stream session. Skips anyone with an existing `InactiveBroadcasterNudge` row. Uses their first station's slug if any. See [Accounts, plans and invites](accounts-plans-invites.md). |
| `plans:expire` | hourly | Sends `PlanExpired` (see catalogue). |
| `notifications:prune` | daily 05:00 | Bell retention. |

Env vars: `MAIL_MAILER`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `FRONTEND_URL`, `QUEUE_CONNECTION`, `NOTIFICATION_RETENTION_DAYS`, `NOTIFICATION_PER_PAGE`, `NOTIFICATION_UNREAD_COUNT_CAP`.

## Gaps and traps

1. **Station-live emails bypass the suppression list and have no unsubscribe.** `StationLiveNotification` has no link, no headers, and `SendStationLiveNotifications` never calls `EmailSuppression`. Anyone can subscribe any address (no confirmation); the address owner has no way out except replying by email.
2. **A subscriber only ever gets one alert per subscription, and the UI hides re-subscribing.** After the first email `notified_at` is set; only `POST /notify` re-arms it, but `NotifyMeForm` shows a permanent "you're subscribed" state from `localStorage` for that slug, so a returning listener cannot re-arm from that browser.
3. **The 2-minute delay can silently skip the alert.** If the session ends within two minutes, the job exits and subscriptions stay armed for the next broadcast (which is arguably right, but nobody is told).
4. **Suppression covers little**: only `InviteOffer` and marketing-flagged `RawEmail`. The nudge (`InactiveBroadcasterNudge`) is outreach-shaped but has no opt-out. A non-marketing `RawEmail` ignores the list by design.
5. **Case sensitivity is left to the database.** `EmailSuppression::suppresses()` and `record()` use exact `email` equality on whatever case the signed URL carried; only `RawEmailSender` re-compares case-insensitively, and only over rows the DB already matched. On MySQL with the repo default collation (`DB_COLLATION` = `utf8mb4_unicode_ci`, `config/database.php`) the `=` match is case-insensitive, so this works; on a case-sensitive collation or SQLite (tests) it would not. Production's actual `DB_COLLATION` is not in the repo.
6. **Resend delivery events are not handled.** `HANDLERS` has only `email.received`; bounces, complaints and delivery failures return `ignored`. Our suppression table and Resend's own suppression are independent and never synced. `InviteOffer.sent_at` means "queued", not delivered.
7. **Deleting a bell row can re-trigger sends.** Both dedup mechanisms read the `notifications` table: `InactiveBroadcasterNudge` (existing-row check) and `ProductUpdate` (`meta.announcement` key). A user who dismisses (hard delete) the row, or the 90-day prune, removes the guard; re-running the same announcement key re-sends to those users. The nudge's one-day candidate window makes its exposure small.
8. **Announcements run inline.** `ProductUpdate` is not `ShouldQueue`, so the admin request and the artisan command do the whole fan-out synchronously, one DB insert per account, with no chunked queue and no verified/active filter (unverified and abandoned accounts get rows).
9. **Icon list is closed on the client.** `NotificationIcon` knows eight keys; the announcement form accepts any `[a-z0-9-]+` icon, which silently renders as the bell. The 6-point limit lives only in `StoreAnnouncementRequest`, not in `ProductUpdate::fromArray` (so the CLI path allows more).
10. **Bell staleness and unused API surface.** No push; a background tab never polls. `filter` and `category` on `GET /notifications` are implemented and tested but never sent by the UI; `category` uses a `LIKE` over serialized JSON. `unread_count` from the API is uncapped despite the name of the config key.
11. **Content is resolved when the worker runs, not when it is triggered.** `ProAccessGranted` reads `stations()->first()` at delivery; an admin preview (`toMail` at preview time) can differ from what is sent if the account changes in between. Queued notifications also serialize the `User`; `SendQueuedNotifications::$deleteWhenMissingModels` defaults to false in the vendored framework, so a hard-deleted user makes the queued job fail (into `failed_jobs`) rather than vanish.
12. **Transactional mail has no idempotency.** A double `Verified` event would send two welcomes; `PasswordChangedNotification` sends on every change; nothing limits `POST /notify` beyond IP throttling.
13. **Defaults are safe-but-silent.** `config/mail.php` defaults to `log`, `config/queue.php` to `database` (the example env file uses `redis`); a missing worker or `RESEND_API_KEY` produces no errors to users, only missing email. The `PasswordResetCode` notification shares a name with the `PasswordResetCode` model (aliased in `PasswordResetController`).
14. **Unsubscribe page copy is invite-specific** ("If you were sent an invite link, it still works") even though it is also used by marketing `RawEmail` sends.
15. **Mobile parity gap.** The web has a bell; the mobile app has none, so plan-expiry or upgrade notices reach mobile-only users only by email.

## Tests

`api/tests/Feature/Notifications/BellContractTest.php` (payload validation, base-class rules, queued-with-mail), `NotificationControllerTest.php`, `PruneNotificationsTest.php`, `NudgeInactiveBroadcastersTest.php`, `SendAnnouncementTest.php`, `StationNotifySubscriptionTest.php`, `UnsubscribeTest.php`, `ResendWebhookTest.php`, `Admin/RawEmailTest.php`. Mail-sending paths are also covered in `Auth/EmailVerificationCodeTest.php`, `Auth/PasswordResetTest.php`, `Auth/InviteRedemptionTest.php`, `Auth/ProfileEmailChangeTest.php`, `Account/PasswordChangeNotificationTest.php`, `Admin/InviteTest.php`, `Admin/AccessRequestReviewTest.php`, `Admin/StationUpgradeTest.php` and `Console/ExpirePlansTest.php`. There are no client tests for the bell.

## History

No plan or handoff documents are treated as spec here. Related feature docs: [Admin panel](admin-panel.md), [Accounts, plans and invites](accounts-plans-invites.md), [Auth](auth.md), [Public player and embed](public-player-and-embed.md), [Realtime events](realtime-events.md).
