---
feature: Data model (database schema, models, seeded plans)
verified: 2026-09-29 against 360c382 plus uncommitted work
sources:
  - api/database/migrations/0001_01_01_000000_create_users_table.php
  - api/database/migrations/0001_01_01_000001_create_cache_table.php
  - api/database/migrations/0001_01_01_000002_create_jobs_table.php
  - api/database/migrations/2026_04_03_185355_create_personal_access_tokens_table.php
  - api/database/migrations/2026_04_03_193133_create_stations_table.php
  - api/database/migrations/2026_04_03_193412_create_stream_sessions_table.php
  - api/database/migrations/2026_04_12_154215_add_google_id_to_users_table.php
  - api/database/migrations/2026_04_15_102951_add_missing_indexes.php
  - api/database/migrations/2026_04_15_123059_add_featured_to_stations_table.php
  - api/database/migrations/2026_04_16_131050_create_plans_table.php
  - api/database/migrations/2026_04_16_131100_add_plan_id_to_users_and_drop_plan_from_stations.php
  - api/database/migrations/2026_04_18_114446_create_waitlist_entries_table.php
  - api/database/migrations/2026_04_18_144640_create_activity_log_table.php
  - api/database/migrations/2026_04_18_145439_create_authentication_log_table.php
  - api/database/migrations/2026_04_18_150140_add_deleted_at_and_last_login_at_to_users_table.php
  - api/database/migrations/2026_04_18_150330_add_deleted_at_to_stations_table.php
  - api/database/migrations/2026_04_18_154524_create_notifications_table.php
  - api/database/migrations/2026_04_20_122249_create_station_notify_subscriptions_table.php
  - api/database/migrations/2026_04_21_120211_create_email_verification_codes_table.php
  - api/database/migrations/2026_04_21_153638_create_password_reset_codes_table.php
  - api/database/migrations/2026_05_10_165153_create_tracks_table.php
  - api/database/migrations/2026_08_15_115900_add_desired_state_to_stations_table.php
  - api/database/migrations/2026_08_15_115900_add_feature_columns_to_plans_table.php
  - api/database/migrations/2026_08_15_170000_add_last_ready_at_to_stations_table.php
  - api/database/migrations/2026_08_16_140000_drop_is_live_from_stations_table.php
  - api/database/migrations/2026_08_17_120000_drop_admins_table.php
  - api/database/migrations/2026_08_17_160000_add_kind_to_tracks_table.php
  - api/database/migrations/2026_08_17_160100_add_jingle_settings_to_stations_table.php
  - api/database/migrations/2026_08_17_170000_add_jingle_mode_to_stations_table.php
  - api/database/migrations/2026_08_18_100000_add_watermark_to_plans_table.php
  - api/database/migrations/2026_08_18_120000_create_admins_table.php
  - api/database/migrations/2026_08_18_130000_add_autodj_cursor_to_stations_table.php
  - api/database/migrations/2026_08_18_234430_add_analysis_to_tracks_table.php
  - api/database/migrations/2026_08_29_090000_add_container_index_to_stations_table.php
  - api/database/migrations/2026_08_29_231700_add_silent_since_to_stations_and_drop_idle_stop_hours.php
  - api/database/migrations/2026_08_30_120000_add_message_and_social_to_waitlist_entries_table.php
  - api/database/migrations/2026_08_30_120000_create_listener_sessions_table.php
  - api/database/migrations/2026_08_30_120100_create_listener_stats_hourly_table.php
  - api/database/migrations/2026_08_30_120200_create_listener_geo_daily_table.php
  - api/database/migrations/2026_08_30_120300_drop_total_listener_minutes_from_stream_sessions.php
  - api/database/migrations/2026_08_30_130000_add_unique_email_plan_to_waitlist_entries_table.php
  - api/database/migrations/2026_08_31_100000_add_user_id_to_waitlist_entries_table.php
  - api/database/migrations/2026_08_31_120000_add_review_status_to_waitlist_entries_table.php
  - api/database/migrations/2026_09_01_100000_add_analytics_days_to_plans_table.php
  - api/database/migrations/2026_09_02_100000_raise_plan_listener_caps.php
  - api/database/migrations/2026_09_07_100000_add_featured_at_to_stations_table.php
  - api/database/migrations/2026_09_08_100000_add_embed_enabled_to_plans_table.php
  - api/database/migrations/2026_09_09_100000_create_invites_table.php
  - api/database/migrations/2026_09_09_100100_add_invite_and_plan_expiry_to_users_table.php
  - api/database/migrations/2026_09_09_110000_create_station_events_table.php
  - api/database/migrations/2026_09_11_100000_add_timezone_to_stations_table.php
  - api/database/migrations/2026_09_11_100100_create_station_schedules_table.php
  - api/database/migrations/2026_09_12_100000_add_autodj_order_to_stations_table.php
  - api/database/migrations/2026_09_15_100000_add_created_at_index_to_notifications_table.php
  - api/database/migrations/2026_09_15_110000_widen_avatar_url_on_users_table.php
  - api/database/migrations/2026_09_15_120000_add_email_and_sent_at_to_invites_table.php
  - api/database/migrations/2026_09_15_130000_add_recipient_fields_to_invites_table.php
  - api/database/migrations/2026_09_15_130100_create_email_suppressions_table.php
  - api/database/migrations/2026_09_15_140000_add_encoder_enabled_to_plans_table.php
  - api/database/migrations/2026_09_15_140100_add_stream_key_to_stations_table.php
  - api/database/migrations/2026_09_15_140200_add_client_to_stream_sessions_table.php
  - api/database/migrations/2026_09_20_134240_create_playlists_table.php
  - api/database/migrations/2026_09_20_134241_create_playlist_track_table.php
  - api/database/migrations/2026_09_20_134242_backfill_default_playlists.php
  - api/database/migrations/2026_09_20_134243_drop_autodj_columns_from_stations_table.php
  - api/database/migrations/2026_09_20_141102_create_autodj_slots_table.php
  - api/database/migrations/2026_09_20_141103_add_autodj_last_playlist_id_to_stations_table.php
  - api/app/Models/Admin.php
  - api/app/Models/AuthenticationLog.php
  - api/app/Models/AutodjSlot.php
  - api/app/Models/Concerns/AuthenticationLoggable.php
  - api/app/Models/EmailSuppression.php
  - api/app/Models/EmailVerificationCode.php
  - api/app/Models/Invite.php
  - api/app/Models/ListenerGeoDaily.php
  - api/app/Models/ListenerSession.php
  - api/app/Models/ListenerStatHourly.php
  - api/app/Models/PasswordResetCode.php
  - api/app/Models/Plan.php
  - api/app/Models/Playlist.php
  - api/app/Models/StationEvent.php
  - api/app/Models/StationNotifySubscription.php
  - api/app/Models/Station.php
  - api/app/Models/StationSchedule.php
  - api/app/Models/StreamSession.php
  - api/app/Models/Track.php
  - api/app/Models/User.php
  - api/app/Models/WaitlistEntry.php
  - api/database/factories/AdminFactory.php
  - api/database/factories/AutodjSlotFactory.php
  - api/database/factories/InviteFactory.php
  - api/database/factories/ListenerSessionFactory.php
  - api/database/factories/PlanFactory.php
  - api/database/factories/PlaylistFactory.php
  - api/database/factories/StationEventFactory.php
  - api/database/factories/StationFactory.php
  - api/database/factories/StationScheduleFactory.php
  - api/database/factories/TrackFactory.php
  - api/database/factories/UserFactory.php
  - api/database/seeders/DatabaseSeeder.php
  - api/database/seeders/StationSeeder.php
  - api/app/Observers/StationObserver.php
  - api/app/Observers/UserObserver.php
  - api/routes/console.php
  - api/config/activitylog.php
  - api/config/analytics.php
  - api/config/station_events.php
  - api/config/session.php
  - api/config/cache.php
  - api/config/queue.php
  - api/config/auth.php
  - api/.env.example
  - api/phpunit.xml
  - api/app/Console/Commands/ExpirePlans.php
  - api/app/Console/Commands/PruneDeletedStations.php
  - api/app/Console/Commands/PruneListenerSessions.php
  - api/app/Console/Commands/PruneNotifications.php
  - api/app/Console/Commands/PruneStationEvents.php
  - api/app/Console/Commands/SyncListenerCounts.php
  - api/app/Http/Controllers/AccountController.php
  - api/app/Http/Requests/StoreStationRequest.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Services/StationLifecycleService.php
  - api/tests/Feature/PlaylistBackfillMigrationTest.php
  - api/app/Http/Controllers/WaitlistController.php
  - api/config/notifications.php
  - api/config/liquidsoap.php
  - api/app/Console/Commands/SweepListenerSessions.php
  - api/app/Console/Commands/RollupListenerStats.php
  - api/app/Services/ListenerAnalytics.php
  - api/app/Http/Controllers/PlaylistController.php
  - api/app/Http/Requests/PlaylistTracksRequest.php
  - api/app/Services/TrackImporter.php
  - api/app/Listeners/LogAuthenticationEvents.php
  - api/app/Listeners/RecordUserLastLogin.php
  - api/app/Providers/AppServiceProvider.php
  - client/interfaces/Station.ts
  - client/interfaces/User.ts
