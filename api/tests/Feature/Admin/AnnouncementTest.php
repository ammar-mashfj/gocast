<?php

use App\Models\Admin;
use App\Models\User;
use App\Notifications\Bell\BellPayload;
use App\Notifications\ProductUpdate;
use App\Services\AnnouncementSender;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Cache;
use Spatie\Activitylog\Models\Activity;

/**
 * The admin panel's one irreversible button.
 *
 * Everything else in here does something to one account and can be undone by
 * doing the opposite — an invite is revoked, a plan downgraded, a station
 * unfeatured. This writes into every bell on the platform and there is no
 * unsend, so what is pinned is the two-step: the compose form must not be able
 * to send anything on its own, and the send must carry exactly what was
 * previewed.
 *
 * @see AnnouncementSender and its own test for the fan-out and the
 *      duplicate guard, which are not re-tested here.
 */
beforeEach(function () {
    test()->withoutVite();
    config()->set('services.frontend_url', 'https://gocast.test');

    $this->admin = Admin::factory()->create();
    test()->actingAs($this->admin, 'admin');
});

/** The fields the compose form posts. */
function announcementForm(array $overrides = []): array
{
    return [
        'headline' => 'Embeddable players are here',
        'summary' => 'Put your station on any page.',
        'points' => "Copy the snippet from your station settings.\nIt keeps playing when someone scrolls away.",
        'level' => BellPayload::LEVEL_INFO,
        ...$overrides,
    ];
}

it('keeps the whole thing behind the admin guard', function () {
    auth('admin')->logout();

    $this->get(route('admin.announcements.index'))->assertRedirect(route('admin.login'));
    $this->post(route('admin.announcements.preview'), announcementForm())->assertRedirect(route('admin.login'));
    $this->post(route('admin.announcements.store'), announcementForm())->assertRedirect(route('admin.login'));

    expect(DatabaseNotification::count())->toBe(0);
});

it('says how many people the form is about to reach', function () {
    User::factory()->count(3)->create();

    $this->get(route('admin.announcements.index'))
        ->assertOk()
        ->assertSee('every account', escape: false)
        ->assertSee('3 people');
});

it('previews without sending anything', function () {
    // THE LOAD-BEARING TEST. If the preview writes, the two-step is decoration
    // and the first typo is on the platform.
    User::factory()->count(2)->create();

    $this->post(route('admin.announcements.preview'), announcementForm())
        ->assertOk()
        ->assertSee('Embeddable players are here')
        ->assertSee('Copy the snippet from your station settings.')
        ->assertSee('Send to 2 accounts');

    expect(DatabaseNotification::count())->toBe(0);
});

it('sends what the preview showed', function () {
    $user = User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm([
        'key' => 'test-embed',
        'url' => 'https://gocast.test/dashboard/embed',
        'link_label' => 'Get your snippet',
        'detail_heading' => 'What you can do',
    ]))->assertRedirect(route('admin.announcements.index'));

    $payload = $user->notifications()->sole()->data;

    expect($payload['title'])->toBe('Embeddable players are here')
        ->and($payload['body'])->toBe('Put your station on any page.')
        ->and($payload['category'])->toBe(BellPayload::CATEGORY_SYSTEM)
        ->and($payload['icon'])->toBe('megaphone')
        ->and($payload['action']['mode'])->toBe(BellPayload::MODE_EXPAND)
        ->and($payload['action']['label'])->toBe('Get your snippet')
        ->and($payload['action']['url'])->toBe('https://gocast.test/dashboard/embed')
        ->and($payload['action']['detail']['heading'])->toBe('What you can do')
        ->and($payload['action']['detail']['points'])->toBe([
            'Copy the snippet from your station settings.',
            'It keeps playing when someone scrolls away.',
        ])
        ->and($payload['meta']['announcement'])->toBe('test-embed');
});

it('builds a dated key from the headline when none is given', function () {
    // The field nobody wants to fill in, and the one that decides whether the
    // next announcement reaches anybody. Dated so "New features" twice in a
    // year is two announcements rather than one that silently goes nowhere.
    User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm())
        ->assertRedirect(route('admin.announcements.index'));

    expect(DatabaseNotification::sole()->data['meta']['announcement'])
        ->toBe(now()->format('Y-m').'-embeddable-players-are-here');
});

