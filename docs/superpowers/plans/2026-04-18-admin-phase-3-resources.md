# Admin Panel — Phase 3: Filament Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the eight Filament resources that make up the management surface of the admin panel: Plan, WaitlistEntry, Admin, StreamSession, ActivityLog, AuthenticationLog, Station, User. After this phase the panel is fully browsable and the core destructive actions (soft-delete user/station, delete waitlist entry) are wired up end-to-end with typed-identifier confirmations and activity logging.

**Architecture:** One Filament resource per domain concept, generated with `php artisan make:filament-resource`. Read-only resources use the generated skeleton with a custom list-page query. Write-capable resources add custom actions (soft-delete with identifier confirmation, feature/unfeature, resend-verify, mark-verified, CSV export) as Filament Actions. Every custom action logs activity via Spatie's `activity()` helper with a hand-chosen event name.

**Tech Stack:** Laravel 13, PHP 8.3+, Pest 4, Filament 4 (Phase 1), activity/auth-log/log-viewer packages (Phase 2).

**Prerequisites:** Phases 1 and 2 complete and green.

**Companion docs:**
- Design spec: `docs/superpowers/specs/2026-04-18-admin-dashboard-design.md` §4 (resources), §6 (destructive actions), §7 (audit).
- Laravel Pint rule (from `api/CLAUDE.md`): run `vendor/bin/pint --dirty --format agent` before each commit.

**Cwd for all commands:** `/home/ammar/Desktop/personal/gocast/api`.

---

## Task ordering rationale

Read-only resources first — they're simpler, they validate the panel's navigation and layout without risk, and they give the later resources (User, Station) concrete examples to copy:

1. PlanResource (smallest, read-only)
2. AdminResource (read-only)
3. WaitlistEntryResource (read-only list + delete + CSV export)
4. StreamSessionResource (read-only)
5. ActivityLogResource (read-only)
6. AuthenticationLogResource (read-only)
7. StationResource (mutations: edit, feature/unfeature, soft-delete)
8. UserResource (mutations: edit, resend-verify, mark-verified, soft-delete + detail panels)

Each resource ends with its own commit.

---

## Shared conventions

- **Generator command:** `php artisan make:filament-resource <Model> --generate --no-interaction`. The `--generate` flag auto-infers form/table schemas from the model's fillable columns.
- **Nav groups:** set via `protected static ?string $navigationGroup = '...';` — used groups: `"Users & Content"` (User, Station, StreamSession), `"Catalog"` (Plan, WaitlistEntry), `"System"` (Admin, ActivityLog, AuthenticationLog).
- **Nav sort:** `protected static ?int $navigationSort = N;` — lower is higher in the nav.
- **Identifier-to-confirm modals:** built with Filament's `Action::make('delete')->requiresConfirmation()->modalDescription('Type the user email to confirm.')->form([TextInput::make('confirmation')->required()->same('email')])`. The `->same($attribute)` rule validates against the record's value.
- **Activity logging in custom actions:** call `activity('admin')->causedBy(Filament::auth()->user())->performedOn($record)->event('<event_name>')->withProperties($props)->log('...');` after a successful action.
- **Tests:** each resource gets a Pest feature test under `tests/Feature/Filament/<Resource>Test.php` covering the most important behaviours, not the Filament internals. Pest 4 exposes Livewire helpers via `livewire()`.

---

## Task 1: PlanResource (read-only)

**Files:**
- Create: `app/Filament/Resources/Plans/PlanResource.php` (and pages under `app/Filament/Resources/Plans/Pages/`)
- Create: `tests/Feature/Filament/PlanResourceTest.php`

- [ ] **Step 1.1: Generate**

```bash
php artisan make:filament-resource Plan --generate --no-interaction
```

- [ ] **Step 1.2: Lock the resource to read-only**

In the generated `PlanResource.php`:

1. Set `protected static ?string $navigationGroup = 'Catalog';`
2. Set `protected static ?int $navigationSort = 1;`
3. Delete (or leave as empty `->schema([])`) the form — no creation/editing.
4. In `getPages()`, keep only `'index' => Pages\ListPlans::route('/')`.
5. Delete the generated `CreatePlan.php`, `EditPlan.php`, and any related page files.
6. Override `table()` to show useful columns:

