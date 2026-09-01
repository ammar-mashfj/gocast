<?php

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

describe('approving', function () {
    it('moves the account onto the plan it asked for', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry))->assertRedirect();

        expect($entry->user->fresh()->plan_id)->toBe($this->pro->id);
    });

    it('unlocks the entitlements the plan actually carries', function () {
        // AutoDJ and the listener cap are the two things that genuinely differ
        // between free and Pro today, and both are read from the plan at
        // request time rather than copied onto the user.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry));

        $plan = $entry->user->fresh()->plan;

        expect($plan->autodj_enabled)->toBeTrue()
            ->and($plan->max_listeners)->toBe(500);
    });

    it('carries the plan through to the watermark flag', function () {
        // Inert in practice — no clips are installed, so nothing is mixed into
        // anyone's audio on any plan. Kept because it is the one assertion that
        // the plan change reaches User::watermarked(), which is what both
        // LiquidsoapSupervisor and StationResource consult if clips ever land.
        $entry = proRequest();
        Station::factory()->for($entry->user)->create();

        expect($entry->user->watermarked())->toBeTrue();

        $this->post(route('admin.requests.approve', $entry));

        expect($entry->user->fresh()->watermarked())->toBeFalse();
    });

    it('emails only what the plan really gives them', function () {
        // The stale `max_stations` column reads 5 on Pro while the product is
        // one station per user, and the watermark is inert. Promising either
        // in the grant email is a promise the app will not keep.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry));

        Notification::assertSentTo($entry->user, ProAccessGranted::class,
            function (ProAccessGranted $notification) use ($entry) {
                $mail = $notification->toMail($entry->user);
                $body = collect([...$mail->introLines, ...$mail->outroLines])->implode(' ');

                expect($body)->toContain('500 listeners')
                    ->and($body)->toContain('AutoDJ')
                    ->and($body)->not->toContain('watermark')
                    ->and($body)->not->toContain('5 stations');

                return true;
            });
    });

    it('records who decided and when', function () {
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry));

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

        $this->post(route('admin.requests.approve', $entry));

        Notification::assertSentTo($entry->user, ProAccessGranted::class);
    });

    it('refuses an enquiry with no account behind it', function () {
        $entry = WaitlistEntry::create([
            'email' => 'network@example.com',
            'plan' => 'custom',
            'social' => '@network',
        ]);

        $this->post(route('admin.requests.approve', $entry))
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

        $this->post(route('admin.requests.approve', $entry))
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

        $this->post(route('admin.requests.approve', $entry->fresh()))
            ->assertRedirect()
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'deleted'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_PENDING);
    });

    it('does not grant or email twice when approved again', function () {
        // Two admins with the queue open. The second click must not re-stamp
        // the decision with the wrong name, or send a second email.
        $entry = proRequest();

        $this->post(route('admin.requests.approve', $entry));

        $second = Admin::factory()->create(['name' => 'Grace Second']);

        $this->actingAs($second, 'admin')
            ->post(route('admin.requests.approve', $entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'already settled'));

        expect($entry->fresh()->reviewed_by)->toBe($this->admin->id);

        Notification::assertSentToTimes($entry->user, ProAccessGranted::class, 1);
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
        $this->post(route('admin.requests.approve', $entry));

        $this->post(route('admin.requests.dismiss', $entry))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Revoke it instead'));

        expect($entry->fresh()->status)->toBe(WaitlistEntry::STATUS_APPROVED);
    });
});

describe('revoking', function () {
    it('moves the account back to free and reopens the request', function () {
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry));

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

        $this->post(route('admin.requests.approve', $entry));
        $this->post(route('admin.requests.revoke', $entry));

        expect($entry->user->fresh()->plan->autodj_enabled)->toBeFalse();
    });

    it('leaves their station and its tracks alone', function () {
        // The caps are checked on create and on start, never on the way down,
        // so a downgrade never deletes anyone's work. That is deliberate —
        // see the controller.
        $entry = proRequest();
        $this->post(route('admin.requests.approve', $entry));

        $station = Station::factory()->for($entry->user)->create();

        $this->post(route('admin.requests.revoke', $entry));

        expect($entry->user->fresh()->stations()->count())->toBe(1)
            ->and($station->fresh())->not->toBeNull();
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
        $this->post(route('admin.requests.approve', $entry));

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
        $this->post(route('admin.requests.approve', $entry));

        $this->get(route('admin.requests.index', ['status' => 'approved']))
            ->assertOk()
            ->assertSee('Ada Reviewer');
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