fingerprint: cd5082dd365fa441
---

# Data model

The database as the code defines it today: 67 migrations replayed in filename order, reconciled against the 20 models in `api/app/Models`, the factories and the seeders. MySQL everywhere, including tests (`api/phpunit.xml` forces `DB_CONNECTION=mysql`, `DB_DATABASE=gocast_test`, and also `CACHE_STORE=array`, `SESSION_DRIVER=array`, `QUEUE_CONNECTION=sync`, so the cache, sessions and jobs tables are idle in tests).

**The one thing people get wrong:** the `plans` rows are not seeded by a seeder. They are inserted, and later `UPDATE`d, *inside migrations* (`2026_04_16_131050_create_plans_table.php` and the "add feature column" migrations). `DatabaseSeeder` only creates one `Test User`; `StationSeeder::run()` is empty. A database that has not run the migrations has no Free or Pro plan, and `users.plan_id` defaults to `1`, so a missing row breaks user creation through the foreign key. The second trap is that several `plans` columns look like limits but are only display text or are never enforced (see "Columns nothing reads or enforces").

## Conventions

- Primary keys are mixed on purpose: `stations`, `stream_sessions` use UUID (`HasUuids`); `tracks`, `playlists`, `station_schedules`, `autodj_slots` use ULID (`HasUlids`); `listener_sessions` uses a 22-char string minted by `ListenerAnalytics` (not by the database); everything else is a bigint auto-increment. `station_events` is bigint deliberately (append-only, ids never leave the server).
- Every foreign key to `stations` is `cascadeOnDelete`. **Soft-deleting a station fires no cascade**; children survive until `stations:prune-deleted` force-deletes it (`liquidsoap.deleted_station_retention_days`, default 30, env `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS`, in `api/app/Console/Commands/PruneDeletedStations.php`).
- Soft deletes exist only on `users` and `stations`.
- Several "wall clock" columns (`start_time`, `end_time`) are MySQL `TIME` and cast to `string`, never `datetime`, because they carry no date.
- Order-of-migration quirks: two pairs share a timestamp and run alphabetically (`2026_08_15_115900_add_desired_state...` before `..._add_feature_columns_to_plans...`; `2026_08_30_120000_add_message_and_social...` before `..._create_listener_sessions...`).
- Four migrations read or write application code, so they are coupled to the code at the time they run: `2026_09_15_140100_add_stream_key_to_stations_table.php` calls `Station::generateStreamKey()` and the `encrypted` cast (needs `APP_KEY`; sets `timestamps = false` so `updated_at` is not touched); `2026_09_20_134242_backfill_default_playlists.php` reads `stations.autodj_*` and `tracks.kind` with raw `DB::table` and returns early if `autodj_order` is already gone; `2026_08_29_090000_add_container_index...` backfills by `created_at, id`; `2026_08_30_130000_add_unique_email_plan...` deletes duplicate `(email, plan)` rows, keeping `MAX(id)`.

## Relationship overview