```php
public static function table(Table $table): Table
{
    return $table
        ->columns([
            TextColumn::make('name')->searchable()->sortable(),
            TextColumn::make('slug')->toggleable(isToggledHiddenByDefault: true),
            TextColumn::make('max_stations')->numeric()->sortable(),
            TextColumn::make('max_listeners')->numeric()->sortable(),
            TextColumn::make('users_count')
                ->label('Subscribers')
                ->counts('users')
                ->sortable(),
        ])
        ->actions([])
        ->bulkActions([]);
}
```

7. On the `ListPlans` page, disable the create button by deleting the `HeaderActions` array (leave `getHeaderActions()` returning `[]` or delete the override).

- [ ] **Step 1.3: Test**

Create `tests/Feature/Filament/PlanResourceTest.php`:

```php
<?php

use App\Filament\Resources\Plans\PlanResource;
use App\Models\Admin;
use App\Models\Plan;
use function Pest\Livewire\livewire;

beforeEach(function () {
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('lists plans', function () {
    $plan = Plan::factory()->create();

    livewire(PlanResource\Pages\ListPlans::class)
        ->assertCanSeeTableRecords([$plan]);
});

it('has no create button', function () {
    livewire(PlanResource\Pages\ListPlans::class)
        ->assertActionDoesNotExist('create');
});
```

(If `PlanFactory` does not yet exist: `php artisan make:factory PlanFactory --no-interaction` and populate with `name`, `slug`, `max_stations`, `max_listeners` defaults.)

- [ ] **Step 1.4: Run**

```bash
php artisan test --compact --filter=PlanResourceTest
```

Expected: 2 passing.

- [ ] **Step 1.5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Filament database/factories/PlanFactory.php tests/Feature/Filament/PlanResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): read-only plan resource in the catalog nav group

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: AdminResource (read-only)

**Files:**
- Create: `app/Filament/Resources/Admins/AdminResource.php` and pages
- Create: `tests/Feature/Filament/AdminResourceTest.php`

- [ ] **Step 2.1: Generate**

```bash
php artisan make:filament-resource Admin --generate --no-interaction
```

- [ ] **Step 2.2: Lock to read-only**

Apply the same read-only treatment as PlanResource:

1. `$navigationGroup = 'System';`, `$navigationSort = 99;` (pushes it to the bottom).
2. Delete the create/edit pages, leave only `ListAdmins`.
3. Table columns:

```php
TextColumn::make('name')->searchable(),
TextColumn::make('email')->searchable(),
IconColumn::make('two_factor_confirmed_at')
    ->label('2FA')
    ->boolean(),
TextColumn::make('last_login_at')->dateTime()->since()->sortable(),
```

4. Empty state note: "Admins are created via `php artisan admin:create`." Use `emptyStateHeading` and `emptyStateDescription`.

- [ ] **Step 2.3: Test**

Create `tests/Feature/Filament/AdminResourceTest.php`:

```php
<?php

use App\Filament\Resources\Admins\AdminResource;
use App\Models\Admin;
use function Pest\Livewire\livewire;

it('lists admins for an authenticated admin', function () {
    $admin = Admin::factory()->create();
    $other = Admin::factory()->create();

    $this->actingAs($admin, 'admin');

    livewire(AdminResource\Pages\ListAdmins::class)
        ->assertCanSeeTableRecords([$admin, $other]);
});

it('does not offer a create action', function () {
    $this->actingAs(Admin::factory()->create(), 'admin');

    livewire(AdminResource\Pages\ListAdmins::class)
        ->assertActionDoesNotExist('create');
});
```

- [ ] **Step 2.4: Run + commit**

