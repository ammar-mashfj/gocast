<?php

use App\Http\Controllers\Admin\AccessRequestController;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Models\WaitlistEntry;
use App\Notifications\ProAccessGranted;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    test()->withoutVite();

    $this->admin = Admin::factory()->create(['name' => 'Ada Reviewer']);
    test()->actingAs($this->admin, 'admin');

    // Seeded by the create_plans_table migration, which RefreshDatabase runs.
    // Looked up rather than created so the test grants the same rows the app
    // grants in production.
    $this->free = Plan::where('slug', 'free')->firstOrFail();
    $this->pro = Plan::where('slug', 'pro')->firstOrFail();

    Notification::fake();
});

/**
 * A Pro request as the dashboard actually files one: authenticated, so it
 * carries the account behind it.
 */
function proRequest(?User $user = null): WaitlistEntry
{
    $user ??= User::factory()->create(['plan_id' => Plan::where('slug', 'free')->value('id')]);

    return WaitlistEntry::create([
        'user_id' => $user->id,
        'email' => $user->email,
        'plan' => 'pro',
        'social' => '@raeradio',
    ]);
}

/**
 * What the approve form posts for a free trial. Both fields are required, so
 * every grant in these tests says what it is.
 *
 * @return array{term: string, paid: string}
 */
function trialGrant(string $term = '1-week', bool $paid = false): array
{
    return ['term' => $term, 'paid' => $paid ? '1' : '0'];
}

/**
 * What the renew form posts: the grant, plus the end date the page showed.
 *
 * @return array{term: string, paid: string, seen_until: string}
 */
function renewal(WaitlistEntry $entry, string $term = '1-month', bool $paid = true): array
{
    return [...trialGrant($term, $paid), 'seen_until' => (string) $entry->user->fresh()->plan_expires_at?->getTimestamp()];
}