it('drops a row that was already told and says so', function () {
    $told = User::factory()->create();
    $newcomer = User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-once']))
        ->assertRedirect(route('admin.announcements.index'));

    // Someone who signed up between the two sends. Resending the same key is
    // how an interrupted send is finished, so it has to reach them and only
    // them.
    $latecomer = User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-once']))
        ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Sent to 1 account')
            && str_contains($status, 'skipped 2'));

    expect($told->notifications()->count())->toBe(1)
        ->and($newcomer->notifications()->count())->toBe(1)
        ->and($latecomer->notifications()->count())->toBe(1);
});

it('warns on the preview when the key has been used up', function () {
    User::factory()->count(2)->create();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-spent']));

    $this->post(route('admin.announcements.preview'), announcementForm(['key' => 'test-spent']))
        ->assertOk()
        ->assertSee('already have', escape: false)
        // The send button is dead rather than merely unhelpful: a click that
        // reaches nobody reads as success from the redirect.
        ->assertSee('Nobody left to send to');
});

it('reports a send that reached nobody as exactly that', function () {
    User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-spent']));
    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-spent']))
        ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Nothing sent'));
});

it('stays a plain link when no points are written', function () {
    $user = User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm([
        'points' => "  \n \n",
        'headline' => 'Maintenance tonight, 02:00–03:00 UTC',
    ]))->assertRedirect(route('admin.announcements.index'));

    $action = $user->notifications()->sole()->data['action'];

    expect($action['mode'])->toBe(BellPayload::MODE_LINK)
        ->and($action['detail'])->toBeNull()
        ->and($action['url'])->toBe('https://gocast.test/dashboard');
});

it('records who sent it', function () {
    // The one irreversible action in the panel, so "who did this" has to be
    // answerable. The admin guard is not the default one, so nothing logs this
    // unless the controller says so explicitly.
    User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-logged']));

    $entry = Activity::where('description', 'sent announcement')->sole();

    // Cast because spatie's Activity does not cast the morph key, so MySQL
    // hands it back as a string.
    expect((int) $entry->causer_id)->toBe($this->admin->id)
        ->and($entry->properties['announcement'])->toBe('test-logged')
        ->and($entry->properties['sent'])->toBe(1);
});

it('lists what has already gone out', function () {
    User::factory()->count(2)->create();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-listed']));

    $this->get(route('admin.announcements.index'))
        ->assertOk()
        ->assertSee('test-listed')
        ->assertSee('Embeddable players are here')
        ->assertSee('2 accounts');
});

it('refuses copy the bell cannot show', function () {
    User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm(['headline' => '']))
        ->assertSessionHasErrors('headline');

    $this->post(route('admin.announcements.store'), announcementForm(['level' => 'catastrophe']))
        ->assertSessionHasErrors('level');

    $this->post(route('admin.announcements.store'), announcementForm([
        'points' => implode("\n", array_fill(0, 7, 'One more thing.')),
    ]))->assertSessionHasErrors('points');

    // A key holding a LIKE wildcard would make the duplicate guard match other
    // announcements' rows — see ProductUpdate::KEY_PATTERN.
    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'spring%']))
        ->assertSessionHasErrors('key');

    expect(DatabaseNotification::count())->toBe(0);
});

it('does not reach accounts through the preview form by accident', function () {
    // The preview posts the fields on to the send route as hidden inputs, so
    // the two requests have to agree about what a field means. Points are the
    // one that changes shape in between — a textarea on the way in, a list in
    // the payload — and the preview posts them back as text.
    User::factory()->create();

    $preview = $this->post(route('admin.announcements.preview'), announcementForm(['key' => 'test-roundtrip']));
    $preview->assertOk();

    $this->post(route('admin.announcements.store'), [
        ...announcementForm(['key' => 'test-roundtrip']),
        // Exactly what the hidden input carries: the joined lines.
        'points' => "Copy the snippet from your station settings.\nIt keeps playing when someone scrolls away.",
    ])->assertRedirect(route('admin.announcements.index'));

    expect(DatabaseNotification::sole()->data['action']['detail']['points'])->toHaveCount(2);
});

it('refuses a second click while the first send is still running', function () {
    // The send takes as long as the account table does, and the button used to
    // stay live for all of it. Both requests would read the same "nobody has
    // this yet" snapshot and both would write — the duplicate the whole feature
    // is built to prevent, reached by clicking twice. Held here by taking the
    // lock a fan-out in flight would be holding.
    User::factory()->count(2)->create();

    $held = Cache::lock('announcement:test-double-click', 60);
    expect($held->get())->toBeTrue();

    $this->post(route('admin.announcements.store'), announcementForm(['key' => 'test-double-click']))
        ->assertRedirect(route('admin.announcements.index'))
        ->assertSessionHas('status', fn (string $status) => str_contains($status, 'being sent right now'));

    expect(DatabaseNotification::count())->toBe(0);

    // And the refusal is not logged as a send, because nothing was sent.
    expect(Activity::where('description', 'sent announcement')->count())->toBe(0)
        ->and(Activity::where('description', 'announcement send refused, already running')->count())->toBe(1);

    $held->release();
});