```
plans 1 ─── * users (plan_id, restrict, default 1)
plans 1 ─── * invites (plan_id, restrict)
invites 1 ── * users (invite_id, nullOnDelete)
invites 1 ── * email_suppressions (invite_id, nullOnDelete)
admins 1 ─── * invites (created_by, nullOnDelete)
admins 1 ─── * waitlist_entries (reviewed_by, nullOnDelete)
users 1 ──── * waitlist_entries (user_id, nullOnDelete)
users 1 ──── 1 email_verification_codes (user_id is the PK, cascade)
users 1 ──── * stations (user_id, cascade; stations are soft-deleted)
stations 1 ─ * stream_sessions | listener_sessions | listener_stats_hourly
             | listener_geo_daily | station_events | station_notify_subscriptions
             | tracks | playlists | autodj_slots | station_schedules   (all cascade)
playlists * ─ * tracks via playlist_track (both cascade)
playlists 1 ─ * autodj_slots (playlist_id, cascade: deleting a playlist deletes its slots)
stations.autodj_last_playlist_id -> playlists.id   (NO foreign key)
users|admins 1 ─ * authentication_log   (morph: authenticatable_type/id, no FK)
any model 1 ─ * activity_log            (morph: subject_*, causer_*, no FK)
users 1 ──── * personal_access_tokens   (morph: tokenable_*, no FK)
users|any 1 ─ * notifications           (morph: notifiable_*, no FK)
station_events.causer_* -> users|admins (stringly typed, no FK, log outlives account)
```

Eloquent side: `User::plan/invite/stations/streamSessions (hasManyThrough Station)`; `Station::user/streamSessions/events (latest created_at)/listenerStats/tracks (ordered by position)/musicTracks/jingles/playlists (default first, then position, then created_at)/defaultPlaylist (hasOne is_default)/autodjSlots (by position)/schedules (by position)/notifySubscriptions`; `Playlist::station/tracks (belongsToMany, music only, pivot position ordered)`; `Track::station/playlists`; `Invite::plan/creator (Admin)/users`; `WaitlistEntry::user/reviewer (Admin)`; `EmailSuppression::invite`; `AuthenticationLog::authenticatable (morphTo)`; `Admin`/`User` use the `AuthenticationLoggable` trait (`authentications()` morphMany).

## Seeded data: the `plans` rows

Final values after every migration has run (inserted by `2026_04_16_131050`, adjusted by `2026_08_15_115900_add_feature_columns...`, `2026_08_18_100000_add_watermark...`, `2026_09_01_100000_add_analytics_days...`, `2026_09_02_100000_raise_plan_listener_caps`, `2026_09_08_100000_add_embed_enabled...`, `2026_09_15_140000_add_encoder_enabled...`):

| Column | free (id 1) | pro (id 2) |
|---|---|---|
| `name` | Free | Pro |
| `max_stations` | 1 | 5 |
| `max_running_stations` | 1 | 5 |
| `max_listeners` | 100 | 1000 |
| `autodj_enabled` | false | true |
| `watermark_enabled` | true | false |
| `analytics_days` | 0 | 90 |
| `embed_enabled` | false | true |
| `encoder_enabled` | false | true |

- The listener cap migration went 25/500 to 100/1000 (its `down()` reverts to 25/500). The column default itself is still `25`.
- Migrations that set per-plan flags also `UPDATE ... WHERE slug NOT IN ('free','pro')` to "paid" values, for plans that were meant to be added later (starter/studio). No such rows exist; the original `stations.plan` enum (`free/starter/pro/studio`) is gone.
- Plan identity in code is by slug: `Plan::isFree()` is `slug === 'free'`; `User::canUseAutoDj/canEmbed/canUseEncoder/watermarked` all read the plan with `?->` and treat "no plan row" as Free.
- `PlanFactory` sets `name`, `slug` (a random unique slug), `max_stations` (random 1-10) and `max_listeners` (random 50-1000); every other column takes its DB default (all flags false, `max_running_stations` 1, `analytics_days` 0). Tests that need real entitlements look up the migration rows: `UserFactory::onPlan('pro')` does `Plan::where('slug',...)->firstOrFail()`; `InviteFactory` prefers the seeded `pro` row.
- `DatabaseSeeder` creates one user (`test@example.com`, factory password `password`); `StationSeeder` is an empty stub. Neither is called for plans.

## Tables

Column order follows the final schema. "null" means nullable. Timestamps means `created_at`/`updated_at` nullable timestamps unless stated.

### users

Migrations: `0001_01_01_000000_create_users_table`, `add_google_id`, `create_plans/add_plan_id...`, `add_deleted_at_and_last_login_at`, `add_invite_and_plan_expiry`, `widen_avatar_url`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `name` | string(255) | |
| `email` | string(255) unique | |
| `google_id` | string null, unique | added after `email`; nulled by account deletion |
| `email_verified_at` | timestamp null | |
| `password` | string null | made nullable for Google-only accounts; cast `hashed` |
| `stripe_customer_id` | string null | **never written by any code**; still returned by `UserResource` and typed in `client/interfaces/User.ts` (see gaps) |
| `avatar_url` | string(2048) null | widened from 255 (Google URLs overflowed) |
| `plan_id` | bigint FK plans, default `1`, no cascade | restrict on delete |
| `invite_id` | bigint FK invites null, `nullOnDelete` | attribution, set once, never cleared |
| `plan_expires_at` | timestamp null, indexed | read by `plans:expire` |
| `remember_token` | string(100) null | hidden |
| `created_at`, `updated_at` | | |
| `deleted_at` | timestamp null | soft delete |
| `last_login_at` | timestamp null | written by `RecordUserLastLogin` listener |

Model `User` (`api/app/Models/User.php`): `#[Fillable(name, email, password, google_id, avatar_url, plan_id)]` (note `plan_id` is mass-assignable; `invite_id` and `plan_expires_at` are not and are written with `forceFill`); `#[Hidden(password, remember_token)]`; `$appends = ['has_password']` (`password !== null`); casts `email_verified_at`, `last_login_at`, `plan_expires_at` datetime and `password` hashed. Traits: `HasApiTokens`, `SoftDeletes`, `Notifiable`, `LogsActivity` (logs `name, email, email_verified_at, plan_id, plan_expires_at, invite_id`, dirty only), `AuthenticationLoggable`. Domain methods: `canUseAutoDj()`, `canEmbed()`, `canUseEncoder()`, `watermarked()` (needs config `liquidsoap.watermark_enabled` AND plan flag), `runningStationsCount()`, `sendEmailVerificationNotification()` (upserts `email_verification_codes`, 6 digits, 15 min).

Account deletion (`AccountController`): deletes tokens, then rewrites `email` to `deleted-{id}-{uuid}@deleted.gocast.local`, nulls `google_id`, `avatar_url`, `email_verified_at`, then soft-deletes. `UserObserver::deleting` soft-deletes each station (or force-deletes them, trashed included, when the user is force-deleted). Nothing prunes soft-deleted users, so the `users` row (with its rewritten email) is kept forever.

### password_reset_tokens, sessions