describe('approving', function () {
    it('moves the account onto the plan it asked for', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant())->assertRedirect();

        expect($entry->user->fresh()->plan_id)->toBe($this->pro->id);
    });

    it('grants the term the admin picked', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant('2-weeks'));

        expect($entry->user->fresh()->plan_expires_at->startOfSecond())
            ->toEqual(now()->addWeeks(2)->startOfSecond());
    });

    /**
     * Months are calendar months, not a day count. "3 months" granted on the
     * 20th has to end on the 20th, or the email says one thing and the column
     * says another — which is the whole failure this change was made to fix.
     */
    it('counts a month as a calendar month', function () {
        $this->travelTo('2026-11-30 09:00:00');

        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant('3-months'));

        expect($entry->user->fresh()->plan_expires_at->toDateString())->toBe('2027-02-28');
    });

    it('refuses a post that does not say the term or whether it was paid', function () {
        // Both used to default, and each default was wrong for somebody: a
        // paying customer left on "Free, 1 week" is emailed "free of charge"
        // and dropped after seven days. A post missing either is a stale form.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), ['paid' => '0'])
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'not a term we grant'));
        $this->post(route('admin.requests.approve', $entry), ['term' => '1-month'])
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'paid or free'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($entry->user->fresh()->plan_id)->toBe($this->free->id);
        Notification::assertNothingSent();
    });

    it('refuses a paid grant for a term that is not sold', function () {
        // "Paid, 1 week" is the admin having forgotten to change the term
        // after a payment, not a sale — there is no one-week price.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant('1-week', paid: true))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'not a term we sell'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
        Notification::assertNothingSent();
    });

    it('refuses a term that is not on the list without settling the request', function () {
        // A stale or tampered form. Substituting a term nobody chose would
        // grant a length the admin never saw, so it refuses — and must leave
        // the row pending so the real decision is still there to make.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant('10-years'))
            ->assertRedirect()
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'not a term we grant'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($entry->user->fresh()->plan_id)->toBe($this->free->id);

        Notification::assertNothingSent();
    });

    /**
     * The point of the whole thing: the grant ends on its own. Before this,
     * `plan_expires_at` was nulled on approval and the only way back to Free
     * was an admin remembering to click Revoke.
     */
    it('drops the account back to free once the term runs out', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant('1-week'));

        $this->travel(6)->days();
        $this->artisan('plans:expire');

        expect($entry->user->fresh()->plan_id)->toBe($this->pro->id);

        $this->travel(2)->days();
        $this->artisan('plans:expire');

        expect($entry->user->fresh()->plan_id)->toBe($this->free->id)
            ->and($entry->user->fresh()->plan_expires_at)->toBeNull();
    });

    /**
     * An account that came in on a 30-day invite and then pays for 3 months
     * keeps the invite days it had left: they paid for the full term, and
     * starting it today would take those days back.
     */
    it('adds to a running invite trial rather than restarting it', function () {
        $inviteEnds = now()->addDays(10);
        $user = User::factory()->create([
            'plan_id' => $this->pro->id,
            'plan_expires_at' => $inviteEnds,
        ]);
        $entry = proRequest($user);

        $this->post(route('admin.requests.approve', $entry), trialGrant('3-months', paid: true));

        expect($user->fresh()->plan_expires_at->startOfSecond())
            ->toEqual($inviteEnds->copy()->addMonthsNoOverflow(3)->startOfSecond());

        Notification::assertSentTo($user, ProAccessGranted::class,
            fn (ProAccessGranted $notification) => str_contains(
                collect($notification->toMail($user)->introLines)->implode(' '),
                "We've added 3 months of Pro",
            ));
    });

    it('refuses to put an end date on a grant that has none', function () {
        // A grant from before terms existed. Any term would make it expire.
        $user = User::factory()->create(['plan_id' => $this->pro->id, 'plan_expires_at' => null]);
        $entry = proRequest($user);

        $this->post(route('admin.requests.approve', $entry), trialGrant())
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'no end date'));

        expect($user->fresh()->plan_expires_at)->toBeNull()
            ->and($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
        Notification::assertNothingSent();
    });

    it('refuses to replace a plan that was set by hand', function () {
        $custom = Plan::factory()->create(['slug' => 'custom-deal', 'name' => 'Custom Deal']);
        $user = User::factory()->create(['plan_id' => $custom->id]);
        $entry = proRequest($user);

        $this->post(route('admin.requests.approve', $entry), trialGrant('12-months', paid: true))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Custom Deal'));

        expect($user->fresh()->plan_id)->toBe($custom->id)
            ->and($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
        Notification::assertNothingSent();
    });

    it('unlocks the entitlements the plan actually carries', function () {
        // AutoDJ and the listener cap are the two things that genuinely differ
        // between free and Pro today, and both are read from the plan at
        // request time rather than copied onto the user.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $plan = $entry->user->fresh()->plan;

        expect($plan->autodj_enabled)->toBeTrue()
            ->and($plan->max_listeners)->toBe(1000);
    });

    it('carries the plan through to the watermark flag', function () {
        // Inert in practice — no clips are installed, so nothing is mixed into
        // anyone's audio on any plan. Kept because it is the one assertion that
        // the plan change reaches User::watermarked(), which is what both
        // LiquidsoapSupervisor and StationResource consult if clips ever land.
        $entry = proRequest();
        Station::factory()->for($entry->user)->create();

        expect($entry->user->watermarked())->toBeTrue();

        $this->post(route('admin.requests.approve', $entry), trialGrant());

        expect($entry->user->fresh()->watermarked())->toBeFalse();
    });

    it('emails only what the plan really gives them', function () {
        // The stale `max_stations` column reads 5 on Pro while the product is
        // one station per user, and the watermark is inert. Promising either
        // in the grant email is a promise the app will not keep.
        $entry = proRequest();
        $station = Station::factory()->for($entry->user)->create();

        $this->post(route('admin.requests.approve', $entry), trialGrant());

        Notification::assertSentTo($entry->user, ProAccessGranted::class,
            function (ProAccessGranted $notification) use ($entry, $station) {
                $mail = $notification->toMail($entry->user);
                $body = collect([...$mail->introLines, ...$mail->outroLines])->implode(' ');
                $frontend = rtrim(config('services.frontend_url'), '/');

                expect($body)->toContain('1,000 listeners')
                    ->and($body)->toContain('AutoDJ')
                    ->and($body)->toContain('refresh the page')
                    // The two links they actually need: where to upload, and
                    // what to hand to listeners.
                    ->and($mail->actionUrl)->toBe("{$frontend}/dashboard/stations/{$station->slug}/library")
                    ->and($body)->toContain("{$frontend}/station/{$station->slug}")
                    ->and($body)->toContain('instagram.com/gocastfm')
                    ->and($body)->not->toContain('watermark')
                    ->and($body)->not->toContain('5 stations');

                return true;
            });
    });

    it('words the email around the term that was actually granted', function () {
        // The copy used to say "3 months" whatever happened, and nothing ended
        // the plan at all. Both halves are asserted together on purpose: the
        // sentence and the column have to come from the same decision.
        $entry = proRequest();
        Station::factory()->for($entry->user)->create();

        $this->post(route('admin.requests.approve', $entry), trialGrant('2-weeks'));

        $endsOn = $entry->user->fresh()->plan_expires_at->toFormattedDateString();

        Notification::assertSentTo($entry->user, ProAccessGranted::class,
            function (ProAccessGranted $notification) use ($entry, $endsOn) {
                $mail = $notification->toMail($entry->user);
                $body = collect([...$mail->introLines, ...$mail->outroLines])->implode(' ');

                expect($mail->subject)->toContain('2 weeks')
                    ->and($body)->toContain('for 2 weeks')
                    ->and($body)->toContain($endsOn)
                    ->and($body)->toContain('goes back to Free automatically')
                    ->and($body)->not->toContain('3 months');

                return true;
            });
    });

    it('puts the end date in the bell as well as the email', function () {
        // The email is read once on the day it arrives. Two months later the
        // bell is the only place the date still exists.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant('1-month'));

        $expiresAt = $entry->user->fresh()->plan_expires_at;

        Notification::assertSentTo($entry->user, ProAccessGranted::class,
            function (ProAccessGranted $notification) use ($entry, $expiresAt) {
                $payload = $notification->toDatabase($entry->user->fresh());
                $points = implode(' ', $payload['action']['detail']['points']);

                expect($points)->toContain('1 month on us')
                    ->and($points)->toContain($expiresAt->toFormattedDateString())
                    ->and($payload['meta']->expires_at)->toBe($expiresAt->toIso8601String());

                return true;
            });
    });

    it('thanks a paying customer instead of calling it free', function () {
        // A paid grant is the admin confirming a payment arrived. "Free of
        // charge" or "on us" to somebody who just sent money reads as a
        // mistake, so the email and the bell both drop it.
        $entry = proRequest();
        Station::factory()->for($entry->user)->create();

        $this->post(route('admin.requests.approve', $entry), trialGrant('12-months', paid: true));

        expect($entry->user->fresh()->plan_expires_at->startOfDay())
            ->toEqual(now()->addMonthsNoOverflow(12)->startOfDay());

        Notification::assertSentTo($entry->user, ProAccessGranted::class,
            function (ProAccessGranted $notification) use ($entry) {
                $mail = $notification->toMail($entry->user);
                $body = collect([...$mail->introLines, ...$mail->outroLines])->implode(' ');
                $points = implode(' ', $notification->toDatabase($entry->user->fresh())['action']['detail']['points']);

                expect($body)->toContain('Thanks for your payment')
                    ->and($body)->toContain('for 12 months')
                    ->and($body)->not->toContain('free of charge')
                    ->and($mail->subject)->not->toContain('on us')
                    ->and($points)->toContain('paid')
                    ->and($points)->not->toContain('on us');

                return true;
            });
    });

    it('records who decided and when', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $entry->refresh();

        expect($entry->status)->toBe(WaitlistEntry::STATUS_APPROVED)
            ->and($entry->reviewed_by)->toBe($this->admin->id)
            ->and($entry->reviewed_at)->not->toBeNull();
    });

    it('emails the requester', function () {
        // Nothing about a grant is pushed to the dashboard — their UI only
        // catches up on the next load of /api/user — so this email is the
        // only thing that actually tells them.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant());

        Notification::assertSentTo($entry->user, ProAccessGranted::class);
    });

    it('refuses an enquiry with no account behind it', function () {
        $entry = WaitlistEntry::create([
            'email' => 'network@example.com',
            'plan' => 'custom',
            'social' => '@network',
        ]);

        $this->post(route('admin.requests.approve', $entry), trialGrant())
            ->assertRedirect()
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'no GoCast account'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
    });

    it('refuses a request naming a plan that does not exist', function () {
        // `plan` is stored verbatim from whichever form sent it, so this is a
        // typo or a retired plan — not something to guess at.
        $user = User::factory()->create();
        $entry = WaitlistEntry::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'plan' => 'platinum',
            'social' => '@rae',
        ]);

        $this->post(route('admin.requests.approve', $entry), trialGrant())
            ->assertRedirect()
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'platinum'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
    });

    it('refuses a request whose account has been deleted', function () {
        // User is soft-deleted, so the foreign key survives the account. Without
        // an explicit guard the decision would be stamped and the plan write
        // would then fatal on null.
        $entry = proRequest();
        $entry->user->delete();

        $this->post(route('admin.requests.approve', $entry->fresh()), trialGrant())
            ->assertRedirect()
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'deleted'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
    });

    it('does not grant or email twice when approved again', function () {
        // Two admins with the queue open. The second click must not re-stamp
        // the decision with the wrong name, or send a second email.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $second = Admin::factory()->create(['name' => 'Grace Second']);

        $this->actingAs($second, 'admin')
            ->post(route('admin.requests.approve', $entry), trialGrant())
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'already settled'));

        expect($entry->fresh()->reviewed_by)->toBe($this->admin->id);

        Notification::assertSentToTimes($entry->user, ProAccessGranted::class, 1);
    });

    it('leaves nothing half-granted when the plan write fails', function () {
        // The plan and its end date are one write in one transaction with the
        // decision. Split, a failure here left the account on Free with a
        // future end date and the request stamped approved.
        $entry = proRequest();

        User::saving(fn () => throw new RuntimeException('database went away'));

        $this->withoutExceptionHandling();

        expect(fn () => $this->post(route('admin.requests.approve', $entry), trialGrant()))
            ->toThrow(RuntimeException::class);

        $user = $entry->user->fresh();

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($user->plan_id)->toBe($this->free->id)
            ->and($user->plan_expires_at)->toBeNull();

        Notification::assertNothingSent();
    });

    it('refuses clearly when there is no free plan to tell a Free account by', function () {
        $user = User::factory()->create(['plan_id' => $this->free->id]);
        $entry = proRequest($user);
        $this->free->update(['slug' => 'starter']);

        $this->post(route('admin.requests.approve', $entry), trialGrant())
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'would replace it') && str_contains($status, 'Nothing changed'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($user->fresh()->plan_id)->toBe($this->free->id);
    });
});

