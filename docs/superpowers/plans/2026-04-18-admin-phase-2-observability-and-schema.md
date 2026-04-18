# Admin Panel — Phase 2: Observability & Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the packages and schema the rest of the admin panel depends on: activity log, authentication log, log viewer, plus `deleted_at` on `users` and `stations`, and `last_login_at` on `users`. After this phase, every admin-significant action has an audit trail and destructive actions can soft-delete rather than hard-delete.

**Architecture:** Three community Laravel packages provide the audit primitives (`spatie/laravel-activitylog`, `rappasoft/laravel-authentication-log`, `opcodesio/log-viewer`). Domain models gain traits; migrations are purely additive. One new event listener populates `users.last_login_at` the same way Phase 1 did for admins.

**Tech Stack:** Laravel 13, PHP 8.3+, Pest 4, Filament 4 (installed in Phase 1).

**Prerequisites:** Phase 1 complete and green (`docs/superpowers/plans/2026-04-18-admin-phase-1-foundation.md`). Same feature branch continues.

**Companion docs:**
- Design spec: `docs/superpowers/specs/2026-04-18-admin-dashboard-design.md` §3 data model, §7 audit logging.
- Laravel Pint rule (from `api/CLAUDE.md`): run `vendor/bin/pint --dirty --format agent` before each commit.

**Cwd for all commands:** `/home/ammar/Desktop/personal/gocast/api`.

---

## File structure (this phase)

Created:
- `app/Listeners/RecordUserLastLogin.php` — listener populating `users.last_login_at`.
- `database/migrations/YYYY_MM_DD_HHMMSS_add_deleted_at_and_last_login_at_to_users_table.php`
- `database/migrations/YYYY_MM_DD_HHMMSS_add_deleted_at_to_stations_table.php`
- `tests/Feature/Observability/ActivityLogTest.php`
- `tests/Feature/Observability/AuthenticationLogTest.php`
- `tests/Feature/Observability/LogViewerAccessTest.php`
- `tests/Feature/Admin/RecordUserLastLoginTest.php`
- `tests/Feature/Models/UserSoftDeleteTest.php`
- `tests/Feature/Models/StationSoftDeleteTest.php`
- `config/activitylog.php` (published) — customised causer morph map.
- `config/authentication-log.php` (published) — defaults with notifications off.
- Package migration files published into `database/migrations/`.

Modified:
- `composer.json` / `composer.lock` — three new packages.
- `app/Models/User.php` — `SoftDeletes`, `LogsActivity`, `AuthenticationLoggable` traits.
- `app/Models/Station.php` — `SoftDeletes`, `LogsActivity` traits.
- `app/Models/Admin.php` — `LogsActivity`, `AuthenticationLoggable` traits.
- `app/Models/Plan.php` — `LogsActivity` trait.
- `app/Providers/AppServiceProvider.php` — Eloquent morph map; register `RecordUserLastLogin`.

Not touched this phase: controllers, routes, `client/`, `relay/`.

---

## Task 1: Install spatie/laravel-activitylog

**Files:**
- Modify: `composer.json`, `composer.lock`
- Created by publish: `config/activitylog.php`, `database/migrations/YYYY_..._create_activity_log_table.php`, `database/migrations/YYYY_..._add_event_column_to_activity_log_table.php`, `database/migrations/YYYY_..._add_batch_uuid_column_to_activity_log_table.php`

- [ ] **Step 1.1: Install**

```bash
composer require spatie/laravel-activitylog
```

Expected: package installed, `LaravelPackageManifestUpdated`, no errors.

- [ ] **Step 1.2: Publish the migrations**

```bash
php artisan vendor:publish --provider="Spatie\Activitylog\ActivitylogServiceProvider" --tag="activitylog-migrations" --no-interaction
```

Expected: three migration files appear under `database/migrations/`.

- [ ] **Step 1.3: Publish the config**

```bash
php artisan vendor:publish --provider="Spatie\Activitylog\ActivitylogServiceProvider" --tag="activitylog-config" --no-interaction
```

Expected: `config/activitylog.php` exists.