Laravel defaults from the users migration. `password_reset_tokens (email pk, token, created_at null)` is named in `config/auth.php` but the app does not use the password broker: resets go through `password_reset_codes` (no `Password::broker`/`sendResetLink` call in `app/` or `routes/`). `sessions (id pk, user_id null indexed, ip_address(45) null, user_agent text null, payload longtext, last_activity int indexed)` is only used if `SESSION_DRIVER=database` (config default); `.env.example` sets `redis`.

### cache, cache_locks, jobs, job_batches, failed_jobs

Laravel defaults (`0001_01_01_000001/2`). `cache (key pk, value mediumtext, expiration bigint idx)`, `cache_locks (key pk, owner, expiration idx)`, `jobs (id, queue idx, payload longtext, attempts utinyint, reserved_at/available_at/created_at uint)`, `job_batches`, `failed_jobs (uuid unique, connection, queue, payload, exception, failed_at default now)`. Config defaults are `database` for cache and queue (`config/cache.php`, `config/queue.php`) but `.env.example` selects `redis` for session, cache and queue, so with the example env these tables are idle (only `failed_jobs`, `queue.failed.driver = database-uuids`, is still written). `ListenerAnalytics`, `StationEvent::withinRateCap` and `SyncListenerCounts` use Redis/Cache directly.

### personal_access_tokens

Sanctum default (`2026_04_03_185355`): `id`, `tokenable_type/tokenable_id` (morphs, indexed), `name` text, `token` string(64) unique, `abilities` text null, `last_used_at` null, `expires_at` null indexed, timestamps. Created in `AuthController` and `GoogleAuthController` (`createToken`). See [Auth](auth.md).

### plans

See the seeded values above. Schema:

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `slug` | string(30) unique | |
| `name` | string(50) | |
| `max_stations` | uint default 1 | enforced by `StoreStationRequest::authorize` (`stations()->count() < plan->max_stations`, soft-deleted excluded) |
| `max_running_stations` | uint default 1 | enforced by `StationLifecycleService::assertCanRunAnother` (running = `desired_state='running'`) |
| `max_listeners` | uint default 25 | **display only**, see gaps |
| `autodj_enabled` | bool default false | |
| `watermark_enabled` | bool default false | plus global config kill switch |
| `analytics_days` | usmallint default 0 | gates the *display* window in the audience page (`AudienceController`, `UserResource`) |
| `embed_enabled` | bool default false | |
| `encoder_enabled` | bool default false | |
| `created_at`, `updated_at` | | |

Dropped: `idle_stop_hours` (added 2026-08-15, dropped 2026-08-29 when `stations:sweep` replaced the idle reaper). Model `Plan`: `$guarded = []`, casts the five boolean/int flags (not `max_*`), `LogsActivity` on every limit and flag, `users()`, `isFree()`. Admin editing of plans is not part of this doc; see [Accounts, plans, invites](accounts-plans-invites.md).

### stations

