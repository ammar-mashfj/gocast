---
feature: Dev environment and testing
verified: 2026-10-05 against c970b2d plus uncommitted work
sources:
  - api/tests/TestCase.php
  - api/tests/Pest.php
  - api/tests/Feature/ArchitectureTest.php
  - api/tests/Feature/ExampleTest.php
  - api/tests/Unit/ExampleTest.php
  - api/phpunit.xml
  - api/composer.json
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Console/Commands/E2EAuthCommand.php
  - api/config/liquidsoap.php
  - api/config/sentry.php
  - api/.env.example
  - api/bootstrap/app.php
  - api/app/Providers/AppServiceProvider.php
  - api/routes/console.php
  - api/database/factories/AdminFactory.php
  - api/database/factories/AutodjSlotFactory.php
  - api/database/factories/InviteFactory.php
  - api/database/factories/JingleListFactory.php
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
  - client/playwright.config.ts
  - client/tests/e2e/auth.spec.ts
  - client/tests/e2e/help-screenshots.spec.ts
  - client/tests/e2e/support/auth.ts
  - client/next.config.ts
  - client/package.json
  - client/eslint.config.mjs
  - client/tsconfig.json
  - client/.env.example
  - client/lib/env.ts
  - client/app/hls-proxy/[...path]/route.ts
  - client/app/dashboard/stations/page.tsx
  - client/app/dashboard/settings/page.tsx
  - client/instrumentation-client.ts
  - client/sentry.server.config.ts
  - client/sentry.edge.config.ts
  - api/app/Observers/StationObserver.php
  - mobile/package.json
  - mobile/eslint.config.js
  - mobile/.env.example
  - mobile/scripts/start.mjs
  - mobile/scripts/ingest-proxy.mjs
  - scripts/docs-check.sh
  - docs/features/README.md
  - infra/native/docker-compose.native.yml
  - client/vitest.config.mts
  - client/vitest.setup.ts
  - client/tests/e2e/dashboard-visual.spec.ts
  - client/app/dashboard.css
fingerprint: 91a0627040a4f613
---

# Dev environment and testing

How to run GoCast on a laptop and how it is tested. The one thing people get wrong: **the tests are not all there is, and the browser (Playwright) tests are mostly broken.** The API has a large Pest suite (1,112 `it()`/`test()` blocks in 102 files) that runs against a real MySQL database and a real Redis. The web client has one Playwright auth spec that no longer matches the UI and one screenshot generator that is not a test. The mobile app has no tests at all. There is no CI in the repo (no `.github/`, no `.gitlab-ci.yml`).

Nothing in this doc came from the memory notes, READMEs or code comments alone; where a comment and the code disagree, the disagreement is in "Gaps and traps".

## Running the API tests

| Command (from `api/`) | What it does |
|---|---|
| `composer test` | `php artisan config:clear` then `php artisan test` (`composer.json` `scripts.test`). The `config:clear` matters: a cached config would ignore `phpunit.xml`'s env overrides. |
| `php artisan test --filter=Name` / `vendor/bin/pest path` | Targeted run. Pest 4 (`pestphp/pest`, `pest-plugin-laravel`) on PHPUnit; there is no Pest browser plugin installed, despite `tests/Browser` being mentioned in the `pest-testing` skill text. |

Prerequisites the suite silently assumes (none are created by the suite):

- **MySQL with a database called `gocast_test`.** `phpunit.xml` forces `DB_CONNECTION=mysql` and `DB_DATABASE=gocast_test` but leaves `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` to whatever `api/.env` says, so the tests use the dev MySQL server with the dev credentials. `RefreshDatabase` (`Pest.php`) runs every migration into it.
- **A reachable Redis.** `phpunit.xml` does not override any `REDIS_*` value. Cache, session and queue are forced to `array`/`array`/`sync`, but code that calls the `Redis::` facade directly (`metadata:{station id}`, `listeners:{station id}`, listener token keys) talks to the real server named in `api/.env`, under the same key prefix (`REDIS_PREFIX`, default `<APP_NAME>-database-`) as the dev app. Files that do: `SweepListenerSessionsTest`, `SyncListenerCountsTest`, `ListenerSessionTest`, `StationStopClearsNowPlayingTest`, `DerivedStationStateTest`, `NowPlayingControllerTest`.
- **The `plans` rows.** They are not seeded by a seeder; the `free` (id 1) and `pro` (id 2) rows, plus every later plan column, are written by migrations (`2026_04_16_131050_create_plans_table.php` and the `add_*_to_plans_table` migrations). `UserFactory::onPlan('pro')` looks the row up with `firstOrFail`, `InviteFactory` looks up `pro` (falling back to a `Plan::factory()` row if absent). A `PlanFactory` plan is a different, blank row.

### `tests/TestCase.php`: environment pinning

`createApplication()` runs `putenv('APP_ENV=testing')` and sets `$_ENV`/`$_SERVER['APP_ENV']` before calling the parent. The point: `api/.env` carries `APP_ENV=local` in dev, and if that wins, `app()->runningUnitTests()` is false and every test-mode guard (below) silently turns off. `phpunit.xml` also sets `APP_ENV=testing` with `force="true"`; the override in `TestCase` exists because that alone was not enough. It also blanks `SENTRY_LARAVEL_DSN` the same way (`putenv`, `$_ENV`, `$_SERVER`): `api/.env`'s live DSN otherwise turned every test that asserts a failure into a real Sentry issue.

### `tests/Pest.php`

- `pest()->extend(TestCase::class)->use(RefreshDatabase::class)->beforeEach(...)->in('Feature')`. Only `Feature` gets the base class and the database refresh; `tests/Unit` is bare PHPUnit-in-Pest (its one test is `expect(true)->toBeTrue()`).
- The `beforeEach` runs `Cache::flush()`, `Session::flush()` and `Auth::forgetGuards()`. Array cache and session live in statics for the whole PHP process, so without it rate-limit counters and authenticated users leak from one test to the next ("passes alone, fails in suite").
- `expect()->extend('toBeOne')` is a leftover Pest sample.
- Helpers `sentMessages()`, `sentMessage($i)`: read what `MAIL_MAILER=array` captured. Use these to assert on rendered email, because `Notification::fake()` never renders a template.

### `phpunit.xml`