```bash
php artisan test --compact --filter=AdminResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/AdminResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): read-only admin resource (artisan-only mutations)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: WaitlistEntryResource (list + delete + CSV export)

**Files:**
- Create: `app/Filament/Resources/WaitlistEntries/WaitlistEntryResource.php` and pages
- Create: `tests/Feature/Filament/WaitlistEntryResourceTest.php`

- [ ] **Step 3.1: Generate**

```bash
php artisan make:filament-resource WaitlistEntry --generate --no-interaction
```

- [ ] **Step 3.2: Shape the table + actions**

In the generated resource:

1. `$navigationGroup = 'Catalog';`, `$navigationSort = 10;`
2. Delete Create/Edit pages; list-only.
3. Table columns:

```php
TextColumn::make('email')->searchable()->copyable(),
TextColumn::make('plan')->badge(),
TextColumn::make('created_at')->dateTime()->sortable(),
```

4. Table filters:

```php
SelectFilter::make('plan')->options(fn () => \App\Models\WaitlistEntry::query()->distinct()->pluck('plan', 'plan')),
Filter::make('created_at')->form([
    DatePicker::make('from'),
    DatePicker::make('to'),
])->query(function ($query, array $data) {
    return $query
        ->when($data['from'], fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
        ->when($data['to'], fn ($q, $d) => $q->whereDate('created_at', '<=', $d));
}),
```

5. Row action: `DeleteAction::make()->requiresConfirmation()` (hard delete — GDPR).
6. Bulk actions: `DeleteBulkAction::make()` and an export action defined below.

- [ ] **Step 3.3: Add the CSV bulk export**

At the top of the resource:

```php
use Filament\Actions\BulkAction;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\StreamedResponse;
```

Inside `table()`'s `->bulkActions([...])`:

```php
BulkAction::make('export_csv')
    ->label('Export selected to CSV')
    ->icon('heroicon-o-arrow-down-tray')
    ->deselectRecordsAfterCompletion()
    ->action(function (Collection $records): StreamedResponse {
        $filename = 'waitlist-'.now()->format('Y-m-d_His').'.csv';

        return response()->streamDownload(function () use ($records) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['email', 'plan', 'created_at']);
            foreach ($records as $entry) {
                fputcsv($out, [$entry->email, $entry->plan, $entry->created_at?->toIso8601String()]);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }),
```

- [ ] **Step 3.4: Test**

Create `tests/Feature/Filament/WaitlistEntryResourceTest.php`:

```php
<?php

use App\Filament\Resources\WaitlistEntries\WaitlistEntryResource;
use App\Models\Admin;
use App\Models\WaitlistEntry;
use function Pest\Livewire\livewire;

beforeEach(function () {
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('lists waitlist entries', function () {
    $entry = WaitlistEntry::create(['email' => 'hi@there.test', 'plan' => 'pro']);

    livewire(WaitlistEntryResource\Pages\ListWaitlistEntries::class)
        ->assertCanSeeTableRecords([$entry]);
});

it('deletes a waitlist entry (hard delete)', function () {
    $entry = WaitlistEntry::create(['email' => 'gone@there.test', 'plan' => 'starter']);

    livewire(WaitlistEntryResource\Pages\ListWaitlistEntries::class)
        ->callTableAction('delete', $entry);

    expect(WaitlistEntry::find($entry->id))->toBeNull();
});

it('exports selected rows as CSV', function () {
    $a = WaitlistEntry::create(['email' => 'a@t.test', 'plan' => 'pro']);
    $b = WaitlistEntry::create(['email' => 'b@t.test', 'plan' => 'free']);

    livewire(WaitlistEntryResource\Pages\ListWaitlistEntries::class)
        ->callTableBulkAction('export_csv', [$a->id, $b->id])
        ->assertFileDownloaded();
});
```

- [ ] **Step 3.5: Run + commit**

```bash
php artisan test --compact --filter=WaitlistEntryResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/WaitlistEntryResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): waitlist entry resource with CSV export and hard delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: StreamSessionResource (read-only)

**Files:**
- Create: `app/Filament/Resources/StreamSessions/StreamSessionResource.php` and pages
- Create: `tests/Feature/Filament/StreamSessionResourceTest.php`

- [ ] **Step 4.1: Generate + lock to read-only**

```bash
php artisan make:filament-resource StreamSession --generate --no-interaction
```

Same read-only pattern as Plan/Admin (delete Create/Edit, list-only, no create action).

1. `$navigationGroup = 'Users & Content';`, `$navigationSort = 30;`
2. Table columns:

```php
TextColumn::make('station.name')->searchable()->sortable()->url(fn ($record) => StationResource::getUrl('view', ['record' => $record->station_id])),
TextColumn::make('station.user.email')->label('Owner'),
TextColumn::make('started_at')->dateTime()->sortable(),
TextColumn::make('ended_at')->dateTime()->placeholder('Live'),
TextColumn::make('duration_minutes')
    ->label('Duration (min)')
    ->getStateUsing(fn ($record) => $record->ended_at
        ? $record->started_at->diffInMinutes($record->ended_at)
        : $record->started_at->diffInMinutes(now())),
TextColumn::make('peak_listeners')->numeric()->sortable(),
TextColumn::make('source_type')->badge(),
```

3. Table filters:

```php
Filter::make('started_at')->form([DatePicker::make('from'), DatePicker::make('to')])->query(...),  // same pattern as WaitlistEntryResource
SelectFilter::make('station_id')
    ->relationship('station', 'name')
    ->searchable()
    ->preload(),
```

- [ ] **Step 4.2: Test**

```php
<?php

use App\Filament\Resources\StreamSessions\StreamSessionResource;
use App\Models\Admin;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use function Pest\Livewire\livewire;

it('lists stream sessions', function () {
    $this->actingAs(Admin::factory()->create(), 'admin');

    $station = Station::factory()->for(User::factory())->create(['name' => 'Test', 'slug' => 'test']);
    $session = StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subHour(),
        'ended_at' => now(),
        'peak_listeners' => 5,
        'source_type' => 'browser',
    ]);

    livewire(StreamSessionResource\Pages\ListStreamSessions::class)
        ->assertCanSeeTableRecords([$session]);
});
```

- [ ] **Step 4.3: Run + commit**

```bash
php artisan test --compact --filter=StreamSessionResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/StreamSessionResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): read-only stream session resource

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ActivityLogResource (read-only)

**Files:**
- Create: `app/Filament/Resources/ActivityLogs/ActivityLogResource.php` and pages
- Create: `tests/Feature/Filament/ActivityLogResourceTest.php`

Spatie's `Activity` lives in the vendor namespace. We use it as the resource model.

- [ ] **Step 5.1: Generate with a custom model**

```bash
php artisan make:filament-resource ActivityLog --model-namespace="Spatie\Activitylog\Models" --model="Activity" --generate --no-interaction
```

(If the `--model-namespace` flag is rejected by the installed Filament version, generate with a placeholder and manually change `protected static ?string $model = \Spatie\Activitylog\Models\Activity::class;` inside the resource.)

- [ ] **Step 5.2: Shape**

1. `$navigationGroup = 'System';`, `$navigationSort = 10;`
2. Read-only.
3. Table:

```php
TextColumn::make('created_at')->dateTime()->sortable()->since(),
TextColumn::make('causer_type')->badge(),
TextColumn::make('causer.email')
    ->label('Causer')
    ->getStateUsing(fn ($record) => $record->causer?->email ?? '—'),
TextColumn::make('event')->badge(),
TextColumn::make('subject_type')->badge(),
TextColumn::make('description')->limit(60),
```

4. Filters:

```php
SelectFilter::make('causer_type')->options([
    'admin' => 'Admin',
    'user' => 'User',
]),
SelectFilter::make('subject_type')->options([
    'user' => 'User',
    'station' => 'Station',
    'admin' => 'Admin',
    'plan' => 'Plan',
]),
SelectFilter::make('event'),
Filter::make('created_at')->form([DatePicker::make('from'), DatePicker::make('to')])->query(...), // same pattern
```

5. View page: show a JSON viewer for `properties`. In the page's `infolist()`:

```php
KeyValueEntry::make('properties')
    ->label('Properties'),
```

- [ ] **Step 5.3: Test**

```php
<?php

use App\Filament\Resources\ActivityLogs\ActivityLogResource;
use App\Models\Admin;
use App\Models\User;
use function Pest\Livewire\livewire;

it('lists activity rows', function () {
    $admin = Admin::factory()->create();
    $this->actingAs($admin, 'admin');

    activity()
        ->causedBy($admin)
        ->performedOn(User::factory()->create())
        ->event('test_event')
        ->log('did a thing');

    livewire(ActivityLogResource\Pages\ListActivityLogs::class)
        ->assertSee('test_event');
});
```

- [ ] **Step 5.4: Run + commit**

```bash
php artisan test --compact --filter=ActivityLogResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/ActivityLogResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): activity log resource

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: AuthenticationLogResource (read-only)

**Files:**
- Create: `app/Filament/Resources/AuthenticationLogs/AuthenticationLogResource.php` and pages
- Create: `tests/Feature/Filament/AuthenticationLogResourceTest.php`

- [ ] **Step 6.1: Generate**

```bash
php artisan make:filament-resource AuthenticationLog --model="Rappasoft\LaravelAuthenticationLog\Models\AuthenticationLog" --generate --no-interaction
```

- [ ] **Step 6.2: Shape**

1. `$navigationGroup = 'System';`, `$navigationSort = 20;`
2. Read-only.
3. Table columns:

```php
TextColumn::make('login_at')->dateTime()->sortable()->since(),
TextColumn::make('authenticatable_type')->badge(),
TextColumn::make('authenticatable.email')->label('Account'),
IconColumn::make('login_successful')->boolean()->label('Success'),
TextColumn::make('ip_address')->label('IP'),
TextColumn::make('user_agent')->limit(40),
TextColumn::make('logout_at')->dateTime()->since()->placeholder('—'),
```

4. Filters: by `authenticatable_type`, `login_successful`, date range, search by `ip_address`.

- [ ] **Step 6.3: Test**

```php
<?php

use App\Filament\Resources\AuthenticationLogs\AuthenticationLogResource;
use App\Models\Admin;
use Illuminate\Auth\Events\Login;
use function Pest\Livewire\livewire;

it('lists login events', function () {
    $admin = Admin::factory()->create();
    $this->actingAs($admin, 'admin');

    event(new Login('admin', $admin, remember: false));

    livewire(AuthenticationLogResource\Pages\ListAuthenticationLogs::class)
        ->assertSee($admin->email);
});
```

- [ ] **Step 6.4: Run + commit**

```bash
php artisan test --compact --filter=AuthenticationLogResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/AuthenticationLogResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): authentication log resource

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: StationResource (edit, feature/unfeature, soft-delete)

**Files:**
- Create: `app/Filament/Resources/Stations/StationResource.php` and pages
- Create: `tests/Feature/Filament/StationResourceTest.php`

- [ ] **Step 7.1: Generate**

```bash
php artisan make:filament-resource Station --generate --no-interaction
```

- [ ] **Step 7.2: Shape nav + list**

1. `$navigationGroup = 'Users & Content';`, `$navigationSort = 20;`
2. Delete the Create page — admins don't create stations, users do.
3. Table columns:

```php
TextColumn::make('name')->searchable()->sortable(),
TextColumn::make('slug')->searchable(),
TextColumn::make('user.email')->label('Owner')->searchable(),
IconColumn::make('is_live')->boolean()->label('Live'),
IconColumn::make('featured')->boolean(),
TextColumn::make('created_at')->dateTime()->sortable()->toggleable(),
```

4. Filters:

```php
TernaryFilter::make('is_live')->label('Live'),
TernaryFilter::make('featured'),
SelectFilter::make('user_id')
    ->relationship('user', 'email')
    ->searchable()
    ->preload()
    ->label('Owner'),
TrashedFilter::make(),  // from Filament — toggles soft-deleted rows
```

5. Actions (per row):

```php
Action::make('toggle_featured')
    ->label(fn ($record) => $record->featured ? 'Unfeature' : 'Feature')
    ->icon('heroicon-o-star')
    ->action(function ($record) {
        $record->update(['featured' => ! $record->featured]);
        activity('admin')
            ->causedBy(Filament::auth()->user())
            ->performedOn($record)
            ->event($record->featured ? 'featured' : 'unfeatured')
            ->log('Station feature toggled');
    }),
EditAction::make(),
DeleteAction::make()
    ->requiresConfirmation()
    ->modalHeading('Soft-delete station')
    ->modalDescription(fn ($record) => "Type the station slug ({$record->slug}) to confirm.")
    ->form([
        TextInput::make('confirmation')
            ->label('Type the slug to confirm')
            ->required()
            ->rule(fn ($record) => 'in:'.$record->slug),
    ])
    ->after(function ($record) {
        activity('admin')
            ->causedBy(Filament::auth()->user())
            ->performedOn($record)
            ->event('deleted')
            ->log('Station soft-deleted');
    }),
RestoreAction::make(),  // requires TrashedFilter
```

6. Edit form:

```php
TextInput::make('name')->required()->maxLength(100),
TextInput::make('slug')->required()->maxLength(60)->unique(ignoreRecord: true),
Textarea::make('description')->rows(4),
TextInput::make('genre'),
TextInput::make('artwork_url')->url(),
Toggle::make('featured'),
```

(Do **not** include `is_live` — it's relay-owned per the spec.)

- [ ] **Step 7.3: Test**

```php
<?php

use App\Filament\Resources\Stations\StationResource;
use App\Models\Admin;
use App\Models\Station;
use App\Models\User;
use Spatie\Activitylog\Models\Activity;
use function Pest\Livewire\livewire;

beforeEach(function () {
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('toggles the featured flag and logs activity', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio One',
        'slug' => 'radio-one',
        'featured' => false,
    ]);

    livewire(StationResource\Pages\ListStations::class)
        ->callTableAction('toggle_featured', $station);

    expect($station->fresh()->featured)->toBeTrue();

    $activity = Activity::where('subject_id', $station->id)->where('event', 'featured')->first();
    expect($activity)->not->toBeNull();
});

it('soft-deletes a station when the slug is typed correctly', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio Two',
        'slug' => 'radio-two',
    ]);

    livewire(StationResource\Pages\ListStations::class)
        ->callTableAction('delete', $station, ['confirmation' => 'radio-two']);

    expect(Station::find($station->id))->toBeNull();
    expect(Station::withTrashed()->find($station->id))->not->toBeNull();
});

