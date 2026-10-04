---
feature: Configuration reference (every env var and config key)
verified: 2026-10-04 against e145a37 plus uncommitted work (named route throttles, session-expiry redirect)
sources:
  - api/config/activitylog.php
  - api/config/analytics.php
  - api/config/app.php
  - api/config/auth.php
  - api/config/broadcasting.php
  - api/config/cache.php
  - api/config/cors.php
  - api/config/database.php
  - api/config/filesystems.php
  - api/config/liquidsoap.php
  - api/config/logging.php
  - api/config/mail.php
  - api/config/notifications.php
  - api/config/queue.php
  - api/config/sanctum.php
  - api/config/sentry.php
  - api/config/services.php
  - api/config/session.php
  - api/config/station_events.php
  - api/.env.example
  - api/phpunit.xml
  - api/tests/TestCase.php
  - api/bootstrap/app.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Observers/UserObserver.php
  - api/app/Models/StationEvent.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Controllers/GoogleAuthController.php
  - api/app/Services/TrackAnalyzer.php
  - api/app/Console/Commands/ReconcileStations.php
  - api/app/Services/AdminTelegram.php
  - api/app/Jobs/SendAdminTelegramAlert.php
  - api/routes/console.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Services/GeoResolver.php
  - api/app/Services/ListenerAnalytics.php
  - api/app/Services/BroadcastTokenService.php
  - api/app/Console/Commands/SyncListenerCounts.php
  - api/app/Http/Controllers/AuthController.php
  - api/app/Http/Controllers/ResendWebhookController.php
  - api/app/Webhooks/Resend/EmailReceived.php
  - api/resources/views/liquidsoap/station.blade.php
  - infra/native/env/api.env.example
  - infra/native/env/domains.env.example
  - infra/native/docker-compose.native.yml
  - infra/native/deploy-native.sh
  - infra/native/setup-native.sh
  - infra/native/systemd/gocast-client.service
  - infra/native/php/gocast.pool.conf
  - infra/native/station-router/ingest.js
  - infra/alloy/config.alloy
  - infra/liquidsoap/Dockerfile
  - client/.env.example
  - client/lib/env.ts
  - client/lib/public-api.ts
  - client/lib/api-server.ts
  - client/next.config.ts
  - client/instrumentation-client.ts
  - client/sentry.server.config.ts
  - client/sentry.edge.config.ts
  - client/playwright.config.ts
  - client/app/hls-proxy/[...path]/route.ts
  - client/app/layout.tsx
  - mobile/.env.example
  - mobile/app.json
  - mobile/eas.json
  - mobile/src/lib/api.ts
  - mobile/src/lib/web.ts
  - mobile/src/lib/auth.tsx
  - mobile/src/broadcast/broadcastManager.ts
  - mobile/scripts/ingest-proxy.mjs
fingerprint: 8cb9b4322890f607
---

# Configuration reference

There are four separate configuration surfaces and they do not share a file format or a reader: the Laravel API (`api/.env` through `api/config/*.php`), the Next.js web app (`client/.env*`, mostly inlined at build time), the Expo mobile app (`mobile/.env`, inlined at bundle time), and the native host (`infra/native/env/*`, which renders nginx/systemd/php-fpm and passes `NEXT_PUBLIC_*` to the client build). The Liquidsoap station containers are configured by none of them at runtime: **no environment variable is passed to any station container**, every value is baked into a rendered `.liq` file or a `docker run` flag when the station starts.