- [ ] **Step 1.4: Run the migrations**

```bash
php artisan migrate --no-interaction
```

Expected: three migrations applied. `activity_log` table exists.

- [ ] **Step 1.5: Smoke check**

```bash
php artisan tinker --execute 'echo \Spatie\Activitylog\Models\Activity::count();'
```

Expected: `0`.

- [ ] **Step 1.6: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add composer.json composer.lock config/activitylog.php database/migrations
git commit -m "$(cat <<'EOF'
feat(observability): install spatie/laravel-activitylog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Configure the causer morph map and wire activity logging into models (TDD)

**Files:**
- Create: `tests/Feature/Observability/ActivityLogTest.php`
- Modify: `app/Providers/AppServiceProvider.php`
- Modify: `app/Models/User.php`, `app/Models/Station.php`, `app/Models/Admin.php`, `app/Models/Plan.php`

Spatie's activity log stores polymorphic `causer_type` and `subject_type` as FQCNs by default. We register a morph map so the DB holds short keys (`admin`, `user`, `station`, `plan`) that are stable across namespace refactors and easier to read.

- [ ] **Step 2.1: Write the failing test**

Create `tests/Feature/Observability/ActivityLogTest.php`:

```php
<?php

use App\Models\Admin;
use App\Models\User;
use Spatie\Activitylog\Models\Activity;

it('logs creation of a User using the short "user" morph key', function () {
    $user = User::factory()->create();

    $activity = Activity::where('subject_id', $user->id)
        ->where('subject_type', 'user')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull();
    expect($activity->description)->toBe('created');
});

it('records an Admin as causer with the short "admin" morph key', function () {
    $admin = Admin::factory()->create();
    $user = User::factory()->make();

    activity()
        ->causedBy($admin)
        ->performedOn(User::factory()->create())
        ->event('test_event')
        ->log('test');

    $activity = Activity::latest('id')->first();

    expect($activity->causer_type)->toBe('admin');
    expect($activity->causer_id)->toBe($admin->id);
});
```

- [ ] **Step 2.2: Run tests to confirm failure**

```bash
php artisan test --compact --filter=ActivityLogTest
```

Expected: failures — traits aren't on the models yet, morph map isn't registered.

- [ ] **Step 2.3: Register the morph map**