it('blocks soft-delete when the slug confirmation is wrong', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio Three',
        'slug' => 'radio-three',
    ]);

    livewire(StationResource\Pages\ListStations::class)
        ->callTableAction('delete', $station, ['confirmation' => 'wrong'])
        ->assertHasActionErrors();

    expect(Station::find($station->id))->not->toBeNull();
});

it('does not write is_live in the edit form', function () {
    $station = Station::factory()->for(User::factory())->create([
        'name' => 'Radio Four',
        'slug' => 'radio-four',
        'is_live' => true,
    ]);

    livewire(StationResource\Pages\EditStation::class, ['record' => $station->id])
        ->fillForm(['name' => 'Renamed'])
        ->call('save');

    expect($station->fresh()->is_live)->toBeTrue();
    expect($station->fresh()->name)->toBe('Renamed');
});
```

- [ ] **Step 7.4: Run + commit**

```bash
php artisan test --compact --filter=StationResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/StationResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): station resource with feature/unfeature and safe soft-delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: UserResource (edit, resend-verify, mark-verified, soft-delete, detail panels)

**Files:**
- Create: `app/Filament/Resources/Users/UserResource.php` and pages
- Create: `app/Filament/Resources/Users/RelationManagers/StationsRelationManager.php`
- Create: `app/Filament/Resources/Users/RelationManagers/StreamSessionsRelationManager.php`
- Create: `tests/Feature/Filament/UserResourceTest.php`