The one thing people get wrong: **changing a value is not the same as it taking effect**. API values are cached by `config:cache` in production and read once per PHP worker; station-container values only change on the next render-and-start (`LiquidsoapSupervisor::start`); `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are frozen into the JS bundle at build time and cannot be fixed by editing a service file.

Notation used in tables: **Prod / Dev / Test** says whether the value must be set (`required`), can be left to its default (`default ok`), or is forced by the test runner (`forced`). "Reader" is the file that consumes the config key; a value in `vendor` means a Laravel/package file reads it, not app code.

## How configuration is loaded

- No file under `api/app`, `api/routes`, `api/bootstrap`, `api/database` or `api/resources` calls `env()` (grepped). Everything goes through `config(...)`, so `config:cache` is safe. The tables below are therefore the complete list of what the API reads from the environment (plus Laravel's own framework config, see below).
- Laravel 11+ merges `vendor/laravel/framework/config/*.php` under the app's config. `api/config/hashing.php` does not exist in the repo, so `BCRYPT_ROUNDS` is read from the framework's `hashing.php` (`'rounds' => env('BCRYPT_ROUNDS', 12)`), not from any app file. That is why it looks "unread" in a grep of `api/config`.
- `APP_ENV` matters in exactly two app code paths: `LiquidsoapSupervisor::inTestMode()` (`app()->runningUnitTests()`, `LiquidsoapSupervisor.php:181`) and `E2EAuthCommand` (`app()->environment(['local','testing'])`). See "Test environment" below.
- `api/config/app.php` hardcodes `timezone` to `UTC` (no env var). All schedule and station times are stored in UTC; per-station timezones are a separate data concern (see [Schedule](schedule.md)).
- Laravel's `.env` is loaded by the app only when config is not cached. On the native host `config:cache` is on, so `.env` edits need `php artisan config:cache` (deploy does it). Anything a subprocess needs (`DOCKER_HOST`) must be a real process env var, see "Native host".

## API: application core

Stock Laravel keys with their defaults from `api/config/*.php`. Values shown in `.env.example` are what the shipped template sets (prod-shaped).

| Variable | Default (config) | `.env.example` | Meaning and reader | Prod / Dev / Test |
|---|---|---|---|---|
| `APP_NAME` | `Laravel` | `GoCast` | `config('app.name')`: admin layout/login titles (`resources/views/admin/*.blade.php`, `welcome.blade.php`), mail From name fallback, cache/session-cookie prefix slug. | default ok / default ok / - |
| `APP_ENV` | `production` | `production` | Environment name. See "Test environment". | required `production` / `local` / forced `testing` |
| `APP_KEY` | none | blank (`key:generate`) | Encryption key; also the HMAC key for broadcast tokens (`BroadcastTokenService::signingKey()`, throws if empty) and the daily listener IP hash (`GeoResolver::visitorHash`). Rotating it invalidates outstanding broadcast tokens and re-encrypts nothing. | required / required / required (tests read it from the dev `.env`) |
| `APP_PREVIOUS_KEYS` | empty | not listed | Comma list of old keys still accepted for decryption (`app.previous_keys`, vendor). | optional |
| `APP_DEBUG` | `false` | `false` | Debug pages. Must be false on a public host. | required false / true / - |
| `APP_URL` | `http://localhost` | `https://api.gocast.fm` | Artisan URL generation, `filesystems.disks.public.url` (`APP_URL/storage`), mail EHLO domain, `GOOGLE_REDIRECT_URI` default in the template. | required / required / - |
| `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `APP_FAKER_LOCALE` | `en`, `en`, `en_US` | same | Laravel locale (vendor). | default ok |
| `APP_MAINTENANCE_DRIVER`, `APP_MAINTENANCE_STORE` | `file`, `database` | `file` (store not listed) | Maintenance mode backing (vendor). Test env forces `file`. | default ok |
| `BCRYPT_ROUNDS` | `12` (framework) | `12` | Password hashing cost, framework `hashing.php`. | default ok / default ok / forced `4` |
| `PHP_CLI_SERVER_WORKERS` | none | `4` | Not a Laravel config key: read by PHP's built-in server for `php artisan serve --no-reload` (dev only; ignored without `--no-reload`). Not read by any file in the repo. | unused / needed for dev / - |
| `AUTH_GUARD`, `AUTH_PASSWORD_BROKER`, `AUTH_MODEL`, `AUTH_PASSWORD_RESET_TOKEN_TABLE`, `AUTH_PASSWORD_TIMEOUT` | `web`, `users`, `App\Models\User`, `password_reset_tokens`, `10800` | not listed | `config/auth.php` (vendor). The `admin` guard (session, `Admin` model) and the password reset window (`expire` 60 min, `throttle` 60 s) are literals, no env. `StationEvent` reads `auth.guards.{guard}` (`StationEvent.php:285`). | default ok |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` (comma list) | `${FRONTEND_URL}` | `config/cors.php`, read by the CORS middleware (vendor). Paths `api/*`, `sanctum/csrf-cookie`, `broadcasting/auth`; `supports_credentials` is a literal `true`, methods/headers `*`. The mobile app is unaffected (no browser CORS). | required / default ok (both dev ports listed) / - |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1` plus current app URL | not listed | Sanctum stateful hosts (vendor). The API authenticates the web app with a bearer token in a cookie (`UseAuthTokenCookie`), so this is largely inert; the sanctum `guard` is `['web']`. | default ok |
| `SANCTUM_EXPIRATION` | `43200` (minutes, 30 days) | not listed | Token lifetime and, reused as minutes, the auth cookie lifetime: `AuthController::authCookie()` (`AuthController.php:155`) and `GoogleAuthController.php:306`. | default ok |
| `SANCTUM_TOKEN_PREFIX` | empty | not listed | Sanctum token prefix (vendor). | default ok |
| `SESSION_DRIVER` | `database` | `redis` | Laravel session store (vendor). The API is token-authenticated, sessions matter mostly for the admin panel and OAuth state. | required (any real store) / any / forced `array` |
| `SESSION_LIFETIME` | `120` (min) | `120` | Session lifetime (vendor). | default ok |
| `SESSION_DOMAIN` | none (null) | `.gocast.fm` | Sessions **and** the auth cookie's domain: `AuthController::authCookie()`/`forgetAuthCookie()` (`AuthController.php:157,170`) and `GoogleAuthController.php:308`. Wrong or unset in prod means the cookie is host-only on `api.` and the web app on `gocast.fm` never sees it. | required / unset / - |
| `SESSION_PATH`, `SESSION_ENCRYPT`, `SESSION_EXPIRE_ON_CLOSE`, `SESSION_SECURE_COOKIE`, `SESSION_HTTP_ONLY`, `SESSION_SAME_SITE`, `SESSION_PARTITIONED_COOKIE`, `SESSION_CONNECTION`, `SESSION_STORE`, `SESSION_TABLE`, `SESSION_COOKIE` | `/`, false, false, null, true, `lax`, false, null, null, `sessions`, `{app-slug}-session` | first two listed | Stock session settings (vendor). The auth cookie itself is built with `secure = $request->isSecure()`, `httpOnly = true`, `sameSite = lax` in code, not from these. | default ok |
| `CACHE_STORE` | `database` | `redis` | Default cache (vendor and app `Cache::`). `CACHE_PREFIX`, `DB_CACHE_*`, `REDIS_CACHE_*`, `MEMCACHED_*`, `DYNAMODB_*` are stock store options. The scheduler's `onOneServer`/locks and reconciler strike counters use this. | required / any / forced `array` |
| `QUEUE_CONNECTION` | `database` | `redis` | Queue backend. Uploads, track analysis, email and Telegram alerts are queued. `REDIS_QUEUE_RETRY_AFTER` defaults to **1800** s (not the stock 90): it must stay above the longest job timeout, `AnalyzeTrack` scaling up to `TrackAnalyzer::MAX_TIMEOUT_SECONDS` + 30 for a long mix. `DB_QUEUE*`, other `REDIS_QUEUE*`, `BEANSTALKD_*`, `SQS_*`, `QUEUE_FAILED_DRIVER` are stock options (`retry_after` 90, redis `block_for` 5). | required / any / forced `sync` |
| `DB_CONNECTION` | `sqlite` | `mysql` | Default DB. Tests force `mysql`, not sqlite. | required `mysql` / `mysql` / forced `mysql` |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | `127.0.0.1`, `3306`, `laravel`, `root`, empty | `127.0.0.1`, `3306`, `gocast`, `gocast`, blank | MySQL connection. Tests force `DB_DATABASE=gocast_test` and clear `DB_URL`. | required / required / partly forced |
| `DB_URL`, `DB_SOCKET`, `DB_CHARSET` (`utf8mb4`), `DB_COLLATION` (`utf8mb4_unicode_ci`), `DB_FOREIGN_KEYS`, `DB_SSLMODE`, `MYSQL_ATTR_SSL_CA`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | see config | not listed | Stock DB options; `DB_ENCRYPT` and `DB_TRUST_SERVER_CERTIFICATE` are inside commented lines in `database.php` (dead). | default ok |
| `REDIS_CLIENT` | `phpredis` | `phpredis` | Redis client. | required |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | `127.0.0.1`, `6379`, null | same, password blank | **The API uses the `Redis::` facade directly**, independent of `CACHE_STORE`/`QUEUE_CONNECTION`: listener session sets, live counts, now-playing, ingest metrics, lifecycle state (`ListenerAnalytics`, `SyncListenerCounts`, `NowPlayingController`, `StationLifecycleService`, `StreamSessionController`, `StationEventController`, `IngestMetrics`, `MetricsController`, `ListenerCountController`, `StationResource`). A reachable Redis is mandatory in every environment including tests (no Redis is faked in `phpunit.xml`). | required / required / required |
| `REDIS_URL`, `REDIS_USERNAME`, `REDIS_DB` (`0`), `REDIS_CACHE_DB` (`1`), `REDIS_CLUSTER`, `REDIS_PREFIX`, `REDIS_PERSISTENT`, `REDIS_MAX_RETRIES` (3), `REDIS_BACKOFF_ALGORITHM`, `REDIS_BACKOFF_BASE` (100), `REDIS_BACKOFF_CAP` (1000) | see config | not listed | Stock options (`database.php`). The `default` and `cache` redis connections share host/port/password. | default ok |
| `LOG_CHANNEL`, `LOG_STACK`, `LOG_LEVEL`, `LOG_DEPRECATIONS_CHANNEL`, `LOG_DEPRECATIONS_TRACE`, `LOG_DAILY_DAYS`, `LOG_SLACK_*`, `LOG_PAPERTRAIL_HANDLER`, `PAPERTRAIL_URL/PORT`, `LOG_STDERR_FORMATTER`, `LOG_SYSLOG_FACILITY` | `stack`, `single`, `debug`, `null`, false, 14, ... | first four listed; template `LOG_LEVEL=warning` | Stock logging (`logging.php`). | default ok |
| `MAIL_MAILER` | `log` | `resend` | Default mailer. Tests force `array`. `mail.php` defines `resend`, `smtp`, `ses`, `postmark`, `sendmail`, `log`, `array`, `failover`, `roundrobin`. | required (a real mailer) / `log` ok / forced `array` |
| `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | `hello@example.com`, `APP_NAME` | `hello@gocast.fm`, `${APP_NAME}` | From header (vendor mail). | required / default ok |
| `MAIL_HOST` (`127.0.0.1`), `MAIL_PORT` (`2525`), `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SCHEME`, `MAIL_URL`, `MAIL_EHLO_DOMAIN`, `MAIL_SENDMAIL_PATH`, `MAIL_LOG_CHANNEL` | see config | not listed | SMTP/sendmail/log mailer options, used only if that mailer is selected. The dev `.env` sets several of these although `.env.example` omits them. | only for smtp |
| `BROADCAST_CONNECTION` | `log` | `log` | Server-side kill switch for realtime events. `log` writes a line; `pusher` sends. Tests force `null`. See [Realtime events](realtime-events.md). | `pusher` to enable / `log` / forced `null` |
| `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET` | none | blank | Ably credentials over the Pusher protocol (`broadcasting.connections.pusher`). The secret is server-only; `PUSHER_APP_KEY` is not what the browser uses (that is `NEXT_PUBLIC_PUSHER_KEY`). | required only if `pusher` |
| `PUSHER_HOST`, `PUSHER_PORT`, `PUSHER_SCHEME`, `PUSHER_APP_CLUSTER` | none, `443`, `https`, `mt1` | `main.pusher.ably.net`, `443`, `https`, `mt1` | Pusher options; `useTLS` is derived from `PUSHER_SCHEME === 'https'`; timeout literal 10 s. | required only if `pusher` |
| `FILESYSTEM_DISK` | `local` | `local` | Default disk. Uploads go to the `public` disk (`storage/app/public`, symlinked by deploy); `s3` is defined but nothing stores to it. | default ok |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, `AWS_URL`, `AWS_ENDPOINT`, `AWS_USE_PATH_STYLE_ENDPOINT` | none | listed, blank | S3/SES/SQS/DynamoDB options. **Nothing in `app/` uses the `s3` disk, SES or SQS**; these are template residue (see Gaps). | unused |
| `ACTIVITYLOG_ENABLED` (true), `ACTIVITYLOG_BUFFER_ENABLED` (false) | see left | not listed | Spatie activity log (vendor); the app calls `activity()` from the admin controllers (`AccountController`, `InviteController`, `AnnouncementController`). `clean_after_days` is a literal 365. | default ok |
| `SENTRY_LARAVEL_DSN` (falls back to `SENTRY_DSN`) | none | blank | Sentry DSN (`sentry.dsn`, vendor). Empty disables. `bootstrap/app.php` wires `Sentry\Laravel\Integration`. Tests force it blank (`phpunit.xml` and `TestCase`), because a live DSN in `api/.env` turned every failure-asserting test into a real Sentry issue. | optional / unset / forced blank |
| `SENTRY_SEND_DEFAULT_PII` | `false` | `false` | `sentry.send_default_pii`. | default ok |
| `SENTRY_TRACES_SAMPLE_RATE` | null | `0` | Performance tracing rate. Anything above 0 in dev adds visible latency to every API call. | default ok / `0` |
| `SENTRY_SAMPLE_RATE` (1.0), `SENTRY_PROFILES_SAMPLE_RATE`, `SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`, `SENTRY_ORG_ID`, `SENTRY_STRICT_TRACE_CONTINUATION`, `SENTRY_ENABLE_LOGS`, `SENTRY_LOG_FLUSH_THRESHOLD`, `SENTRY_LOG_LEVEL`/`SENTRY_LOGS_LEVEL`, `SENTRY_SPOTLIGHT` (commented out) and the 30-odd `SENTRY_BREADCRUMBS_*` / `SENTRY_TRACE_*` toggles | see `sentry.php` | not listed | Stock sentry-laravel options, all default. `ignore_transactions` is a literal `['/up']`. | default ok |

## API: secrets, external services, cross-service addresses

From `api/config/services.php`. The "reader" is the app file that consumes the key.

| Variable | Default | Meaning | Reader | Prod / Dev / Test |
|---|---|---|---|---|
| `FRONTEND_URL` | `http://localhost:5173` | Public web app origin. Builds every link in emails, bell payloads, Telegram alerts and the Google OAuth return redirect. **The default is the old Vite port; the web dev server is `:3000`**, so leaving it unset in dev sends emails pointing at a dead port. | `Notifications/{StationLive,InactiveBroadcasterNudge,Welcome,ProAccessGranted,InviteRedeemed,PlanExpired}Notification.php`, `Notifications/Bell/BellPayload.php:253`, `Models/Invite.php:196`, `Services/AdminTelegram.php:182`, `resources/views/admin/{station,stations}.blade.php`, `GoogleAuthController.php:323` (fallback `http://localhost:3000` is unreachable because the config default is non-null; a value that does not parse to an origin makes it `abort(500)`) | required / set to `:3000` / - |
| `INTERNAL_API_KEY` | none | Shared secret for `/api/internal/*` and for the station harbor status endpoint. Empty makes `VerifyInternalKey` throw `RuntimeException('INTERNAL_API_KEY is not configured')` (a 500), so **nobody can go live**. It is written into every rendered `.liq` file (`station.blade.php:127,187,492,1108,1267`) and sent as `X-Internal-Key` by `StationStatusService` (`:284`). | `Http/Middleware/VerifyInternalKey.php`, `LiquidsoapSupervisor.php:1136`, `StationStatusService.php:284` | required / required / any |
| `RENDER_API_KEY` | none | Lifts the `public` rate limit (60/min/IP) for requests carrying a matching `X-Render-Key` (the Next server's SSR fetches). Blank means no exemption and nothing else breaks. Must equal the client's `RENDER_API_KEY`. | `Providers/AppServiceProvider.php:54` | required for SEO safety / optional / - |
| `RESEND_API_KEY` | none | Resend API key: the `resend` mailer transport (vendor) and the inbound-email lookup. | vendor mail; `Webhooks/Resend/EmailReceived.php:30` | required if `MAIL_MAILER=resend` |
| `RESEND_WEBHOOK_SECRET` | none | Svix signing secret for `POST /api/webhooks/resend`. Blank makes the endpoint answer 503 to everything. | `ResendWebhookController.php:38` | required only for inbound-email alerts |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | none | Operator alerts. Alerts are off (no error) when **either** the token or the chat id is blank. `phpunit.xml` blanks the token so tests never message the real chat. | `Jobs/SendAdminTelegramAlert.php:31-32`, `Services/AdminTelegram.php:170` (blank-check covers both values) | optional / optional / forced blank token |
| `GOOGLE_CLIENT_ID` | none | Google web OAuth client ID. Also the audience the native token verifier requires (mobile app). | `Services/GoogleIdTokenVerifier.php:43`; Socialite (vendor) | required for Google sign-in |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | none | Web OAuth secret and callback (`${APP_URL}/api/auth/google/callback`). Read by Socialite's google driver (`services.google.*`), not by app code. | `Laravel\Socialite` (vendor) | required for web Google sign-in |
| `ICECAST_SOURCE_PASSWORD` | none | Password each station's `output.icecast` uses to publish; rendered into the `.liq` (`station.blade.php:1284`, `LiquidsoapSupervisor.php:1133`). Also substituted into Icecast's own config by `setup-native.sh`. | `LiquidsoapSupervisor.php`, `station.blade.php` | required / required / any |
| `ICECAST_ADMIN_USER` | `admin` | Basic-auth user for Icecast `/admin/stats`. | `Console/Commands/SyncListenerCounts.php:48` | default ok |
| `ICECAST_ADMIN_PASSWORD` | none | Its password. Blank makes `stations:sync-listeners` fail with an error every minute (`SyncListenerCounts.php:52-56`). | `SyncListenerCounts.php:49` | required / required |
| `ICECAST_INTERNAL_URL` | `http://127.0.0.1:8000` | In-network base URL for Icecast's admin API. Not the public listener URL. On the native host it should be the loopback `ICECAST_PORT`. | `SyncListenerCounts.php:47` | set to real port / set |
| `ICECAST_RELAY_PASSWORD` | none | **Not read by Laravel.** Only the Icecast config template uses it (`infra/native/icecast/icecast.xml.tpl`); `setup-native.sh` defaults it to the source password. Sits in `api/.env` only because `setup-native.sh` sources that file. | `setup-native.sh:214` | optional |
| `DOCKER_HOST` | unset (uses `/var/run/docker.sock`) | The `docker` CLI's daemon address. Laravel never reads it; the CLI subprocesses inherit it. On the native host it must be a **real** process env var (php-fpm pool `env[]`, systemd units, `deploy-native.sh`), because `config:cache` stops `.env` loading. | docker CLI via `Process` in `LiquidsoapSupervisor`, `TrackAnalyzer` | required (native) / as needed |
| `POSTMARK_API_KEY`, `SLACK_BOT_USER_OAUTH_TOKEN`, `SLACK_BOT_USER_DEFAULT_CHANNEL`, `POSTMARK_MESSAGE_STREAM_ID` | none | Stock `services.php` entries. Nothing in `app/` sends via Postmark or Slack. Dead (see Gaps). | none | unused |

## API: analytics, event log, notifications

| Variable | Default | Meaning | Reader | Notes |
|---|---|---|---|---|
| `ANALYTICS_PLAYER_TRANSPORT` | `hls` | Transport recorded for a listener session when the player does not say. Valid values `hls` or `icecast` (`ListenerAnalytics::TRANSPORTS`); anything else normalises to `hls`. The double-count trap: an Icecast-transport session is not added to the HLS live count. | `Services/ListenerAnalytics.php:233` | see [Listener analytics](listener-analytics.md) |
| `ANALYTICS_BEAT_INTERVAL` | `15` | Seconds between player heartbeats; returned to the player as `beat_every` from `POST` listener-session start. | `ListenerSessionController.php:52` | |
| `ANALYTICS_LIVE_WINDOW` | `45` | A session counts as live if seen within this many seconds. | `ListenerAnalytics.php:195`, `SweepListenerSessions.php:46` | keep above 2-3 beat intervals |
| `ANALYTICS_IDLE_CLOSE` | `60` | Seconds of silence after which the sweep closes a session. | `SweepListenerSessions.php:45,193` | |
| `ANALYTICS_MAX_SESSION_HOURS` | `12` | Hard cap on a session's length; also drives the Redis token TTL (`hours*3600 + 3600`). | `ListenerAnalytics.php:117`, `SweepListenerSessions.php:192` | |
| `ANALYTICS_MIN_LISTEN_SECONDS` | `60` | Sessions shorter than this are not counted as listeners in rollups/reports. | `RollupListenerStats.php:69`, `Models/ListenerSession.php:72`, `Services/AudienceReport.php:304` | |
| `ANALYTICS_RETENTION_DAYS` | `90` | How long raw session rows are kept. | `PruneListenerSessions.php:35`, `RollupListenerStats.php:134`, `AudienceReport.php:114` | |
| `ANALYTICS_GEOIP_DATABASE` | `/var/gocast/system/GeoLite2-Country.mmdb` | Path to a MaxMind country database. Missing file or missing `geoip2` package degrades to "no country", not an error. | `Services/GeoResolver.php:125` | optional |
| `ANALYTICS_COUNTRY_HEADER` | `CF-IPCountry` | CDN header carrying the country code (checked first; `XX` and `T1` are treated as unknown). Empty disables header lookup. | `GeoResolver.php:46` | Geo needs Cloudflare or the mmdb |
| `STATION_EVENT_RETENTION_DAYS` | `30` | Prune window for `station_events`; `0` disables pruning. | `PruneStationEvents.php:33` | |
| `STATION_EVENT_MAX_PER_MINUTE` | `60` | Per-station, per-minute cap (a `Cache` counter, key `station-event-rate:{id}:{YmdHi}`, TTL 120 s), applied **only to container-sourced events**; other sources are never capped. `0` disables. | `Models/StationEvent.php:255` | |
| `NOTIFICATION_RETENTION_DAYS` | `90` | Prune window for bell notifications; `0` disables. The announcement and inactive-nudge duplicate guards read these rows, so pruning them re-arms those. | `PruneNotifications.php:38`, `resources/views/admin/announcements.blade.php:177,224` | |
| `NOTIFICATION_PER_PAGE` | `20` | Bell feed page size. | `NotificationController.php:119` | |
| `NOTIFICATION_UNREAD_COUNT_CAP` | `99` | Unread badge ceiling (the client renders `99+`). | `NotificationController.php:140` | |

## API: Liquidsoap and station containers (`api/config/liquidsoap.php`)

Every key is read by app code (grep of `config('liquidsoap.*')` finds a reader for each; none is dead). Unless noted the reader is `Services/LiquidsoapSupervisor.php` (LS) or the file named.

### Paths and addresses

| Variable | Default | Meaning | Reader | Prod / Dev / Test |
|---|---|---|---|---|
| `LIQUIDSOAP_LIQ_DIR` | `/var/gocast/liq` | Host dir where rendered `{slug}.liq` files are written and mounted read-only at `/station.liq`. | LS `:165` | default ok / default ok / forced `/tmp/gocast-test/liq` |
| `LIQUIDSOAP_PLAYLISTS_DIR` | `/var/gocast/playlists` | Host dir of per-station m3u/track dirs, mounted read-only at `/data/playlists`. | LS `:166`, `PlaylistFileWriter.php:180`, `StationObserver.php:144` | forced `/tmp/gocast-test/playlists` |
| `LIQUIDSOAP_HLS_DIR` | `/var/gocast/hls` | Host dir HLS segments are written to, mounted read-write at `/data/hls`; served by nginx in prod. The **client** has its own `LIQUIDSOAP_HLS_DIR` for the dev proxy. | LS `:167` | forced `/tmp/gocast-test/hls` |
| `LIQUIDSOAP_SYSTEM_DIR` | `/var/gocast/system` | Platform-shared audio (watermark clips), mounted read-only at `/data/system`. Also the default location of the GeoLite2 file. | LS `:168`, `WatermarkClipLibrary.php:41` | default ok |
| `LIQUIDSOAP_HLS_VARIANT` | `aac` | HLS rendition name: the encoder label in the `.liq` **and** the media-playlist filename in the URL. Changing it 404s players holding the old URL. | LS `:1150`, `StationResource.php:377` | default ok |
| `LIQUIDSOAP_HLS_BASE_URL` | empty | Public base for HLS (`{base}/{slug}/{variant}.m3u8`). Empty makes `hls_url` null and the player falls back to Icecast. Dev value points at the client's `/hls-proxy`. | `StationResource.php:371` | required for HLS / dev proxy URL / - |
| `LIQUIDSOAP_ICECAST_HOST` | `host.docker.internal` | Icecast host **as seen from inside a station container**. | LS `:1141` | default ok |
| `LIQUIDSOAP_ICECAST_PORT` | `8000` | Its port. Must match `ICECAST_PORT` in `domains.env`. | LS `:1142` | must match host Icecast |
| `LIQUIDSOAP_API_URL` | `http://host.docker.internal:8081` | Base URL a container uses to call Laravel back. Port must equal `INTERNAL_API_PORT`. Also used for the `next-track` URL. | LS `:1143,1172` | must match `INTERNAL_API_PORT` |
| `LIQUIDSOAP_CONTAINER_SUBNET` | `172.28.0.0/16` | Base for computing each station's fixed IP (`base + container_index + 2`). Prefix must be 1 to 30 and the offset must fit the block, else `RuntimeException` (a station past the ceiling refuses to start). Must equal the `gocast-network` subnet in `docker-compose.native.yml` (which also sets `ip_range 172.28.255.0/24`). | LS `:780` | must match compose |
| `LIQUIDSOAP_TELNET_RESOLVE` | `ip` | `ip` = compute the container IP; `name` = use the container name via Docker DNS. `name` from the host makes stations sit in `starting` forever. | LS `:834` | `ip` / `ip` (native) / forced `name` |
| `LIQUIDSOAP_HARBOR_INPUT_PORT` | `8090` | Port inside each container that broadcasters connect to. The station router **hardcodes 8090** (`infra/native/station-router/ingest.js:126`), so this cannot be changed alone. | LS `:864,1153` | leave at `8090` |
| `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` | `10.0` | Seconds harbor waits on a stalled source before dropping it (reconnect window). | LS `:1154` | |
| `LIQUIDSOAP_INGEST_URL` | none | Public WebSocket template the studio connects to, `{slug}` substituted (prod: `wss://stream.host/broadcast/{slug}`). Unset falls back to the container's bridge IP (dev only). | LS `:857` | required (prod) / unset |
| `LIQUIDSOAP_ENCODER_HOST` | none | Hostname printed for BUTT/Mixxx. **Unset means not deployed**: `StationResource` omits the whole `encoder` block (it is also omitted unless the viewer is the station owner and `canUseEncoder()`). | `StationResource.php:251-253` | set where the router is published |
| `LIQUIDSOAP_ENCODER_PORT` | `8010` | Port for encoders; must equal `INGEST_PORT` in `domains.env`. | `StationResource.php:254` | must match `INGEST_PORT` |
| `LIQUIDSOAP_HARBOR_PORT` | `8080` | Harbor HTTP `/status` and `/healthz` port inside the container. Also the Docker `--health-cmd` target. | LS `:1046,1146`, `StationStatusService.php:251` | |
| `LIQUIDSOAP_HARBOR_TIMEOUT` | `1.5` | Seconds Laravel waits for `/status`. | `StationStatusService.php:286` | |
| `LIQUIDSOAP_STATUS_TTL` | `2` | Cache seconds for a pulled status. | `StationStatusService.php:137,166` | |
| `LIQUIDSOAP_STATUS_DOWN_TTL` | `15` | Cache seconds when Docker confirmed the container is gone. | `StationStatusService.php:136` | not in either template |

### Container image, limits, health

| Variable | Default | Meaning | Reader |
|---|---|---|---|
| `LIQUIDSOAP_IMAGE` | `gocast/liquidsoap:latest` | Image for stations **and** for the ffmpeg analysis container. The Dockerfile pins Liquidsoap to v2.4.5 but the tag Laravel runs is whatever this says. | LS `:206`, `TrackAnalyzer.php:109` |
| `LIQUIDSOAP_CONTAINER_CPUS` | `0.5` | `docker run --cpus`; empty string omits the flag. | LS `:1073` |
| `LIQUIDSOAP_CONTAINER_MEMORY` | `512m` | `--memory` and `--memory-swap` (same value); empty omits. Too low SIGKILLs a station at boot with empty logs; the supervisor reports an OOM kill as "ran out of memory while starting". | LS `:1079` |
| `LIQUIDSOAP_CONTAINER_PIDS_LIMIT` | `256` | `--pids-limit`; `0` omits. | LS `:1012` |
| `LIQUIDSOAP_CONTAINER_INIT` | `false` | Adds `--init`. | LS `:1018` |
| `LIQUIDSOAP_STOP_TIMEOUT` | `5` | SIGTERM grace seconds, clamped to at most `DOCKER_TIMEOUT_SECONDS - 3` (= 7). | LS `:221` |
| `LIQUIDSOAP_START_VERIFY_DELAY_MS` | `750` | Wait after `docker run` before checking the container is still up; `<=0` skips. | LS `:912` |
| `LIQUIDSOAP_HEALTHCHECK` | `true` | Whether to add Docker `--health-*` flags. | LS `:1042` |
| `LIQUIDSOAP_HEALTH_INTERVAL`, `_TIMEOUT`, `_RETRIES`, `_START_PERIOD` | `15`, `3`, `3`, `45` | Docker health probe timing (seconds; retries a count). | LS `:1055-1058` |
| `LIQUIDSOAP_UNHEALTHY_PASSES` | `2` | Consecutive reconcile passes before an unhealthy container is recreated. | `ReconcileStations.php:223` |
| `LIQUIDSOAP_UNHEALTHY_RECREATES_PER_HOUR` | `3` | Recreate cap per station per hour. | `ReconcileStations.php:224` |
| `LIQUIDSOAP_STRANDED_SESSION_STRIKES` | `3` | Reconcile passes an open session may disagree with its container before being closed. | `ReconcileStations.php:381` |
| `LIQUIDSOAP_STATION_STORAGE_BYTES` | `3 GiB` | Per-station library cap, checked at upload and shown in the library meter. | `TrackImporter.php:48`, `TrackController.php:78` |
| `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS` | `30` | Days before soft-deleted stations are erased; `0` disables. Overridden by `--days`. | `PruneDeletedStations.php:44` |
| `LIQUIDSOAP_SILENT_STOP_SECONDS` | `600` (the code fallback in `StationAudioPolicy::windowSeconds()` is `60`, but the config key always exists so it never applies) | How long a silent station with nothing to fall back to may run before the sweep stops it; `0` disables auto-stop. | `StationAudioPolicy.php:80` |
| `LIQUIDSOAP_STUDIO_GONE_STOP_SECONDS` | `150` | Shortcut window after a web studio broadcast ends; `0` turns it off. Web and mobile reconnect budgets are set relative to this. | `StationAudioPolicy.php:95` |
| `LIQUIDSOAP_SILENCE_RMS_THRESHOLD` | `0.0001` | Output level at or below which a station counts as silent. | `StationAudioPolicy.php:108` |
| `LIQUIDSOAP_RMS_WINDOW_SECONDS` | `2` | RMS averaging window for the level meter (also its update interval). | LS `:1156` |

### Audio behaviour rendered into the script

| Variable | Default | Meaning | Reader |
|---|---|---|---|
| `LIQUIDSOAP_AUTODJ_RETRY_DELAY` | `10.0` | Seconds the script waits before re-asking for a track after "nothing to play" (floored at 1.0). | LS `:1169` |
| `LIQUIDSOAP_CROSSFADE_ENABLED` | `false` | AutoDJ crossfade kill switch. Off means hard cuts. Off by default because crossfade wedged AutoDJ on Liquidsoap 2.4.0 and has not yet been observed working on 2.4.5. | LS `:1211` |
| `LIQUIDSOAP_CROSSFADE_DURATION` / `_FADE` | `5` / `3` | Cross window and fade envelope seconds; fade is clamped to `max(duration - 0.5, 0.1)`. | LS `:1212,1218` |
| `LIQUIDSOAP_CROSSFADE_HIGH_DB`, `_MEDIUM_DB`, `_MARGIN_DB` | `-15`, `-32`, `4` | Smart-transition loudness thresholds. | LS `:1239-1241` |
| `LIQUIDSOAP_LIMITER_THRESHOLD_DB` | `-1.0` | Peak limiter ceiling (dBFS). | LS `:1225` |
| `LIQUIDSOAP_LIMITER_INCLUDE_LIVE` | `true` | Limiter at the bottom of the graph (guards live too) versus AutoDJ arm only. | LS `:1226` |
| `LIQUIDSOAP_LIVE_BROADCAST_TEXT` | `Live Broadcast` | Placeholder title when a broadcaster sends none. | LS `:1230` |
| `LIQUIDSOAP_METADATA_CHARSET` | `UTF-8` | Charset for in-band broadcaster metadata. | LS `:1231` |
| `LIQUIDSOAP_GC_SPACE_OVERHEAD` | `80` | OCaml GC `space_overhead`; `0` omits the block. | LS `:1233` |
| `LIQUIDSOAP_APPLY_AMPLIFY` | `true` | Whether the graph applies the per-track loudness gain annotation. | LS `:1238`, `PlaylistFileWriter.php:336` |
| `LIQUIDSOAP_WATERMARK_ENABLED` | `true` | Install-wide watermark kill switch; per-station state comes from the owner's plan. | LS `:1195`, `ReloadWatermarkClips.php:43`, `Models/User.php:86`, `Admin/WatermarkClipController.php:35` |
| `LIQUIDSOAP_WATERMARK_INTERVAL` | `600` | Seconds between watermarks, floored at 60. | LS `:742`, admin controller |
| `LIQUIDSOAP_WATERMARK_DUCK` | `0.15` | Portion of station audio kept while the clip plays, clamped to `[0.01, 1]`. | LS `:753` |
| `LIQUIDSOAP_WATERMARK_FADE` | `1.0` | Duck ramp seconds. | LS `:1203` |
| `LIQUIDSOAP_WATERMARK_CLIP_MAX_BYTES` | `5 MiB` | Upload size cap for the admin clip form. | `StoreWatermarkClipRequest.php:28`, `WatermarkClipController.php:39` |

### Track analysis (queued job and a docker one-shot)

| Variable | Default | Meaning | Reader |
|---|---|---|---|
| `LIQUIDSOAP_ANALYSIS_ENABLED` | `true` | Master switch for loudness/cue analysis; `tracks:analyze` refuses to run when off. | `TrackImporter.php:154`, `AnalyzeTracksCommand.php:37` |
| `LIQUIDSOAP_ANALYSIS_FFMPEG` | empty | Path to a local ffmpeg. Empty runs ffmpeg in a `docker run --rm --network none` one-shot of `LIQUIDSOAP_IMAGE`. | `TrackAnalyzer.php:90` |
| `LIQUIDSOAP_ANALYSIS_TIMEOUT` | `120` | The **floor** of the per-file analysis timeout (itself floored at 5); the real limit scales to one eighth of the track's length, capped at 1500 s (`TrackAnalyzer::timeoutFor`). | `TrackAnalyzer.php:310` |
| `LIQUIDSOAP_LOUDNESS_TARGET` | `-14.0` | Target LUFS. | `Services/TrackAnalysis.php:62` |
| `LIQUIDSOAP_LOUDNESS_CEILING` | `-1.0` | True-peak ceiling dB. | `TrackAnalysis.php:63` |
| `LIQUIDSOAP_LOUDNESS_MAX_GAIN` | `12.0` | Maximum gain applied dB. | `TrackAnalysis.php:64` |
| `LIQUIDSOAP_ANALYSIS_SILENCE_DB` / `_SECONDS` | `-50.0` / `0.25` | Silence-detect threshold and minimum length for cue points. | `TrackAnalyzer.php:86-87` |
| `LIQUIDSOAP_CUE_MIN_PLAYABLE` | `5.0` | Minimum playable seconds after cuts. | `TrackAnalysis.php:92` |

## What a station container actually receives

Assembled by `LiquidsoapSupervisor::baseRunCommand/sandboxFlags/healthFlags/resourceFlags/mountFlags`:

- **Environment variables: none.** No `-e`/`--env` flag is emitted anywhere. `infra/liquidsoap/Dockerfile` sets no `ENV`/`ARG` either (only pins `savonet/liquidsoap:v2.4.5` and installs ffmpeg).
- **Flags:** `--name gocast-liquidsoap-{slug}`, `--network gocast-network`, `--ip {computed}`, `--restart unless-stopped`, `--add-host host.docker.internal:host-gateway`, `--stop-signal SIGTERM`, `--stop-timeout`, labels `gocast.station` and `gocast.station_id`, log rotation `max-size=10m` `max-file=3`, `--cap-drop ALL`, `--security-opt no-new-privileges`, plus the config-driven `--pids-limit`, `--init`, `--health-*`, `--cpus`, `--memory`/`--memory-swap`.
- **Mounts:** `{liq_dir}/{slug}.liq:/station.liq:ro`, `{playlists_dir}/{slug}:/data/playlists:ro`, `{hls_dir}/{slug}:/data/hls` (rw), `{system_dir}:/data/system:ro` (always, even with watermarks off).
- **Baked into the `.liq` at render time (`renderLiqFile`):** Icecast host/port/source password, the API base URL and next-track URL, the `INTERNAL_API_KEY` (so the rendered file on disk contains two secrets; keep `/var/gocast/liq` unreadable to others), harbor ports and timeout, RMS window, HLS variant, crossfade/limiter/watermark/GC/amplify settings, live text and charset, retry delay, and per-station jingle settings. Hardcoded in the template: telnet on `0.0.0.0:1234`, log level 2, MP3 128 kbps at 44.1 kHz for Icecast.
- **Timeouts inside the supervisor (constants, not env):** docker command 10 s, docker read 3 s, telnet 3 s (`LiquidsoapSupervisor.php:79,93,106`).
- The station's own `docker run` for analysis uses `--network none`, so analysis cannot reach Icecast or the API.

Because nothing is passed by env, **changing any `LIQUIDSOAP_*` value that appears in the script does not affect an already-running station** until it is re-rendered and recreated. Exceptions: the station's jingle settings and the watermark enabled/interval/duck are interactive variables pushed over telnet (`applyJingleSettings`, `applyWatermarkSettings`, the latter called from `UserObserver.php:120` when an owner's plan changes), so they change live, but the interval/duck pushed are whatever config held at that moment. See [Liquidsoap supervisor](liquidsoap-supervisor.md) and [Liquidsoap station script](liquidsoap-station-script.md).

## Test environment (API)

`api/phpunit.xml` forces (with `force="true"`, so they beat anything in `api/.env`): `APP_ENV=testing`, `APP_MAINTENANCE_DRIVER=file`, `BCRYPT_ROUNDS=4`, `BROADCAST_CONNECTION=null`, `CACHE_STORE=array`, `DB_CONNECTION=mysql`, `DB_DATABASE=gocast_test`, `DB_URL=` (blank), `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`, `SESSION_DRIVER=array`, `PULSE_ENABLED=false`, `TELESCOPE_ENABLED=false`, `NIGHTWATCH_ENABLED=false`, `TELEGRAM_BOT_TOKEN=` (blank), `SENTRY_LARAVEL_DSN=` (blank), `LIQUIDSOAP_TELNET_RESOLVE=name`, `LIQUIDSOAP_LIQ_DIR/PLAYLISTS_DIR/HLS_DIR=/tmp/gocast-test/...`.

- `Tests\TestCase::createApplication()` also does `putenv('APP_ENV=testing')` and sets `$_ENV`/`$_SERVER` before boot, because a process-level `APP_ENV=local` (from a compose `env_file`) is otherwise cached by Laravel's environment detection before phpunit's override lands. It blanks `SENTRY_LARAVEL_DSN` the same way (`putenv`, `$_ENV`, `$_SERVER`).
- Why it matters: `LiquidsoapSupervisor::inTestMode()` is `app()->runningUnitTests()`. If it returns false, `Station::factory()->create()` spawns real containers on the host daemon.
- Not forced, so inherited from `api/.env`: `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `REDIS_*` (a real Redis is used by the tests that touch `Redis::`), `APP_KEY`, `INTERNAL_API_KEY`, `LIQUIDSOAP_SYSTEM_DIR` (defaults to the real `/var/gocast/system`), and everything else. Tests override individual config with `config([...])` about 90 times across 46 files.
- `PULSE_ENABLED`, `TELESCOPE_ENABLED` and `NIGHTWATCH_ENABLED` are forced but no Pulse/Telescope/Nightwatch config exists in `api/config` (harmless leftovers).

## Web app (`client/`)

`NEXT_PUBLIC_*` values are string-replaced into the browser bundle at `next build`; they must be written as literal `process.env.NEXT_PUBLIC_X` (`client/lib/env.ts` header). Non-prefixed values are read at runtime on the Node server only. Dev reads `client/.env.local`; `client/.env.example` is the template.

| Variable | Default | Meaning | Reader | Prod / Dev |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `""` | Laravel API base including `/api`. Used by the axios client (`withCredentials: true`), server fetches, Google auth, and the `next/image` remote pattern hostname (`next.config.ts:84`, fallback host `api.gocast.fm` when unparsable). | `lib/env.ts` (`env.apiUrl`), `lib/api-server.ts:4`, `next.config.ts` | required (build-time) / required |
| `NEXT_PUBLIC_APP_URL` | `""` | Public web origin: canonical links, OG tags, sitemap, robots, embed snippet, share links, station player links. | `lib/env.ts` (`env.appUrl`), about 18 files (sitemap, robots, layout, dashboard pages, `lib/embed.ts`) | required / required |
| `NEXT_PUBLIC_ICECAST_URL` | `""` | Icecast listener base for the direct-stream fallback in the player, embed and homepage hero. | `env.icecastUrl` in `PlayerView`, `EmbedPlayer`, `HeroStationPlayer` | required / required |
| `NEXT_PUBLIC_PUSHER_KEY` | `""` | Ably app key (`APP_ID.KEY_ID`, the part before the colon). **Empty is the client-side kill switch**: `lib/echo.ts` returns null and every hook polls. | `lib/echo.ts` via `env.broadcastKey` | optional / optional |
| `NEXT_PUBLIC_PUSHER_HOST` | `""` | Pusher-protocol host (`main.pusher.ably.net`). | `lib/echo.ts` | with key |
| `NEXT_PUBLIC_PUSHER_PORT` | `443` | Port (`Number(...)`). | `lib/echo.ts` | with key |
| `NEXT_PUBLIC_BROADCAST_AUTH_URL` | `""` | Where Echo signs private subscriptions (`{api-host}/broadcasting/auth`, a sibling of `/api`). | `lib/echo.ts` | with key |
| `NEXT_PUBLIC_SENTRY_DSN` | none | Browser/server/edge Sentry DSN. Sentry initialises only when `NODE_ENV === "production"` **and** this is set. Sample rates are literals: traces 0.2, replay session 0.02, replay on error 0.5, `sendDefaultPii` false. The browser client also has literal filters: `denyUrls` `app://`, `ignoreErrors` for in-app-browser bridge noise (`/\b\w*browser is not defined/` and two others), and `allowUrls: [/\/_next\//]` so only errors thrown from the Next bundle are kept (stackless events such as rejected promises still pass; errors from inline scripts are dropped). | `instrumentation-client.ts:40`, `sentry.server.config.ts:11`, `sentry.edge.config.ts:9` | optional / ignored |
| `SENTRY_AUTH_TOKEN` | none | Build-time source-map upload token, read by `@sentry/nextjs`'s build plugin (org `gocast`, project `javascript-nextjs` are literals in `next.config.ts`). Passed by `deploy-native.sh:build_client`. | plugin (vendor) | optional (build) |
| `RENDER_API_KEY` | none | Server-only. Sent as `X-Render-Key` on the Next server's own public-API fetches so they skip the 60/min limit. Must equal the API's. In prod it comes from `/etc/gocast/client.env` through the systemd unit's `EnvironmentFile=-`. | `lib/public-api.ts:16` | recommended / optional |
| `INTERNAL_API_URL` | none | Server-side override of the API base (`typeof window === "undefined"`), for a container that cannot reach the public URL. **Not declared in `.env.example`, `client.env` docs, or any deploy file**; only the code reads it. | `lib/env.ts:16`, `lib/api-server.ts:4` | unused in prod / optional |
| `INTERNAL_ICECAST_URL` | `http://127.0.0.1:8888` | Dev-only rewrite target for `/stream-proxy/*` (avoids Icecast's missing CORS preflight). Undeclared in `.env.example` (present in the dev `.env.local`). | `next.config.ts:120` | ignored / optional |
| `LIQUIDSOAP_HLS_DIR` | `/var/gocast/hls` | Dev-only: directory the `/hls-proxy/*` route serves (`NODE_ENV === "development"` only; 404 otherwise). Only `.m3u8`, `.aac`, `.ts`, `.m4s`, `.mp4` are served. | `app/hls-proxy/[...path]/route.ts:25` | ignored / optional |
| `ANALYZE` | none | `"true"` enables the bundle analyzer. | `next.config.ts:5` | - |
| `CI` | none | Also makes the Sentry build plugin verbose (`silent: !process.env.CI`, `next.config.ts:184`); Sentry traffic is tunnelled through `/monitoring`. | `next.config.ts` | build |
| `NODE_ENV` | set by Next | Gates analytics scripts (Umami, GA, Clarity, JSON-LD), Sentry, image optimisation (`unoptimized` in dev), dev rewrites, dev retry/timeout in `getStation`/embed fetches. | `app/layout.tsx:191-227`, `next.config.ts`, `getStation.ts:25`, `embed/[slug]/page.tsx:23` | production / development |
| `NEXT_RUNTIME` | set by Next | Picks the Sentry server or edge config. | `instrumentation.ts` | - |
| `NEXT_TELEMETRY_DISABLED`, `PORT`, `HOSTNAME` | set in the systemd unit / deploy | Next runtime settings (`PORT=__CLIENT_PORT__`, `HOSTNAME=127.0.0.1`). | `gocast-client.service` | native only |
| `E2E_BASE_URL`, `E2E_API_URL`, `CI` | `http://localhost:3000`, `http://localhost:8000`, unset | Playwright base URLs and CI mode. | `playwright.config.ts` | test only |
| `E2E_CAPTURE` | unset | Lifts `grepInvert: /@(screenshots\|visual)/`, so the capture specs run; set by `npm run test:visual` and `test:help-shots`. | `playwright.config.ts` | test only |

Hardcoded (no env): the Umami website id, the GA measurement id (`G-44FJYHJWQR`) and the Clarity project id are literals in `app/layout.tsx:191-215`; they load only in production builds. `tests/e2e` reads no `process.env`.

## Mobile app (`mobile/`)

Values are read from `process.env.EXPO_PUBLIC_*` (Expo inlines them into the bundle; there is no runtime lookup). `mobile/.env` is for dev; `.env.production.local` exists on disk (gitignored by `.env*.local`). `eas.json` declares **no `env` blocks**, so the repo does not say where an EAS cloud build gets these; that is outside the repo (EAS-side variables or files, unknowable from code).

| Variable | Default | Meaning | Reader | Prod / Dev |
|---|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `''` | Laravel API base including `/api` (also used to derive the API origin for absolute-URL handling, `api.ts:100`). Empty means every request goes to a relative path and fails ("Could not reach the server at "). | `src/lib/api.ts:1` | required / LAN IP of the dev machine, API served with `--host=0.0.0.0` |
| `EXPO_PUBLIC_APP_URL` | `''` | Web app base for share links and in-app browser pages (sign-up, reset, dashboard). | `src/lib/web.ts:6` | required / required |
| `EXPO_PUBLIC_INGEST_URL` | `''` | Dev-only override of the publish address, `{slug}` substituted. Non-empty **wins over the API's `ingest_url`**, so it must be blank in production builds. Pairs with `scripts/ingest-proxy.mjs`. | `src/broadcast/broadcastManager.ts:76,290` | must be empty / dev proxy address |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `''` | Web OAuth client ID (same as the API's `GOOGLE_CLIENT_ID`); empty makes Google sign-in throw "isn't set up in this build". Public, not a secret. | `src/lib/auth.tsx:14,107` | required for Google / required |
| `PORT` (18091), `DUMP_DIR` | see left | Dev-tool settings for `scripts/ingest-proxy.mjs`, which forwards `0.0.0.0:PORT` to `127.0.0.1:8091` (the station router). Started by `npm start` (`scripts/start.mjs`). | `scripts/ingest-proxy.mjs:17,21` | dev only |

`app.json` has no runtime config: `extra` holds only `eas.projectId` (plus `owner`); the `react-native-audio-api` plugin block declares the Android permissions (RECORD_AUDIO, foreground-service microphone/mediaPlayback, POST_NOTIFICATIONS) and the iOS microphone string. The app version shown in Account is `Constants.expoConfig.version` (`app.json` `version`, `1.0.0`). Package/bundle id `app.gocast.mobile`, scheme `gocast`. Other constants live in code, not config, for example the mobile reconnect budget of 30 minutes with backoff `[1,2,4,8,15,30]` s and 20 percent jitter (`broadcastManager.ts:65-68`).

## Native host (`infra/native/`)

`infra/native/env/domains.env` (gitignored; the committed `domains.env.example` is the template) is sourced by `setup-native.sh` and `deploy-native.sh` (`set -a; source`). `setup-native.sh` aborts if any of the first group is unset. `api/.env` is **not** written by any script (`setup-native.sh` says so); you copy `infra/native/env/api.env.example` to `api/.env` by hand.

| Variable | Default (example) | Meaning | Consumers |
|---|---|---|---|
| `APP_HOST`, `API_HOST`, `ICECAST_HOST`, `STREAM_HOST` | `gocast.fm`, `api.`, `icecast.`, `stream.` | Public hostnames rendered into the nginx vhosts (`__APP_HOST__` etc.); `API_HOST` and `APP_HOST` also feed `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BROADCAST_AUTH_URL`. `ICECAST_HOST` feeds `NEXT_PUBLIC_ICECAST_URL`. | `setup-native.sh`, `deploy-native.sh:127-133`, `nginx/*.conf` |
| `APP_ROOT` (`/srv/gocast/app`), `RUN_USER` (`gocast`), `PHP_VERSION` (`8.4`) | | Checkout path, service user, php-fpm version (pool socket name and ini paths). | `setup-native.sh`, systemd units, `php/gocast.pool.conf` (`open_basedir` includes `__APP_ROOT__/api:/var/gocast:/tmp:...`) |
| `CLIENT_PORT` | `3000` | Next standalone server loopback port. | `gocast-client.service`, `gocast-app.conf` |
| `ICECAST_PORT` | `8000` | Native Icecast loopback port (also the UFW allow rule from the Docker bridges). | `gocast-icecast.conf`, `setup-native.sh` |
| `ROUTER_PORT` | `8091` | Loopback port host nginx proxies `/broadcast/{slug}` to. **`docker-compose.native.yml` hardcodes `127.0.0.1:8091:8091` and the router's nginx listens on `8091`**, so changing this value alone breaks the studio path (only `gocast-stream.conf` follows it). | `gocast-stream.conf:58`, `setup-native.sh` |
| `INGEST_PORT` | `8010` | Host port published (all interfaces) for external encoders, mapped to the router's `8000`. `setup-native.sh` refuses to run if it equals `ICECAST_PORT`, `ROUTER_PORT`, `CLIENT_PORT` or `INTERNAL_API_PORT`. Must also be `LIQUIDSOAP_ENCODER_PORT`. | `docker-compose.native.yml` (`${INGEST_PORT:-8010}:8000`) |
| `INTERNAL_API_PORT` | `8081` | Internal-only API vhost, reachable only from the Docker bridges (UFW). Must match the port in `LIQUIDSOAP_API_URL`. | `gocast-api.conf:105`, `setup-native.sh` |
| `DOCKER_HOST_ADDR` | `tcp://127.0.0.1:2375` | Docker socket proxy address, rendered into the pool `env[DOCKER_HOST]` and the queue/scheduler units, and passed by `deploy-native.sh` to `artisan`. Required by `setup-native.sh`. | see left |
| `NEXT_PUBLIC_PUSHER_KEY`, `_HOST`, `_PORT` | blank, `main.pusher.ably.net`, `443` | Client realtime settings, forwarded to `next build` (`deploy-native.sh:130-132`, defaults if unset). **Listed in the example only**; the on-disk `domains.env` on this checkout does not define them, so a build from it has realtime off. | `deploy-native.sh` |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `BACKUP_DIR` (`/var/backups/gocast`), `BACKUP_KEEP` (`10`), `DEPLOYED_REF_FILE`, `DEPLOYED_ENV_FILE` | | `deploy-native.sh` reads them from the environment (`${VAR:-}`), so they can live in `domains.env` **but neither example file mentions the first two**. | `deploy-native.sh:86-89,134-135` |

Other native-host config: the systemd client unit loads `/etc/gocast/client.env` (optional, `-` prefix; the only value the client code reads from it is `RENDER_API_KEY`) and sets `NODE_ENV=production`. `setup-native.sh` sources `api/.env` and then `unset DOCKER_HOST` so its own `docker compose` talks to the unix socket, not the proxy it is creating. The docker socket proxy container is configured with `CONTAINERS=1 NETWORKS=1 IMAGES=1 POST=1 EXEC=0`. The station router image is `gocast/station-router:1.29.8`, memory limit 128M, and has no env; its harbor port is the literal `8090` in `ingest.js`.

`infra/native/env/api.env.example` is described in its own header as "a COMPLETE file, not a patch", but it is a drifted copy of `api/.env.example` (see Gaps). `infra/alloy/config.alloy` reads `HOSTNAME` and `GRAFANA_CLOUD_LOKI_URL/USERNAME/API_KEY`, `GRAFANA_CLOUD_PROM_URL/USERNAME/API_KEY` via `sys.env`; nothing in `infra/native` starts Alloy (see [Deployment and infra](deployment-infra.md)).

## Values that must agree across files

| Must match | Where |
|---|---|
| `INTERNAL_API_KEY` | API `.env` = baked into every `.liq` (re-render after rotating: running stations keep the old key and lose their callbacks) |
| `RENDER_API_KEY` | API `.env` = `/etc/gocast/client.env` (dev: `client/.env.local`) |
| `LIQUIDSOAP_CONTAINER_SUBNET` | API `.env` = subnet in `docker-compose.native.yml` |
| `LIQUIDSOAP_ENCODER_PORT` | API `.env` = `INGEST_PORT` in `domains.env` |
| `LIQUIDSOAP_API_URL` port | API `.env` = `INTERNAL_API_PORT` |
| `LIQUIDSOAP_ICECAST_PORT`, `ICECAST_INTERNAL_URL` port | API `.env` = `ICECAST_PORT` |
| `LIQUIDSOAP_HARBOR_INPUT_PORT` | API `.env` = `8090` literal in `ingest.js` |
| `GOOGLE_CLIENT_ID` | API `.env` = `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| `LIQUIDSOAP_HLS_BASE_URL` | API `.env` -> nginx `STREAM_HOST` vhost serving `LIQUIDSOAP_HLS_DIR` (dev: client `/hls-proxy`) |
| `PUSHER_*` / `BROADCAST_CONNECTION` and `NEXT_PUBLIC_PUSHER_*` | both sides; the client key is the real off switch |
| `CORS_ALLOWED_ORIGINS`, `SESSION_DOMAIN`, `FRONTEND_URL` | all derive from the web origin |

## Gaps and traps

1. **`infra/native/env/api.env.example` has drifted** from `api/.env.example` and still claims to be complete. It lacks 25 keys: all 9 `ANALYTICS_*`, `STATION_EVENT_*` (2), `NOTIFICATION_*` (3), `SENTRY_*` (3), `TELEGRAM_*` (2), `RESEND_WEBHOOK_SECRET`, `LIQUIDSOAP_CONTAINER_SUBNET`, `LIQUIDSOAP_DELETED_STATION_RETENTION_DAYS`, `LIQUIDSOAP_HLS_BASE_URL`, `LIQUIDSOAP_HLS_VARIANT`, and the dev-only `PHP_CLI_SERVER_WORKERS`. The worst omission: without `LIQUIDSOAP_HLS_BASE_URL` a box built from it has HLS off (`hls_url` null, Icecast fallback only) with no warning.
2. **The two templates disagree on a value**: `LIQUIDSOAP_STATION_STORAGE_BYTES` is 3221225472 (3 GiB) in `api/.env.example` and the config default, but 104857600 (100 MB) in `infra/native/env/api.env.example`. A native install from the latter caps every station's library at 100 MB.
3. **Defined but never read by any code:** `VITE_APP_NAME` (in both templates; no `import.meta.env` use anywhere in `api/resources`), `PHP_CLI_SERVER_WORKERS` (read by PHP itself, dev only, not by the repo), `ICECAST_RELAY_PASSWORD` (Icecast template only, via `setup-native.sh`), `DOCKER_HOST` in `api/.env` (only meaningful as a real env var), and the AWS/S3/SES/SQS, `POSTMARK_*`, `SLACK_*`, `MEMCACHED_*`, `PAPERTRAIL_*` groups (stock Laravel, no app code uses those backends). `MEMCACHED_HOST` and `AWS_*` appear in the templates despite that.
4. **Read but undeclared:** in the API, `LIQUIDSOAP_IMAGE`, `_SYSTEM_DIR`, `_STOP_TIMEOUT`, `_START_VERIFY_DELAY_MS`, `_STATUS_DOWN_TTL`, the five `_HEALTH*` keys, `_UNHEALTHY_*`, `_STRANDED_SESSION_STRIKES`, `_CONTAINER_INIT`, `_CONTAINER_PIDS_LIMIT` and the five `_WATERMARK_*` keys are in `config/liquidsoap.php` but in neither template (defaults apply silently). In the client, `INTERNAL_API_URL`, `INTERNAL_ICECAST_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `E2E_*` are read but absent from `client/.env.example`; the dev `.env.local` sets `INTERNAL_ICECAST_URL` regardless.
5. **`FRONTEND_URL` defaults to `http://localhost:5173`** (a Vite-era port; the web dev server is `:3000`). Unset in dev, every email/bell/Telegram link points at a dead port. The `http://localhost:3000` fallback in `GoogleAuthController.php:323` is unreachable because the config default is non-null.
6. **`ROUTER_PORT` is not really configurable** (compose and router nginx hardcode 8091), and **`LIQUIDSOAP_HARBOR_INPUT_PORT` is not really configurable** (router hardcodes 8090). Changing either config value silently breaks ingest routing.
7. **Config edits do not reach running stations.** No env is passed to containers; ports, keys, crossfade, limiter, watermark and address settings are baked in at render/start. Rotating `INTERNAL_API_KEY` or `ICECAST_SOURCE_PASSWORD` needs every station recreated.
8. **Rendered `.liq` files contain secrets** (`INTERNAL_API_KEY` and, via the `output.icecast` block, the Icecast source password). The file mode is whatever `File::put` yields under the php-fpm umask.
9. **`LIQUIDSOAP_SILENT_STOP_SECONDS` has two defaults**: 600 in `config/liquidsoap.php`, 60 in the `config()` fallback in `StationAudioPolicy::windowSeconds()`. The config file wins in practice, but a config-cache-less test that unsets the key would see 60.
10. **`LIQUIDSOAP_IMAGE` default is `gocast/liquidsoap:latest`** while the Dockerfile header insists on never using `:latest` (pinned base `v2.4.5`). Nothing in config pins the local tag; whichever `:latest` was last built is what runs.
11. **`LIQUIDSOAP_CONTAINER_MEMORY` 512m** in config and templates is the working value; smaller caps SIGKILL stations at boot with empty logs (only the supervisor's OOM check explains it).
12. **`api/.env.example` still lists `ICECAST_RELAY_PASSWORD` and `DOCKER_HOST` beside real config**, giving the impression Laravel reads them. `DOCKER_HOST` set only in `.env` has no effect under `config:cache`; three other places set it (pool, two systemd units).
13. **Sanctum stateful/guard config is inert-looking**: auth is a bearer token stored in a cookie built by `AuthController::authCookie()`, whose lifetime comes from `SANCTUM_EXPIRATION` (minutes) and whose domain from `SESSION_DOMAIN`. Setting `SESSION_DOMAIN` wrong breaks web login even though "sessions" are not the auth mechanism.
14. **Redis is required everywhere.** `CACHE_STORE=array`/`SESSION_DRIVER=array`/`QUEUE_CONNECTION=sync` in tests do not remove the direct `Redis::` dependency; a test run without Redis fails in listener, now-playing and lifecycle tests.
15. **`phpunit.xml` forces `PULSE_ENABLED`/`TELESCOPE_ENABLED`/`NIGHTWATCH_ENABLED`** for packages that do not exist here; dead lines.
16. **The `.liq` template's docblock still lists `$rtspHost`/`$rtspPort`** (`station.blade.php:14-15`), variables `renderLiqFile()` no longer passes. Comment drift only.
17. **`EXPO_PUBLIC_INGEST_URL` overrides the API's ingest address unconditionally** when non-empty (`broadcastManager.ts:290`). A production build made from the dev `.env` would send every phone show to a LAN address.
18. **`mobile/eas.json` has no env section**, so where a production EAS build gets `EXPO_PUBLIC_*` from is not defined in the repo. `.env.production.local` is gitignored (`mobile/.gitignore` `.env*.local`); whether EAS picks it up is decided by EAS, not by any file here.
19. **The on-disk `infra/native/env/domains.env` lacks the `NEXT_PUBLIC_PUSHER_*` lines** that `domains.env.example` documents, and neither file defines `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_AUTH_TOKEN` although `deploy-native.sh` forwards them; a build without them silently has realtime and Sentry off.
20. **Analytics and third-party script IDs are hardcoded** (Umami site id, GA `G-44FJYHJWQR`, Clarity id in `client/app/layout.tsx`): switching environments does not change them, but they only load with `NODE_ENV=production`.

## Tests

No test covers the config files themselves. Relevant: `api/tests/TestCase.php` (env pinning), `api/phpunit.xml` (forced values), `api/tests/Feature/StationHlsUrlTest.php` (`hls_variant`, `hls_base_url`), `api/tests/Feature/ReconcileStationsTest.php` (`stranded_session_strikes`), `api/tests/Feature/LiquidsoapTemplateTest.php` (rendered values), `api/tests/Feature/DerivedStationStateTest.php` (`status_down_ttl_seconds`). About 90 inline `config([...])` calls across 46 test files.

## History

- Hybrid dev mode and env switches: memory notes on hybrid dev mode and the no-Docker runbook (`docs/`); the native kit is documented in `infra/native/README.md`.
- Deployment topology and what reads which file: [Deployment and infra](deployment-infra.md).
- Related feature docs: [Liquidsoap supervisor](liquidsoap-supervisor.md), [Liquidsoap station script](liquidsoap-station-script.md), [Listener analytics](listener-analytics.md), [Realtime events](realtime-events.md), [Dev environment and testing](dev-environment-and-testing.md), [Mobile app shell and auth](mobile-app-shell-and-auth.md).