Two suites (`Unit`, `Feature`), coverage source `app/`. Every `<env>` is `force="true"`:

| Variable | Value | Why |
|---|---|---|
| `APP_ENV` | `testing` | see TestCase above |
| `APP_MAINTENANCE_DRIVER` | `file` | |
| `BCRYPT_ROUNDS` | `4` | fast hashing |
| `BROADCAST_CONNECTION` | `null` | no Ably/Pusher traffic |
| `CACHE_STORE` / `SESSION_DRIVER` / `QUEUE_CONNECTION` | `array` / `array` / `sync` | jobs run inline |
| `DB_CONNECTION` / `DB_DATABASE` / `DB_URL` | `mysql` / `gocast_test` / empty | |
| `MAIL_MAILER` | `array` | |
| `PULSE_ENABLED`, `TELESCOPE_ENABLED`, `NIGHTWATCH_ENABLED` | `false` | |
| `TELEGRAM_BOT_TOKEN` | empty | a run must never message the real admin chat |
| `SENTRY_LARAVEL_DSN` | empty | a run must never send test failures to Sentry (also pinned in `TestCase`) |
| `LIQUIDSOAP_TELNET_RESOLVE` | `name` | hybrid dev sets `ip`; `ip` would make `LiquidsoapSupervisor::containerHost` shell out to docker for nonexistent stations |
| `LIQUIDSOAP_LIQ_DIR` / `_PLAYLISTS_DIR` / `_HLS_DIR` | `/tmp/gocast-test/{liq,playlists,hls}` | `PlaylistFileWriter` has no test guard and `StationObserver`'s force-delete hook deletes the station directory; without this every factory station leaks into `/var/gocast` |

Many tests also call `config([...])` (46 files) to point `liquidsoap.playlists_dir` at their own tmp dir, set `services.internal_api_key`, or move thresholds.

### The Docker guard in `LiquidsoapSupervisor`

`LiquidsoapSupervisor::inTestMode()` is `app()->runningUnitTests()`. Every method that touches the daemon or a container returns early when it is true: `up`, `down`, `downBySlug`, `removeContainer`, `restart`, `isRunning`, `isHealthy`, `containerState`, `logTail`, `listManagedContainers`, `listContainerStates`, the private `containerExistsByName`, and `telnet`. Without it, one `Station::factory()->create()` would `docker run` a real container on the host daemon (restart policy `unless-stopped` outlives the test).

Consequences for writing tests:

- Code that asks the supervisor "is it running / healthy / what state" gets `false`/empty in tests, so behaviour that depends on the daemon has to be tested by mocking the supervisor (`Mockery::mock(LiquidsoapSupervisor::class)->makePartial()` bound with `app()->instance(...)`, used in `StationObserverTest`, `DerivedStationStateTest`, ; 13 test files mock or partial-mock it and 15 reference the class in all) or, for command construction, by calling the private builders through reflection (`LiquidsoapSupervisorTest` `invokePrivate()` on `baseRunCommand`, `sandboxFlags`, `healthFlags`, `resourceFlags`, `mountFlags`).
- `StationObserverTest` first asserts `LiquidsoapSupervisor::inTestMode()` is true. If that test fails, stop and fix the env before running anything else.
- `telnet()` returns immediately too, so the watermark pushes are asserted on the command strings (`WatermarkTest` expects e.g. `var.set watermark_interval = 60.0` on a mocked supervisor), not on a socket.

## Factories and seeders

| Factory | Notes |
|---|---|
| `UserFactory` | Verified by default. `password` is the hash of `password`. `onPlan($slug)` (real row, `firstOrFail`); `unverified()`. A default user is on the free plan (column default `plan_id` 1). |
| `AdminFactory` | Guard `admin`; password `password`. Admin tests use `actingAs($admin, 'admin')` plus `withoutVite()`. |
| `PlanFactory` | Random slug, 1-10 stations, 50-1000 listeners. Other plan flags come from column defaults. |
| `StationFactory` | Fills a stream key so `make()` matches `create()` (no jingle fields any more: the old `stations.jingle_*` columns are unused). States: `withAutoDj()` (owner on Pro; **skipped when the caller used `for()`**, on purpose), `featured()`, `running()` (sets `desired_state`), `live()` (opens an open `StreamSession`, because `is_live` is derived, not a column). `Station::booted()` creates the default playlist on `created`; `StationObserver::creating` allocates `container_index` (max including soft-deleted, plus one). |
| `TrackFactory` | `configure()` attaches music tracks to the station's default playlist via `PlaylistTracks::attach`. States `analyzed()` (loudness -9 LUFS, peak -0.5 dB, cue in 1.5 s, and `duration_measured_at` set, so the track has an `airtimeSeconds()` and the hard-start planner can fit it), `jingle()` (3-12 s, **no `jingle_list_id`**: pass one, or the jingle belongs to no list and never plays). Files are not created on disk: `path` is a ULID name. |
| `JingleListFactory` | "Station IDs", enabled, random pick, every 4 songs, on a fresh station. States `everyMinutes($n)`, `atTimes([...], exact: false)`. |
| `PlaylistFactory` | Non-default only (`is_default` false); `shuffled()`. |
| `AutodjSlotFactory` | Default: Mon-Fri 06:00-12:00 on a fresh UTC station with its own playlist. Pass `station_id` and a playlist of that station. |
| `StationScheduleFactory` | One random weekday, hour-aligned start. |
| `ListenerSessionFactory` | Default is an **open** session (no `ended_at`); `closed($seconds)` (120-3600 s default), `bounced()` (1-20 s). |
| `InviteFactory` | `pro` plan, single use; `used()`, `expired()`. |
| `StationEventFactory` | Random container-type event; `type()`, `old($days=60)`. |

Seeders: `DatabaseSeeder` (uses `WithoutModelEvents`) creates one `Test User` (`test@example.com`, verified, free) and `StationSeeder` is an empty stub that `DatabaseSeeder` does not call. Nothing seeds plans, stations or tracks. There is no dev-data seeder: local demo data is made by hand (the screenshot spec assumes a manually "dressed" database).

`E2EAuthCommand` (`e2e:auth`, in `app/Console/Commands`) is the only fixture command; see Playwright below.

## API test inventory (coverage map)