This is the largest resource. Split into two commits: one for list+edit+actions, one for detail-page relation managers.

- [ ] **Step 8.1: Generate**

```bash
php artisan make:filament-resource User --generate --no-interaction
```

- [ ] **Step 8.2: Shape list + actions**

1. `$navigationGroup = 'Users & Content';`, `$navigationSort = 10;`
2. Delete Create page.
3. Table columns:

```php
TextColumn::make('name')->searchable(),
TextColumn::make('email')->searchable()->copyable(),
TextColumn::make('plan.name')->badge(),
TextColumn::make('stations_count')
    ->counts('stations')
    ->label('Stations')
    ->sortable(),
IconColumn::make('email_verified_at')->boolean()->label('Verified'),
TextColumn::make('created_at')->dateTime()->sortable(),
TextColumn::make('last_login_at')->dateTime()->since()->sortable(),
```

4. Filters:

```php
SelectFilter::make('plan_id')->relationship('plan', 'name')->multiple(),
TernaryFilter::make('email_verified_at')->label('Verified')
    ->nullable()
    ->queries(
        true: fn ($q) => $q->whereNotNull('email_verified_at'),
        false: fn ($q) => $q->whereNull('email_verified_at'),
        blank: fn ($q) => $q,
    ),
Filter::make('created_at')->form([DatePicker::make('from'), DatePicker::make('to')])->query(...),
TrashedFilter::make(),
```

