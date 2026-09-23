<?php

use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Notifications\ProAccessGranted;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    test()->withoutVite();

    $this->admin = Admin::factory()->create();
    test()->actingAs($this->admin, 'admin');

    $this->free = Plan::where('slug', 'free')->firstOrFail();
    $this->pro = Plan::where('slug', 'pro')->firstOrFail();

    Notification::fake();
});

function freeStation(): Station
{
    return Station::factory()
        ->for(User::factory()->create(['plan_id' => Plan::where('slug', 'free')->value('id')]))
        ->create(['name' => 'Night Shift']);
}

it('moves the owner onto the plan for the term picked', function () {
    $station = freeStation();

    $this->post(route('admin.stations.upgrade', $station), [
        'plan_id' => $this->pro->id,
        'term' => '1-month',
        'note' => 'You have been pulling a crowd.',
    ])->assertRedirect()->assertSessionHas('status');

    $user = $station->user->fresh();

    expect($user->plan_id)->toBe($this->pro->id)
        ->and($user->plan_expires_at->toDateString())->toBe(now()->addMonthNoOverflow()->toDateString());
});

it('can upgrade with no end date', function () {
    $station = freeStation();

    $this->post(route('admin.stations.upgrade', $station), [
        'plan_id' => $this->pro->id,
        'term' => 'none',
        'note' => 'Welcome aboard.',
    ]);

    $user = $station->user->fresh();

    expect($user->plan_id)->toBe($this->pro->id)
        ->and($user->plan_expires_at)->toBeNull();

    Notification::assertSentTo($user, ProAccessGranted::class, function (ProAccessGranted $notification) use ($user) {
        $mail = $notification->toMail($user);
        $body = collect([...$mail->introLines, ...$mail->outroLines])->implode(' ');

        // No term was granted, so nothing may promise a return to Free.
        expect($mail->subject)->toBe("You're on GoCast {$this->pro->name}")
            ->and($body)->not->toContain('goes back to Free')
            ->and(data_get($notification->toDatabase($user), 'meta.expires_at'))->toBeNull();

        return true;
    });
});

it('opens the email with the admin note instead of a request approval', function () {
    $station = freeStation();

    $this->post(route('admin.stations.upgrade', $station), [
        'plan_id' => $this->pro->id,
        'term' => '3-months',
        'note' => "We noticed Night Shift is getting a lot of listeners.\n\nSo here is Pro, on us.",
    ]);

    Notification::assertSentTo($station->user, ProAccessGranted::class, function (ProAccessGranted $notification) use ($station) {
        $mail = $notification->toMail($station->user);

        expect($mail->introLines[0])->toBe('We noticed Night Shift is getting a lot of listeners.')
            ->and($mail->introLines[1])->toBe('So here is Pro, on us.')
            ->and(implode(' ', $mail->introLines))->not->toContain('request')
            // The length appears once, as a date — not in the subject, and not
            // as "for 3 months" beside the date as well.
            ->and($mail->subject)->toBe("You're on GoCast {$this->pro->name}")
            ->and(implode(' ', $mail->introLines))->not->toContain('3 months')
            ->and(implode(' ', $mail->introLines))->toContain('until **'.now()->addMonthsNoOverflow(3)->toFormattedDateString().'**');

        // The bell carries the same reason, not just the email.
        $bell = $notification->toDatabase($station->user);

        expect($notification->via($station->user))->toContain('database')
            ->and(data_get($bell, 'body'))->toStartWith("We've upgraded your account")
            ->and(data_get($bell, 'action.detail.points.0'))
            ->toBe('We noticed Night Shift is getting a lot of listeners. So here is Pro, on us.');

        return true;
    });
});

it('records who made the upgrade', function () {
    $station = freeStation();

    $this->post(route('admin.stations.upgrade', $station), [
        'plan_id' => $this->pro->id,
        'term' => '1-week',
        'note' => 'Enjoy.',
    ]);

    $log = Activity::where('description', 'upgraded account')->sole();

    expect($log->causer->is($this->admin))->toBeTrue()
        ->and($log->subject->is($station->user))->toBeTrue();
});