Counts are `it()`/`test()` blocks by grep, so datasets multiply them at run time. Test bodies were sampled, titles were all read; treat this as a map of intent, not proof that each behaviour is fully asserted. Paths are under `api/tests/Feature/` unless noted.

| Feature (doc) | Test files |
|---|---|
| Auth: login, lockout, cookies | `Auth/LoginTest` (4: fresh code for unverified, cookie vs mobile-token JSON), `Auth/LoginLockoutTest` (2: five failures, counter clears), `Auth/AuthCookieShadowingTest` (4: stale duplicate cookie), `Auth/RecordUserLastLoginTest`, `Observability/AuthenticationLogTest` (5) |
| Auth: verification & reset | `Auth/EmailVerificationCodeTest` (9), `Auth/EmailVerificationEnforcementTest` (5, datasets: the 403 `email_unverified` gate), `Auth/PasswordResetTest` (7), `Auth/ProfileEmailChangeTest` (6), `Auth/UserEntitlementsTest` (3) |
| Auth: Google | `Auth/GoogleOAuthCallbackTest` (14: popup view, avatar overflow, invite cookie), `Auth/GoogleNativeSignInTest` (8: `GoogleIdTokenVerifier`, `POST /auth/google/native`) |
| Account deletion / soft delete | `Account/AccountDeletionConfirmationTest` (6), `Account/AccountDeletionCascadeTest` (4), `Account/PasswordChangeNotificationTest` (3), `Models/UserSoftDeleteTest`, `Models/StationSoftDeleteTest`, `Models/StationSlugTest` (7) |
| Invites, plans, access requests | `Auth/InviteRedemptionTest` (20), `Admin/InviteTest` (26), `Admin/AccessRequestReviewTest` (38), `Admin/AccessRequestIndexTest` (10), `WaitlistControllerTest` (12), `Console/ExpirePlansTest` (3), `Admin/StationUpgradeTest` (15), `Admin/AccountProvisionTest` (15) |
| Admin panel | `Admin/AuthenticationTest` (13), `Admin/StationIndexTest` (13), `Admin/StationFeatureTest` (9), `Admin/StationTimelineTest` (11), `Admin/AnnouncementTest` (23), `Admin/RawEmailTest` (23), `Admin/WatermarkClipTest` (11), `Console/AdminResetPasswordCommandTest` (4), `AdminTelegramAlertTest` (5) |
| Station power and lifecycle | `StationPowerControllerTest` (11), `StationLifecycleServiceTest` (5), `StationSweepTest` (40, the largest: auto-stop decision tree), `ReconcileStationsTest` (17), `StationObserverTest` (10), `StationStopClearsNowPlayingTest` (5), `PruneDeletedStationsTest` (7), `StationContainerIndexTest` (5), `StationContainerIpTest` (10) |
| Derived state / status / metrics | `DerivedStationStateTest` (19), `StationStatusTest` (22), `MetricsControllerTest` (4), `StationStatsTest` (9) |
| Liquidsoap supervisor and script | `LiquidsoapSupervisorTest` (10: docker flags), `LiquidsoapTemplateTest` (59: string assertions on the rendered `.liq`, including the `X-Gocast-Script`/`X-Gocast-Fresh` headers and the `fade.out` on the rotation), `PlaylistFileWriterTest` (11: annotate URIs, `prepare()`, the trimmed `liq_cue_out`/`liq_fade_out`), `StationHlsUrlTest` (4) |
| Broadcasting: studio and encoder | `BroadcastTokenServiceTest` (5), `BroadcastTokenControllerTest` (5), `HarborAuthTest` (15), `EncoderSessionAttributionTest` (22), `StreamKeyRotationTest` (6), `StationEncoderResourceTest` (6) |
| AutoDJ, playlists, schedule | `NextTrackControllerTest` (16), `AutoDjShuffleTest` (16), `AutoDjProgrammeTest` (9), `AutodjSlotTest` (16, incl. `start_mode`), `AutoDjHardStartTest` (15: the AutoDJ clock, hard slot starts, fit picks, trims, jingle filler, older scripts get neither), `StationScheduleTest` (22), `PlaylistControllerTest` (26), `PlaylistBackfillMigrationTest` (1) |
| Library and track processing | `TrackControllerTest` (32), `TrackImporterFilenameTest` (3), `TrackAnalyzerTest` (18, `Process::fake` around ffmpeg, incl. the decoded length and `measureDuration()`), `TrackAnalysisTest` (13, loudness plan), `TrackAnnotationTest` (10), `TrackDurationTest` (10: measured length, `tracks:measure-durations`, `airtimeSeconds()`) |
| Jingles | `JingleListControllerTest` (14: CRUD, rule validation, upload into a list, move, the data migration from `stations.jingle_*`), `JingleRulesTest` (16: every/songs/minutes/set times, exact, pick modes, hours and days, never two in a row, plan gate) |
| Now playing | `NowPlayingControllerTest` (9; real Redis) |
| Listener analytics | `ListenerSessionTest` (14), `ListenerIdentityTest` (10), `SweepListenerSessionsTest` (16), `RollupListenerStatsTest` (7), `PruneListenerSessionsTest` (4), `SyncListenerCountsTest` (6), `AudienceControllerTest` (17) |
| Public player, embed, SEO, featured | `PublicEmbedTest` (6), `PublicFeaturedTest` (10), `PublicStationSeoTest` (8), `StationSocialLinksTest` (9), `StationNotifySubscriptionTest` (6), `ExampleTest` (`GET /` returns 200, the Laravel welcome view) |
| Notifications and email | `NotificationControllerTest` (18), `Notifications/BellContractTest` (12: reads source to enforce the bell base class), `PruneNotificationsTest` (4), `SendAnnouncementTest` (20), `UnsubscribeTest` (7), `ResendWebhookTest` (6), `NudgeInactiveBroadcastersTest` (7) |
| Station event log / realtime | `StationEventLogTest` (10), `StationEventControllerTest` (8), `StationEventBroadcastTest` (8), `StationEventTrackLogTest` (3), `Console/PruneStationEventsTest` (3), `Observability/ActivityLogTest` (2), `BroadcastAuthTest` (5) |
| Watermark | `WatermarkTest` (12, incl. the `plans:expire` case that used to live in the deleted `StationJingleSettingsTest`), `ReloadWatermarkClipsTest` (3), `Admin/WatermarkClipTest` |
| Architecture | `ArchitectureTest`: four `arch()` rules (commands extend `Command`; notifications extend `Notification` except `Bell\BellPayload`; `BellNotification` is abstract; policies are classes) |
| Placeholders | `Unit/ExampleTest` (`true is true`), `Feature/ExampleTest` |