5. Row actions:

```php
ViewAction::make(),
EditAction::make(),
Action::make('resend_verification')
    ->icon('heroicon-o-envelope')
    ->visible(fn ($record) => $record->email_verified_at === null)
    ->action(function ($record) {
        $record->sendEmailVerificationNotification();
        activity('admin')
            ->causedBy(Filament::auth()->user())
            ->performedOn($record)
            ->event('verification_resent')
            ->log('Verification email resent');
    }),
Action::make('mark_verified')
    ->icon('heroicon-o-check-badge')
    ->visible(fn ($record) => $record->email_verified_at === null)
    ->requiresConfirmation()
    ->action(function ($record) {
        $record->forceFill(['email_verified_at' => now()])->save();
        activity('admin')
            ->causedBy(Filament::auth()->user())
            ->performedOn($record)
            ->event('marked_verified')
            ->log('Email marked verified');
    }),
DeleteAction::make()
    ->requiresConfirmation()
    ->modalHeading('Soft-delete user')
    ->modalDescription(fn ($record) => "Type the user's email ({$record->email}) to confirm. This cascades to their stations.")
    ->form([
        TextInput::make('confirmation')
            ->required()
            ->rule(fn ($record) => 'in:'.$record->email),
    ])
    ->before(function ($record) {
        $record->tokens()->delete();
    })
    ->after(function ($record) {
        $record->stations()->delete();
        activity('admin')
            ->causedBy(Filament::auth()->user())
            ->performedOn($record)
            ->event('deleted')
            ->log('User soft-deleted with stations cascade');
    }),
RestoreAction::make(),
```

