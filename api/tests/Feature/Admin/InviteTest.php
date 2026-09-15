<?php

use App\Models\Admin;
use App\Models\EmailSuppression;
use App\Models\Invite;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\InviteOffer;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    test()->withoutVite();
    config()->set('services.frontend_url', 'https://gocast.test');

    $this->admin = Admin::factory()->create(['name' => 'Ada']);
    test()->actingAs($this->admin, 'admin');

    $this->pro = Plan::where('slug', 'pro')->firstOrFail();
});

it('mints a single-use pro invite by default and shows the link', function () {
    $this->post(route('admin.invites.store'), [
        'plan_id' => $this->pro->id,
        'label' => 'DJ Rae',
        'max_uses' => 1,
    ])->assertRedirect(route('admin.invites.index'));

    $invite = Invite::sole();

    expect($invite->plan_id)->toBe($this->pro->id)
        ->and($invite->label)->toBe('DJ Rae')
        ->and($invite->max_uses)->toBe(1)
        ->and($invite->uses)->toBe(0)
        ->and($invite->duration_days)->toBeNull()
        ->and($invite->expires_at)->toBeNull()
        ->and($invite->created_by)->toBe($this->admin->id)
        ->and($invite->code)->toBe('DJ-Rae-GoCast-Pro')
        ->and($invite->url())->toBe('https://gocast.test/auth/register?invite=DJ-Rae-GoCast-Pro');

    // The link is what the admin came for, so it is on the page after the redirect.
    $this->get(route('admin.invites.index'))
        ->assertOk()
        ->assertSee($invite->url());
});

it('records the plan duration and link expiry when given', function () {
    $this->freezeTime();

    $this->post(route('admin.invites.store'), [
        'plan_id' => $this->pro->id,
        'duration_days' => 90,
        'max_uses' => 5,
        'link_expires_in_days' => 7,
    ]);

    $invite = Invite::sole();

    expect($invite->duration_days)->toBe(90)
        ->and($invite->max_uses)->toBe(5)
        ->and($invite->expires_at->startOfSecond()->equalTo(now()->addDays(7)->startOfSecond()))->toBeTrue();
});

it('builds a readable code from the label and plan', function () {
    $this->post(route('admin.invites.store'), [
        'label' => 'DJ Ammar',
        'plan_id' => $this->pro->id,
        'max_uses' => 1,
    ])->assertSessionHasNoErrors();

    expect(Invite::sole()->code)->toBe('DJ-Ammar-GoCast-Pro');
});

it('numbers a second invite for the same name', function () {
    Invite::factory()->create(['code' => 'DJ-Ammar-GoCast-Pro']);

    $this->post(route('admin.invites.store'), ['label' => 'DJ Ammar', 'plan_id' => $this->pro->id, 'max_uses' => 1]);
    $this->post(route('admin.invites.store'), ['label' => 'dj ammar!', 'plan_id' => $this->pro->id, 'max_uses' => 1]);

    expect(Invite::pluck('code')->all())->toBe(['DJ-Ammar-GoCast-Pro', 'DJ-Ammar-GoCast-Pro-2', 'dj-ammar-GoCast-Pro-3']);
});

it('falls back to a random code when there is no label', function () {
    $this->post(route('admin.invites.store'), ['plan_id' => $this->pro->id, 'max_uses' => 1]);
    $this->post(route('admin.invites.store'), ['label' => '!!!', 'plan_id' => $this->pro->id, 'max_uses' => 1]);

    Invite::all()->each(fn (Invite $invite) => expect(strlen($invite->code))->toBe(Invite::CODE_LENGTH));
});

it('uses a typed code instead of a random one', function () {
    $this->post(route('admin.invites.store'), [
        'code' => 'DJRAE-2026',
        'plan_id' => $this->pro->id,
        'max_uses' => 1,
    ])->assertSessionHasNoErrors();

    $invite = Invite::sole();

    expect($invite->code)->toBe('DJRAE-2026')
        ->and($invite->url())->toBe('https://gocast.test/auth/register?invite=DJRAE-2026');

    // And it redeems like any other.
    $this->getJson('/api/invites/DJRAE-2026')->assertOk()->assertJsonPath('data.redeemable', true);
});

