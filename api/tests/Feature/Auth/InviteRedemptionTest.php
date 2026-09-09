<?php

use App\Models\Invite;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\InviteRedeemed;
use App\Notifications\VerifyEmailCode;
use App\Notifications\WelcomeNotification;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;

beforeEach(function () {
    Notification::fake();

    $this->free = Plan::where('slug', 'free')->firstOrFail();
    $this->pro = Plan::where('slug', 'pro')->firstOrFail();
});

function registerWith(?string $code, string $email = 'dj@example.com'): TestResponse
{
    return test()->postJson('/api/auth/register', array_filter([
        'name' => 'Dana',
        'email' => $email,
        'password' => 'a-typed-password',
        'password_confirmation' => 'a-typed-password',
        'invite_code' => $code,
    ]));
}

describe('registering with an invite', function () {
    it('puts the new account on the invited plan', function () {
        $invite = Invite::factory()->create(['plan_id' => $this->pro->id]);

        registerWith($invite->code)->assertCreated();

        $user = User::where('email', 'dj@example.com')->sole();

        expect($user->plan_id)->toBe($this->pro->id)
            ->and($user->invite_id)->toBe($invite->id)
            ->and($user->plan_expires_at)->toBeNull()
            ->and($invite->fresh()->uses)->toBe(1);
    });

    it('sets the plan end date from the invite duration', function () {
        $this->freezeTime();
        $invite = Invite::factory()->create(['duration_days' => 90]);

        registerWith($invite->code);

        $user = User::where('email', 'dj@example.com')->sole();

        // Columns are second-precision; freezeTime() keeps the two reads equal
        // but the stored value has lost its microseconds.
        expect($user->plan_expires_at->startOfSecond()->equalTo(now()->addDays(90)->startOfSecond()))->toBeTrue();
    });

    it('still goes through email verification', function () {
        $invite = Invite::factory()->create();

        registerWith($invite->code);

        $user = User::where('email', 'dj@example.com')->sole();

        expect($user->hasVerifiedEmail())->toBeFalse();
        Notification::assertSentTo($user, VerifyEmailCode::class);
        // The Pro welcome waits for the address to be reachable.
        Notification::assertNotSentTo($user, InviteRedeemed::class);
    });

    it('sends the pro welcome instead of the generic one once verified', function () {
        $invite = Invite::factory()->create();
        registerWith($invite->code);
        $user = User::where('email', 'dj@example.com')->sole();

        $user->markEmailAsVerified();
        event(new Verified($user));

        Notification::assertSentTo($user, InviteRedeemed::class);
        Notification::assertNotSentTo($user, WelcomeNotification::class);
    });

    it('keeps the generic welcome for accounts without an invite', function () {
        registerWith(null);
        $user = User::where('email', 'dj@example.com')->sole();

        $user->markEmailAsVerified();
        event(new Verified($user));

        Notification::assertSentTo($user, WelcomeNotification::class);
        Notification::assertNotSentTo($user, InviteRedeemed::class);
    });

    it('registers a free account when no code is given', function () {
        registerWith(null)->assertCreated();

        expect(User::where('email', 'dj@example.com')->sole()->plan_id)->toBe($this->free->id);
    });

    /**
     * The whole reason the redemption sits inside the insert transaction: a
     * dead link must not leave behind a free account that looks like it worked.
     */
    it('creates no account at all when the code is used up', function () {
        $invite = Invite::factory()->used()->create();

        registerWith($invite->code)
            ->assertStatus(422)
            ->assertJsonPath('code', 'invite_used')
            ->assertJsonValidationErrors('invite_code');

        expect(User::where('email', 'dj@example.com')->exists())->toBeFalse()
            ->and($invite->fresh()->uses)->toBe(1);
        Notification::assertNothingSent();
    });

    it('rejects an expired link', function () {
        $invite = Invite::factory()->expired()->create();

        registerWith($invite->code)
            ->assertStatus(422)
            ->assertJsonPath('code', 'invite_expired');

        expect(User::where('email', 'dj@example.com')->exists())->toBeFalse();
    });

    it('rejects a code that does not exist', function () {
        registerWith('not-a-real-code')
            ->assertNotFound()
            ->assertJsonPath('code', 'invite_not_found');

        expect(User::where('email', 'dj@example.com')->exists())->toBeFalse();
    });

    /**
     * Two sign-ups on one single-use link. The second must lose outright:
     * no plan, no account, and the counter never passes max_uses.
     */
    it('lets exactly one account through a single-use link', function () {
        $invite = Invite::factory()->create(['max_uses' => 1]);

        registerWith($invite->code, 'first@example.com')->assertCreated();
        registerWith($invite->code, 'second@example.com')->assertStatus(422);

        expect(User::where('email', 'first@example.com')->sole()->plan_id)->toBe($this->pro->id)
            ->and(User::where('email', 'second@example.com')->exists())->toBeFalse()
            ->and($invite->fresh()->uses)->toBe(1);
    });

    it('honours a shared code up to its use count', function () {
        $invite = Invite::factory()->create(['max_uses' => 2]);

        registerWith($invite->code, 'first@example.com')->assertCreated();
        registerWith($invite->code, 'second@example.com')->assertCreated();
        registerWith($invite->code, 'third@example.com')->assertStatus(422);

        expect($invite->fresh()->uses)->toBe(2)
            ->and($invite->fresh()->users)->toHaveCount(2);
    });
});

