<?php

use App\Models\Admin;
use App\Models\EmailSuppression;
use App\Notifications\RawEmail;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;

/**
 * The panel's one free-form composer.
 *
 * Everything else that leaves here has its copy in the code and is therefore
 * reviewed once; this is typed into a textarea and sent, and mail does not come
 * back. So what is pinned is the two-step — the compose form must not be able
 * to send anything on its own, and the send must carry exactly what was
 * previewed — together with the three things the admin cannot see for
 * themselves: that one message goes per address rather than one with everybody
 * on it, that the marketing flag governs suppression and the unsubscribe
 * footer together, and that a body of markup is shown rather than rendered.
 */
beforeEach(function () {
    test()->withoutVite();

    $this->admin = Admin::factory()->create(['email' => 'ada@gocast.fm']);
    test()->actingAs($this->admin, 'admin');
});

/** The fields the compose form posts. */
function emailForm(array $overrides = []): array
{
    return [
        'recipients' => 'rae@example.com',
        'subject' => 'About your station',
        'body' => 'Thanks for writing in.',
        ...$overrides,
    ];
}

it('keeps the whole thing behind the admin guard', function () {
    auth('admin')->logout();

    $this->get(route('admin.emails.index'))->assertRedirect(route('admin.login'));
    $this->post(route('admin.emails.preview'), emailForm())->assertRedirect(route('admin.login'));
    $this->post(route('admin.emails.store'), emailForm())->assertRedirect(route('admin.login'));

    expect(sentMessages())->toBeEmpty();
});

it('previews without sending anything', function () {
    Notification::fake();

    $this->post(route('admin.emails.preview'), emailForm([
        'headline' => 'Your station is back on air',
    ]))
        ->assertOk()
        ->assertSee('Your station is back on air', escape: false)
        ->assertSee('rae@example.com');

    Notification::assertNothingSent();
});

it('sends one message per address, so nobody sees the others', function () {
    $this->post(route('admin.emails.store'), emailForm([
        'recipients' => "rae@example.com\ndj@example.com, third@example.com",
    ]))->assertRedirect(route('admin.emails.index'));

    expect(sentMessages())->toHaveCount(3);

    $addresses = sentMessages()
        ->flatMap(fn ($message) => collect($message->getTo())->map->getAddress())
        ->all();

    expect($addresses)->toBe(['rae@example.com', 'dj@example.com', 'third@example.com']);

    // The leak this shape exists to prevent: three messages, one recipient
    // each, and nothing in a copy header either.
    foreach (sentMessages() as $message) {
        expect($message->getTo())->toHaveCount(1)
            ->and($message->getCc())->toBeEmpty()
            ->and($message->getBcc())->toBeEmpty();
    }
});

it('drops a repeated address however it was typed', function () {
    $this->post(route('admin.emails.store'), emailForm([
        'recipients' => 'rae@example.com, Rae@Example.com',
    ]))->assertRedirect(route('admin.emails.index'));

    expect(sentMessages())->toHaveCount(1);
});

it('renders the body as paragraphs, splitting on blank lines and not on wrapping', function () {
    $this->post(route('admin.emails.store'), emailForm([
        'subject' => 'A note',
        'greeting' => 'Hi Rae,',
        'body' => "The container ran out of memory\novernight, which is why it went quiet.\n\nIt is back up.",
        'sign_off' => '— Ada',
    ]))->assertRedirect();

    $message = sentMessage();
    $html = $message->getHtmlBody();

    expect($message->getSubject())->toBe('A note');

    // One paragraph, not two: a single newline is where the admin's textarea
    // wrapped, not where they meant a break.
    expect($html)->toContain('The container ran out of memory overnight, which is why it went quiet.')
        ->toContain('It is back up.')
        ->toContain('Hi Rae,')
        ->toContain('— Ada');

    // The plain-text half is not optional, and says the same things.
    expect($message->getTextBody())
        ->toContain('The container ran out of memory overnight, which is why it went quiet.')
        ->toContain('It is back up.')
        ->toContain('— Ada');
});

it('shows markup in the body rather than rendering it', function () {
    $this->post(route('admin.emails.store'), emailForm([
        'body' => 'Use the <strong>power button</strong> to go live.',
    ]))->assertRedirect();

    // The whole reason the body is not an HTML field: what an admin pastes
    // cannot break the template, and cannot smuggle a link into it either.
    expect(sentMessage()->getHtmlBody())
        ->toContain('&lt;strong&gt;power button&lt;/strong&gt;')
        ->not->toContain('<strong>power button</strong>');
});

it('carries the button only when both halves are given', function () {
    $this->post(route('admin.emails.store'), emailForm([
        'cta_url' => 'https://gocast.fm/dashboard',
        'cta_label' => 'Open your dashboard',
    ]))->assertRedirect();

    expect(sentMessage()->getHtmlBody())
        ->toContain('https://gocast.fm/dashboard')
        ->toContain('Open your dashboard');

    expect(sentMessage()->getTextBody())->toContain('Open your dashboard: https://gocast.fm/dashboard');
});

it('refuses a button with only one half, and sends nothing', function () {
    $this->post(route('admin.emails.preview'), emailForm([
        'cta_url' => 'https://gocast.fm/dashboard',
    ]))->assertSessionHasErrors('cta_label');

    $this->post(route('admin.emails.preview'), emailForm([
        'cta_label' => 'Open your dashboard',
    ]))->assertSessionHasErrors('cta_url');

    expect(sentMessages())->toBeEmpty();
});

