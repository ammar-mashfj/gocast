<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Notifications\Bell\BellNotification;
use App\Notifications\Bell\BellPayload;
use App\Notifications\InactiveBroadcasterNudge;
use App\Notifications\InviteRedeemed;
use App\Notifications\PlanExpired;
use App\Notifications\ProAccessGranted;
use App\Notifications\ProductUpdate;
use App\Notifications\WelcomeNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;

/**
 * The contract that makes adding a notification a backend-only change.
 *
 * Two halves, and both are needed:
 *
 *   • Nothing may reach the database channel except through BellNotification.
 *     Laravel will happily store any array, so without this the first
 *     hand-written toDatabase() puts an unrenderable row in a table whose rows
 *     are never migrated — a permanent shape the client has to tolerate.
 *   • Every payload the app can actually produce has the fields the client
 *     renders. Notifications are dispatched from commands and queued jobs, so
 *     a bad one is discovered by a user, not by a stack trace.
 */

/**
 * Every notification class in the app, as file path => FQCN.
 *
 * @return array<string, string>
 */
function notificationClasses(): array
{
    $classes = [];

    foreach (File::allFiles(app_path('Notifications')) as $file) {
        $relative = str_replace(['/', '.php'], ['\\', ''], $file->getRelativePathname());
        $classes[$file->getRelativePathname()] = 'App\\Notifications\\'.$relative;
    }

    return $classes;
}

/**
 * An announcement with the fields a caller would fill in.
 *
 * A helper rather than a literal at each site because ProductUpdate is the one
 * notification whose content comes from outside the class, so every assertion
 * about it needs some invented copy — and copy invented twice drifts.
 */
function announcementFixture(): ProductUpdate
{
    return new ProductUpdate(
        key: '2026-09-contract',
        headline: 'Something new on GoCast',
        summary: 'A sentence about it.',
        points: ['The thing you can now do.'],
    );
}

it('routes every database-channel notification through the bell base class', function () {
    $offenders = [];

    foreach (notificationClasses() as $path => $class) {
        if (! class_exists($class)) {
            continue;
        }

        // The base class is the one legitimate declaration of toDatabase()
        // in the app — it is what every other class has to route through.
        if ($class === BellNotification::class) {
            continue;
        }

        $reflection = new ReflectionClass($class);

        if ($reflection->isSubclassOf(BellNotification::class)) {
            continue;
        }

        // TWO WAYS ONTO THE CHANNEL, and checking only the first would leave
        // the guarantee half-made. A hand-written toDatabase() is the obvious
        // one. The other is quieter: Laravel's database channel falls back to
        // toArray() when toDatabase() is absent, so a class that merely names
        // 'database' in via() and happens to have a toArray() writes a row
        // whose shape nobody chose — and rows are never migrated, so the
        // client tolerates it forever.
        //
        // The channel is named in source rather than resolved by calling
        // via(), because via() needs a notifiable and these constructors take
        // arguments this test has no business inventing. A notification with
        // the word 'database' in it for some unrelated reason is a false
        // positive worth having: the fix is one line and the alternative is
        // an unrenderable row.
        $namesTheChannel = preg_match(
            '/[\'"]database[\'"]/',
            (string) file_get_contents((string) $reflection->getFileName())
        ) === 1;

        if ($reflection->hasMethod('toDatabase') || $namesTheChannel) {
            $offenders[] = $path;
        }
    }

    // Named rather than counted, so the failure tells whoever wrote it what
    // to do instead of just that a number moved.
    expect($offenders)->toBe([], implode(', ', $offenders)
        .' reach the database channel without extending BellNotification. Extend it and implement toBell() instead — see App\Notifications\Bell\BellPayload.');
});

it('always includes the database channel for a bell notification', function () {
    $user = User::factory()->create();

    expect((new InactiveBroadcasterNudge('some-slug'))->via($user))->toContain('database');
});

it('keeps mail on the notifications that had it before the bell existed', function () {
    $user = User::factory()->create();
    $plan = Plan::factory()->create();

    // The bell was added to these, not swapped in for the email. A regression
    // here is silent: the dashboard would still light up, and nobody would
    // notice the mail had stopped until someone asked why they were never told.
    expect((new PlanExpired($plan, $plan))->via($user))->toContain('mail')
        ->and((new ProAccessGranted($plan, Carbon::parse('2026-12-01'), '3 months'))->via($user))->toContain('mail')
        ->and((new InviteRedeemed($plan, null))->via($user))->toContain('mail')
        ->and((new InactiveBroadcasterNudge(null))->via($user))->toContain('mail')
        // The one that was mail-only until it joined the bell. The bell was
        // added to it; the welcome email is still the message that matters.
        ->and((new WelcomeNotification)->via($user))->toContain('mail');
});

