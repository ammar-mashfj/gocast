<?php

use App\Models\User;
use App\Notifications\Bell\BellPayload;
use App\Notifications\ProductUpdate;
use App\Services\AnnouncementInProgressException;
use App\Services\AnnouncementSender;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

use function Pest\Laravel\actingAs;

/**
 * The one command in the product that cannot be taken back.
 *
 * An announcement lands in the bell of every account at once, and there is no
 * unsend. So what is pinned here is not "does it send" — that is the easy half
 * and it fails loudly — but the two ways a mass send goes wrong quietly:
 *
 *   • It sends TWICE. A run that dies halfway is re-run by whoever was
 *     watching, and if the guard is wrong everybody who got it the first time
 *     gets it again. This is the failure that looks like nothing at all from
 *     the terminal.
 *   • It sends to the WRONG PEOPLE. Deleted accounts, or a filter that quietly
 *     drops most of the platform so the announcement reaches nobody and looks
 *     like it worked.
 *
 * Notification::fake() is deliberately NOT used anywhere in this file. The
 * duplicate guard reads the notifications table, so a fake that swallows the
 * writes would leave every one of these tests passing against a guard that
 * never has anything to find.
 */

/**
 * Write an announcement JSON file and return its path.
 *
 * @param  array<string, mixed>  $content
 */
function announcementFile(array $content = []): string
{
    $path = tempnam(sys_get_temp_dir(), 'announcement').'.json';

    file_put_contents($path, json_encode([
        'key' => '2026-09-test',
        'headline' => 'Something new on GoCast',
        'summary' => 'A sentence about it.',
        'points' => ['The first thing.', 'The second thing.'],
        ...$content,
    ], JSON_THROW_ON_ERROR));

    return $path;
}

/**
 * The stored payloads for one announcement, newest first.
 *
 * @return Collection<int, array<string, mixed>>
 */
function storedAnnouncements(string $key = '2026-09-test')
{
    return DatabaseNotification::query()
        ->where('type', ProductUpdate::class)
        ->get()
        ->map(fn (DatabaseNotification $row) => $row->data)
        ->filter(fn (array $data) => ($data['meta']['announcement'] ?? null) === $key)
        ->values();
}

it('reaches every account', function () {
    $users = User::factory()->count(3)->create();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])
        ->assertSuccessful();

    foreach ($users as $user) {
        expect($user->notifications()->where('type', ProductUpdate::class)->count())->toBe(1);
    }
});

it('reaches accounts that have not verified their email', function () {
    // Wider than NudgeInactiveBroadcasters on purpose, and the difference is
    // the channel: that command emails, this one writes a row into a bell the
    // API exposes before verification. An unverified account that verifies
    // next week would otherwise have silently missed everything.
    $unverified = User::factory()->unverified()->create();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])
        ->assertSuccessful();

    expect($unverified->notifications()->count())->toBe(1);
});

it('leaves deleted accounts alone', function () {
    $deleted = User::factory()->create();
    $deleted->delete();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])
        ->assertSuccessful();

    expect(DatabaseNotification::query()->where('notifiable_id', $deleted->getKey())->count())->toBe(0);
});

it('never sends the same announcement twice', function () {
    // THE TEST THIS FILE EXISTS FOR. Re-running is what a human does when the
    // first run printed an error, and the second send is invisible to them and
    // obvious to everyone else.
    User::factory()->count(3)->create();
    $file = announcementFile();

    $this->artisan('notifications:announce', ['file' => $file, '--force' => true])->assertSuccessful();
    $this->artisan('notifications:announce', ['file' => $file, '--force' => true])->assertSuccessful();

    expect(storedAnnouncements())->toHaveCount(3);
});

it('resumes a send that only reached some accounts', function () {
    $users = User::factory()->count(3)->create();
    $update = ProductUpdate::fromArray(json_decode(file_get_contents(announcementFile()), true));

    // Stand in for a run that died after one recipient: the row is committed,
    // the rest never happened. Re-running has to finish the job rather than
    // start it over.
    $users->first()->notify($update);

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])
        ->assertSuccessful();

    expect(storedAnnouncements())->toHaveCount(3);

    foreach ($users as $user) {
        expect($user->notifications()->where('type', ProductUpdate::class)->count())->toBe(1);
    }
});