it('refuses a blank note out loud', function (string $note) {
    $station = freeStation();

    // Through `status`, not the error bag: the admin layout only renders the
    // flash, so a validation error here would be a silent reload.
    $this->post(route('admin.stations.upgrade', $station), [
        'plan_id' => $this->pro->id,
        'term' => '1-month',
        'note' => $note,
    ])->assertSessionHas('status')->assertSessionHasNoErrors();

    expect($station->user->fresh()->plan_id)->toBe($this->free->id);
    Notification::assertNothingSent();
})->with(['empty' => '', 'only spaces' => '    ']);

it('refuses the free plan and unknown terms', function (string $field, mixed $value) {
    $station = freeStation();

    $this->post(route('admin.stations.upgrade', $station), [
        'plan_id' => $this->pro->id,
        'term' => '1-month',
        'note' => 'Enjoy.',
        $field => $field === 'plan_id' ? Plan::where('slug', 'free')->value('id') : $value,
    ])->assertSessionHas('status');

    expect($station->user->fresh()->plan_id)->toBe($this->free->id);
    Notification::assertNothingSent();
})->with([
    'free plan' => ['plan_id', null],
    'unknown term' => ['term', '10-years'],
]);

it('shows an upgrade dialog on the stations list', function () {
    $station = freeStation();

    $this->get(route('admin.stations.index'))
        ->assertOk()
        // The dialog only ever previews; sending is the preview page's job.
        ->assertSee(route('admin.stations.upgrade.preview', $station))
        ->assertDontSee('action="'.route('admin.stations.upgrade', $station).'"', false)
        ->assertSee('No end date');
});

it('warns before putting an end date on a plan that has none', function () {
    $user = User::factory()->create(['plan_id' => $this->pro->id, 'plan_expires_at' => null]);
    Station::factory()->for($user)->create();

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertSee('with no end date. Anything but', false);
});

it('does not warn for a free account', function () {
    freeStation();

    $this->get(route('admin.stations.index'))
        ->assertOk()
        ->assertDontSee('with no end date. Anything but', false);
});

describe('previewing', function () {
    it('shows the email and the bell without changing or sending anything', function () {
        $station = freeStation();

        $this->post(route('admin.stations.upgrade.preview', $station), [
            'plan_id' => $this->pro->id,
            'term' => '2-months',
            'note' => 'Way to go, Night Shift.',
        ])
            ->assertOk()
            ->assertSee("You're on GoCast {$this->pro->name}")
            ->assertSee('Way to go, Night Shift.')
            ->assertSee(now()->addMonthsNoOverflow(2)->toFormattedDateString())
            // The form carries the previewed values forward to the send.
            ->assertSee('value="2-months" selected', false)
            ->assertSee('action="'.route('admin.stations.upgrade', $station).'"', false);

        expect($station->user->fresh()->plan_id)->toBe($this->free->id);
        Notification::assertNothingSent();
    });

    it('keeps the rendered email inside the frame attribute', function () {
        // render() hands back an HtmlString, which {{ }} would print raw and
        // which would then end the srcdoc attribute at its first quote.
        $station = freeStation();

        $html = $this->post(route('admin.stations.upgrade.preview', $station), [
            'plan_id' => $this->pro->id,
            'term' => '1-month',
            'note' => 'Hello.',
        ])->getContent();

        preg_match('/<iframe srcdoc="([^"]*)"/', $html, $frame);

        expect($frame[1] ?? '')->toContain('&lt;html')->toContain('Hello.');
    });

    it('refuses to the stations list rather than back to a POST-only page', function () {
        $station = freeStation();

        $this->post(route('admin.stations.upgrade.preview', $station), [
            'plan_id' => $this->pro->id,
            'term' => '10-years',
            'note' => 'Hello.',
        ])
            ->assertRedirect(route('admin.stations.index', ['search' => $station->slug]))
            ->assertSessionHas('status');
    });

    it('warns when the preview would put an end date on a permanent plan', function () {
        $user = User::factory()->create(['plan_id' => $this->pro->id, 'plan_expires_at' => null]);
        $station = Station::factory()->for($user)->create();

        $this->post(route('admin.stations.upgrade.preview', $station), [
            'plan_id' => $this->pro->id,
            'term' => '1-month',
            'note' => 'Hello.',
        ])->assertSee('This puts an end date on it');
    });
});
