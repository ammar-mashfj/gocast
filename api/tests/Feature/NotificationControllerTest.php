<?php

use App\Models\User;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use Illuminate\Support\Str;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;

/**
 * The dashboard bell's endpoints.
 *
 * The load-bearing test in this file is the scoping one. `notifications` is a
 * single table shared by every account, keyed by uuids that travel to the
 * browser in the feed, so "can user B read user A's notification by id" is the
 * whole security model of this feature in one question.
 *
 * The rest is shape: the client renders from the payload and never from the
 * class name, so the fields have to survive the round trip through a text
 * column intact, and a row written by an older build has to render rather than
 * 500 the feed.
 */

/** A throwaway bell notification, so the tests don't depend on product copy. */
class TestBellNotification extends BellNotification
{
    public function __construct(
        private readonly string $title = 'Something happened',
        private readonly string $category = BellPayload::CATEGORY_STATION,
    ) {}

    protected function toBell(object $notifiable): BellPayload
    {
        return new BellPayload(
            title: $this->title,
            body: 'The detail line.',
            icon: 'radio',
            level: BellPayload::LEVEL_SUCCESS,
            category: $this->category,
            actionLabel: 'Take a look',
            actionUrl: 'https://gocast.test/dashboard',
            meta: ['station' => 'night-shift'],
        );
    }
}

function bellUser(int $notifications = 0): User
{
    $user = User::factory()->create(['email_verified_at' => now()]);

    for ($i = 0; $i < $notifications; $i++) {
        $user->notify(new TestBellNotification("Notification {$i}"));
    }

    return $user->fresh();
}

it('returns the feed newest first with the payload flattened', function () {
    $user = bellUser();
    $user->notify(new TestBellNotification('Older'));
    $user->notify(new TestBellNotification('Newer'));

    // Backdated explicitly rather than relying on insertion order:
    // `created_at` is second-precision, so two notifications dispatched in one
    // test (or one request) genuinely tie, and a test that passed on the tie
    // would be asserting the tiebreaker, not the ordering.
    $user->notifications()->where('data', 'like', '%Older%')
        ->update(['created_at' => now()->subHour()]);

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications')
        ->assertOk()
        ->assertJsonPath('data.0.title', 'Newer')
        ->assertJsonPath('data.1.title', 'Older')
        // Flattened, not nested under `data.data` — the envelope and the
        // payload are one thing to whoever is rendering a row.
        ->assertJsonPath('data.0.body', 'The detail line.')
        ->assertJsonPath('data.0.icon', 'radio')
        ->assertJsonPath('data.0.level', 'success')
        ->assertJsonPath('data.0.category', 'station')
        ->assertJsonPath('data.0.action.label', 'Take a look')
        ->assertJsonPath('data.0.action.url', 'https://gocast.test/dashboard')
        ->assertJsonPath('data.0.meta.station', 'night-shift')
        ->assertJsonPath('data.0.read_at', null)
        ->assertJsonPath('meta.unread_count', 2);
});

it('never serves one user the notifications of another', function () {
    $owner = bellUser(1);
    $stranger = bellUser();

    $id = $owner->notifications()->first()->id;

    // The id is not a secret — it is in the owner's own feed — so everything
    // that resolves one has to scope by user first. Each of these would be a
    // separate hole if any single one bound the model directly.
    actingAs($stranger, 'sanctum')->getJson('/api/notifications')
        ->assertOk()
        ->assertJsonCount(0, 'data');

    actingAs($stranger, 'sanctum')->postJson("/api/notifications/{$id}/read")->assertNotFound();
    actingAs($stranger, 'sanctum')->deleteJson("/api/notifications/{$id}")->assertNotFound();

    expect($owner->notifications()->first()->read_at)->toBeNull()
        ->and($owner->notifications()->count())->toBe(1);
});

it('requires authentication', function () {
    getJson('/api/notifications')->assertUnauthorized();
    getJson('/api/notifications/unread-count')->assertUnauthorized();
    postJson('/api/notifications/read-all')->assertUnauthorized();
});