6. Bulk actions: `DeleteBulkAction::make()->requiresConfirmation()`.

7. Edit form:

```php
TextInput::make('name')->required(),
TextInput::make('email')->email()->required()->unique(ignoreRecord: true),
Select::make('plan_id')->relationship('plan', 'name')->required(),
Toggle::make('email_verified_at')
    ->label('Verified')
    ->dehydrateStateUsing(fn ($state) => $state ? now() : null)
    ->formatStateUsing(fn ($state) => $state !== null),
```

- [ ] **Step 8.3: Test list + actions**

Create `tests/Feature/Filament/UserResourceTest.php`:

```php
<?php

use App\Filament\Resources\Users\UserResource;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Illuminate\Support\Facades\Notification;
use Illuminate\Auth\Notifications\VerifyEmail;
use Spatie\Activitylog\Models\Activity;
use function Pest\Livewire\livewire;

beforeEach(function () {
    Plan::factory()->create(['id' => 1, 'name' => 'Free']);
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('lists users', function () {
    $users = User::factory()->count(3)->create();

    livewire(UserResource\Pages\ListUsers::class)
        ->assertCanSeeTableRecords($users);
});

it('marks a user verified and logs activity', function () {
    $user = User::factory()->unverified()->create();

    livewire(UserResource\Pages\ListUsers::class)
        ->callTableAction('mark_verified', $user);

    expect($user->fresh()->email_verified_at)->not->toBeNull();
    expect(Activity::where('event', 'marked_verified')->where('subject_id', $user->id)->exists())->toBeTrue();
});

it('resends a verification email', function () {
    Notification::fake();
    $user = User::factory()->unverified()->create();

    livewire(UserResource\Pages\ListUsers::class)
        ->callTableAction('resend_verification', $user);

    Notification::assertSentTo($user, VerifyEmail::class);
});

it('soft-deletes a user with correct email confirmation and cascades to stations', function () {
    $user = User::factory()->create(['email' => 'victim@test.test']);
    $station = Station::factory()->for($user)->create(['name' => 'X', 'slug' => 'x']);
    $user->createToken('auth');

    livewire(UserResource\Pages\ListUsers::class)
        ->callTableAction('delete', $user, ['confirmation' => 'victim@test.test']);

    expect(User::find($user->id))->toBeNull();
    expect(Station::find($station->id))->toBeNull();
    expect($user->fresh()->tokens()->count())->toBe(0);
});

it('refuses soft-delete when the email confirmation is wrong', function () {
    $user = User::factory()->create(['email' => 'safe@test.test']);

    livewire(UserResource\Pages\ListUsers::class)
        ->callTableAction('delete', $user, ['confirmation' => 'wrong@test.test'])
        ->assertHasActionErrors();

    expect(User::find($user->id))->not->toBeNull();
});
```

- [ ] **Step 8.4: Run + intermediate commit**