it('treats a different key as a different announcement', function () {
    // The other half of the guard. Deduping on the class alone would make the
    // second announcement ever sent reach nobody — and it would look exactly
    // like a successful run.
    $user = User::factory()->create();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])->assertSuccessful();
    $this->artisan('notifications:announce', [
        'file' => announcementFile(['key' => '2026-10-test']),
        '--force' => true,
    ])->assertSuccessful();

    expect($user->notifications()->where('type', ProductUpdate::class)->count())->toBe(2);
});

it('writes nothing on a dry run', function () {
    User::factory()->count(2)->create();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--dry-run' => true])
        ->assertSuccessful();

    expect(DatabaseNotification::query()->count())->toBe(0);
});

it('sends nothing when the confirmation is declined', function () {
    User::factory()->create();

    $this->artisan('notifications:announce', ['file' => announcementFile()])
        ->expectsConfirmation('Send this to 1 account? It cannot be undone.', 'no')
        ->assertSuccessful();

    expect(DatabaseNotification::query()->count())->toBe(0);
});

it('stores a payload the dashboard can render', function () {
    $user = User::factory()->create();

    $this->artisan('notifications:announce', [
        'file' => announcementFile([
            'headline' => 'Embeddable players are here',
            'summary' => 'Put your station on any page.',
            'detail_heading' => 'What you can do',
            'points' => ['Copy the snippet from your station settings.'],
            'url' => 'https://gocast.test/dashboard/embed',
            'link_label' => 'Get your snippet',
        ]),
        '--force' => true,
    ])->assertSuccessful();

    $payload = $user->notifications()->first()->data;

    expect($payload['title'])->toBe('Embeddable players are here')
        ->and($payload['body'])->toBe('Put your station on any page.')
        ->and($payload['category'])->toBe(BellPayload::CATEGORY_SYSTEM)
        ->and($payload['level'])->toBe(BellPayload::LEVEL_INFO)
        ->and($payload['icon'])->toBe('megaphone')
        ->and($payload['action']['mode'])->toBe(BellPayload::MODE_EXPAND)
        ->and($payload['action']['label'])->toBe('Get your snippet')
        ->and($payload['action']['url'])->toBe('https://gocast.test/dashboard/embed')
        ->and($payload['action']['detail']['heading'])->toBe('What you can do')
        ->and($payload['action']['detail']['points'])->toBe(['Copy the snippet from your station settings.'])
        ->and($payload['meta']['announcement'])->toBe('2026-09-test');
});

it('stays a plain link when there is nothing to expand into', function () {
    // A one-liner — "maintenance tonight, 02:00–03:00 UTC" — should not cost a
    // click to reveal a dialog that repeats the row back.
    $user = User::factory()->create();

    $this->artisan('notifications:announce', [
        'file' => announcementFile(['points' => []]),
        '--force' => true,
    ])->assertSuccessful();

    $action = $user->notifications()->first()->data['action'];

    expect($action['mode'])->toBe(BellPayload::MODE_LINK)
        ->and($action['detail'])->toBeNull()
        // Still has somewhere to go: an action is required either way, and the
        // dashboard is the honest default.
        ->and($action['url'])->toContain('/dashboard');
});

it('rejects a file that is not there', function () {
    $this->artisan('notifications:announce', ['file' => '/nope/missing.json'])
        ->assertFailed();
});

it('rejects an announcement with no headline', function () {
    $file = tempnam(sys_get_temp_dir(), 'announcement').'.json';
    file_put_contents($file, json_encode(['key' => 'x']));

    $this->artisan('notifications:announce', ['file' => $file])->assertFailed();

    expect(DatabaseNotification::query()->count())->toBe(0);
});

it('refuses a key that would match more than itself', function () {
    // The key is interpolated into a LIKE against the serialised payload, so a
    // wildcard in it would make the duplicate guard match rows belonging to
    // other announcements — and the symptom is an announcement that silently
    // reaches nobody. Refused at construction rather than escaped, for the same
    // reason NotificationController validates its category filter.
    expect(fn () => new ProductUpdate(key: '2026-09%', headline: 'Hi'))
        ->toThrow(InvalidArgumentException::class, 'must be lower-case');

    expect(fn () => new ProductUpdate(key: '2026_09', headline: 'Hi'))
        ->toThrow(InvalidArgumentException::class, 'must be lower-case');

    expect(fn () => new ProductUpdate(key: 'Autumn Update', headline: 'Hi'))
        ->toThrow(InvalidArgumentException::class, 'must be lower-case');
});