it('rejects a typed code that is short, malformed or already taken', function () {
    Invite::factory()->create(['code' => 'TAKEN-ONE']);

    foreach (['short', 'has space', 'taken-one'] as $code) {
        $this->from(route('admin.invites.index'))
            ->post(route('admin.invites.store'), ['code' => $code, 'plan_id' => $this->pro->id, 'max_uses' => 1])
            ->assertSessionHasErrors('code');
    }

    // The collision check is case-insensitive, so `taken-one` above was the
    // same code as TAKEN-ONE and nothing new was minted.
    expect(Invite::count())->toBe(1);
});

it('attributes the mint to the admin in the activity log', function () {
    $this->post(route('admin.invites.store'), ['plan_id' => $this->pro->id, 'max_uses' => 1]);

    $entry = Activity::where('description', 'minted invite')->sole();

    // The activity table stores ids as strings; compare loosely on purpose.
    expect((int) $entry->causer_id)->toBe($this->admin->id)
        ->and((int) $entry->subject_id)->toBe(Invite::sole()->id);
});

it('validates the form', function () {
    $this->from(route('admin.invites.index'))
        ->post(route('admin.invites.store'), ['plan_id' => 999, 'max_uses' => 0])
        ->assertRedirect(route('admin.invites.index'))
        ->assertSessionHasErrors(['plan_id', 'max_uses']);

    expect(Invite::count())->toBe(0);
});

it('lists who redeemed each link', function () {
    $invite = Invite::factory()->create(['label' => 'DJ Rae']);
    $user = User::factory()->create(['plan_id' => $this->pro->id]);
    $user->forceFill(['invite_id' => $invite->id])->save();
    Invite::whereKey($invite->id)->increment('uses');

    $this->get(route('admin.invites.index'))
        ->assertOk()
        ->assertSee('DJ Rae')
        ->assertSee($user->name)
        ->assertSee('1 / 1');
});

it('closes a link so it no longer redeems, keeping the row', function () {
    $invite = Invite::factory()->create();

    $this->post(route('admin.invites.revoke', $invite))->assertRedirect();

    $invite->refresh();

    expect($invite->isRedeemable())->toBeFalse()
        ->and($invite->isExpired())->toBeTrue()
        ->and(Invite::count())->toBe(1);

    // And the public side agrees.
    $this->getJson("/api/invites/{$invite->code}")->assertJsonPath('data.redeemable', false);
});

it('refuses the panel to anyone not signed in as an admin', function () {
    auth('admin')->logout();

    $this->get(route('admin.invites.index'))->assertRedirect(route('admin.login'));
    $this->post(route('admin.invites.store'), ['plan_id' => $this->pro->id, 'max_uses' => 1])
        ->assertRedirect(route('admin.login'));

    expect(Invite::count())->toBe(0);
});

it('emails the link when the form carries an address', function () {
    Notification::fake();
    $this->freezeTime();

    $this->post(route('admin.invites.store'), [
        'plan_id' => $this->pro->id,
        'label' => 'DJ Rae',
        'email' => 'rae@example.com',
        'max_uses' => 1,
    ])->assertSessionHasNoErrors();

    $invite = Invite::sole();

    expect($invite->email)->toBe('rae@example.com')
        // startOfSecond: the column has no sub-second precision, so the
        // stored value is the frozen clock truncated.
        ->and($invite->sent_at->equalTo(now()->startOfSecond()))->toBeTrue()
        ->and($invite->wasSent())->toBeTrue();

    // On-demand, not to a User: the recipient has no account yet, which is
    // the whole point of an invite.
    Notification::assertSentOnDemand(
        InviteOffer::class,
        fn (InviteOffer $notification, array $channels, AnonymousNotifiable $notifiable) => $notifiable->routes['mail'] === 'rae@example.com'
            && $channels === ['mail']
    );

    // And the page says so rather than just handing back a link to copy.
    $this->get(route('admin.invites.index'))->assertOk()->assertSee('rae@example.com');
});