```bash
php artisan test --compact --filter=UserResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/UserResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): user resource with resend-verify, mark-verified, and safe soft-delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8.5: Add the detail page + relation managers**

Generate:

```bash
php artisan make:filament-relation-manager UserResource stations name --no-interaction
php artisan make:filament-relation-manager UserResource streamSessions started_at --no-interaction
```

(Path per your Filament version may be `app/Filament/Resources/Users/RelationManagers/`.)

In each relation manager, restrict to read-only (delete the form/create/edit) and set sensible columns:

For `StationsRelationManager`:

```php
public function table(Table $table): Table
{
    return $table
        ->columns([
            TextColumn::make('name')->searchable(),
            TextColumn::make('slug'),
            IconColumn::make('is_live')->boolean(),
            IconColumn::make('featured')->boolean(),
            TextColumn::make('created_at')->dateTime(),
        ])
        ->actions([
            Action::make('view')->url(fn ($record) => StationResource::getUrl('view', ['record' => $record->id])),
        ])
        ->headerActions([]);
}
```

For `StreamSessionsRelationManager`:

```php
public function table(Table $table): Table
{
    return $table
        ->modifyQueryUsing(fn ($query) => $query
            ->join('stations', 'stream_sessions.station_id', '=', 'stations.id')
            ->where('stations.user_id', $this->ownerRecord->id)
            ->select('stream_sessions.*'))
        ->columns([
            TextColumn::make('station.name'),
            TextColumn::make('started_at')->dateTime()->sortable(),
            TextColumn::make('ended_at')->dateTime()->placeholder('Live'),
            TextColumn::make('peak_listeners')->numeric(),
        ])
        ->paginated([25]);
}
```

(The User model has a `stations` hasMany; there's no direct `streamSessions` relation — the `modifyQueryUsing` joins through stations. If you prefer, add a `streamSessions` HasManyThrough relation on User and simplify.)

Register both relation managers in `UserResource::getRelations()`:

```php
public static function getRelations(): array
{
    return [
        StationsRelationManager::class,
        StreamSessionsRelationManager::class,
    ];
}
```

Also register "Activity" and "Authentication log" panels on the view page via a custom `infolist()` section using repeaters that pull from the respective tables, limited to the user's rows and ordered desc.

- [ ] **Step 8.6: Test detail page**

Append to `UserResourceTest.php`:

```php
it('shows the user detail page with stations', function () {
    $user = User::factory()->create();
    Station::factory()->for($user)->count(2)->create([
        'name' => fn () => fake()->words(2, asText: true),
        'slug' => fn () => fake()->unique()->slug(2),
    ]);

    $this->get(UserResource::getUrl('view', ['record' => $user->id]))
        ->assertOk();
});
```

(This is a smoke test — full relation-manager coverage comes via browser smoke tests in Phase 5.)

- [ ] **Step 8.7: Run + commit**

```bash
php artisan test --compact --filter=UserResourceTest
vendor/bin/pint --dirty --format agent
git add app/Filament tests/Feature/Filament/UserResourceTest.php
git commit -m "$(cat <<'EOF'
feat(admin): user detail page with stations and session relation managers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Full-suite green

- [ ] **Step 9.1: Full suite**

```bash
php artisan test --compact
```

Expected: every test from Phases 1–3 passes.

- [ ] **Step 9.2: Manual browse**

`php artisan serve`, log in as an admin, click through every nav item: Users & Content → Users/Stations/StreamSessions; Catalog → Plans/WaitlistEntries; System → Admins/ActivityLogs/AuthenticationLogs. Each loads without error. No missing nav icons (add `protected static ?string $navigationIcon = 'heroicon-o-...';` per resource if any look blank).

- [ ] **Step 9.3: Style commit if Pint found changes**

If `vendor/bin/pint --dirty --format agent` modified any file after full runs:

```bash
git add -u
git commit -m "$(cat <<'EOF'
style: pint pass after phase 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Phase 3 complete.

---

## Self-review

- **Spec coverage:**
  - §4.1 UserResource: Task 8 (edit, resend-verify, mark-verified, soft-delete, relation managers).
  - §4.2 StationResource: Task 7 (edit, feature/unfeature, soft-delete; no is_live writes).
  - §4.3 StreamSessionResource read-only: Task 4.
  - §4.4 PlanResource read-only: Task 1.
  - §4.5 AdminResource read-only: Task 2.
  - §4.6 WaitlistEntryResource with CSV export + hard delete: Task 3.
  - §4.7 ActivityLogResource read-only: Task 5.
  - §4.8 AuthenticationLogResource read-only: Task 6.
  - §6 Identifier-typed confirmation modals on destructive actions: applied in Tasks 7 and 8.
  - §7 Activity log emitted by every custom action: applied in Tasks 7 and 8 via `activity('admin')`.
- **Out of scope for this phase (handled later):**
  - Dashboard widgets (Phase 4).
  - `DetectAdminLoginAbuse` and in-panel notifications bell (Phase 5).
  - Pest browser smoke tests and arch tests (Phase 5).
- **Placeholder scan:** every `->query(...)` shorthand in filters is a deliberate "same pattern as above" callback because the code is identical to the WaitlistEntryResource filter. If the implementer prefers, inline the closure verbatim.
- **Type consistency:** `Filament::auth()->user()` used consistently as the causer. All activity `event` strings are snake_case.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-admin-phase-3-resources.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