The widest table. Migrations: create, `add_missing_indexes`, `add_featured`, `add_plan_id...` (drops), `add_deleted_at`, `add_desired_state`, `add_last_ready_at`, `drop_is_live`, `add_jingle_settings`, `add_jingle_mode`, `add_autodj_cursor` (later dropped), `add_container_index`, `add_silent_since`, `add_featured_at`, `add_timezone`, `add_autodj_order` (later dropped), `add_stream_key`, `drop_autodj_columns`, `add_autodj_last_playlist_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `container_index` | uint, NOT NULL, unique | first column after `id`; slot in the container IP space (`LiquidsoapSupervisor::containerIp`, `config/liquidsoap.php`); assigned in `StationObserver::creating` as `max(container_index over withTrashed) + 1`; never recycled |
| `user_id` | bigint FK users, cascade, indexed | |
| `name` | string(100) | |
| `slug` | string(60) unique | generated in `Station::booted()` (`-2`, `-3` suffixes, checks `withTrashed`, base capped to 55 chars); no code path regenerates it on update |
| `description` | text null | |
| `genre` | string(255) null | |
| `timezone` | string(64) null | IANA name; shared by show times and AutoDJ slots; null means no `nextOccurrence()` |
| `artwork_url` | string(255) null | validators allow up to 2048 chars (`StoreStationRequest`, `UpdateStationRequest`), longer than the column |
| `featured` | bool default false, indexed | |
| `featured_at` | timestamp null, indexed | backfilled to `updated_at` for pre-existing featured rows; written together with `featured` by `Station::markFeatured()` |
| `desired_state` | enum(`stopped`,`running`) default `stopped`, indexed | owner intent; `Station::STATE_STOPPED/STATE_RUNNING` |
| `started_at` | timestamp null | last transition to running |
| `last_ready_at` | timestamp null | stamped by `StationEventController` on the container's ready event |
| `silent_since` | timestamp null | the auto-stop clock; written by `SweepStations`/`StopStation` |
| `autodj_last_playlist_id` | char(26) null | which playlist the rotation last drew from; **no FK**; written by `AutoDjScheduler` via query builder |
| `icecast_mount` | string(255) | no DB default; `Station::booted()` `creating` sets `/stream/{slug}` when empty; read by `SyncListenerCounts` and the .liq |
| `icecast_password` | string(255) | random 32 chars; **not used by the audio path**, see gaps |
| `stream_key` | text null | `encrypted` cast (ciphertext is ~250 bytes, hence `text`); 32 chars `[A-Za-z0-9]`; minted on create and backfilled for all rows including trashed |
| `stream_key_rotated_at` | timestamp null | |
| `social_links` | json null | cast `array`; max 8 links (`Station::MAX_SOCIAL_LINKS`), each `{label<=30, url<=2048}` |
| `theme_config` | json null | cast `array`; accepted by `UpdateStationRequest` (`nullable array`, no shape rules) and echoed by `StationResource`; declared in `client/interfaces/Station.ts` and used by no other client file (grep) |
| `jingles_enabled` | bool default false | |
| `jingle_interval_seconds` | uint default 1800 | |
| `jingle_mode` | string(16) default `interval` | `interval` or `tracks` |
| `jingle_every_tracks` | uint default 5 | |
| `created_at`, `updated_at` | | |
| `deleted_at` | timestamp null | soft delete |

Other indexes: none beyond those listed (`is_live` index went with the column).

Dropped or renamed:
- `plan` enum, `stripe_customer_id`, `stripe_subscription_id`: dropped 2026-04-16 when the plan moved to `users.plan_id`.
- `is_live` (bool + index): dropped 2026-08-16. Live-ness is now "has an open `stream_sessions` row" (`Station::scopeLive()`, `isLive()`). The `Station` docblock still lists `@property bool $is_live` (stale).
- `autodj_cursor_position`, `autodj_order`, `autodj_deck`: added 2026-08-18 / 2026-09-12, moved into `playlists` and dropped 2026-09-20 after `backfill_default_playlists` copied them into each station's default playlist. Rolling back in order restores them: `drop_autodj_columns::down()` recreates empty columns and `backfill_default_playlists::down()` copies each default playlist's `order/cursor_position/deck` back (then deletes every `playlist_track` and `playlists` row).

Model `Station` (`api/app/Models/Station.php`): `$guarded = []` (everything is mass-assignable; request classes are the gate; there is no `$hidden`, so `icecast_password` and the decrypted `stream_key` would serialize if a raw model were ever returned instead of `StationResource`); `HasUuids`, `SoftDeletes`, `LogsActivity` (logs `name, slug, description, genre, featured, desired_state`, dirty only); route key is `slug`. Casts: `featured`, `jingles_enabled` boolean; `jingle_*` integer; `stream_key` encrypted; `stream_key_rotated_at`, `featured_at`, `started_at`, `silent_since`, `last_ready_at` datetime; `social_links`, `theme_config` array. Not cast: `timezone`, `desired_state`, `container_index`.

Model hooks: `creating` sets slug, mount, icecast password, stream key, `desired_state`, jingle defaults; `created` force-creates the default playlist (`Main rotation`, sequential, position 0). `StationObserver` (registered in `AppServiceProvider`) on changes to `name, slug, description, genre, icecast_mount` calls `supervisor->up()` only if the station is running and nobody is live (else the reconciler recreates it after the show); a slug change additionally runs `downBySlug(oldSlug)` and renames the playlist directory first (even when stopped, in which case it stops there). Jingle column changes on a running station are pushed over telnet without a restart. `deleting` (soft or force) brings the container down; `forceDeleted` wipes the playlist directory and container artifacts; `restored` brings it back up if `desired_state` is running. `UserObserver::updated` on a `plan_id` change re-pushes watermark and jingle settings to each of the user's running stations. Scopes: `running()`, `live()`, `featured()`, `indexable()`/`withIndexability()` (running, or ever had a stream session, or ever had listener stats). Constants: `FEATURED_RAIL_SIZE` 4, `MAX_SOCIAL_LINKS` 8, `DEFAULT_JINGLE_INTERVAL_SECONDS` 1800, `DEFAULT_JINGLE_EVERY_TRACKS` 5. Methods: `rotateStreamKey()`, `isIndexable()`. Jingle clock columns (`autodj_last_jingle_at/_id`, `autodj_songs_since_jingle`) and the last-handed-out track (`autodj_queued_at/_start/_airtime`) are written by `JingleClock`/`AutoDjScheduler` with the query builder, never through the model; `jingle_times` is minutes past the hour for `jingle_mode = times`. `autodj_slots.start_mode` is `soft` or `hard`.

### stream_sessions

A broadcaster holding the microphone, not an audience member. Rows exist only for live broadcasts; AutoDJ airtime leaves none.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `station_id` | uuid FK stations, cascade, indexed | |
| `started_at` | timestamp | |
| `ended_at` | timestamp null, indexed | null = currently live |
| `peak_listeners` | uint default 0 | raised by `listeners:sweep` via a conditional `UPDATE ... WHERE peak_listeners < count` |
| `source_type` | enum(`browser`,`electron`,`external`) default `browser` | `StreamSessionController` only accepts `browser`/`electron` from clients; `external` is written by `StationEventController` when the container reports `via=external` |
| `client` | string(255) null | encoder software name, trimmed, `''` becomes null |
| `created_at`, `updated_at` | | |

Dropped: `total_listener_minutes` (2026-08-30; nothing ever wrote it). Model: `$guarded = []`, `HasUuids`, casts `started_at`, `ended_at` datetime, `peak_listeners` integer.

### listener_sessions

One anonymous listener session. Pruned (see Retention).

| Column | Type | Notes |
|---|---|---|
| `id` | char(22) pk | minted by `ListenerAnalytics`, `$incrementing=false`, string key |
| `station_id` | uuid FK, cascade | |
| `transport` | enum(`hls`,`icecast`) default `hls` | |
| `country` | char(2) null | |
| `device` | string(16) null | |
| `browser` | string(32) null | |
| `referrer_host` | string(255) null | |
| `visitor_hash` | char(64) null | sha256, not linkable to an IP or across days |
| `started_at`, `last_seen_at` | timestamp | no `created_at`/`updated_at`; `$timestamps=false` |
| `ended_at` | timestamp null | |
| `seconds` | uint default 0 | |

Indexes: `(station_id, started_at)`, `(ended_at, last_seen_at)`, `(started_at)`. Model scopes `open()` (ended_at null) and `qualified()` (`seconds >= analytics.min_listen_seconds`, default 60). `$guarded = []`. See [Listener analytics](listener-analytics.md).

### listener_stats_hourly

Permanent per-station hourly rollup; sparse (no row for an empty hour).

| Column | Type |
|---|---|
| `id` | bigint pk |
| `station_id` | uuid FK, cascade |
| `hour` | timestamp |
| `peak_listeners`, `listener_minutes` | uint default 0 |
| `sampled_minutes` | usmallint default 0 |
| `sessions_started`, `unique_listeners`, `qualified_listens` | uint default 0 |

Unique `(station_id, hour)`. No timestamps. `listeners:sweep` (`SweepListenerSessions`, via `ListenerAnalytics::recordSample`, an upsert at `ListenerAnalytics.php` line ~312) owns `peak_listeners/listener_minutes/sampled_minutes`; `listeners:rollup` (hourly at :05) owns `sessions_started/unique_listeners/qualified_listens` and its upsert omits the three sampled columns. All integer-cast.

### listener_geo_daily

`id`, `station_id` FK cascade, `day` date, `country` char(2) NOT NULL, `sessions` uint default 0, `listener_seconds` ubigint default 0; unique `(station_id, day, country)`; no timestamps. Written by raw `INSERT ... ON DUPLICATE KEY UPDATE` in `RollupListenerStats::rollupCountries` (closed sessions with a country only, trailing `--days` window); the only country history that outlives `listener_sessions`. Attributed to the day the session started.

### station_events

Append-only timeline; never load-bearing (`StationEvent::record()` swallows its own exceptions).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `station_id` | uuid FK, cascade | |
| `type` | string(32) | vocabulary in `StationEvent::TYPES` (13 values: `started, stopped, boot, shutdown, icecast_connected, icecast_disconnected, icecast_error, live_connected, live_disconnected, track_uploaded, track_deleted, playlist_changed, stream_key_rotated`; the 7 container ones are `CONTAINER_TYPES`) |
| `source` | string(16) | `container`, `owner`, `admin`, `system` |
| `causer_type`, `causer_id` | string null | morph class and key as strings, no FK |
| `properties` | json null | cast `array`; `[]` is stored as null |
| `created_at` | timestamp null | only timestamp; `UPDATED_AT = null` |

Indexes: `(station_id, created_at)`, `(created_at)`. Container-sourced writes are capped at `station_events.max_per_minute` (default 60) per station per minute via a cache counter. There is deliberately no "autodj started" type (it is derived from `live_disconnected`); `TYPES` is what the admin filter offers. See [Observability and events](observability-and-events.md).

### station_notify_subscriptions

Anonymous "notify me when this station goes live" opt-ins. `id`, `station_id` FK cascade, `email` string(255), `notified_at` null, timestamps; unique `(station_id, email)`, index `email`. `StationNotifyController` resets `notified_at` to null on re-subscribe; `SendStationLiveNotifications` sets it after mailing. The migration comment says delivery is "TODO" but the job exists.

### tracks

Every uploaded audio file, music or jingle.

| Column | Type | Notes |
|---|---|---|
| `id` | ulid pk | |
| `station_id` | uuid FK, cascade | |
| `kind` | string(16) default `music` | `music` or `jingle` (`Track::KINDS`); model `$attributes` also defaults it |
| `path` | string(255) | `{ulid}.{ext}` relative to the station's playlist dir |
| `original_filename` | string(255) | shown in `TrackResource`; the upload part's filename, or the `names[N]` override `TrackImporter::import` accepts (mobile sends it because Expo percent-encodes part filenames), reduced to its last path segment |
| `title` | string(255) | |
| `artist` | string(255) null | |
| `duration_seconds` | float default 0 | |
| `loudness_lufs`, `true_peak_db`, `cue_in_seconds`, `cue_out_seconds` | float null | analyser output |
| `analyzed_at` | timestamp null, indexed | set on success and on failure |
| `analysis_error` | string(255) null | |
| `file_size_bytes` | ubigint | |
| `position` | uint | 1-based, gap-free per station AND kind (maintained by `TrackImporter`) |
| `created_at`, `updated_at` | | |

Indexes: `(station_id, position)`, `(station_id, kind, position)`, `(analyzed_at)`. Model: `$fillable = ['title','artist']` only (everything else is `forceFill`ed or set by the factory), casts floats/ints/`analyzed_at`, scopes `music()`/`jingles()`, `playlists()`. The library `position` is still maintained but a music track only plays if it is in a playlist; playback order comes from `playlist_track.position`.

### playlists

Migration `2026_09_20_134240`. Rotation state that used to live on `stations`.

| Column | Type | Notes |
|---|---|---|
| `id` | ulid pk | |
| `station_id` | uuid FK, cascade | |
| `name` | string(60) | |
| `is_default` | bool default false | exactly one per station by convention; nothing in the schema enforces it |
| `order` | string(16) default `sequential` | `sequential` or `shuffle` (`Playlist::ORDERS`) |
| `cursor_position` | uint null | pivot position last handed out (sequential); written with the query builder |
| `deck` | json null | shuffle: remaining track ids; null and `[]` both mean deal a new one |
| `position` | uint default 0 | display order |
| `created_at`, `updated_at` | | |

Indexes: `(station_id, position)`, unique `(station_id, name)`. Model: `$fillable = ['name','order','position']`, so `station_id` and `is_default` are set through the relation (`forceCreate` in `Station::created`) or `forceFill`. Casts `is_default` bool, `cursor_position`/`position` int, `deck` array. The backfill named each existing station's default `Main rotation`, copying `autodj_order/cursor/deck` and every `kind='music'` track into the pivot in `position` order. Note `order` is a SQL reserved word; Eloquent quotes it, raw SQL must too.

### playlist_track

Pivot with a composite primary key, no timestamps and no id: `playlist_id` (ulid FK playlists, cascade), `track_id` (ulid FK tracks, cascade), `position` uint; primary `(playlist_id, track_id)`; index `(playlist_id, position)`. A track can be in many playlists with a different position in each. `Playlist::tracks()` filters to `tracks.kind = 'music'`; the schema does not stop a jingle being attached, but `PlaylistTracksRequest` only accepts track ids whose `tracks.kind = 'music'` and belong to the playlist's station (max 2000 ids per request).

### autodj_slots

AutoDJ programming (which playlist plays when). Not the advertised show times.

| Column | Type | Notes |
|---|---|---|
| `id` | ulid pk | |
| `station_id` | uuid FK, cascade | |
| `playlist_id` | ulid FK playlists, cascade | slots vanish with their playlist |
| `label` | string(60) null | |
| `days` | json | array of weekday ints, 0 = Sunday, the day the slot **starts**; no DB constraint on values |
| `start_time`, `end_time` | time | end at or before start means it runs into the next day |
| `position` | uint default 0 | |
| `created_at`, `updated_at` | | |

Index `(station_id, position)`. Model `AutodjSlot`: `#[Fillable(...)]` all columns except `id`, casts `days` array and the two times `string`, and `windowsBetween()` builds concrete DST-safe windows. Full behaviour in [Schedule](schedule.md) and [AutoDJ](autodj.md).