it('queues every bell notification that also sends mail', function () {
    // The database channel comes first in via(), so sent inline a mail failure
    // throws AFTER the bell row has been committed: out through notify(), into
    // whatever dispatched it. For InactiveBroadcasterNudge that row is the
    // command's idempotency guard, so the user is marked notified forever and
    // never gets the email, and the sweep aborts on the spot — but the shape is
    // general, and the base class documents the rule. Queued, Laravel makes one
    // job per channel and a bad mail host is one retryable job.
    $offenders = [];

    foreach (notificationClasses() as $path => $class) {
        if (! class_exists($class)) {
            continue;
        }

        $reflection = new ReflectionClass($class);

        if (! $reflection->isSubclassOf(BellNotification::class) || $reflection->isAbstract()) {
            continue;
        }

        // Read from source for the same reason the channel check above is:
        // via() wants a notifiable and these constructors take arguments this
        // test has no business inventing.
        $sendsMail = preg_match(
            '/[\'"]mail[\'"]/',
            (string) file_get_contents((string) $reflection->getFileName())
        ) === 1;

        if ($sendsMail && ! $reflection->implementsInterface(ShouldQueue::class)) {
            $offenders[] = $path;
        }
    }

    expect($offenders)->toBe([], implode(', ', $offenders)
        .' send mail without implementing ShouldQueue. A mail failure there commits the bell row and then throws through notify().');
});

it('produces a renderable payload for every converted notification', function () {
    $plan = Plan::factory()->create(['autodj_enabled' => true, 'max_listeners' => 250]);
    $user = User::factory()->create();
    Station::factory()->for($user, 'user')->create();

    $payloads = [
        'PlanExpired' => (new PlanExpired($plan, $plan))->toDatabase($user->fresh()),
        'ProAccessGranted' => (new ProAccessGranted($plan, Carbon::parse('2026-12-01'), '3 months'))->toDatabase($user->fresh()),
        'InviteRedeemed' => (new InviteRedeemed($plan, Carbon::parse('2026-12-01')))->toDatabase($user),
        'InactiveBroadcasterNudge' => (new InactiveBroadcasterNudge('night-shift'))->toDatabase($user),
        'WelcomeNotification' => (new WelcomeNotification)->toDatabase($user),
        // The one whose copy is an argument rather than a model — see its
        // docblock. It belongs in this list for exactly that reason: nothing
        // about its payload is derived, so nothing about it is checked
        // anywhere else by accident.
        'ProductUpdate' => announcementFixture()->toDatabase($user),
    ];

    foreach ($payloads as $name => $payload) {
        expect($payload)->toHaveKeys(['title', 'body', 'icon', 'level', 'category', 'action', 'meta'], $name)
            ->and($payload['title'])->not->toBe('', $name)
            ->and($payload['level'])->toBeIn(BellPayload::LEVELS, $name)
            ->and($payload['category'])->toBeIn(BellPayload::CATEGORIES, $name)
            // Every one of these is worth clicking through to, and an action
            // is the only part of the payload a rushed new type tends to omit.
            ->and($payload['action'])->toHaveKeys(['mode', 'label', 'url', 'detail'], $name)
            ->and($payload['action']['url'])->toStartWith('http', $name)
            ->and($payload['action']['mode'])->toBeIn(BellPayload::MODES, $name);
    }
});

it('gives every expanding notification something to expand into', function () {
    $plan = Plan::factory()->create(['autodj_enabled' => true, 'max_listeners' => 250]);
    $free = Plan::factory()->create(['autodj_enabled' => false, 'max_listeners' => 25]);
    $user = User::factory()->create();
    Station::factory()->for($user, 'user')->create();

    $expanding = [
        'ProAccessGranted' => (new ProAccessGranted($plan, Carbon::parse('2026-12-01'), '3 months'))->toDatabase($user->fresh()),
        'InviteRedeemed' => (new InviteRedeemed($plan, Carbon::parse('2026-12-01')))->toDatabase($user),
        'PlanExpired' => (new PlanExpired($plan, $free))->toDatabase($user),
        'WelcomeNotification' => (new WelcomeNotification)->toDatabase($user),
        'ProductUpdate' => announcementFixture()->toDatabase($user),
    ];

    foreach ($expanding as $name => $payload) {
        $action = $payload['action'];

        // Asserted on the SHAPE, not on the copy. What the points say is a
        // product decision that will be reworded; that an expanding action has
        // points at all is the contract, because the alternative is a row that
        // opens an empty dialog.
        expect($action['mode'])->toBe(BellPayload::MODE_EXPAND, $name)
            ->and($action['detail']['points'])->not->toBeEmpty($name)
            ->and($action['detail']['heading'])->not->toBeEmpty($name)
            // The action survives the mode: the URL is still there, as the
            // button inside the dialog rather than as the row's destination.
            ->and($action['url'])->toStartWith('http', $name)
            ->and($action['label'])->not->toBe('', $name);
    }
});