it('records who started a send before it finishes', function () {
    // The counts are filled in afterwards, but the causer and the key are
    // written first: a fan-out that dies halfway — a timeout, a killed worker —
    // has already written rows nobody can recall, and an entry that only exists
    // on the success path would leave that with no record of who started it.
    User::factory()->create();

    $sender = Mockery::mock(AnnouncementSender::class);
    $sender->shouldReceive('send')->once()->andThrow(new RuntimeException('killed mid-send'));
    $this->app->instance(AnnouncementSender::class, $sender);

    expect(fn () => $this->withoutExceptionHandling()->post(
        route('admin.announcements.store'),
        announcementForm(['key' => 'test-interrupted'])
    ))->toThrow(RuntimeException::class);

    $entry = Activity::where('description', 'sent announcement')->sole();

    expect((int) $entry->causer_id)->toBe($this->admin->id)
        ->and($entry->properties['announcement'])->toBe('test-interrupted');
});

it('keeps two long announcements apart in the history', function () {
    // The history groups by `data`, a TEXT column, and the key an admin reads
    // this list for sits at the very END of the serialised payload. That makes
    // it worth pinning that the grouping compares the whole value: MySQL's
    // max_sort_length truncates sorting, not the comparison GROUP BY does, and
    // if that ever stopped being true two long announcements would merge into
    // one row with a doubled recipient count and only one of the keys.
    User::factory()->create();

    $shared = array_fill(0, 5, str_repeat('a', 200));

    foreach (['one' => 'The first one ends here.', 'two' => 'The second one ends here.'] as $suffix => $last) {
        $this->post(route('admin.announcements.store'), announcementForm([
            'key' => "test-long-{$suffix}",
            'points' => implode("\n", [...$shared, $last]),
        ]))->assertRedirect(route('admin.announcements.index'));
    }

    $this->get(route('admin.announcements.index'))
        ->assertOk()
        ->assertSee('test-long-one')
        ->assertSee('test-long-two');
});

it('is reachable from the sidebar', function () {
    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee(route('admin.announcements.index'));
});

it('leaves the console command and the page telling the same story', function () {
    // Both go through AnnouncementSender, so a key sent from the terminal is
    // already spent on the page. The alternative — a page that kept its own
    // record — would disagree with the command the first time either was used
    // alone, and disagree invisibly.
    $user = User::factory()->create();

    $user->notify(new ProductUpdate(key: 'test-shared', headline: 'Sent from the terminal'));

    $this->post(route('admin.announcements.preview'), announcementForm(['key' => 'test-shared']))
        ->assertOk()
        ->assertSee('Nobody left to send to');
});

it('takes a dashboard path and points it at the right host', function () {
    // The form used to demand a full URL, which is the wrong thing to ask for:
    // notification rows are never migrated, so an absolute address typed in one
    // environment is in every bell forever. A path is resolved at send time
    // against the configured origin, exactly as every other notification does.
    $user = User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm([
        'key' => 'test-path',
        'url' => '/dashboard/settings',
    ]))->assertRedirect(route('admin.announcements.index'));

    expect($user->notifications()->sole()->data['action']['url'])
        ->toBe('https://gocast.test/dashboard/settings');
});

it('leaves a full address alone', function () {
    // Announcements do link off-site — a blog post, a status page — and those
    // are the one case where an absolute URL is the correct answer.
    $user = User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm([
        'key' => 'test-offsite',
        'url' => 'https://blog.example.test/embed-players',
    ]))->assertRedirect(route('admin.announcements.index'));

    expect($user->notifications()->sole()->data['action']['url'])
        ->toBe('https://blog.example.test/embed-players');
});

it('refuses a destination that is neither', function () {
    // `dashboard/settings` with no leading slash would resolve against nothing
    // and render as a link to a sibling page of whatever the viewer is on.
    User::factory()->create();

    $this->post(route('admin.announcements.store'), announcementForm(['url' => 'dashboard/settings']))
        ->assertSessionHasErrors('url');

    $this->post(route('admin.announcements.store'), announcementForm(['url' => 'javascript:alert(1)']))
        ->assertSessionHasErrors('url');

    expect(DatabaseNotification::count())->toBe(0);
});