### station_schedules

Advertised show times. Display only.

`id` ulid pk, `station_id` FK cascade, `label` string(60) null, `days` json, `start_time` time (no end), `position` uint default 0, timestamps; index `(station_id, position)`. Model `StationSchedule`: fillable `station_id,label,days,start_time,position`; casts `days` array, `start_time` string; `nextOccurrence()` returns null if the station has no `timezone`, skips weekdays outside 0-6. Nothing in the audio path reads this table (see [Schedule](schedule.md)).

### invites

`id`; `code` string(40) unique; `plan_id` FK plans (restrict); `duration_days` uint null (null = no expiry); `label` string(255) null; `email` string null; `recipient_name` string null; `personal_note` text null; `max_uses` uint default 1; `uses` uint default 0; `expires_at` null; `sent_at` null; `created_by` FK admins `nullOnDelete` null; timestamps. Column order was built up over four migrations (`create_invites`, `add_email_and_sent_at`, `add_recipient_fields`). Model `Invite`: `$fillable` excludes `uses` (only `InviteRedemption` writes it, with a conditional UPDATE) and `sent_at`; `CODE_LENGTH` 20 (random) or a readable `Label-GoCast-Plan` code that must fit 40 chars (`codeFor`); scope `redeemable()`; `isExhausted/isExpired/isRedeemable/wasSent`; `url()` gives `{services.frontend_url}/auth/register?invite={code}`; logs activity. `expires_at` is the code's redeem-by date; `duration_days` is how long the granted plan lasts (`users.plan_expires_at`). See [Accounts, plans, invites](accounts-plans-invites.md).