it('tells someone losing AutoDJ that uploads have stopped', function () {
    // The one point here that is not a restatement of the row, and the reason
    // PlanExpired expands at all: the downgrade is invisible until something
    // refuses, and this is what refuses first. Pinned by MEANING rather than by
    // wording — a reword may pass, a silent removal may not.
    $pro = Plan::factory()->create(['autodj_enabled' => true, 'max_listeners' => 250]);
    $free = Plan::factory()->create(['autodj_enabled' => false, 'max_listeners' => 25]);
    $user = User::factory()->create();

    $points = (new PlanExpired($pro, $free))->toDatabase($user)['action']['detail']['points'];

    expect(implode(' ', $points))->toContain('AutoDJ');

    // And says nothing about it to somebody who never had it.
    $stillNoAutoDj = (new PlanExpired($free, $free))->toDatabase($user)['action']['detail']['points'];

    expect(implode(' ', $stillNoAutoDj))->not->toContain('AutoDJ');
});

it('leaves a plain notification as a link', function () {
    $user = User::factory()->create();

    // The default, and what every row written before modes existed means. A
    // notification that says nothing about presentation has to keep behaving
    // exactly as it did.
    //
    // The nudge is the deliberate one: its audience is someone who has not
    // opened the dashboard in a week, so the whole point is the button, and a
    // dialog between them and going live is a step in the way. Not every
    // notification wants to expand, and this is the one that says so.
    $action = (new InactiveBroadcasterNudge('night-shift'))->toDatabase($user)['action'];

    expect($action['mode'])->toBe(BellPayload::MODE_LINK)
        ->and($action['detail'])->toBeNull();
});

it('refuses a payload the client could not render', function () {
    expect(fn () => new BellPayload(title: '   '))
        ->toThrow(InvalidArgumentException::class, 'needs a title');

    expect(fn () => new BellPayload(title: 'Hi', level: 'catastrophe'))
        ->toThrow(InvalidArgumentException::class, 'Unknown notification level');

    expect(fn () => new BellPayload(title: 'Hi', category: 'vibes'))
        ->toThrow(InvalidArgumentException::class, 'Unknown notification category');
});

it('refuses an action mode that cannot be rendered', function () {
    // Each of these serialises to something that renders as broken rather than
    // as absent — an empty dialog, or prose nothing will ever display — and
    // every one of them would be found by a user rather than by a stack trace.
    expect(fn () => new BellPayload(
        title: 'Hi',
        actionLabel: 'Open',
        actionUrl: 'https://example.test',
        actionMode: 'popup',
    ))->toThrow(InvalidArgumentException::class, 'Unknown notification action mode');

    // The mode is serialised inside the action, so this one would not merely
    // look wrong: it would silently vanish and leave an unclickable row.
    expect(fn () => new BellPayload(
        title: 'Hi',
        actionMode: BellPayload::MODE_EXPAND,
        detailPoints: ['Something'],
    ))->toThrow(InvalidArgumentException::class, 'cannot expand without an action');

    expect(fn () => new BellPayload(
        title: 'Hi',
        actionLabel: 'Open',
        actionUrl: 'https://example.test',
        actionMode: BellPayload::MODE_EXPAND,
    ))->toThrow(InvalidArgumentException::class, 'needs detail points');

    expect(fn () => new BellPayload(
        title: 'Hi',
        actionLabel: 'Open',
        actionUrl: 'https://example.test',
        detailPoints: ['Never rendered'],
    ))->toThrow(InvalidArgumentException::class, 'has to set the expand action mode');

    expect(fn () => new BellPayload(
        title: 'Hi',
        actionLabel: 'Open',
        actionUrl: 'https://example.test',
        detailHeading: 'What you get',
    ))->toThrow(InvalidArgumentException::class, 'needs points underneath it');

    expect(fn () => new BellPayload(
        title: 'Hi',
        actionLabel: 'Open',
        actionUrl: 'https://example.test',
        actionMode: BellPayload::MODE_EXPAND,
        detailPoints: ['  '],
    ))->toThrow(InvalidArgumentException::class, 'non-empty string');
});

it('refuses half an action', function () {
    // A label with no destination renders a button that does nothing; a URL
    // with no label renders a button with no text. Both look broken rather
    // than absent, which is why neither is allowed through.
    expect(fn () => new BellPayload(title: 'Hi', actionLabel: 'Open'))
        ->toThrow(InvalidArgumentException::class);

    expect(fn () => new BellPayload(title: 'Hi', actionUrl: 'https://example.test'))
        ->toThrow(InvalidArgumentException::class);
});

it('builds app urls without doubling the slash', function () {
    config(['services.frontend_url' => 'https://gocast.test/']);

    expect(BellPayload::appUrl('/dashboard'))->toBe('https://gocast.test/dashboard')
        ->and(BellPayload::appUrl('dashboard'))->toBe('https://gocast.test/dashboard');
});