it('serves the bell to a user who has not verified their email', function () {
    // Outside the `verified` group on purpose: reading messages addressed to
    // you is not a productive action, and an unverified account can already
    // hold notifications about its own plan.
    $user = User::factory()->create(['email_verified_at' => null]);
    $user->notify(new TestBellNotification);

    actingAs($user->fresh(), 'sanctum')
        ->getJson('/api/notifications')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('filters to unread only', function () {
    $user = bellUser(3);
    $user->notifications()->first()->markAsRead();

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications?filter=unread')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('filters by category', function () {
    $user = bellUser();
    $user->notify(new TestBellNotification('Station thing', BellPayload::CATEGORY_STATION));
    $user->notify(new TestBellNotification('Plan thing', BellPayload::CATEGORY_PLAN));

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications?category=plan')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.title', 'Plan thing');
});

it('treats an empty filter value as no filter at all', function () {
    // `?category=` and `?filter=` are what a filter control emits for its
    // "All" option, and Laravel's ConvertEmptyStringsToNull hands the
    // validator a null for each. Without `nullable` the unfiltered case is a
    // 422 — the one request the feed most has to answer.
    $user = bellUser();
    $user->notify(new TestBellNotification('Station thing', BellPayload::CATEGORY_STATION));
    $user->notify(new TestBellNotification('Plan thing', BellPayload::CATEGORY_PLAN));

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications?category=&filter=')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('rejects a filter it does not understand', function () {
    actingAs(bellUser(), 'sanctum')
        ->getJson('/api/notifications?filter=starred')
        ->assertStatus(422);
});

it('rejects a category that is not one of the payload categories', function () {
    // Validated against BellPayload::CATEGORIES rather than as free text, which
    // is what keeps the LIKE clause a plain literal: nothing containing `%`,
    // `_` or a backslash can reach it, so there is no pattern to escape and no
    // per-driver escaping behaviour to get wrong.
    actingAs(bellUser(), 'sanctum')
        ->getJson('/api/notifications?category=vibes')
        ->assertStatus(422);

    actingAs(bellUser(), 'sanctum')
        ->getJson('/api/notifications?category=_')
        ->assertStatus(422);
});

it('reports the unread count and the cap the client should render against', function () {
    config(['notifications.unread_count_cap' => 99]);
    $user = bellUser(2);

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications/unread-count')
        ->assertOk()
        ->assertJsonPath('data.unread_count', 2)
        ->assertJsonPath('data.capped_at', 99);
});

it('marks one notification read, idempotently', function () {
    $user = bellUser(2);
    $id = $user->notifications()->first()->id;

    actingAs($user, 'sanctum')
        ->postJson("/api/notifications/{$id}/read")
        ->assertOk()
        ->assertJsonPath('data.id', $id);

    $readAt = $user->notifications()->find($id)->read_at;
    expect($readAt)->not->toBeNull();

    // The client fires this on click; a double click is not an error, and it
    // must not move the timestamp either.
    actingAs($user, 'sanctum')->postJson("/api/notifications/{$id}/read")->assertOk();

    expect($user->notifications()->find($id)->read_at->eq($readAt))->toBeTrue()
        ->and($user->unreadNotifications()->count())->toBe(1);
});

it('marks the whole feed read and answers with the cleared count', function () {
    $user = bellUser(3);

    actingAs($user, 'sanctum')
        ->postJson('/api/notifications/read-all')
        ->assertOk()
        ->assertJsonPath('data.unread_count', 0);

    expect($user->unreadNotifications()->count())->toBe(0);
});

it('deletes a notification for real', function () {
    $user = bellUser(2);
    $id = $user->notifications()->first()->id;

    actingAs($user, 'sanctum')
        ->deleteJson("/api/notifications/{$id}")
        ->assertOk()
        ->assertJsonPath('data.unread_count', 1);

    expect($user->notifications()->count())->toBe(1);
});

it('renders a row written before a payload field existed', function () {
    // Rows are written once and never migrated, so the feed will still be
    // serving payloads from older builds long after every notification class
    // has moved on. One thin row must not 500 the whole feed.
    $user = bellUser();
    $user->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => TestBellNotification::class,
        'data' => ['title' => 'From an older build'],
    ]);

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications')
        ->assertOk()
        ->assertJsonPath('data.0.title', 'From an older build')
        ->assertJsonPath('data.0.icon', 'bell')
        ->assertJsonPath('data.0.level', 'info')
        ->assertJsonPath('data.0.category', 'system')
        ->assertJsonPath('data.0.action', null);
});