### email_suppressions

`id`, `email` string(255) unique, `reason` string(255) default `unsubscribed`, `invite_id` FK invites `nullOnDelete` null, timestamps. Model: `$fillable = [email, reason, invite_id]`, `suppresses()`, idempotent `record()` (`firstOrCreate`). Checked by admin invite sending and `RawEmailSender`; it governs outreach mail, not account mail.

### waitlist_entries

Access requests (the "Pro request" flow) and public enquiries.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint pk | |
| `user_id` | bigint FK users null, `nullOnDelete` | null = public enquiry with no account |
| `email` | string(255) indexed | |
| `plan` | string(30) indexed | requested plan slug as free text, not an FK (`pro` from `storePro`) |
| `social` | string(255) null | |
| `message` | text null | |
| `status` | string(20) default `pending`, indexed | `pending/approved/rejected` (`WaitlistEntry::STATUSES`) |
| `reviewed_at` | timestamp null | |
| `reviewed_by` | bigint FK admins null, `nullOnDelete` | |
| `created_at`, `updated_at` | | |

Unique `(email, plan)`. `WaitlistController::record` does `updateOrCreate` on that pair and reopens a rejected one. Model: `$fillable = [user_id, email, plan, social, message]` (review columns are not mass-assignable; `markReviewed()` and `reopen()` use `forceFill`), scope `pending()`, `isGrantable()` (pending and has a user). `AppServiceProvider` sends an admin Telegram message on created and updated.

### admins

Separate identity for the Blade admin panel. History: `2026_08_17_120000_drop_admins_table` dropped an older Filament-era table (with 2FA columns and `email_verified_at`; its `down()` recreates that shape); `2026_08_18_120000_create_admins_table` recreated a narrower one. Final: `id`, `name`, `email` unique, `password`, `last_login_at` null, `remember_token`, timestamps. Model `Admin`: `#[Fillable(name,email,password)]`, hidden `password, remember_token`, casts `last_login_at` datetime, `password` hashed, `LogsActivity` (name, email), `AuthenticationLoggable`. Created only by `php artisan admin:create`, password reset by `admin:reset-password`. Guard `admin` in `config/auth.php`. Rows in `activity_log` and `authentication_log` that pointed at the earlier admin table's ids were left in place and can now point at unrelated new admins (the morph key is the same class name and integer ids restart).

### email_verification_codes

`user_id` bigint **primary key** and FK users (cascade), `code_hash` string(255), `attempts` utinyint default 0, `expires_at` timestamp, `created_at` default now (no `updated_at`). Model: primary key `user_id`, non-incrementing, `UPDATED_AT = null`, `CODE_TTL_MINUTES` 15, `MAX_ATTEMPTS` 5, `isExpired()`.

### password_reset_codes

`email` string primary, `code_hash`, `attempts` utinyint 0, `expires_at`, `created_at` default now. Model: key `email` (string, non-incrementing), same TTL 15 and `MAX_ATTEMPTS` 5. No foreign key to users, so codes can exist for unknown addresses.

### notifications

Laravel database notifications: `id` uuid pk, `type` string, `notifiable_type/notifiable_id` (morphs), `data` **text**, `read_at` null, timestamps, plus a `created_at` index added 2026-09-15 for the prune. No model of its own (`DatabaseNotification`). `notifications:prune` deletes rows older than `notifications.retention_days` (default 90).

### activity_log

Spatie activity log: `id`, `log_name` string null indexed, `description` text, `subject_type/subject_id` string null (index `subject`), `event` string null, `causer_type/causer_id` string null (index `causer`), `attribute_changes` json null, `properties` json null, timestamps. Written by `LogsActivity` on `User`, `Station`, `Plan`, `Invite`, `Admin` and explicitly by `activity()` calls in the admin controllers `AccountController`, `AnnouncementController`, `InviteController`, `StationController` and `RawEmailController`. There is no `batch_uuid` column.

### authentication_log

`id`, `authenticatable_type` string, `authenticatable_id` ubigint, `ip_address` string(45) null, `user_agent` string(500) null, `login_at` null, `login_successful` bool default false, `logout_at` null, `cleared_by_user` bool default false, `location` string(255) null, timestamps; indexes `(authenticatable_type, authenticatable_id)`, `login_at`, `ip_address`. Written by `LogAuthenticationEvents` (Login, Failed, Logout; logout updates the latest open row or inserts one with only `logout_at`; Failed rows are written only when the guard resolved a user). `cleared_by_user` and `location` are never written by application code (only the boolean cast for `cleared_by_user` exists).

## Retention and pruning

| Table | Pruned by | Window | Scheduled |
|---|---|---|---|
| `listener_sessions` | `listeners:prune` | `analytics.retention_days`, default 90 (`ANALYTICS_RETENTION_DAYS`, 0 disables), by `started_at` | yes, daily 04:20 |
| `station_events` | `stations:prune-events` | `station_events.retention_days`, default 30, daily 04:50 | yes |
| `notifications` | `notifications:prune` | `notifications.retention_days`, default 90, daily 05:00 | yes |
| `stations` (soft-deleted) | `stations:prune-deleted` (`--days`, `--dry-run`) | `liquidsoap.deleted_station_retention_days`, default 30; 0 disables | yes, daily 04:40 |
| `users` (soft-deleted) | nothing | forever | no |
| `users.plan_id` | `plans:expire` (downgrades rather than deletes) | `plan_expires_at <= now()`, hourly | yes |
| `listener_stats_hourly`, `listener_geo_daily`, `stream_sessions`, `tracks` | none | forever | n/a |
| `activity_log` | `config/activitylog.php` sets `clean_after_days = 365` but `activitylog:clean` is not scheduled | unbounded | no |
| `authentication_log` | nothing | unbounded | no |

