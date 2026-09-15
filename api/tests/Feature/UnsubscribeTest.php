<?php

use App\Models\EmailSuppression;
use App\Models\Invite;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\URL;

beforeEach(function () {
    $this->invite = Invite::factory()->create(['code' => 'DJ-Rae-GoCast-Pro']);

    $this->link = URL::signedRoute('unsubscribe', [
        'email' => 'rae@example.com',
        'invite' => 'DJ-Rae-GoCast-Pro',
    ]);
});

it('asks before it unsubscribes anybody', function () {
    // The reason this is two requests: Outlook Safe Links, corporate scanners
    // and preview panes all GET the links in an email. A GET that wrote would
    // opt out people who never clicked.
    $this->get($this->link)
        ->assertOk()
        ->assertSee('rae@example.com')
        ->assertSee('Stop emails to this address?');

    expect(EmailSuppression::count())->toBe(0);
});

it('records the address on the POST and says so', function () {
    $this->post($this->link)
        ->assertOk()
        ->assertSee("You're unsubscribed.", false);

    $suppression = EmailSuppression::sole();

    expect($suppression->email)->toBe('rae@example.com')
        ->and($suppression->reason)->toBe(EmailSuppression::REASON_UNSUBSCRIBED)
        // Which send prompted the no — the admin page's reason for asking.
        ->and($suppression->invite_id)->toBe($this->invite->id);
});

it('answers a one-click unsubscribe with a bare 200', function () {
    // RFC 8058: the mail provider POSTs this body from its own servers and
    // reads nothing but the status code. A redirect or a rendered page here
    // is wasted, and an error is read as the unsubscribe having failed.
    $response = $this->post($this->link, ['List-Unsubscribe' => 'One-Click']);

    $response->assertOk();

    expect($response->getContent())->toBe('')
        ->and(EmailSuppression::suppresses('rae@example.com'))->toBeTrue();
});

it('exempts the one-click POST from CSRF, since no mail provider can have a token', function () {
    // Asserted rather than exercised: Laravel skips CSRF verification under
    // test entirely, so the only way this stays true is a test that reads the
    // configuration in bootstrap/app.php.
    $except = (new ReflectionClass(ValidateCsrfToken::class))->getStaticPropertyValue('neverVerify');

    expect($except)->toContain('unsubscribe');
});

it('refuses an unsigned or edited link', function () {
    // Without the signature the address is just a query parameter, and
    // anybody could unsubscribe anybody.
    $this->get(route('unsubscribe', ['email' => 'rae@example.com']))->assertForbidden();

    // Signed for one address, used for another.
    $this->get($this->link.'&email=someone@example.com')->assertForbidden();

    expect(EmailSuppression::count())->toBe(0);
});

it('treats a second unsubscribe as the same statement', function () {
    // Clients prefetch, people click twice, and providers retry. None of
    // those should 500 or create a second row.
    $this->post($this->link)->assertOk();
    $this->post($this->link)->assertOk();

    expect(EmailSuppression::count())->toBe(1);
});

it('shows the settled page to somebody who opens the link again', function () {
    EmailSuppression::record('rae@example.com');

    $this->get($this->link)
        ->assertOk()
        ->assertSee("You're unsubscribed.", false)
        // And says the thing they would otherwise write in to ask.
        ->assertSee('it still works', false);
});
