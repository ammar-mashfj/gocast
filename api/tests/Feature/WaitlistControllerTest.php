<?php

use App\Models\Admin;
use App\Models\User;
use App\Models\WaitlistEntry;
use Illuminate\Routing\Middleware\ThrottleRequests;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\postJson;
use function Pest\Laravel\withoutMiddleware;

/**
 * Access requests, across the two endpoints that record them.
 *
 * There is no checkout behind either plan, so what these store is exactly
 * what somebody reads before granting access by hand. The qualifying answers
 * landing in the row is the failure that would otherwise be invisible: the
 * form would still say "Request received" while `validated()` quietly dropped
 * every field the rules did not name.
 *
 * The per-IP throttle is switched off in every test here. Its limit is a
 * tuning knob, not a contract — pinning the current number would turn a
 * deliberate adjustment into a failing test.
 */
describe('pro access requests', function () {
    it('takes the email from the session, not the request body', function () {
        // The reason this endpoint exists. While the form was public, anyone
        // could file a request against someone else's address — and because a
        // resubmit updates the row in place, overwrite their answers too.
        $user = User::factory()->create(['email' => 'dj@example.com']);

        actingAs($user)->postJson('/api/waitlist/pro', [
            'email' => 'victim@example.com',
            'plan' => 'custom',
            'social' => 'instagram.com/yourshow',
            'message' => 'Weekly jazz show, Sundays.',
        ])->assertCreated();

        $entry = WaitlistEntry::query()->sole();

        expect($entry->email)->toBe('dj@example.com')
            ->and($entry->plan)->toBe('pro')
            ->and($entry->user_id)->toBe($user->id)
            ->and($entry->social)->toBe('instagram.com/yourshow')
            ->and($entry->message)->toBe('Weekly jazz show, Sundays.');
    });

    it('rejects an anonymous request', function () {
        postJson('/api/waitlist/pro', ['social' => 'instagram.com/yourshow'])
            ->assertUnauthorized();

        expect(WaitlistEntry::query()->count())->toBe(0);
    });

    it('requires the public page link', function () {
        // This is the whole point of the form: the station says what they
        // broadcast, but only this says who is listening.
        actingAs(User::factory()->create())
            ->postJson('/api/waitlist/pro', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('social');

        expect(WaitlistEntry::query()->count())->toBe(0);
    });

    it('accepts a request with no message', function () {
        actingAs(User::factory()->create())
            ->postJson('/api/waitlist/pro', ['social' => 'youtube.com/@yourshow'])
            ->assertCreated();

        expect(WaitlistEntry::query()->sole()->message)->toBeNull();
    });

    it('updates the existing request when someone resubmits', function () {
        // The unique (email, plan) index would turn a resubmit into a 500 on
        // its own. Someone sending a second request is almost always fixing a
        // typo'd link, so the latest submission wins and no duplicate appears.
        $user = User::factory()->create();

        actingAs($user)->postJson('/api/waitlist/pro', [
            'social' => 'instagarm.com/typo',
            'message' => 'First go.',
        ])->assertCreated();

        actingAs($user)->postJson('/api/waitlist/pro', [
            'social' => 'instagram.com/yourshow',
        ])->assertCreated();

        $entry = WaitlistEntry::query()->sole();

        expect($entry->social)->toBe('instagram.com/yourshow')
            // Omitted on the second submission, so it clears rather than
            // keeping a stale line the requester chose to drop.
            ->and($entry->message)->toBeNull();
    });

    it('puts a dismissed request back in the queue when they try again', function () {
        // Otherwise the second attempt updates a row the admin queue filters
        // out, and nobody ever sees that they answered the objection.
        $user = User::factory()->create();

        actingAs($user)->postJson('/api/waitlist/pro', ['social' => '@thin'])->assertCreated();

        $entry = WaitlistEntry::query()->sole();
        $entry->markReviewed(WaitlistEntry::STATUS_REJECTED, Admin::factory()->create());

        actingAs($user)->postJson('/api/waitlist/pro', [
            'social' => 'instagram.com/yourshow',
            'message' => 'Here is the detail you asked for.',
        ])->assertCreated();

        $entry->refresh();

        expect($entry->status)->toBe(WaitlistEntry::STATUS_PENDING)
            // Cleared with the status, so the next decision is not credited to
            // whoever made the last one.
            ->and($entry->reviewed_by)->toBeNull()
            ->and($entry->reviewed_at)->toBeNull();
    });

    it('leaves an approved request alone when they submit again', function () {
        // They already have the plan. Reopening would put a settled grant back
        // in front of an admin to approve a second time.
        $user = User::factory()->create();

        actingAs($user)->postJson('/api/waitlist/pro', ['social' => '@rae'])->assertCreated();

        $admin = Admin::factory()->create();
        $entry = WaitlistEntry::query()->sole();
        $entry->markReviewed(WaitlistEntry::STATUS_APPROVED, $admin);

        actingAs($user)->postJson('/api/waitlist/pro', ['social' => '@rae-updated'])->assertCreated();

        $entry->refresh();

        expect($entry->status)->toBe(WaitlistEntry::STATUS_APPROVED)
            ->and($entry->reviewed_by)->toBe($admin->id)
            // The answers still update — only the decision is frozen.
            ->and($entry->social)->toBe('@rae-updated');
    });
});

describe('public custom enquiries', function () {
    it('stores the qualifying answers alongside the email', function () {
        withoutMiddleware(ThrottleRequests::class);

        postJson('/api/waitlist', [
            'email' => 'network@example.com',
            'plan' => 'custom',
            'social' => 'instagram.com/yournetwork',
            'message' => 'Six stations, need white-label.',
        ])->assertCreated();

        $entry = WaitlistEntry::query()->sole();

        expect($entry->email)->toBe('network@example.com')
            ->and($entry->plan)->toBe('custom')
            ->and($entry->social)->toBe('instagram.com/yournetwork')
            ->and($entry->message)->toBe('Six stations, need white-label.')
            // Nobody behind it yet — that is what makes it an enquiry rather
            // than something that can be granted.
            ->and($entry->user_id)->toBeNull();
    });

    it('refuses to record a Pro request', function () {
        // Without the whitelist on `plan`, this public route would be a way
        // back around the authenticated one, landing an unverified email in
        // the review queue under the plan that actually grants something.
        withoutMiddleware(ThrottleRequests::class);

        postJson('/api/waitlist', [
            'email' => 'anyone@example.com',
            'plan' => 'pro',
            'social' => 'instagram.com/yourshow',
        ])->assertUnprocessable()->assertJsonValidationErrors('plan');

        expect(WaitlistEntry::query()->count())->toBe(0);
    });

    it('requires the public page link', function () {
        withoutMiddleware(ThrottleRequests::class);

        postJson('/api/waitlist', ['email' => 'network@example.com', 'plan' => 'custom'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('social');

        expect(WaitlistEntry::query()->count())->toBe(0);
    });

    it('rejects a malformed email', function () {
        withoutMiddleware(ThrottleRequests::class);

        postJson('/api/waitlist', [
            'email' => 'not-an-email',
            'plan' => 'custom',
            'social' => 'instagram.com/yournetwork',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    });
});

it('keeps a Pro request and a Custom enquiry from the same person apart', function () {
    // `plan` is half the key: the same broadcaster may legitimately want two
    // different things, and a unique index on email alone would eat the second.
    withoutMiddleware(ThrottleRequests::class);

    $user = User::factory()->create(['email' => 'dj@example.com']);

    actingAs($user)->postJson('/api/waitlist/pro', [
        'social' => 'instagram.com/yourshow',
    ])->assertCreated();

    postJson('/api/waitlist', [
        'email' => 'dj@example.com',
        'plan' => 'custom',
        'social' => 'instagram.com/yourshow',
    ])->assertCreated();

    expect(WaitlistEntry::query()->count())->toBe(2);
});
