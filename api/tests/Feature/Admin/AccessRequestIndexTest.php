<?php

use App\Models\Admin;
use App\Models\Station;
use App\Models\User;
use App\Models\WaitlistEntry;

beforeEach(function () {
    test()->withoutVite();

    test()->actingAs(Admin::factory()->create(), 'admin');
});

it('lists access requests with everything the form captured', function () {
    WaitlistEntry::create([
        'email' => 'rae@example.com',
        'plan' => 'pro',
        'social' => '@raeradio',
        'message' => 'I run a weekly show.',
    ]);

    $this->get(route('admin.requests.index'))
        ->assertOk()
        ->assertSee('rae@example.com')
        ->assertSee('pro')
        ->assertSee('@raeradio')
        ->assertSee('I run a weekly show.');
});

it('counts requests and unique emails', function () {
    // (email, plan) is unique, so the same person shows up twice only by
    // requesting two different plans — which still counts as one email.
    WaitlistEntry::create(['email' => 'a@example.com', 'plan' => 'pro', 'social' => '@a']);
    WaitlistEntry::create(['email' => 'a@example.com', 'plan' => 'autodj', 'social' => '@a']);
    WaitlistEntry::create(['email' => 'b@example.com', 'plan' => 'pro', 'social' => '@b']);

    $this->get(route('admin.requests.index'))
        ->assertOk()
        ->assertSee('Unique emails')
        ->assertSeeInOrder(['Requests', '3'])
        ->assertSeeInOrder(['Unique emails', '2']);
});

it('filters by search across email, social and message', function () {
    WaitlistEntry::create(['email' => 'match@example.com', 'plan' => 'pro', 'social' => '@one']);
    WaitlistEntry::create(['email' => 'other@example.com', 'plan' => 'pro', 'social' => '@two']);

    $this->get(route('admin.requests.index', ['search' => 'match']))
        ->assertOk()
        ->assertSee('match@example.com')
        ->assertDontSee('other@example.com');
});

it('filters by plan', function () {
    WaitlistEntry::create(['email' => 'pro@example.com', 'plan' => 'pro', 'social' => '@pro']);
    WaitlistEntry::create(['email' => 'addon@example.com', 'plan' => 'autodj', 'social' => '@addon']);

    $this->get(route('admin.requests.index', ['plan' => 'autodj']))
        ->assertOk()
        ->assertSee('addon@example.com')
        ->assertDontSee('pro@example.com');
});

it('flags a request that was resubmitted after the fact', function () {
    $entry = WaitlistEntry::create(['email' => 'rae@example.com', 'plan' => 'pro', 'social' => '@rae']);
    $entry->forceFill(['updated_at' => $entry->created_at->addHour()])->saveQuietly();

    $this->get(route('admin.requests.index'))
        ->assertOk()
        ->assertSee('resubmitted');
});

it('shows an empty state when nobody has requested access', function () {
    $this->get(route('admin.requests.index'))
        ->assertOk()
        ->assertSee('No access requests yet.');
});

it('is not reachable without an admin session', function () {
    auth('admin')->logout();

    $this->get(route('admin.requests.index'))->assertRedirect(route('admin.login'));
});

it('shows the account behind a Pro request, and none behind a public enquiry', function () {
    // The point of reviewing a Pro request is opening the requester's
    // stations. Without the account on the row there is nothing to open, and
    // the reviewer is back to matching on the email string by hand.
    $user = User::factory()->create(['name' => 'Rae Okonkwo']);
    Station::factory()->for($user)->create();

    WaitlistEntry::create([
        'user_id' => $user->id,
        'email' => $user->email,
        'plan' => 'pro',
        'social' => '@raeradio',
    ]);
    WaitlistEntry::create([
        'email' => 'network@example.com',
        'plan' => 'custom',
        'social' => '@network',
    ]);

    $this->get(route('admin.requests.index'))
        ->assertOk()
        ->assertSee('Rae Okonkwo')
        ->assertSee('1 station')
        // One of the two is grantable; the enquiry has nobody behind it.
        ->assertSeeInOrder(['From accounts', '1']);
});