## Columns nothing reads or enforces

Verified by grepping `api/app`, `api/routes`, `api/resources`, `api/config`, `client` (for `theme_config`):

- `users.stripe_customer_id`: never assigned anywhere; `UserResource` still returns it. Dead since billing was dropped.
- `stations.icecast_password`: generated on create, but the rendered script takes its source password from `config('services.icecast.source_password')` (`LiquidsoapSupervisor` passes `icecastPassword` from config to the .liq view). Editing it changes nothing and, since 2026-10-06, restarts nothing.
- `stations.theme_config`: stored and echoed by the API, no consumer in the client beyond the TypeScript interface.
- `plans.max_listeners`: shown in the admin plan list, `UserResource` (`plan.max_listeners`), notification emails, the web `dashboard/settings` page and the mobile account screen ("Up to N listeners at once"). No code enforces a listener cap. `max_stations` is enforced, and the product treats a user as having one station in the client, though Pro carries 5.
- `plans.watermark_enabled`: enforced only if the global `liquidsoap.watermark_enabled` config is on (see [Watermark clips](watermark-clips.md)).
- `authentication_log.cleared_by_user`, `authentication_log.location`: never written.
- `stations.autodj_last_playlist_id`: monitoring only (docblock and `AutoDjScheduler` agree); safe to be stale, dangling, or null.
- `tracks.position`: still maintained per kind; not used for playback order any more (pivot position is).
- `password_reset_tokens`, and (with the example env) `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`: tables exist but are idle.

## Gaps and traps

1. Plans are migration data, not seed data. A fresh DB needs `php artisan migrate` (not just `db:seed`) to have any plan; `users.plan_id` default `1` assumes the Free row keeps id 1.
2. `plans.max_listeners` is not enforced anywhere, only displayed (admin, web settings page, mobile account screen) and quoted in emails. `max_stations` is enforced (5 on Pro) while emails and the client treat the product as one station (`ProAccessGranted` docblock, `AccessRequestReviewTest`).
3. `users.stripe_customer_id` is dead but still exposed through `UserResource`; the Station model docblock also still lists a dropped `is_live` property.
4. `stations.icecast_password` looks like a credential but is not used by the audio path. `Station` has no `$hidden`, and `$guarded = []`; only `StationResource` and the request classes protect `stream_key`, `icecast_password` and mass assignment.
5. `User::$fillable` includes `plan_id`. Any code path that passes unvalidated input into `User::create/update` can change a plan. `invite_id` and `plan_expires_at` are correctly guarded.
6. `stations.artwork_url` is `varchar(255)` but request validation allows 2048 characters; a longer valid URL fails at the database, not validation.
7. `autodj_last_playlist_id` has no foreign key; deleting a playlist leaves the id dangling (harmless, monitoring only). Likewise nothing in the schema enforces "exactly one default playlist per station" (unique on `(station_id, name)` only); that is application-level: `Station::created` creates it, `PlaylistController::destroy` answers 409 for a default playlist, and `update` with `is_default` clears the flag on the station's other playlists before setting it.
8. Soft-deleting a station cascades nothing, so its tracks, sessions, slots and playlists remain (and count in some joins) until `stations:prune-deleted` removes it after 30 days. Restoring returns the station to its previous `desired_state`.
9. `container_index` is assigned as `MAX + 1` in an observer; two simultaneous creates can collide on the unique index and one fails. It is `NOT NULL` at the DB level but the `Station` docblock omits it and `LiquidsoapSupervisor::containerIp` still checks for null.
10. Migrations `add_stream_key` and `backfill_default_playlists` depend on model code and column presence at run time; a future rename of `Station::generateStreamKey()` or of `tracks.kind` breaks a fresh `migrate`.
11. `drop_is_live::down()` recreates the column empty (all false); `drop_autodj_columns::down()` recreates empty columns and relies on the backfill migration's `down()` to refill them, so rolling back only the drop loses the state. `backfill_default_playlists::down()` also deletes ALL playlists and pivot rows.
12. `admins` was dropped and recreated (on a fresh database the drop migration is a no-op `dropIfExists`, since no migration in the repo creates the earlier table); historical `activity_log` and `authentication_log` rows with `admin` morph ids from the earlier table are ambiguous with new admins.
13. `activity_log` and `authentication_log` grow without bound (`activitylog:clean` is configured for 365 days but not scheduled; no prune command exists for `authentication_log`). `listener_stats_hourly` and `listener_geo_daily` are permanent by design.
14. `waitlist_entries.plan` is a free-text slug with a unique `(email, plan)` key rather than a plan FK, so a renamed plan slug orphans history.
15. `station_notify_subscriptions` migration comment says delivery is TODO; delivery exists (`SendStationLiveNotifications`), so that comment is stale.
16. `notifications` has no model in `app/Models` and `data` is `text`, not `json`.
17. `password_reset_tokens` is configured in `config/auth.php` but unused; resets use `password_reset_codes`, which has no FK to `users`.
18. Default `SESSION_DRIVER`/`CACHE_STORE`/`QUEUE_CONNECTION` in config is `database`; `.env.example` overrides all three to `redis`. An environment missing those variables silently uses the database tables.

## Tests

No test asserts the schema as a whole. Relevant: `api/tests/Feature/PlaylistBackfillMigrationTest.php` (the default-playlist backfill), plus the many feature tests that build `Plan` rows with `updateOrCreate` (for example `AudienceControllerTest`, `HarborAuthTest`, `StreamKeyRotationTest`, `StationEncoderResourceTest`) which set Free `max_listeners` 100 and Pro 1000, matching the migrations. Run only targeted files; the API suite takes minutes.

## History

Individual features that changed the schema are documented in their own docs ([Schedule](schedule.md), [Listener analytics](listener-analytics.md), [Encoder ingest](encoder-ingest.md), [Station lifecycle](station-lifecycle.md)). Notable schema events in order: 2026-04 initial users/stations/sessions/plans; 2026-08-15 `desired_state` split from row existence; 2026-08-16 `is_live` dropped; 2026-08-17/18 admins dropped and recreated; 2026-08-29 `container_index`, `silent_since`, `idle_stop_hours` dropped; 2026-08-30 listener analytics tables; 2026-09-09 invites and `station_events`; 2026-09-11 timezone and show times; 2026-09-15 stream keys and encoder flag; 2026-09-20 playlists and AutoDJ slots replaced `stations.autodj_*`.