In `app/Providers/AppServiceProvider.php`, add the morph map to the `boot()` method. Final `boot()` should contain (merged with Phase 1's listener registration):

```php
use App\Listeners\RecordAdminLastLogin;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Illuminate\Auth\Events\Login;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Event;

public function boot(): void
{
    Relation::enforceMorphMap([
        'admin' => Admin::class,
        'user' => User::class,
        'station' => Station::class,
        'plan' => Plan::class,
    ]);

    Event::listen(Login::class, RecordAdminLastLogin::class);
}
```

- [ ] **Step 2.4: Add the `LogsActivity` trait to the four models**

For each model (`User`, `Station`, `Admin`, `Plan`), add:

```php
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;
```

Add `LogsActivity` to the `use` line in the class body (alongside existing traits) and add this method to each class:

```php
public function getActivitylogOptions(): LogOptions
{
    return LogOptions::defaults()
        ->logOnly(['name', 'email', 'slug', 'is_featured'])
        ->logOnlyDirty()
        ->dontSubmitEmptyLogs();
}
```

Fine-tune the `logOnly([...])` list per model — keep it to the attributes you'd actually want to see in an audit trail:

- `User` → `['name', 'email', 'email_verified_at', 'plan_id']`
- `Station` → `['name', 'slug', 'description', 'genre', 'featured', 'is_live']`
- `Admin` → `['name', 'email']`
- `Plan` → `['name', 'slug', 'max_stations', 'max_listeners']`

(Paste the four adjusted `getActivitylogOptions()` methods into the respective models.)

- [ ] **Step 2.5: Run tests**

```bash
php artisan test --compact --filter=ActivityLogTest
```

Expected: 2 passing.

- [ ] **Step 2.6: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Providers/AppServiceProvider.php app/Models/User.php app/Models/Station.php app/Models/Admin.php app/Models/Plan.php tests/Feature/Observability/ActivityLogTest.php
git commit -m "$(cat <<'EOF'
feat(observability): log user/station/admin/plan activity with a morph map

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Install rappasoft/laravel-authentication-log

**Files:**
- Modify: `composer.json`, `composer.lock`
- Created by publish: `config/authentication-log.php`, migration(s) under `database/migrations/`.

- [ ] **Step 3.1: Install**

```bash
composer require rappasoft/laravel-authentication-log
```

- [ ] **Step 3.2: Publish config and migrations**

```bash
php artisan vendor:publish --provider="Rappasoft\LaravelAuthenticationLog\LaravelAuthenticationLogServiceProvider" --no-interaction
```

Expected: `config/authentication-log.php` appears + one migration file under `database/migrations/`.

- [ ] **Step 3.3: Disable new-device notifications for now**

In `config/authentication-log.php`, make sure notifications are disabled in v1 (Sentry is the current alert channel):

```php
'notifications' => [
    'new-device' => [
        'enabled' => false,
    ],
    'failed-login' => [
        'enabled' => false,
    ],
],
```

(If the keys differ slightly in the installed version, toggle whatever `enabled` flags the published config exposes.)

- [ ] **Step 3.4: Run the migration**

```bash
php artisan migrate --no-interaction
```

Expected: `authentication_log` table created.

- [ ] **Step 3.5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add composer.json composer.lock config/authentication-log.php database/migrations
git commit -m "$(cat <<'EOF'
feat(observability): install rappasoft/laravel-authentication-log with notifications off

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire authentication logging into User and Admin (TDD)

**Files:**
- Create: `tests/Feature/Observability/AuthenticationLogTest.php`
- Modify: `app/Models/User.php`, `app/Models/Admin.php`

- [ ] **Step 4.1: Write the failing test**

Create `tests/Feature/Observability/AuthenticationLogTest.php`:

```php
<?php

use App\Models\Admin;
use App\Models\User;
use Illuminate\Auth\Events\Login;

it('writes an authentication log row when an admin logs in', function () {
    $admin = Admin::factory()->create();

    event(new Login('admin', $admin, remember: false));

    $this->assertDatabaseHas('authentication_log', [
        'authenticatable_id' => $admin->id,
        'authenticatable_type' => 'admin',
    ]);
});

it('writes an authentication log row when a user logs in', function () {
    $user = User::factory()->create();

    event(new Login('web', $user, remember: false));

    $this->assertDatabaseHas('authentication_log', [
        'authenticatable_id' => $user->id,
        'authenticatable_type' => 'user',
    ]);
});
```

- [ ] **Step 4.2: Run tests to confirm failure**

```bash
php artisan test --compact --filter=AuthenticationLogTest
```

Expected: failures — trait not present on the models.

- [ ] **Step 4.3: Add the trait to each model**

In both `app/Models/User.php` and `app/Models/Admin.php`, add:

```php
use Rappasoft\LaravelAuthenticationLog\Traits\AuthenticationLoggable;
```

Include `AuthenticationLoggable` in the `use` line in the class body alongside the existing traits.

- [ ] **Step 4.4: Run tests**

```bash
php artisan test --compact --filter=AuthenticationLogTest
```

Expected: 2 passing.

- [ ] **Step 4.5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Models/User.php app/Models/Admin.php tests/Feature/Observability/AuthenticationLogTest.php
git commit -m "$(cat <<'EOF'
feat(observability): log admin and user login events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Install and gate opcodesio/log-viewer to admins

**Files:**
- Modify: `composer.json`, `composer.lock`
- Created by publish: `config/log-viewer.php`
- Create: `app/Providers/LogViewerServiceProvider.php`
- Modify: `bootstrap/providers.php`
- Create: `tests/Feature/Observability/LogViewerAccessTest.php`

The log viewer exposes `/log-viewer`. We lock it down with a custom gate so only authenticated admins can reach it, regardless of domain.

- [ ] **Step 5.1: Install**

```bash
composer require opcodesio/log-viewer
```

- [ ] **Step 5.2: Publish config**

```bash
php artisan vendor:publish --tag=log-viewer-config --no-interaction
```

Expected: `config/log-viewer.php`.

- [ ] **Step 5.3: Add the auth gate in the service provider**

Generate a provider:

```bash
php artisan make:provider LogViewerServiceProvider --no-interaction
```

Replace `app/Providers/LogViewerServiceProvider.php` with:

```php
<?php

namespace App\Providers;

use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Opcodes\LogViewer\Facades\LogViewer;

class LogViewerServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        LogViewer::auth(function ($request) {
            return $request->user('admin') !== null;
        });

        Gate::define('viewLogViewer', fn ($admin) => $admin !== null);
    }
}
```

- [ ] **Step 5.4: Register the provider**

Add to `bootstrap/providers.php`:

```php
return [
    App\Providers\AppServiceProvider::class,
    App\Providers\Filament\AdminPanelProvider::class,
    App\Providers\LogViewerServiceProvider::class,
];
```

(Merge with whatever is already there — just add the new `LogViewerServiceProvider` line.)

- [ ] **Step 5.5: Write the access test**

Create `tests/Feature/Observability/LogViewerAccessTest.php`:

```php
<?php

use App\Models\Admin;
use App\Models\User;

it('rejects an unauthenticated visitor from /log-viewer', function () {
    $this->get('/log-viewer')->assertForbidden();
});

it('rejects a customer User from /log-viewer', function () {
    $user = User::factory()->create();

    $this->actingAs($user, 'web')
        ->get('/log-viewer')
        ->assertForbidden();
});

it('lets an admin reach /log-viewer', function () {
    $admin = Admin::factory()->create();

    $this->actingAs($admin, 'admin')
        ->get('/log-viewer')
        ->assertOk();
});
```

- [ ] **Step 5.6: Run tests**

```bash
php artisan test --compact --filter=LogViewerAccessTest
```

Expected: 3 passing.

- [ ] **Step 5.7: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add composer.json composer.lock config/log-viewer.php app/Providers/LogViewerServiceProvider.php bootstrap/providers.php tests/Feature/Observability/LogViewerAccessTest.php
git commit -m "$(cat <<'EOF'
feat(observability): install log viewer gated to admins

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add soft-deletes and `last_login_at` to `users` (TDD)

**Files:**
- Create: `database/migrations/YYYY_..._add_deleted_at_and_last_login_at_to_users_table.php`
- Modify: `app/Models/User.php`
- Create: `app/Listeners/RecordUserLastLogin.php`
- Modify: `app/Providers/AppServiceProvider.php`
- Create: `tests/Feature/Models/UserSoftDeleteTest.php`
- Create: `tests/Feature/Admin/RecordUserLastLoginTest.php`

- [ ] **Step 6.1: Write the failing tests**

Create `tests/Feature/Models/UserSoftDeleteTest.php`:

```php
<?php

use App\Models\User;

it('soft-deletes a user', function () {
    $user = User::factory()->create();
    $id = $user->id;

    $user->delete();

    expect(User::find($id))->toBeNull();
    expect(User::withTrashed()->find($id))->not->toBeNull();
    expect(User::withTrashed()->find($id)->deleted_at)->not->toBeNull();
});

it('restores a soft-deleted user', function () {
    $user = User::factory()->create();
    $user->delete();

    User::withTrashed()->find($user->id)->restore();

    expect(User::find($user->id))->not->toBeNull();
});
```

Create `tests/Feature/Admin/RecordUserLastLoginTest.php`:

```php
<?php

use App\Models\User;
use Illuminate\Auth\Events\Login;

it('updates users.last_login_at when a user logs in via the web guard', function () {
    $user = User::factory()->create(['last_login_at' => null]);

    event(new Login('web', $user, remember: false));

    expect($user->fresh()->last_login_at)->not->toBeNull();
});

it('does not update users.last_login_at when an admin logs in', function () {
    $user = User::factory()->create(['last_login_at' => null]);

    event(new Login('admin', $user, remember: false));

    expect($user->fresh()->last_login_at)->toBeNull();
});
```

- [ ] **Step 6.2: Run tests to see failures**

```bash
php artisan test --compact --filter='UserSoftDeleteTest|RecordUserLastLoginTest'
```

Expected: failures — column doesn't exist, trait missing, listener missing.

- [ ] **Step 6.3: Generate and populate the migration**

```bash
php artisan make:migration add_deleted_at_and_last_login_at_to_users_table --no-interaction
```

Replace the generated migration's `up()` and `down()` with:

```php
public function up(): void
{
    Schema::table('users', function (Blueprint $table) {
        $table->softDeletes()->after('updated_at');
        $table->timestamp('last_login_at')->nullable()->after('deleted_at');
    });
}

public function down(): void
{
    Schema::table('users', function (Blueprint $table) {
        $table->dropSoftDeletes();
        $table->dropColumn('last_login_at');
    });
}
```

Run it:

```bash
php artisan migrate --no-interaction
```

- [ ] **Step 6.4: Update the User model**

In `app/Models/User.php`:

1. Add `use Illuminate\Database\Eloquent\SoftDeletes;`
2. Add `SoftDeletes` to the `use` line in the class body.
3. Extend the `casts()` array to include `'last_login_at' => 'datetime'`.

- [ ] **Step 6.5: Create the listener**

```bash
php artisan make:listener RecordUserLastLogin --event=Login --no-interaction
```

Replace `app/Listeners/RecordUserLastLogin.php` with:

```php
<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Auth\Events\Login;

class RecordUserLastLogin
{
    public function handle(Login $event): void
    {
        if ($event->guard !== 'web') {
            return;
        }

        if (! $event->user instanceof User) {
            return;
        }

        $event->user->forceFill(['last_login_at' => now()])->save();
    }
}
```

- [ ] **Step 6.6: Register the listener**

In `app/Providers/AppServiceProvider.php`, add the registration next to the existing admin listener:

```php
Event::listen(Login::class, RecordAdminLastLogin::class);
Event::listen(Login::class, RecordUserLastLogin::class);
```

And `use App\Listeners\RecordUserLastLogin;` near the top.

- [ ] **Step 6.7: Run tests**

```bash
php artisan test --compact --filter='UserSoftDeleteTest|RecordUserLastLoginTest'
```

Expected: 4 passing.

- [ ] **Step 6.8: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations app/Models/User.php app/Listeners/RecordUserLastLogin.php app/Providers/AppServiceProvider.php tests/Feature/Models/UserSoftDeleteTest.php tests/Feature/Admin/RecordUserLastLoginTest.php
git commit -m "$(cat <<'EOF'
feat(admin): soft-delete users and record last_login_at

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add soft-deletes to `stations` (TDD)

**Files:**
- Create: `database/migrations/YYYY_..._add_deleted_at_to_stations_table.php`
- Modify: `app/Models/Station.php`
- Create: `tests/Feature/Models/StationSoftDeleteTest.php`

- [ ] **Step 7.1: Write the failing test**

Create `tests/Feature/Models/StationSoftDeleteTest.php`:

```php
<?php

use App\Models\Station;
use App\Models\User;

it('soft-deletes a station', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user)->create([
        'name' => 'Test Station',
        'slug' => 'test-station',
    ]);

    $station->delete();

    expect(Station::find($station->id))->toBeNull();
    expect(Station::withTrashed()->find($station->id))->not->toBeNull();
});

it('cascades soft-delete from user to stations', function () {
    $user = User::factory()->create();
    $station = Station::factory()->for($user)->create([
        'name' => 'Cascade Station',
        'slug' => 'cascade-station',
    ]);

    $user->stations()->delete();

    expect(Station::find($station->id))->toBeNull();
    expect(Station::withTrashed()->find($station->id)->deleted_at)->not->toBeNull();
});
```

- [ ] **Step 7.2: Populate the StationFactory**

The existing factory (`database/factories/StationFactory.php`) is empty. Replace its `definition()` with defaults that work with the `Station` model's current columns:

```php
public function definition(): array
{
    $slug = fake()->unique()->slug(2);

    return [
        'user_id' => \App\Models\User::factory(),
        'name' => fake()->words(2, asText: true),
        'slug' => $slug,
        'description' => fake()->optional()->sentence(),
        'genre' => fake()->optional()->word(),
        'is_live' => false,
        'featured' => false,
    ];
}
```

(The model's `booted()` hook auto-populates `icecast_mount` and `icecast_password` on create — no need to provide them here.)

- [ ] **Step 7.3: Run tests to see failures**

```bash
php artisan test --compact --filter=StationSoftDeleteTest
```

Expected: failures — column doesn't exist, trait missing.

- [ ] **Step 7.4: Generate and populate the migration**

```bash
php artisan make:migration add_deleted_at_to_stations_table --no-interaction
```

Replace the `up()` / `down()`:

```php
public function up(): void
{
    Schema::table('stations', function (Blueprint $table) {
        $table->softDeletes()->after('updated_at');
    });
}

public function down(): void
{
    Schema::table('stations', function (Blueprint $table) {
        $table->dropSoftDeletes();
    });
}
```

Run it:

```bash
php artisan migrate --no-interaction
```

- [ ] **Step 7.5: Update the Station model**

In `app/Models/Station.php`:

1. Add `use Illuminate\Database\Eloquent\SoftDeletes;`
2. Add `SoftDeletes` to the `use` line in the class body.

- [ ] **Step 7.6: Run tests**

```bash
php artisan test --compact --filter=StationSoftDeleteTest
```

Expected: 2 passing.

- [ ] **Step 7.7: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations app/Models/Station.php database/factories/StationFactory.php tests/Feature/Models/StationSoftDeleteTest.php
git commit -m "$(cat <<'EOF'
feat(admin): soft-delete stations and flesh out the station factory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full-suite green and sanity check

- [ ] **Step 8.1: Run the full suite**

```bash
php artisan test --compact
```

Expected: all tests pass, including everything added in Phase 1.

- [ ] **Step 8.2: Manually sanity-check the log-viewer**

Start the dev server (`php artisan serve`) and visit:

- `/log-viewer` while logged out → 403.
- `/log-viewer` after `actingAs` an admin (use tinker or log in through `/admin`) → the log viewer UI loads.

- [ ] **Step 8.3: Manually sanity-check the activity log**

```bash
php artisan tinker --execute 'App\Models\Station::first()?->update(["name" => "Updated Name"]); echo \Spatie\Activitylog\Models\Activity::latest("id")->first()?->description;'
```

Expected: `updated` (or empty if no station exists — create one via tinker first).

Phase 2 complete. Feature branch stays open for Phase 3 (Filament resources).

---

## Self-review

- **Spec coverage:**
  - §3 additive columns: `users.deleted_at` (Task 6), `users.last_login_at` (Task 6), `stations.deleted_at` (Task 7).
  - §3 new tables for package migrations: `activity_log` (Task 1), `authentication_log` (Task 3).
  - §7 Activity log on User/Station/Admin/Plan: Task 2.
  - §7 Authentication log on User and Admin: Task 4.
  - §4 Log viewer mounted and gated: Task 5.
- **Out of scope for this phase (handled later):**
  - Filament `ActivityLogResource` / `AuthenticationLogResource` (Phase 3). This phase only guarantees the underlying data exists.
  - Inline "activity on this user" panel (Phase 3, in UserResource detail).
  - `DetectAdminLoginAbuse` scheduled job (Phase 5).
- **Placeholder scan:** every code block is concrete. No "add validation" / "handle errors" without shown code.
- **Type / API consistency:**
  - `AuthenticationLoggable`: full FQCN `Rappasoft\LaravelAuthenticationLog\Traits\AuthenticationLoggable` — single source of truth used in both User and Admin.
  - `LogsActivity`: `Spatie\Activitylog\Traits\LogsActivity` used on four models.
  - Morph keys (`admin`, `user`, `station`, `plan`) are registered in AppServiceProvider and referenced in `ActivityLogTest` assertions.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-admin-phase-2-observability-and-schema.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