it('refuses copy the bell could not render before anybody is notified', function () {
    // Validated in the constructor rather than at toBell(), which runs once per
    // recipient — inside the fan-out, after the first few hundred rows are
    // already committed and unrecallable.
    expect(fn () => new ProductUpdate(key: 'valid-key', headline: '   '))
        ->toThrow(InvalidArgumentException::class);

    expect(fn () => new ProductUpdate(key: 'valid-key', headline: 'Hi', level: 'catastrophe'))
        ->toThrow(InvalidArgumentException::class, 'Unknown notification level');

    expect(fn () => ProductUpdate::fromArray([
        'key' => 'valid-key',
        'headline' => 'Hi',
        'points' => ['Fine', '   '],
    ]))->toThrow(InvalidArgumentException::class, 'non-empty string');
});

it('counts the audience without sending', function () {
    User::factory()->count(4)->create();
    $update = ProductUpdate::fromArray(['key' => 'counted', 'headline' => 'Hi']);

    $sender = app(AnnouncementSender::class);

    expect($sender->plan($update))
        ->toBe(['audience' => 4, 'skipped' => 0, 'pending' => 4]);

    $sender->send($update);

    // Re-counted after the fact: every one of them is now a skip, which is what
    // makes re-running the command safe and what the command reports back.
    expect($sender->plan($update))
        ->toBe(['audience' => 4, 'skipped' => 4, 'pending' => 0]);
});

it('does not count a recipient who has since deleted their account as pending', function () {
    // The count is an intersection rather than a tally off the notifications
    // table: a deleted account keeps its rows but leaves the audience, so
    // counting rows would report fewer people left to reach than there are.
    $leaver = User::factory()->create();
    User::factory()->count(2)->create();
    $update = ProductUpdate::fromArray(['key' => 'counted', 'headline' => 'Hi']);

    $sender = app(AnnouncementSender::class);
    $leaver->notify($update);
    $leaver->delete();

    expect($sender->plan($update))
        ->toBe(['audience' => 2, 'skipped' => 0, 'pending' => 2]);
});

it('refuses a second send of the same announcement while one is running', function () {
    // THE RACE THE GUARD COULD NOT SEE. `alreadyNotified` takes one snapshot
    // and the fan-out then runs for as long as the account table takes; two
    // sends overlapping in that window both read "nobody has this" and both
    // write, which is the duplicate this whole class exists to prevent. Held
    // here by taking the lock the sender uses, which is what a fan-out already
    // in flight would be holding.
    User::factory()->count(2)->create();
    $update = ProductUpdate::fromArray(['key' => 'in-flight', 'headline' => 'Hi']);

    $held = Cache::lock('announcement:in-flight', 60);
    expect($held->get())->toBeTrue();

    expect(fn () => app(AnnouncementSender::class)->send($update))
        ->toThrow(AnnouncementInProgressException::class, 'is being sent right now');

    expect(DatabaseNotification::query()->count())->toBe(0);

    // And once the run in flight is done, the next one behaves normally.
    $held->release();

    expect(app(AnnouncementSender::class)->send($update)['sent'])->toBe(2);
});

it('reports a refused send from the command rather than sending anyway', function () {
    User::factory()->create();

    $lock = Cache::lock('announcement:2026-09-test', 60);
    expect($lock->get())->toBeTrue();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])
        ->assertFailed();

    expect(DatabaseNotification::query()->count())->toBe(0);

    $lock->release();
});

it('releases the lock once a send finishes', function () {
    // A lock left held would turn the resume — the thing that makes an
    // interrupted send recoverable — into a refusal for the next quarter of an
    // hour.
    User::factory()->create();
    $update = ProductUpdate::fromArray(['key' => 'released', 'headline' => 'Hi']);

    app(AnnouncementSender::class)->send($update);

    expect(Cache::lock('announcement:released', 10)->get())->toBeTrue();
});

it('arrives in the feed the dashboard already renders', function () {
    // The claim the whole design rests on, asserted end to end rather than
    // trusted: a notification that did not exist when the client was built
    // comes back through the API with everything the bell needs, and is
    // reachable by the category filter the feed already offers. If this passes,
    // shipping an announcement is a command and nothing else.
    $user = User::factory()->create();

    $this->artisan('notifications:announce', ['file' => announcementFile(), '--force' => true])
        ->assertSuccessful();

    actingAs($user)->getJson('/api/notifications?category=system')
        ->assertOk()
        ->assertJsonPath('data.0.title', 'Something new on GoCast')
        ->assertJsonPath('data.0.category', 'system')
        ->assertJsonPath('data.0.action.mode', 'expand')
        ->assertJsonPath('data.0.action.detail.points.0', 'The first thing.');
});