it('mints without sending anything when no address is given', function () {
    Notification::fake();

    $this->post(route('admin.invites.store'), ['plan_id' => $this->pro->id, 'max_uses' => 1]);

    $invite = Invite::sole();

    expect($invite->email)->toBeNull()
        ->and($invite->sent_at)->toBeNull()
        ->and($invite->wasSent())->toBeFalse();

    Notification::assertNothingSent();
});

it('sends an existing link to a corrected address', function () {
    Notification::fake();

    $invite = Invite::factory()->create(['email' => 'typo@example.com', 'sent_at' => now()->subDay()]);

    $this->post(route('admin.invites.send', $invite), ['email' => 'right@example.com'])
        ->assertRedirect();

    $invite->refresh();

    // The column is "who it was last sent to", so the corrected address
    // replaces the typo rather than joining it.
    expect($invite->email)->toBe('right@example.com')
        ->and($invite->sent_at->isToday())->toBeTrue();

    Notification::assertSentOnDemand(
        InviteOffer::class,
        fn (InviteOffer $notification, array $channels, AnonymousNotifiable $notifiable) => $notifiable->routes['mail'] === 'right@example.com'
    );
});

it('refuses to email a closed link', function () {
    Notification::fake();

    $invite = Invite::factory()->create(['expires_at' => now()->subHour()]);

    $this->post(route('admin.invites.send', $invite), ['email' => 'rae@example.com'])
        ->assertRedirect();

    expect($invite->refresh()->email)->toBeNull()
        ->and($invite->sent_at)->toBeNull();

    Notification::assertNothingSent();
});

it('validates the address on both the mint form and a resend', function () {
    Notification::fake();

    $invite = Invite::factory()->create();

    $this->from(route('admin.invites.index'))
        ->post(route('admin.invites.store'), ['plan_id' => $this->pro->id, 'max_uses' => 1, 'email' => 'not-an-address'])
        ->assertSessionHasErrors('email');

    // Required here, unlike on the mint form: this route only exists to send.
    $this->from(route('admin.invites.index'))
        ->post(route('admin.invites.send', $invite), [])
        ->assertSessionHasErrors('email');

    expect(Invite::count())->toBe(1);
    Notification::assertNothingSent();
});

it('records who sent an invite in the activity log', function () {
    Notification::fake();

    $this->post(route('admin.invites.store'), [
        'plan_id' => $this->pro->id,
        'email' => 'rae@example.com',
        'max_uses' => 1,
    ]);

    $entry = Activity::where('description', 'sent invite')->sole();

    expect((int) $entry->causer_id)->toBe($this->admin->id)
        ->and((int) $entry->subject_id)->toBe(Invite::sole()->id)
        ->and($entry->properties['email'])->toBe('rae@example.com');
});

it('renders the designed template, with the link, the plan line and the note', function () {
    $invite = Invite::factory()->create([
        'code' => 'DJ-Rae-GoCast-Pro',
        'plan_id' => $this->pro->id,
        'duration_days' => 90,
        'expires_at' => now()->addDays(7),
    ]);

    // Sent for real through the array transport rather than faked, because
    // the thing worth testing is the rendered template — a fake would assert
    // that a class was dispatched and never touch the Blade.
    Notification::route('mail', 'rae@example.com')
        ->notify(new InviteOffer($invite, 'rae@example.com'));

    $message = sentMessage();
    $html = $message->getHtmlBody();
    $text = $message->getTextBody();

    expect($message->getSubject())->toBe('Your GoCast invite');

    // The button, the caption under it, and the deadline — the three things
    // the email promises.
    expect($html)->toContain('https://gocast.test/auth/register?invite=DJ-Rae-GoCast-Pro')
        ->toContain('3 months of Pro, free. No card required.')
        ->toContain('Open until '.now()->addDays(7)->toFormattedDateString())
        ->toContain('Claim your invite');

    // The plain-text half is not optional on cold mail, and it carries the
    // same link.
    expect($text)->toContain('https://gocast.test/auth/register?invite=DJ-Rae-GoCast-Pro')
        ->toContain('3 months of Pro, free. No card required.')
        // Nothing in text/plain may be HTML-escaped: `&amp;` between the
        // unsubscribe URL's query parameters breaks the signature for anyone
        // who copies the line out of a plain-text client.
        ->not->toContain('&amp;');
});

