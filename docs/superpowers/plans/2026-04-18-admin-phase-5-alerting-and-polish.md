# Admin Panel — Phase 5: Alerting & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the panel out: detect admin login-abuse on a schedule, surface alerts via Sentry + an in-panel database-notification bell, tighten the test suite with Pest 4 browser smoke tests and arch tests, and document the production rollout checklist.

**Architecture:** A single Artisan command (`admin:detect-login-abuse`) runs every 5 minutes via the Laravel scheduler. It queries `authentication_log` for failed admin logins grouped by IP in the last hour; when any IP passes 10 attempts, it logs a critical Sentry error and dispatches a database notification to every admin. Filament renders those notifications in the built-in bell. Tests: Pest arch tests pin boundaries (admin code stays under `app/Filament` and `app/Console/Commands`; only `Admin` uses the `admin` guard), and Pest 4 browser smoke tests click through every resource + widget to catch JS errors.

**Tech Stack:** Laravel 13, PHP 8.3+, Pest 4 (including browser), Filament 4, Sentry Laravel SDK (already installed).

**Prerequisites:** Phases 1–4 complete and green.

**Companion docs:**
- Design spec: `docs/superpowers/specs/2026-04-18-admin-dashboard-design.md` §7 (alerting), §9 (testing), §10 (rollout).

**Cwd for all commands:** `/home/ammar/Desktop/personal/gocast/api`.

---

## File structure (this phase)

Created:
- `app/Console/Commands/DetectAdminLoginAbuseCommand.php`
- `app/Notifications/AdminLoginAbuseDetected.php`
- `tests/Feature/Admin/DetectAdminLoginAbuseTest.php`
- `tests/Feature/ArchitectureTest.php`
- `tests/Browser/AdminPanelSmokeTest.php` (Pest 4 browser)
- `docs/superpowers/runbooks/admin-panel-rollout.md`

Modified:
- `routes/console.php` — schedule the command.
- `app/Providers/Filament/AdminPanelProvider.php` — add `->databaseNotifications()`.

Not touched: `client/`, `relay/`.

---

## Task 1: `AdminLoginAbuseDetected` notification

**Files:**
- Create: `app/Notifications/AdminLoginAbuseDetected.php`

- [ ] **Step 1.1: Generate**

```bash
php artisan make:notification AdminLoginAbuseDetected --no-interaction
```

- [ ] **Step 1.2: Fill**

Replace with:

```php
<?php

namespace App\Notifications;

use Filament\Notifications\Notification as FilamentNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\DatabaseMessage;
use Illuminate\Notifications\Notification;

class AdminLoginAbuseDetected extends Notification
{
    use Queueable;

    public function __construct(
        public string $ip,
        public int $attempts,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toDatabase(object $notifiable): array
    {
        return FilamentNotification::make()
            ->title('Admin login abuse detected')
            ->body("IP {$this->ip} failed {$this->attempts} admin logins in the last hour.")
            ->danger()
            ->getDatabaseMessage();
    }
}
```