### Features and code with no automated test

Found by grepping the test tree for route paths, artisan signatures and class names (2026-09-29):

- **`POST /api/upload/{type}`** (`UploadController`, station artwork): only the "unverified users are blocked" dataset in `EmailVerificationEnforcementTest` touches it. Nothing tests the file rules, storage, or the returned URL.
- **`DELETE /api/stations/{station}`** (`StationController@destroy`): no direct HTTP test. Deletion is exercised only through account deletion and model soft-delete tests.
- **`GET /api/stations/{station}/sessions`, `DELETE .../sessions/{session}`** (`StreamSessionController@index/destroy`): untested. Only `POST .../sessions` (studio start) is, via `EncoderSessionAttributionTest`.
- **`GET /api/public/genres`**: untested. `GET /api/public/stations` (the list) appears only as a side-assertion in other tests (schedule, SEO, account deletion, encoder-leak), never as its own feature test.
- **`GET /api/auth/google`** (the redirect half of web Google sign-in): only its `invite` query handling (cookie set / rejected for `<script>`) is tested in `GoogleOAuthCallbackTest`; the redirect itself is not.
- **`POST /api/auth/register` and `POST /api/logout` as features**: registration is only exercised through the invite tests and `PasswordChangeNotificationTest`, logout only in the verification-enforcement dataset. There is no test of a plain sign-up (welcome mail, first-station creation, throttle).
- **Commands**: `admin:create`, `tracks:analyze` (the `AnalyzeTrack` job's service is tested, the command is not), `stations:relaunch` (named only in a comment in `EncoderSessionAttributionTest`), `e2e:auth`.
- **Real Liquidsoap**: no test runs the `.liq` through Liquidsoap. `LiquidsoapTemplateTest`'s own comment says `liquidsoap --check` "runs against the image", but no script, Makefile or workflow in the repo runs it (grep over `infra/`, `scripts/`, `api/app`). The test also builds the Blade variable array by hand (`renderStationScript()`), separately from `LiquidsoapSupervisor`'s render call (`LiquidsoapSupervisor.php` `View::make('liquidsoap.station', ...)` at about line 1051), so a variable added to one and not the other is not caught by the test failing to render.
- **Docker behaviour**: everything behind `inTestMode()` (real start, stop, health, reconcile against a daemon) has never been exercised by the suite.
- **Infra scripts**: `infra/native/*.sh`, the station router (`infra/native/station-router/ingest.js`), nginx and systemd units: no tests.
- **Client (Next.js)**: no unit or component tests. Everything except the auth flows in `auth.spec.ts` (and those are stale, below) is untested: dashboard, studio, player, embed, schedule grid, help, marketing.
- **Mobile**: no tests, no test runner, no `test` script in `mobile/package.json`.

## Web client: lint, types, build

`client/package.json` scripts: `dev` (`next dev`), `build` (`next build`), `start`, `lint` (`eslint`), `analyze` (`ANALYZE=true next build`, via `@next/bundle-analyzer`), `test:e2e` (`playwright test`), `test:e2e:ui`, `test:visual` (`playwright test dashboard-visual --grep @visual`), `test` (`vitest run`), `test:watch` (`vitest`).

- `eslint.config.mjs` extends `eslint-config-next` core-web-vitals and typescript; ignores `.next/`, `out/`, `build/`, `next-env.d.ts`, `public/**`.
- **Dashboard guardrails** (`dashboardGuardrails` in the same file), on `app/dashboard/**`, `components/dashboard/**`, `components/ds/**`, `components/studio/**` (tests excluded), all errors:
  - no arbitrary values for type, colour, radius, tracking, line height, shadow, ring or stroke (`text-[13px]`, `rounded-[14px]`, `bg-[#…]`), and no `[Npx]` sizes; layout brackets (grid templates, `max-w-[65ch]`, `max-h-[50vh]`, calc with safe-area insets, flex-basis, transition lists) stay legal;
  - no Tailwind default radius steps (`rounded-xl`) or palette colours (`text-zinc-400`);
  - no HTML entities in JSX text (`you&apos;re`): an entity after an `{expression}` made the compiler drop the space before it ("Keep Morning Staticon air");
  - no `@/components/ui/*` import except `skeleton`, `sidebar`, `slider`, `scroll-area`, `avatar`.
  Design tokens live in `client/app/dashboard.css` and are registered with tailwind-merge in `client/lib/utils.ts`; add a token there rather than a bracket value.
- There is **no `typecheck` script**. `tsconfig.json` is `strict: true`, `noEmit`, `incremental`, so the check is `npx tsc --noEmit` by hand. `next build` type-checks as part of the build but does not run ESLint.
- `next.config.ts` wraps everything in `withSentryConfig` (org `gocast`, project `javascript-nextjs`, `tunnelRoute: "/monitoring"`). A production build therefore talks to Sentry for source maps unless offline.

### Dev-only pieces of the client

| Piece | Where | Behaviour |
|---|---|---|
| `allowedDevOrigins` | `next.config.ts` `LAN_DEV_ORIGINS` | `10.*.*.*`, `192.168.*.*`, `172.16.*.*` through `172.31.*.*` (spelled out; the matcher only wildcards whole segments, `172.1*` matches nothing) and `*.local`. Without it, opening `next dev` from a phone/tablet serves SSR HTML but 403s every `/_next` chunk, so nothing hydrates and every button is dead with no visible error. `next dev --hostname 0.0.0.0` does not help. Ignored by production builds. |
| `/stream-proxy/*` rewrite | `next.config.ts` `rewrites()` | Only when `NODE_ENV=development`: proxies to `INTERNAL_ICECAST_URL` (default `http://127.0.0.1:8888`). The default port is 8888, not 8000, because in dev the API holds 8000; a wrong port proxies audio requests to Laravel, which answers a valid-looking 404 HTML page. |
| `/hls-proxy/[...path]` | `client/app/hls-proxy/[...path]/route.ts` | Dev only (returns 404 unless `NODE_ENV=development`). Serves `.m3u8`/`.aac`/`.ts`/`.m4s`/`.mp4` from `LIQUIDSOAP_HLS_DIR` (default `/var/gocast/hls`) with path-traversal guard; manifests `no-cache`, segments `immutable`. Point the API at it with `LIQUIDSOAP_HLS_BASE_URL=http://localhost:3000/hls-proxy`; empty `LIQUIDSOAP_HLS_BASE_URL` makes `hls_url` null and the player falls back to Icecast. |
| Image optimizer | `images.unoptimized` and `dangerouslyAllowLocalIP` are true only in development; `remotePatterns` includes `http://localhost:8000/storage/**` |
| Sentry | `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` only init when `NODE_ENV === "production"` **and** `NEXT_PUBLIC_SENTRY_DSN` is set; traces sample rate 0.2. Dev never reports from the web client. |

## Web unit and component tests (Vitest)

`npm test` runs Vitest 4 (`vitest.config.mts`: jsdom, `resolve.tsconfigPaths`, setup `vitest.setup.ts` with `@testing-library/jest-dom`); `npm run test:watch` watches. Tests are colocated as `*.test.ts(x)`. As of 2026-10-05: pure dashboard logic in `lib/` (`airState`, `stationHero`, `comingUp`, `liveShows`, `showsTrend`, `dashboardNav`, `format`, `preflightQueue`, `socialLinks`, `utils`), the ds kit (`components/ds/ds.test.tsx`, `kit.test.tsx`, `ConfirmDialog.test.tsx`, `Dialog.test.tsx`), dashboard components (`station-form/StationForm.test.tsx`, `settings/ShowTimesEditor.test.tsx`, `account/PlanCard.test.ts`, `jingles/jingleRule.test.ts` (the rule sentence; 7 cases)), and two pure studio helpers (`components/studio/FileQueue.test.ts` `secondsUntilLoop`, `NowPlaying.test.ts` `upNext`); about 110 `it`/`test` cases by static count. Radix keyboard behaviour (arrow keys in menus) doesn't work in jsdom; test it in a browser.

## Playwright (web e2e)

`client/playwright.config.ts`: `testDir ./tests/e2e`, Chromium only, 30 s test timeout, 5 s expect timeout, not fully parallel, CI (`process.env.CI`) adds 2 retries and one worker, trace on first retry, screenshot and video on failure. Base URL `E2E_BASE_URL` (default `http://localhost:3000`), API `E2E_API_URL` (default `http://localhost:8000`). `webServer` starts two things and reuses existing ones outside CI:

1. `php8.4 artisan serve --host=127.0.0.1 --port=8000 --no-reload` in `../api`, healthy when `/up` answers.
2. `npm run dev`.

`php8.4` is hard-coded here and in `support/auth.ts`; a machine whose PHP binary is named differently fails at spawn.

### Fixtures: `e2e:auth` and `support/auth.ts`

`php artisan e2e:auth {action} --email= --password=Password123! --name="E2E User" --unverified --code=123456`. It refuses to run unless `app()->environment(['local','testing'])`. Actions:

- `user`: force-deletes any existing user with that email (plus their tokens and email code, and the reset code row), creates the user with a hashed password, sets `email_verified_at` (or leaves it null with `--unverified` and stores a hashed 6-digit code that expires per `EmailVerificationCode::CODE_TTL_MINUTES`).
- `email-code` / `password-code`: upsert a deterministic hashed code (attempts reset to 0). `--code` must be exactly six digits; email must be valid.
- `email-code` throws if the user does not exist; `password-code` does not check.
- `delete`: implemented in the command, but **no helper in `support/auth.ts` calls it and no spec cleans up**. Every run leaves `e2e+<label>-<nonce>@gocast.test` users in whichever database `api/.env` points at, which is the dev database `gocast`, not `gocast_test`.

`support/auth.ts` exports `E2E_PASSWORD`, `EMAIL_CODE` (`123456`), `RESET_CODE` (`654321`), `uniqueEmail`, `createE2EUser`, `setEmailCode`, `setPasswordResetCode`, `signIn`, `expectDashboard`, `signOutFromDashboard`, and `isolateAuthRateLimit`. The last one sets an `X-Forwarded-For` header (`198.51.<n>.<m>`, derived from a hash of file, title, retry) per test. That works because `bootstrap/app.php` trusts proxies from `*`, and the `auth` limiter is 10 requests/minute per IP (`AppServiceProvider`), with a separate five-failed-logins lockout, so the specs would otherwise throttle each other.

### `tests/e2e/auth.spec.ts` (10 tests)

Redirect of logged-out visitors from `/dashboard`, `/dashboard/stations`, `/dashboard/broadcasts`, `/dashboard/settings`; invalid credentials (mocked 401); sign in/out; unverified user gated by the "Verify your email" dialog; register + verify; password reset; change email (verify new address); change password; delete account; Google button opens `/auth/google` popup (stubs `window.open`).

**Most of these cannot pass against the current UI** (verified by grep of `client/`):

- `expectDashboard()` waits for URL `/dashboard/stations` and the text "Create your first station" or a "Your stations" heading. `client/app/dashboard/stations/page.tsx` is now `redirect("/dashboard")` ("there is no station list any more") and neither string exists anywhere in `client/`. Every test that calls `expectDashboard` (sign in, verify, register, reset, change email, change password) fails at that step.
- The delete-account test clicks "Delete account" and fills `#delete-password`. The page now has "Delete account…" (`components/dashboard/account/DeleteAccount.tsx`), whose `ds/ConfirmDialog` asks for the email typed into a generated-id field, and the API (`AccountController@destroy`) checks `confirmation` against the email. The test cannot reach "Delete forever" enabled.
- The redirect test, the invalid-credentials test (it mocks the 401 and accepts either `Invalid credentials` or `Something went wrong`; the real API message is `Invalid credentials.`, `AuthController`) and the Google popup test do not depend on the dashboard and are the ones plausibly still green.

### `tests/e2e/help-screenshots.spec.ts` (not a test)

One test, `@screenshots`, writing lossless PNGs at `deviceScaleFactor: 2` to `tests/e2e/.screenshots/` (gitignored; only the webp copies in `public/help/` are committed; its header has the conversion loop). Rewritten on 2026-10-01 for the redesigned dashboard: it signs in as the keeper account `shell@gocast.test` (`E2E_PASSWORD`), shoots station `night-shift-shell`, and stages only in the page (`dress()` swaps the factory's placeholder genre/description and drops `support/help-artwork.webp` into the artwork tile; the schedule shots draw slots and never press Save). It no longer shoots the public player page or the go-live pre-flight. Run it with `npm run test:help-shots`; its header lists the shots and the webp conversion.

`playwright.config.ts` sets `grepInvert: /@(screenshots|visual)/`, so neither capture spec runs in `npm run test:e2e`; `npm run test:help-shots` and `npm run test:visual` set `E2E_CAPTURE=1`, which lifts it.

### `tests/e2e/dashboard-visual.spec.ts` (`npm run test:visual`)

Every dashboard page and main state at desktop 1440 and phone 390: 31 states × 2 = 62 tests (AutoDJ is three pages: `/library`, `/playlists`, `/jingles`, each shot on Pro and Free), about 1.5 minutes. Each writes a full-page PNG to `tests/e2e/.visual/{desktop,phone}/` (gitignored) and fails on an uncaught page error, a missing `h1` (or open dialog, for dialog states) or a phone page that scrolls sideways. It fakes `document.visibilityState` (headless tabs are hidden, which pauses the status poll and the player) and waits for fonts, images and the end of "Checking…". Not a pixel diff: the pages show live data (clock, "today", counts). It signs in once per account (`storageState` in `.visual/.auth-*.json`) and never changes data. It uses the running dev servers; `webServer` only starts them when absent.

**Keeper accounts** (all `Password123!`; made once, read by both screenshot specs; never re-run `e2e:auth user` on them, it force-deletes the user and the station with it):

- `shell@gocast.test`: Pro, station `night-shift-shell` (factory), with tracks, two playlists, a slot, seeded listener rows (`visitor_hash` `seed55-*`) and seeded shows.
- `free@gocast.test`: Free, station `free-shell` "Morning Static" (factory): the locked states.
- `create@gocast.test`: Free, no station: the create page. Don't submit its form.

## Mobile scripts and lint

`mobile/package.json`: `start` (`node scripts/start.mjs`), `android` (`expo run:android`), `ios`, `web`, `lint` (`expo lint`), `postinstall` (`patch-package`, applying `mobile/patches/react-native-audio-api+0.13.6.patch`). `eslint.config.js` is `eslint-config-expo/flat` with `dist/*` ignored. No `tsc` script; no tests. `eas.json` (not a source here) defines `development`, `preview`, `production` build profiles.

- `npm start` runs `scripts/start.mjs`: spawns `scripts/ingest-proxy.mjs` and `npx expo start` (extra args pass through), and kills the proxy when Metro exits. If the proxy dies (e.g. `EADDRINUSE` on 18091) it prints why and Metro keeps running.
- `ingest-proxy.mjs`: a raw TCP forwarder from `0.0.0.0:${PORT ?? 18091}` to `127.0.0.1:8091`, the station router's loopback broadcast port, with the WebSocket upgrade passing through untouched. Needed because the API returns the container's Docker bridge IP as the ingest address and a phone cannot route to it. `DUMP_DIR` writes each connection's inbound bytes to a file for debugging.
- Env (`mobile/.env.example`, all `EXPO_PUBLIC_`, read in `src/lib/api.ts`, `src/broadcast/broadcastManager.ts`, `src/lib/web.ts`, `src/lib/auth.tsx`): `EXPO_PUBLIC_API_URL` (API with `/api`, the laptop's LAN address; the API must listen on all interfaces), `EXPO_PUBLIC_INGEST_URL` (dev only; leave empty in production to use the API's answer), `EXPO_PUBLIC_APP_URL` (web base for share links), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the API's web OAuth client id; public).
- `mobile/.env` and `mobile/.env.production.local` also exist locally; it is not documented by an example file.

## Dev modes as encoded in config

There is **no docker-compose file for the app** in this repo (the only compose file is `infra/native/docker-compose.native.yml`: a Docker socket proxy and the station router; a root `.env` still holds old compose-era names). The code supports two shapes, selected by env alone:

| | Native or hybrid (what everything ships as) | Laravel inside a container (legacy) |
|---|---|---|
| Laravel | host (`php artisan serve`, php-fpm) | on `gocast-network` |
| Liquidsoap | one Docker container per station, spawned via `docker` CLI (`DOCKER_HOST`, or the local daemon in dev) | same |
| `LIQUIDSOAP_TELNET_RESOLVE` | `ip` (config default): `containerIp()` = `LIQUIDSOAP_CONTAINER_SUBNET` base + `container_index` + 2, pure arithmetic | `name`: container name via Docker's DNS; only works from inside `gocast-network`. Also what `phpunit.xml` forces. |
| Station to API callbacks | `LIQUIDSOAP_API_URL` (default `http://host.docker.internal:8081`); containers get `--add-host host.docker.internal:host-gateway` | same |
| Icecast from a station | `LIQUIDSOAP_ICECAST_HOST`/`_PORT` (default `host.docker.internal:8000`) | |

Setting `name` from a host process leaves every station in `starting` forever (status polls time out); setting `ip` inside tests makes the supervisor shell out to docker (hence the pin in `phpunit.xml`). `host-gateway` resolves to the default bridge gateway (172.17.0.1), not to loopback, so **whatever serves the API to station containers must listen on all interfaces**. `php artisan serve` defaults to loopback: with `--host=127.0.0.1` (as `playwright.config.ts` runs it) the browser works but station callbacks (`next-track`, `now-playing`, `station-event`, `harbor-auth`) cannot connect and the studio reports the stream server closing the connection. `mobile/.env.example` tells you to use `--host=0.0.0.0` for the same reason on the phone side. Note that the default `LIQUIDSOAP_API_URL` port is 8081 (the internal nginx vhost in production); a dev laptop must point it at wherever `artisan serve` listens.

Other dev-mode switches (variable names only; meanings verified against `config/liquidsoap.php` unless marked):

| Variable | Dev meaning |
|---|---|
| `PHP_CLI_SERVER_WORKERS` | `artisan serve` is single-threaded unless this is set (example: 4). It only takes effect with `--no-reload`; Laravel otherwise falls back to one worker. `composer dev` and `playwright.config.ts` both pass `--no-reload`. The cost: edits to `.env` and config need a manual restart (PHP source is re-read per request). |
| `LIQUIDSOAP_HLS_BASE_URL` | Empty disables HLS (null `hls_url`); dev value `http://localhost:3000/hls-proxy` uses the Next route above. |
| `LIQUIDSOAP_HLS_DIR`, `_LIQ_DIR`, `_PLAYLISTS_DIR` | Host directories the supervisor writes and mounts (defaults `/var/gocast/{hls,liq,playlists}`); `client/.env.example` repeats `LIQUIDSOAP_HLS_DIR` for the dev proxy. |
| `LIQUIDSOAP_INGEST_URL` | Template with `{slug}`. Empty: the API hands out `ws://<container-ip>:8090/{slug}` (works from the laptop only; plain `ws`). |
| `LIQUIDSOAP_ENCODER_HOST` / `_PORT` (8010) | Empty means the API omits the `encoder` block entirely ("not deployed here"); dev can use the LAN address. |
| `BROADCAST_CONNECTION` and client `NEXT_PUBLIC_PUSHER_KEY` | Server switch and the *client-side* kill switch for realtime; with the key empty `lib/echo.ts` returns null and pages poll. The two must be turned off together. |
| `RENDER_API_KEY` (API) and `RENDER_API_KEY` (client, server-only) | Must match; lets the Next server skip the API's public rate limit. Optional locally. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Blank turns admin alerts off. `phpunit.xml` blanks the token. |
| `INTERNAL_API_URL` (client) | Read by `client/lib/env.ts` and `lib/api-server.ts` for server-side fetches; **not listed in `client/.env.example`**. Falls back to `NEXT_PUBLIC_API_URL`. |

### Sentry and dev latency

`api/config/sentry.php`: `traces_sample_rate` is `null` (no tracing) unless `SENTRY_TRACES_SAMPLE_RATE` is set; `sample_rate` (errors) defaults to 1.0; `send_default_pii` false; `/up` transactions ignored; `enable_logs` false. `.env.example` sets `SENTRY_TRACES_SAMPLE_RATE=0` and documents why: the SDK ships each transaction before the response finishes, so `1.0` adds a Sentry round trip (measured by the comment at about 0.7 s per API call versus 11 ms at 0) to every request, and the dashboard makes four to six calls per page. At verification time the local `api/.env` had it at 0. Setting `SENTRY_LARAVEL_DSN` empty disables the SDK.

## Env files

Only variable names and meanings; never commit values.

- `api/.env.example` (844 lines, written for a native production install; `APP_ENV=production`, `APP_DEBUG=false`). Groups: app identity (`APP_*`), `PHP_CLI_SERVER_WORKERS`, `BCRYPT_ROUNDS`, `LOG_*`, `DB_*`, `REDIS_*` (`REDIS_CLIENT` phpredis in the example, `predis` in the dev file), drivers (`SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION`, `BROADCAST_CONNECTION`), realtime (`PUSHER_*`), `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `SESSION_*`, mail (`MAIL_MAILER`, `RESEND_API_KEY`, `MAIL_FROM_*`, `RESEND_WEBHOOK_SECRET`), Google (`GOOGLE_CLIENT_ID`, `_SECRET`, `_REDIRECT_URI`), `AWS_*` (present but unused for the local `public` disk), `INTERNAL_API_KEY`, `RENDER_API_KEY`, Icecast (`ICECAST_SOURCE_PASSWORD`, `_ADMIN_USER`, `_ADMIN_PASSWORD`, `_RELAY_PASSWORD`, `_INTERNAL_URL`), `DOCKER_HOST`, the `LIQUIDSOAP_*` block (addresses, ingest and encoder, directories, resource caps, crossfade, limiter, analysis and loudness, auto-stop thresholds, HLS), `ANALYTICS_*`, `STATION_EVENT_*`, `NOTIFICATION_*`, `VITE_APP_NAME` (vestigial), Sentry, Telegram. The full per-variable reference belongs to [Configuration reference](configuration-reference.md).
- Drift: the dev `api/.env` has `MAIL_HOST/PORT/USERNAME/PASSWORD/SCHEME` that the example lacks; the example has a long tail of `LIQUIDSOAP_*`, `ANALYTICS_*` and `NOTIFICATION_*` keys the dev file does not set, so those run on config defaults. The root `.env` holds MySQL/Icecast/Grafana/Caddy-style names (`MYSQL_*`, `SERVER_NAME`, `GRAFANA_CLOUD_*`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`) left from the compose era; Laravel loads only `api/.env`, so this file is inert for the API.
- `client/.env.example`: `NEXT_PUBLIC_API_URL` (with `/api`), `NEXT_PUBLIC_APP_URL`, `RENDER_API_KEY`, `NEXT_PUBLIC_ICECAST_URL`, `LIQUIDSOAP_HLS_DIR`, `NEXT_PUBLIC_PUSHER_KEY`/`_HOST`/`_PORT`, `NEXT_PUBLIC_BROADCAST_AUTH_URL` (a sibling of `/api`, spelled out; needs the LAN IP for device testing like the API URL does). Also read but unlisted: `INTERNAL_API_URL`, `INTERNAL_ICECAST_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `ANALYZE`.
- `mobile/.env.example`: the four `EXPO_PUBLIC_*` above.

## Docs freshness check: `scripts/docs-check.sh`

Each `docs/features/*.md` (except `README.md`) lists `sources:` in front matter and a `fingerprint:`. The fingerprint is a SHA-256 (first 16 hex characters) over each source path plus its file contents, in listed order, so it works with uncommitted changes.

- `scripts/docs-check.sh` prints `ok`, `STALE` (a source changed since stamping) or `BROKEN` (a listed source is missing) per doc, and exits 1 if any is not ok.
- `scripts/docs-check.sh --stamp docs/features/NAME.md` rewrites the doc's `fingerprint:` line and prints `stamped`. It refuses if a source file does not exist.
- The parser only reads two-space-indented `  - path` lines directly under `sources:`; a trailing `# comment` on the line becomes part of the path and breaks it. Paths with brackets (`[slug]`) work because the file is read by exact path, no globbing.
- It hashes only the listed files, so editing a test or a controller the doc does not list will not mark the doc stale.
- Not wired into git hooks or CI (there is none). Running it is a manual step; `docs/features/README.md` states the rule that a feature change updates its doc in the same change.

## Gaps and traps

1. **The Playwright auth suite is broken.** `expectDashboard()` targets a `/dashboard/stations` list and "Create your first station" / "Your stations" text that were removed (`client/app/dashboard/stations/page.tsx` redirects to `/dashboard`; the no-station page now says "Create your station"); the delete-account test uses a `#delete-password` field that no longer exists. `signIn()` also uses `getByLabel("Password")`, which now matches the password field and its Show button (strict-mode failure); `getByRole("textbox", { name: "Password" })` works. Fix `support/auth.ts` `expectDashboard` and the delete test before trusting any e2e result.
2. **The capture specs need the keeper accounts.** `help-screenshots.spec.ts` and `dashboard-visual.spec.ts` sign in as `shell@gocast.test` (and the visual one also `free@gocast.test`, `create@gocast.test`); they are excluded from `test:e2e` by `grepInvert` and fail on a database without those accounts. Never run `e2e:auth user` on a keeper: it force-deletes the user and the station.
3. **E2E and the API suite hit real shared services.** Playwright users are created in the dev database (`gocast`) and never deleted; the API suite's direct `Redis::` calls hit whatever Redis `api/.env` names, with keys derived from small auto-increment station ids (`metadata:{id}`, `listeners:{id}`, live-session sets). Running the suite against the same Redis as a running dev app can clobber the dev app's keys for stations with the same ids. There is no `REDIS_*`/`REDIS_PREFIX` override in `phpunit.xml`.
4. **`gocast_test` must be created by hand**, and uses the dev MySQL credentials. A missing database fails every Feature test, not just one.
5. **Everything docker-related is unexercised.** `inTestMode()` short-circuits 13 supervisor methods; behaviour is tested by command-string assertions, reflection into private builders, and mocks. No test runs Liquidsoap or `liquidsoap --check`, and `LiquidsoapTemplateTest` builds its own variable array instead of using the supervisor's.
6. **`TestCase::createApplication()` and `phpunit.xml` both pin `APP_ENV`, with comments blaming docker-compose's `env_file`.** There is no compose file for the app any more; the cause today is `api/.env` having `APP_ENV=local`. The pin is still required, the explanation is stale.
7. **`config/liquidsoap.php` comments contradict its own defaults.** A docblock there still points at `docker-compose.yml` (no such file). The block "Addresses as seen FROM INSIDE a station container" says the defaults are "the all-Docker values ... compose services reachable by service name", but the defaults are `host.docker.internal`. Its `telnet_resolve` docblock says `name` is for "a containerised Laravel and for tests", which is accurate; the `client/.env.example` note that the ingest address "changes on every restart" contradicts the fixed per-station address computed from `container_index` (`LiquidsoapSupervisor::containerIp`, `'--ip'` in the run command).
8. **`artisan serve` loopback trap** (see above): Playwright's own server is bound to `127.0.0.1`, which is fine for the browser and useless for station containers or a phone.
9. **`mobile/scripts/start.mjs` and `ingest-proxy.mjs` assume the station router listens on `127.0.0.1:8091`** (hard-coded `TARGET`); if the router moves the phone's broadcast path fails with only a proxy-side log line.
10. **No typecheck script, no CI, no tests for mobile.** The web has Vitest unit tests for the dashboard's pure logic and kit, and the visual suite, but not for the studio engine (`broadcast.ts`, including its frame watchdog and engine rebuild, `audioEngine.ts`), the player or marketing; the only studio tests are the two pure helpers above. Type errors surface only in `next build` or `npx tsc --noEmit` (web) or the editor (mobile).
11. **Placeholder tests count toward the total**: `Unit/ExampleTest`, `Feature/ExampleTest` (asserts the Laravel welcome page), and the `toBeOne` expectation.
12. **`E2EAuthCommand` is only environment-gated** (`local`/`testing`). A production box with `APP_ENV=local` would allow creating verified users by CLI; it is not reachable over HTTP.
13. **`docs-check.sh` hides nothing but also covers only listed sources**; a doc can read `ok` while a file it silently depends on changed.
14. **`INTERNAL_API_URL` and `INTERNAL_ICECAST_URL` are read but undocumented** in `client/.env.example`.
15. **`DatabaseSeeder` creates a `test@example.com` user with the factory password `password`**; harmless locally, but do not run `db:seed` against a shared or production database. `StationSeeder` is an empty stub.
16. **Next dev can serve a stylesheet without `app/dashboard.css`, across restarts.** Seen 2026-10-04: the dashboard renders with its tokens missing even after restarting `next dev`, because the stale CSS chunk lives in `client/.next`. Fix: stop the dev server, `rm -rf client/.next`, start it again. Check this before debugging "my CSS change didn't land".

## Tests

This doc is the meta-layer: see the coverage map above. The behaviour of `TestCase`, `Pest.php`, `phpunit.xml` and the supervisor guard is itself pinned by `StationObserverTest` (`inTestMode()` is true) and `ArchitectureTest`.

## History

- The env pinning, supervisor guard and tmp-directory redirects were each added after a test run leaked real containers or directories onto the host; the reasoning lives in the comments of `phpunit.xml` and `tests/TestCase.php`.
- 2026-10-05 (jingle lists, hard slot starts, measured track lengths): `StationJingleSettingsTest` deleted, four new files (`AutoDjHardStartTest`, `JingleRulesTest`, `JingleListControllerTest`, `TrackDurationTest`), `JingleListFactory` added. The full suite then ran 1177 passed, 1 failed: the `ArchitectureTest` notifications rule on `app/Notifications/RawEmailDraft.php` (a plain class in that namespace, not a `Notification`), unrelated to that change.
- Related docs: [Liquidsoap supervisor](liquidsoap-supervisor.md), [Configuration reference](configuration-reference.md), [Station lifecycle](station-lifecycle.md), [Auth](auth.md), [Observability and events](observability-and-events.md), [Deployment infra](deployment-infra.md), [Mobile studio and encoder](mobile-studio-and-encoder.md), [Schedule](schedule.md) (the pilot doc this format follows).
