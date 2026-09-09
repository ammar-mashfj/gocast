<?php

use App\Models\Admin;
use App\Models\Invite;
use App\Models\Plan;
use App\Models\User;
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