it('greets by name and carries the personal note when the invite has them', function () {
    $invite = Invite::factory()->create([
        'plan_id' => $this->pro->id,
        'recipient_name' => 'Rae',
        'personal_note' => 'Heard your Boiler Room set last week.',
    ]);

    Notification::route('mail', 'rae@example.com')->notify(new InviteOffer($invite, 'rae@example.com'));

    expect(sentMessage()->getHtmlBody())
        ->toContain('Hi Rae,')
        ->toContain('Heard your Boiler Room set last week.');
});

it('says "Hi there" rather than guessing, and claims no term the invite does not carry', function () {
    $invite = Invite::factory()->create([
        'plan_id' => $this->pro->id,
        // A label is NOT a name: this one would read "Hi found on SoundCloud,".
        'label' => 'found on SoundCloud',
        'recipient_name' => null,
        'personal_note' => null,
        'duration_days' => null,
        'expires_at' => null,
    ]);

    Notification::route('mail', 'rae@example.com')->notify(new InviteOffer($invite, 'rae@example.com'));

    $html = sentMessage()->getHtmlBody();

    expect($html)->toContain('Hi there,')
        ->not->toContain('found on SoundCloud')
        ->not->toContain('months of')
        ->not->toContain('Open until')
        // The plan is still named; only the term it does not carry is absent.
        ->toContain('Pro, free. No card required.');
});

it('sets the one-click unsubscribe headers and a signed footer link', function () {
    $invite = Invite::factory()->create(['code' => 'DJ-Rae-GoCast-Pro', 'plan_id' => $this->pro->id]);

    Notification::route('mail', 'rae@example.com')->notify(new InviteOffer($invite, 'rae@example.com'));

    $message = sentMessage();
    $unsubscribe = $message->getHeaders()->get('List-Unsubscribe')->getBodyAsString();

    // What puts Gmail's own unsubscribe button above the message.
    expect($unsubscribe)->toContain('/unsubscribe')
        ->toContain('signature=')
        ->and($message->getHeaders()->get('List-Unsubscribe-Post')->getBodyAsString())
        ->toBe('List-Unsubscribe=One-Click');

    // And the same signed URL is the footer link, addressed to the recipient.
    expect($message->getHtmlBody())->toContain('signature=')
        ->toContain('Unsubscribe');
});

it('marks an unsubscribed address on the page', function () {
    Invite::factory()->create(['email' => 'Gone@Example.com']);
    // Stored in the other casing on purpose: the badge must not depend on it.
    EmailSuppression::record('gone@example.com');

    $this->get(route('admin.invites.index'))->assertOk()->assertSee('unsubscribed');
});

it('never emails an address that unsubscribed, on either route', function () {
    EmailSuppression::record('gone@example.com');

    // Not on the mint form...
    $this->post(route('admin.invites.store'), [
        'plan_id' => $this->pro->id,
        'email' => 'gone@example.com',
        'max_uses' => 1,
    ])->assertSessionHasNoErrors();

    $invite = Invite::sole();

    // The link still exists and still works — the address is what was
    // suppressed, not the invite.
    expect($invite->sent_at)->toBeNull()
        ->and($invite->isRedeemable())->toBeTrue();

    // ...and not on a resend either.
    $this->post(route('admin.invites.send', $invite), ['email' => 'gone@example.com'])
        ->assertRedirect();

    expect($invite->refresh()->sent_at)->toBeNull()
        ->and(sentMessages())->toBeEmpty();
});