describe('dismissing', function () {
    it('marks the request rejected and sends nothing', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.dismiss', $entry))->assertRedirect();

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_REJECTED);

        Notification::assertNothingSent();
    });

    it('leaves the account on the plan it was already on', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.dismiss', $entry));

        expect($entry->user->fresh()->plan_id)->toBe($this->free->id);
    });

    it('refuses to dismiss an approved request', function () {
        // Dismissing one would hide it from the queue while the account keeps
        // the plan — the grant would become invisible and unrevokable.
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $this->post(route('admin.requests.dismiss', $entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Revoke it instead'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_APPROVED);
    });
});

describe('revoking', function () {
    it('moves the account back to free and reopens the request', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $this->post(route('admin.requests.revoke', $entry))->assertRedirect();

        $entry->refresh();

        expect($entry->user->fresh()->plan_id)->toBe($this->free->id)
            // Pending, not rejected: revoking leaves the original question
            // open rather than answering it with a no.
            ->and($entry->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($entry->reviewed_by)->toBeNull()
            ->and($entry->reviewed_at)->toBeNull();
    });

    it('takes AutoDJ back with the plan', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $this->post(route('admin.requests.revoke', $entry));

        expect($entry->user->fresh()->plan->autodj_enabled)->toBeFalse();
    });

    it('leaves their station and its tracks alone', function () {
        // The caps are checked on create and on start, never on the way down,
        // so a downgrade never deletes anyone's work. That is deliberate —
        // see the controller.
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $station = Station::factory()->for($entry->user)->create();

        $this->post(route('admin.requests.revoke', $entry));

        expect($entry->user->fresh()->stations()->count())->toBe(1)
            ->and($station->fresh())->not->toBeNull();
    });

    it('refuses to take back a plan the account was moved to by hand since', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $custom = Plan::factory()->create(['slug' => 'custom-deal', 'name' => 'Custom Deal']);
        $entry->user->forceFill(['plan_id' => $custom->id, 'plan_expires_at' => null])->save();

        $this->post(route('admin.requests.revoke', $entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Custom Deal'));

        expect($entry->user->fresh()->plan_id)->toBe($custom->id)
            ->and($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_APPROVED);
    });

    it('reopens a request whose grant already expired', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $entry->user->forceFill(['plan_id' => $this->free->id, 'plan_expires_at' => null])->save();

        $this->post(route('admin.requests.revoke', $entry));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
    });

    it('refuses to revoke a request that was never approved', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.revoke', $entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'nothing to revoke'));

        expect($entry->user->fresh()->plan_id)->toBe($this->free->id);
    });
});