it('reads an action written before modes existed as a link', function () {
    // THE MIGRATION STORY, and there is no migration. Every action already in
    // the table carries a label and a url and nothing else, so a client that
    // required a mode would render each of them as a row that goes nowhere.
    // The resource fills it in on the way out instead.
    $user = bellUser();
    $user->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => TestBellNotification::class,
        'data' => [
            'title' => 'From an older build',
            'action' => ['label' => 'Take a look', 'url' => 'https://gocast.test/dashboard'],
        ],
    ]);

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications')
        ->assertOk()
        ->assertJsonPath('data.0.action.mode', 'link')
        ->assertJsonPath('data.0.action.url', 'https://gocast.test/dashboard')
        ->assertJsonPath('data.0.action.detail', null);
});

it('drops detail an older row cannot render', function () {
    // Same table, same rule, one step further: `detail` may be anything a past
    // build wrote. A heading over an empty list is a dialog with nothing in
    // it, and the client's fallback for "expands but has nothing to show" only
    // works if this reports null rather than an empty list.
    $user = bellUser();
    $user->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => TestBellNotification::class,
        'data' => [
            'title' => 'Half a detail',
            'action' => [
                'mode' => 'expand',
                'label' => 'Open',
                'url' => 'https://gocast.test/dashboard',
                'detail' => ['heading' => 'What you get', 'points' => ['', 42]],
            ],
        ],
    ]);

    actingAs($user, 'sanctum')
        ->getJson('/api/notifications')
        ->assertOk()
        ->assertJsonPath('data.0.action.detail', null);
});

it('falls back to the first page for a cursor it cannot use', function () {
    // A cursor is user input and the paginator trusts it: base64 of a
    // well-formed object that simply isn't one of ours reaches straight into
    // `_pointsToNextItems` and the sort columns and throws, which is a 500 for
    // a hand-edited URL — and for every client still holding a cursor minted
    // before a change to the feed's sort, which is exactly when a 500 is least
    // useful. Page one is the answer a client can act on.
    $user = bellUser(2);

    $cursors = [
        'not base64 at all' => 'zzzz!!!!',
        'valid json, wrong shape' => base64_encode('{"a":1,"_pointsToNextItems":true}'),
        'missing the tiebreak column' => base64_encode('{"created_at":"2026-01-01 00:00:00","_pointsToNextItems":true}'),
        'missing the direction flag' => base64_encode('{"created_at":"2026-01-01 00:00:00","id":"abc"}'),
        'not an object' => base64_encode('"nope"'),
    ];

    foreach ($cursors as $name => $cursor) {
        $response = actingAs($user, 'sanctum')
            ->getJson('/api/notifications?cursor='.urlencode($cursor));

        expect($response->status())->toBe(200, "cursor: {$name}");

        $response->assertJsonCount(2, 'data');
    }
});

it('pages without repeating or dropping notifications that share a timestamp', function () {
    // The reason the feed orders by id as well as by created_at. These all land
    // in the same second, so with `created_at` as the only sort key the cursor
    // has no unique position to resume from and a row can appear on both pages
    // or on neither.
    config(['notifications.per_page' => 3]);
    $user = bellUser(7);

    $seen = [];
    $url = '/api/notifications';

    do {
        $page = actingAs($user, 'sanctum')->getJson($url)->assertOk()->json();
        $seen = [...$seen, ...array_column($page['data'], 'id')];
        $url = $page['links']['next'] ?? null;
    } while ($url !== null);

    expect($seen)->toHaveCount(7)
        ->and(array_unique($seen))->toHaveCount(7);
});