describe('redeeming from an existing account', function () {
    it('applies the invite to the signed-in user and emails them', function () {
        $user = User::factory()->create(['plan_id' => $this->free->id]);
        $invite = Invite::factory()->create(['duration_days' => 30]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/invites/redeem', ['code' => $invite->code])
            ->assertOk()
            ->assertJsonPath('data.plan.slug', 'pro');

        $user->refresh();

        expect($user->plan_id)->toBe($this->pro->id)
            ->and($user->invite_id)->toBe($invite->id)
            ->and($user->plan_expires_at)->not->toBeNull();

        // Already verified (the Google case), so the welcome goes out now.
        Notification::assertSentTo($user, InviteRedeemed::class);
    });

    it('refuses a second invite on the same account', function () {
        $first = Invite::factory()->create();
        $second = Invite::factory()->create();
        $user = User::factory()->create(['plan_id' => $this->free->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/invites/redeem', ['code' => $first->code])
            ->assertOk();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/invites/redeem', ['code' => $second->code])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invite_already_redeemed');

        expect($second->fresh()->uses)->toBe(0);
    });

    /**
     * The guard that keeps a forwarded link from shortening a permanent
     * grant: an admin-approved Pro account has no invite_id, so the one-per-
     * account check alone would let a 30-day invite overwrite it.
     */
    it('refuses to replace a paid plan the account already holds', function () {
        $user = User::factory()->create(['plan_id' => $this->pro->id]);
        $invite = Invite::factory()->create(['duration_days' => 30]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/invites/redeem', ['code' => $invite->code])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invite_plan_already_held');

        $user->refresh();

        expect($user->plan_id)->toBe($this->pro->id)
            ->and($user->plan_expires_at)->toBeNull()
            ->and($user->invite_id)->toBeNull()
            ->and($invite->fresh()->uses)->toBe(0);

        Notification::assertNothingSent();
    });

    it('does not wait for email verification', function () {
        $user = User::factory()->unverified()->create(['plan_id' => $this->free->id]);
        $invite = Invite::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/invites/redeem', ['code' => $invite->code])
            ->assertOk();

        expect($user->fresh()->plan_id)->toBe($this->pro->id);
        Notification::assertNotSentTo($user, InviteRedeemed::class);
    });

    it('requires authentication', function () {
        $invite = Invite::factory()->create();

        $this->postJson('/api/invites/redeem', ['code' => $invite->code])->assertUnauthorized();

        expect($invite->fresh()->uses)->toBe(0);
    });
});

describe('looking up a code', function () {
    it('describes a live invite without leaking who made it', function () {
        $invite = Invite::factory()->create(['duration_days' => 90, 'label' => 'Private note']);

        $this->getJson("/api/invites/{$invite->code}")
            ->assertOk()
            ->assertJsonPath('data.plan.name', 'Pro')
            ->assertJsonPath('data.duration_days', 90)
            ->assertJsonPath('data.redeemable', true)
            ->assertJsonPath('data.reason', null)
            ->assertJsonMissing(['label' => 'Private note']);
    });

    it('says why a dead link is dead', function () {
        $used = Invite::factory()->used()->create();
        $expired = Invite::factory()->expired()->create();

        $this->getJson("/api/invites/{$used->code}")
            ->assertOk()
            ->assertJsonPath('data.redeemable', false)
            ->assertJsonPath('data.reason', 'used');

        $this->getJson("/api/invites/{$expired->code}")
            ->assertOk()
            ->assertJsonPath('data.redeemable', false)
            ->assertJsonPath('data.reason', 'expired');
    });

    it('404s an unknown code', function () {
        $this->getJson('/api/invites/nope')->assertNotFound();
    });

    it('answers in JSON even without an Accept header', function () {
        $this->get('/api/invites/nope')
            ->assertNotFound()
            ->assertJsonPath('code', 'invite_not_found');
    });
});