it('refuses a path for the button, which a mail client cannot resolve', function () {
    $this->post(route('admin.emails.preview'), emailForm([
        'cta_url' => '/dashboard',
        'cta_label' => 'Open your dashboard',
    ]))->assertSessionHasErrors('cta_url');

    expect(sentMessages())->toBeEmpty();
});

it('refuses a body that is nothing but blank lines', function () {
    // Passes `required` and produces no paragraphs — the one case the rules
    // and the draft disagree about, which is why the controller catches it.
    $this->post(route('admin.emails.preview'), emailForm(['body' => "\n  \n\n"]))
        ->assertSessionHasErrors('body');

    expect(sentMessages())->toBeEmpty();
});

describe('marketing sends', function () {
    it('carries an unsubscribe link, the headers, and skips anyone who opted out', function () {
        EmailSuppression::record('gone@example.com');

        $this->post(route('admin.emails.store'), emailForm([
            'recipients' => 'rae@example.com, Gone@example.com',
            'marketing' => '1',
        ]))
            ->assertRedirect(route('admin.emails.index'))
            ->assertSessionHas('status', fn (string $status) => str_contains($status, 'Queued for rae@example.com')
                && str_contains($status, 'Skipped 1'));

        expect(sentMessages())->toHaveCount(1);

        $message = sentMessage();

        expect($message->getTo()[0]->getAddress())->toBe('rae@example.com')
            ->and($message->getHeaders()->get('List-Unsubscribe'))->not->toBeNull()
            ->and($message->getHeaders()->get('List-Unsubscribe-Post')?->getBodyAsString())
            ->toContain('One-Click');

        expect($message->getHtmlBody())->toContain('Unsubscribe')
            ->toContain(route('unsubscribe', [], false));

        // Nothing in text/plain may be HTML-escaped: `&amp;` between the
        // unsubscribe URL's query parameters breaks the signature for anyone
        // who copies the line out of a plain-text client.
        expect($message->getTextBody())->toContain('Unsubscribe:')
            ->not->toContain('&amp;');
    });

    it('says so plainly when every address on the list has unsubscribed', function () {
        EmailSuppression::record('gone@example.com');

        $this->post(route('admin.emails.store'), emailForm([
            'recipients' => 'gone@example.com',
            'marketing' => '1',
        ]))->assertSessionHas('status', 'Nothing sent — gone@example.com has unsubscribed.');

        expect(sentMessages())->toBeEmpty();
    });

    it('warns about the skipped addresses on the preview, before the button', function () {
        EmailSuppression::record('gone@example.com');

        $this->post(route('admin.emails.preview'), emailForm([
            'recipients' => 'rae@example.com, gone@example.com',
            'marketing' => '1',
        ]))
            ->assertOk()
            ->assertSee('will be skipped', escape: false)
            ->assertSee('gone@example.com');
    });
});

describe('operational sends', function () {
    it('reaches an address on the unsubscribe list and shows it no footer link', function () {
        EmailSuppression::record('gone@example.com');

        // The list governs outreach, not the reply to somebody's own support
        // email. Dropping that silently would be a worse failure than the one
        // the list exists to prevent.
        $this->post(route('admin.emails.store'), emailForm([
            'recipients' => 'gone@example.com',
        ]))->assertRedirect();

        $message = sentMessage();

        expect($message->getTo()[0]->getAddress())->toBe('gone@example.com')
            ->and($message->getHeaders()->get('List-Unsubscribe'))->toBeNull()
            ->and($message->getHtmlBody())->not->toContain('Unsubscribe')
            ->and($message->getTextBody())->not->toContain('Unsubscribe');
    });
});

it('queues the mail rather than sending it inline', function () {
    Notification::fake();

    $this->post(route('admin.emails.store'), emailForm())->assertRedirect();

    Notification::assertSentOnDemand(
        RawEmail::class,
        fn (RawEmail $notification, array $channels, AnonymousNotifiable $notifiable) => $notifiable->routes['mail'] === 'rae@example.com'
    );
});

it('records who sent what, to whom', function () {
    $this->post(route('admin.emails.store'), emailForm([
        'recipients' => 'rae@example.com, dj@example.com',
        'subject' => 'About your station',
    ]))->assertRedirect();

    $entry = Activity::where('description', 'sent email')->sole();

    // The addresses are the point of the entry: the one question asked
    // afterwards is "did this go to them?", which a count cannot answer.
    expect((int) $entry->causer_id)->toBe($this->admin->id)
        ->and($entry->properties['subject'])->toBe('About your station')
        ->and($entry->properties['sent'])->toBe(['rae@example.com', 'dj@example.com'])
        ->and($entry->properties['marketing'])->toBeFalse();

    // The body is not recorded — it is in their inbox, and the activity log is
    // not an archive.
    expect($entry->properties)->not->toHaveKey('body');
});

it('refuses more addresses than the page is for', function () {
    $tooMany = collect(range(1, 101))->map(fn (int $n) => "dj{$n}@example.com")->implode(', ');

    $this->post(route('admin.emails.preview'), emailForm(['recipients' => $tooMany]))
        ->assertSessionHasErrors('recipients');

    expect(sentMessages())->toBeEmpty();
});

it('sends what was previewed, not a second reading of the form', function () {
    $preview = $this->post(route('admin.emails.preview'), emailForm([
        'body' => "First paragraph.\n\nSecond paragraph.",
        'headline' => 'Your station is back on air',
    ]))->assertOk();

    // The hidden inputs on the preview page are the draft, normalised — so
    // posting them back must produce the same email.
    $preview->assertSee('name="subject"', escape: false)
        ->assertSee('name="body"', escape: false)
        ->assertSee('name="headline"', escape: false)
        ->assertSee('name="recipients[]"', escape: false);
});