(If `->getDatabaseMessage()` doesn't exist in the Filament version in use, use a plain `DatabaseMessage` with a matching payload shape: `['title' => ..., 'body' => ..., 'color' => 'danger']`.)

- [ ] **Step 1.3: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Notifications/AdminLoginAbuseDetected.php
git commit -m "$(cat <<'EOF'
feat(admin): login abuse notification for the filament bell

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `DetectAdminLoginAbuseCommand` (TDD)

**Files:**
- Create: `app/Console/Commands/DetectAdminLoginAbuseCommand.php`
- Create: `tests/Feature/Admin/DetectAdminLoginAbuseTest.php`

- [ ] **Step 2.1: Write the failing test**

```php
<?php

use App\Models\Admin;
use App\Notifications\AdminLoginAbuseDetected;
use Illuminate\Support\Facades\Notification;
use Rappasoft\LaravelAuthenticationLog\Models\AuthenticationLog;

beforeEach(function () {
    $this->admin = Admin::factory()->create();
});

it('does nothing when no IP exceeds the threshold', function () {
    Notification::fake();

    for ($i = 0; $i < 3; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '1.2.3.4',
            'login_at' => now()->subMinutes(5),
            'login_successful' => false,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    Notification::assertNothingSent();
});

it('alerts Sentry and admins when an IP exceeds 10 failed admin logins in the last hour', function () {
    Notification::fake();

    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '9.9.9.9',
            'login_at' => now()->subMinutes(5),
            'login_successful' => false,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    Notification::assertSentTo([$this->admin], AdminLoginAbuseDetected::class);
});

it('ignores successful logins and old entries', function () {
    Notification::fake();

    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '8.8.8.8',
            'login_at' => now()->subHours(3),
            'login_successful' => false,
        ]);
    }
    for ($i = 0; $i < 11; $i++) {
        AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '7.7.7.7',
            'login_at' => now()->subMinutes(5),
            'login_successful' => true,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    Notification::assertNothingSent();
});
```

- [ ] **Step 2.2: Run tests to confirm failure**

```bash
php artisan test --compact --filter=DetectAdminLoginAbuseTest
```

Expected: command not registered yet.

- [ ] **Step 2.3: Generate and implement**

```bash
php artisan make:command DetectAdminLoginAbuseCommand --no-interaction
```

Replace with:

```php
<?php

namespace App\Console\Commands;

use App\Models\Admin;
use App\Notifications\AdminLoginAbuseDetected;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Rappasoft\LaravelAuthenticationLog\Models\AuthenticationLog;

class DetectAdminLoginAbuseCommand extends Command
{
    protected $signature = 'admin:detect-login-abuse';

    protected $description = 'Alert when any IP exceeds the admin login-failure threshold in the last hour.';

    private const THRESHOLD = 10;

    public function handle(): int
    {
        $since = now()->subHour();

        $offenders = AuthenticationLog::query()
            ->where('authenticatable_type', 'admin')
            ->where('login_successful', false)
            ->where('login_at', '>=', $since)
            ->selectRaw('ip_address, COUNT(*) as attempts')
            ->groupBy('ip_address')
            ->having('attempts', '>', self::THRESHOLD)
            ->get();

        if ($offenders->isEmpty()) {
            return self::SUCCESS;
        }

        $admins = Admin::all();

        foreach ($offenders as $offender) {
            Log::critical('Admin login abuse detected', [
                'ip' => $offender->ip_address,
                'attempts' => (int) $offender->attempts,
                'since' => $since->toIso8601String(),
            ]);

            Notification::send(
                $admins,
                new AdminLoginAbuseDetected((string) $offender->ip_address, (int) $offender->attempts),
            );
        }

        return self::SUCCESS;
    }
}
```

- [ ] **Step 2.4: Run tests**

```bash
php artisan test --compact --filter=DetectAdminLoginAbuseTest
```

Expected: 3 passing.

- [ ] **Step 2.5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Console/Commands/DetectAdminLoginAbuseCommand.php tests/Feature/Admin/DetectAdminLoginAbuseTest.php
git commit -m "$(cat <<'EOF'
feat(admin): detect-login-abuse command with TDD tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schedule the detector every 5 minutes

**Files:**
- Modify: `routes/console.php`

- [ ] **Step 3.1: Schedule**

Append to `routes/console.php`:

```php
use Illuminate\Support\Facades\Schedule;

Schedule::command('admin:detect-login-abuse')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();
```

- [ ] **Step 3.2: Verify it's registered**

```bash
php artisan schedule:list
```

Expected: the `admin:detect-login-abuse` entry appears with `*/5 * * * *`.

- [ ] **Step 3.3: Commit**

```bash
git add routes/console.php
git commit -m "$(cat <<'EOF'
feat(admin): schedule detect-login-abuse every 5 minutes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Enable Filament database notifications

**Files:**
- Modify: `app/Providers/Filament/AdminPanelProvider.php`

- [ ] **Step 4.1: Enable**

Inside the `panel()` chain, add:

```php
->databaseNotifications()
->databaseNotificationsPolling('30s')
```

- [ ] **Step 4.2: Publish the Laravel notifications migration if not already present**

```bash
php artisan make:notifications-table --no-interaction || true
php artisan migrate --no-interaction
```

(The first command is a no-op if the migration already exists.)

- [ ] **Step 4.3: Test that the admin receives the notification in-panel**

Append to `tests/Feature/Admin/DetectAdminLoginAbuseTest.php`:

```php
it('stores notifications in the database so filament renders them', function () {
    for ($i = 0; $i < 11; $i++) {
        \Rappasoft\LaravelAuthenticationLog\Models\AuthenticationLog::create([
            'authenticatable_id' => $this->admin->id,
            'authenticatable_type' => 'admin',
            'ip_address' => '6.6.6.6',
            'login_at' => now()->subMinutes(5),
            'login_successful' => false,
        ]);
    }

    $this->artisan('admin:detect-login-abuse')->assertExitCode(0);

    expect($this->admin->notifications()->count())->toBe(1);
});
```

Run: `php artisan test --compact --filter=DetectAdminLoginAbuseTest` — should be 4 passing total.

- [ ] **Step 4.4: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Providers/Filament/AdminPanelProvider.php database/migrations tests/Feature/Admin/DetectAdminLoginAbuseTest.php
git commit -m "$(cat <<'EOF'
feat(admin): enable database notifications and render in the filament bell

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Architecture tests

**Files:**
- Create: `tests/Feature/ArchitectureTest.php`

- [ ] **Step 5.1: Write**

```php
<?php

arch('filament code lives under app/Filament or app/Console/Commands')
    ->expect('App\\Filament')
    ->toOnlyBeUsedIn(['App\\Filament', 'App\\Providers', 'App\\Console', 'App\\Http']);

arch('the Admin model is the only model under the admin guard')
    ->expect('App\\Models\\Admin')
    ->toBeUsedIn(['App\\Filament', 'App\\Console', 'App\\Listeners', 'App\\Notifications', 'App\\Providers', 'Database\\Factories']);

arch('no admin code imports the User model for authentication')
    ->expect('App\\Models\\User')
    ->not->toBeUsedIn(['App\\Filament\\Auth']);

arch('every console command extends Laravel Command')
    ->expect('App\\Console\\Commands')
    ->classes()
    ->toExtend('Illuminate\\Console\\Command');

arch('notifications extend the Laravel base notification')
    ->expect('App\\Notifications')
    ->classes()
    ->toExtend('Illuminate\\Notifications\\Notification');
```

(Some of these may need small path tweaks depending on the exact namespaces Filament generates in the project — adjust the `toBeUsedIn` allow-lists to match the reality of the repo rather than fighting them.)

- [ ] **Step 5.2: Run**

```bash
php artisan test --compact --filter=ArchitectureTest
```

Expected: all passing.

- [ ] **Step 5.3: Commit**

```bash
git add tests/Feature/ArchitectureTest.php
git commit -m "$(cat <<'EOF'
test(admin): architecture tests pin admin panel boundaries

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pest 4 browser smoke test

**Files:**
- Create: `tests/Browser/AdminPanelSmokeTest.php`
- Modify: `tests/Pest.php` (register the `Browser` directory)

- [ ] **Step 6.1: Register Browser tests in Pest**

In `tests/Pest.php`, add a second `pest()->extend(...)` call:

```php
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Browser');
```

- [ ] **Step 6.2: Write the smoke test**

Create `tests/Browser/AdminPanelSmokeTest.php`:

```php
<?php

use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Models\WaitlistEntry;

it('loads every admin nav page without JS errors', function () {
    Plan::factory()->create(['id' => 1, 'name' => 'Free']);
    $admin = Admin::factory()->create(['email' => 'admin@smoke.test']);
    User::factory()->count(3)->create();
    $owner = User::factory()->create();
    Station::factory()->for($owner)->create(['name' => 'S1', 'slug' => 's1']);
    WaitlistEntry::create(['email' => 'wl@smoke.test', 'plan' => 'pro']);

    $page = visit('/admin')
        ->actingAs($admin, 'admin');

    foreach (['/admin', '/admin/users', '/admin/stations', '/admin/stream-sessions', '/admin/plans', '/admin/waitlist-entries', '/admin/admins', '/admin/activity-logs', '/admin/authentication-logs'] as $url) {
        $page->visit($url)
            ->assertNoJavaScriptErrors()
            ->assertNoConsoleLogs('error');
    }
});
```

(Exact URL slugs depend on Filament's slugger — verify via `php artisan route:list --path=admin` after Phase 3. Adjust any that differ.)

- [ ] **Step 6.3: Run**

```bash
php artisan test --compact --filter=AdminPanelSmokeTest
```

Pest 4 launches a headless browser. Expected: passing.

- [ ] **Step 6.4: Commit**

```bash
git add tests/Pest.php tests/Browser/AdminPanelSmokeTest.php
git commit -m "$(cat <<'EOF'
test(admin): browser smoke test covers every admin nav page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rollout runbook

**Files:**
- Create: `docs/superpowers/runbooks/admin-panel-rollout.md`

This is ops documentation, not code. It captures the deploy checklist so the production cutover is repeatable.

- [ ] **Step 7.1: Write**

```markdown
# Admin Panel — Production Rollout Runbook

1. **Branch merge.** PR the `feature/admin-panel` branch into `main`. Verify CI green.
2. **DNS.** Add an A/CNAME record for `admin.gocast.ai` pointing to the same host as `api.gocast.ai`.
3. **Nginx.** Add a server block for `admin.gocast.ai` that proxies to the existing Laravel app (or aliases the same document root). Reload nginx.
4. **TLS.** Issue a certificate for `admin.gocast.ai` via the existing certbot / provider flow. Confirm HTTPS works.
5. **Deploy.** Run the normal deploy script. Ensure `php artisan migrate --force` runs (adds the `admins`, `activity_log`, `authentication_log`, soft-delete columns, and notifications table).
6. **Env.** Add `ADMIN_DOMAIN=admin.gocast.ai` to the production environment; `php artisan config:cache` after.
7. **Scheduler.** Confirm the server's cron runs `php artisan schedule:run` every minute (standard Laravel setup). If not, add it. The detector job relies on it.
8. **Create first admin.** `php artisan admin:create founder@gocast.ai --name="Ammar" --password="<strong-password>"`.
9. **First login.** Visit `https://admin.gocast.ai/admin/login`. Log in with the credentials set in step 8. Filament forces 2FA enrolment — complete with an authenticator app. Store recovery codes in 1Password.
10. **Smoke test.** Click every nav link. Confirm: no 500s, stats load, waitlist + recent signups show production data.
11. **Alert trial.** Hit the admin login page with 11 wrong-password attempts from an incognito window to trigger the detector. Within 5 minutes, check the Filament bell for the alert and Sentry for the critical log entry. Delete the test notification afterwards.
12. **Sentry DSN.** Verify the admin panel logs critical events to the same Sentry project as the customer app (Sentry is already configured via `sentry/sentry-laravel`).

## Rollback
- Revert the merge commit. Run `php artisan migrate:rollback --step=<count-of-new-migrations>`. Remove the nginx server block. DNS record can stay.
- The `admins` table is standalone; rolling it back does not affect customer data. `users.deleted_at`, `stations.deleted_at`, `users.last_login_at` are additive and safe to leave in place if a partial rollback is preferred.

## Future work
- Flip the `is_live` / suspend behavior when the relay coordination endpoint is added (see spec §2 future work).
- Swap `Color::Amber` for the official GoCast brand primary when branding lands.
- Introduce `admin.gocast.ai` IP allowlist at the nginx/Cloudflare layer once the team has a stable egress.
```

- [ ] **Step 7.2: Commit**

```bash
git add docs/superpowers/runbooks/admin-panel-rollout.md
git commit -m "$(cat <<'EOF'
docs: admin panel production rollout runbook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final full-suite green and PR

- [ ] **Step 8.1: Full suite**

```bash
php artisan test --compact
```

Expected: 100% pass. Record the final count.

- [ ] **Step 8.2: Pint pass**

```bash
vendor/bin/pint --format agent
```

If any files changed: stage + commit as `style: final pint pass`.

- [ ] **Step 8.3: Open the PR**

```bash
git push -u origin feature/admin-panel
gh pr create --title "feat(admin): v1 admin panel" --body "$(cat <<'EOF'
## Summary
- Filament 4 panel on admin.gocast.ai with separate admins table, mandatory 2FA.
- Resources for users, stations, stream sessions, plans, admins, waitlist, activity log, auth log.
- Dashboard with 6 widgets (stats, charts, recent signups, currently live).
- Scheduled login-abuse detection with Filament + Sentry alerting.
- Test coverage: feature, architecture, and Pest 4 browser smoke tests.

## Test plan
- [ ] `php artisan test --compact` — full suite passes.
- [ ] `php artisan schedule:list` shows the detector job.
- [ ] Manual: `admin:create`, log in, complete 2FA, click through every nav page.
- [ ] Manual: trigger 11 wrong-password admin logins → bell + Sentry alert.
- [ ] Rollout runbook followed end-to-end on staging before prod.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Phase 5 — and the admin panel — complete.

---

## Self-review

- **Spec coverage:**
  - §7 `DetectAdminLoginAbuse` + Sentry + in-panel notification bell: Tasks 1–4.
  - §9 Pest arch tests: Task 5.
  - §9 Pest 4 browser smoke tests: Task 6.
  - §10 Rollout steps (DNS, nginx, admin:create, 2FA, smoke): Task 7.
- **Placeholder scan:** every command and code block is concrete; any "adjust to match reality" notes are explicit and bounded (arch test namespace allow-lists, browser-test URL slugs).
- **Type / API consistency:**
  - `AuthenticationLog::create([..., 'authenticatable_type' => 'admin', ...])` matches the morph-map key registered in Phase 2.
  - `AdminLoginAbuseDetected(ip, attempts)` signature matches the `Notification::send(..., new AdminLoginAbuseDetected(..., ...))` call in the command.
- **Deferred past v1:**
  - Relay `POST /control/kick` and the SPA close-code handler (spec §2 future work).
  - Suspension flow (spec §1 non-goals).
  - Impersonation.
  - Custom Vite-based Filament theme.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-admin-phase-5-alerting-and-polish.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