describe('reopening', function () {
    it('puts a dismissed request back in the queue', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.dismiss', $entry));

        $this->post(route('admin.requests.reopen', $entry))->assertRedirect();

        $entry->refresh();

        expect($entry->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($entry->reviewed_by)->toBeNull();
    });

    it('refuses to reopen an approved request', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $this->post(route('admin.requests.reopen', $entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Only a dismissed request'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_APPROVED);
    });
});

describe('the queue view', function () {
    // Decided state is built on the model rather than through the dismiss
    // endpoint: that action flashes "Dismissed <email>" into the session, and
    // the layout renders it on the very next response — so a filter test
    // driven through HTTP would see the email it is asserting is absent.
    it('shows only pending requests by default', function () {
        $pending = proRequest();

        $decided = proRequest(User::factory()->create(['email' => 'decided@example.com']));
        $decided->markReviewed(WaitlistEntry::STATUS_REJECTED, $this->admin);

        $this->get(route('admin.requests.index'))
            ->assertOk()
            ->assertSee($pending->email)
            ->assertDontSee('decided@example.com');
    });

    it('shows every request when asked for all', function () {
        $decided = proRequest(User::factory()->create(['email' => 'decided@example.com']));
        $decided->markReviewed(WaitlistEntry::STATUS_REJECTED, $this->admin);

        $this->get(route('admin.requests.index', ['status' => 'all']))
            ->assertOk()
            ->assertSee('decided@example.com');
    });

    it('falls back to pending when handed a status that is not one', function () {
        proRequest();

        $this->get(route('admin.requests.index', ['status' => 'wheelbarrow']))
            ->assertOk()
            ->assertSee('Pending');
    });

    it('distinguishes an empty queue from an empty table', function () {
        $decided = proRequest();
        $decided->markReviewed(WaitlistEntry::STATUS_REJECTED, $this->admin);

        $this->get(route('admin.requests.index'))
            ->assertOk()
            ->assertSee('Nothing waiting for review.')
            ->assertDontSee('No access requests yet.');
    });

    it('counts what is still waiting on a person', function () {
        proRequest();
        $decided = proRequest(User::factory()->create());
        $decided->markReviewed(WaitlistEntry::STATUS_REJECTED, $this->admin);

        $this->get(route('admin.requests.index'))
            ->assertOk()
            ->assertSeeInOrder(['Pending', '1']);
    });

    it('names the admin who decided', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $this->get(route('admin.requests.index', ['status' => 'approved']))
            ->assertOk()
            ->assertSee('Ada Reviewer');
    });

    it('offers every term on the approve form, preselecting none', function () {
        proRequest();

        $response = $this->get(route('admin.requests.index'))->assertOk();

        foreach (AccessRequestController::TERMS as $value => $term) {
            $response->assertSee('value="'.$value.'"', false)
                ->assertSee($term['label']);
        }

        // Nothing here may grant a plan that never ends — that was the old
        // behaviour and the reason the term is enforced at all.
        // Nothing preselected either: the admin must pick the term and
        // whether it was paid, so neither can be left on a wrong default.
        $response->assertSee('<option value="" disabled selected>Term…</option>', false)
            ->assertSee('<option value="" disabled selected>Paid?</option>', false)
            ->assertDontSee('No end date');
    });

    it('offers no approve button for an enquiry with no account', function () {
        $entry = WaitlistEntry::create([
            'email' => 'network@example.com',
            'plan' => 'custom',
            'social' => '@network',
        ]);

        $this->get(route('admin.requests.index'))
            ->assertOk()
            ->assertDontSee(route('admin.requests.approve', $entry))
            ->assertSee(route('admin.requests.dismiss', $entry));
    });
});

describe('access', function () {
    it('refuses every review action without an admin session', function () {
        $entry = proRequest();

        auth('admin')->logout();

        foreach (['approve', 'dismiss', 'revoke', 'reopen'] as $action) {
            $this->post(route("admin.requests.{$action}", $entry))
                ->assertRedirect(route('admin.login'));
        }

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING)
            ->and($entry->user->fresh()->plan_id)->toBe($this->free->id);
    });
});

describe('renewing', function () {
    it('moves a trial onto a paid term without passing through Free', function () {
        // The usual paid grant: the payment email offers a free week, so the
        // request is already approved by the time the money arrives.
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $trialEnds = $entry->user->fresh()->plan_expires_at;

        $this->travel(3)->days();

        $this->post(route('admin.requests.renew', $entry), renewal($entry, '12-months'))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Added 12 months'));

        $user = $entry->user->fresh();

        // Added to the trial's end date, so the days left on it are kept.
        expect($user->plan_id)->toBe($this->pro->id)
            ->and($user->plan_expires_at->startOfSecond())
            ->toEqual($trialEnds->copy()->addMonthsNoOverflow(12)->startOfSecond())
            ->and($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_APPROVED);

        Notification::assertSentTo($entry->user, ProAccessGranted::class,
            function (ProAccessGranted $notification) use ($entry) {
                $mail = $notification->toMail($entry->user);
                $body = collect([...$mail->introLines, ...$mail->outroLines])->implode(' ');

                return str_contains($body, "Thanks for your payment. We've added 12 months of Pro")
                    && ! str_contains($body, 'free of charge');
            });
    });

    it('starts a lapsed grant from today', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $entry->user->forceFill(['plan_id' => $this->free->id, 'plan_expires_at' => null])->save();

        $this->post(route('admin.requests.renew', $entry), renewal($entry));

        expect($entry->user->fresh()->plan_id)->toBe($this->pro->id)
            ->and($entry->user->fresh()->plan_expires_at->startOfSecond())
            ->toEqual(now()->addMonthNoOverflow()->startOfSecond());
    });

    it('only renews an approved request', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.renew', $entry), renewal($entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Only an approved request'));

        expect($entry->user->fresh()->plan_id)->toBe($this->free->id);
        Notification::assertNothingSent();
    });

    it('offers Renew on an approved row', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());

        $this->get(route('admin.requests.index', ['status' => 'approved']))
            ->assertOk()
            ->assertSee(route('admin.requests.renew', $entry));
    });

    it('adds a term once when the form is submitted twice', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $form = renewal($entry, '12-months');

        $this->post(route('admin.requests.renew', $entry), $form);
        $endsAt = $entry->user->fresh()->plan_expires_at;

        $this->post(route('admin.requests.renew', $entry), $form)
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'changed since this page loaded'));

        expect($entry->user->fresh()->plan_expires_at)->toEqual($endsAt);
        // The trial approval and one renewal.
        Notification::assertSentToTimes($entry->user, ProAccessGranted::class, 2);
    });

    it('does not put a revoked account back on the plan from a stale page', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $form = renewal($entry);

        $this->post(route('admin.requests.revoke', $entry));

        $this->post(route('admin.requests.renew', $entry), $form)
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Only an approved request'));

        expect($entry->user->fresh()->plan_id)->toBe($this->free->id)
            ->and($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
    });

    it('tells a lapsed account its plan is back rather than re-approving the request', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        // plans:expire ran.
        $entry->user->forceFill(['plan_id' => $this->free->id, 'plan_expires_at' => null])->save();

        $this->post(route('admin.requests.renew', $entry), renewal($entry, '2-weeks', paid: false));

        Notification::assertSentTo($entry->user, ProAccessGranted::class, function (ProAccessGranted $notification) use ($entry) {
            $mail = implode(' ', $notification->toMail($entry->user)->introLines);
            $bell = data_get($notification->toDatabase($entry->user), 'body');

            return str_contains($mail, 'Your Pro is back on')
                && ! str_contains($mail, 'Your request is approved')
                && str_starts_with($bell, 'Your Pro is back on');
        });
    });

    it('refuses to replace a plan that was set by hand since the grant', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry), trialGrant());
        $custom = Plan::factory()->create(['slug' => 'custom-deal', 'name' => 'Custom Deal']);
        $entry->user->forceFill(['plan_id' => $custom->id])->save();

        $this->post(route('admin.requests.renew', $entry), renewal($entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Custom Deal'));

        expect($entry->user->fresh()->plan_id)->toBe($custom->id);
    });

    it('keeps the confirm prompt valid JavaScript for an email with an apostrophe', function () {
        // HTML-escaping alone is decoded back to a raw ' before the handler
        // runs, which ended the JS string and skipped the confirm entirely.
        $user = User::factory()->create(['plan_id' => $this->free->id, 'email' => "o'brien@example.com"]);
        $entry = proRequest($user);

        $this->get(route('admin.requests.index'))
            ->assertOk()
            ->assertDontSee("confirm('Put o&#039;brien", false)
            ->assertSee('o\\u0027brien', false);
    });
});
