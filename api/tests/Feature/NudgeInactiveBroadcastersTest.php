<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Notifications\Bell\BellPayload;
use App\Notifications\InactiveBroadcasterNudge;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * Who the day-7 nudge is allowed to email.
 *
 * This command reaches people who have not asked to hear from us, so being
 * wrong about "inactive" is not a cosmetic bug — it tells an active customer
 * we have not noticed them. It shipped with no coverage at all and promptly
 * emailed Pro accounts running AutoDJ, so the eligibility rule is pinned here
 * rather than left to the query.
 *
 * What is NOT asserted, because it is not true yet: that a free account on air
 * with AutoDJ is spared. `stream_sessions` cannot see AutoDJ airtime, and the
 * free plan cannot run AutoDJ, so the plan gate covers the case in practice
 * without the query ever learning to ask the real question.
 */
function nudgeCandidate(array $attributes = []): User
{
    return User::factory()->create([
        // Mid-window, so the 24-hour candidate band can shift either way
        // without these tests turning into a clock puzzle.
        'created_at' => now()->subDays(7)->subHours(12),
        ...$attributes,
    ]);
}

function paidPlanId(): int
{
    return (int) Plan::query()->where('slug', 'pro')->value('id');
}

beforeEach(function () {
    Notification::fake();
});

it('nudges a verified free account that signed up a week ago and never broadcast', function () {
    $user = nudgeCandidate();

    $this->artisan('app:nudge-inactive-broadcasters')->assertSuccessful();

    Notification::assertSentTo($user, InactiveBroadcasterNudge::class);
});

it('leaves paid accounts alone', function () {
    // The reason this gate exists. Getting onto a paid plan means an admin
    // approved an access request or an invite was redeemed — the account has
    // already met a human, and the email's "we wanted to check in" is written
    // for a stranger. It is also the only account that can run AutoDJ, which
    // is airtime this command is structurally unable to see.
    nudgeCandidate(['plan_id' => paidPlanId()]);

    $this->artisan('app:nudge-inactive-broadcasters')->assertSuccessful();

    Notification::assertNothingSent();
});

it('skips a free account that has completed a broadcast', function () {
    $user = nudgeCandidate();
    $station = Station::factory()->for($user, 'user')->create();

    StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subDays(2),
        'ended_at' => now()->subDays(2)->addHour(),
    ]);

    $this->artisan('app:nudge-inactive-broadcasters')->assertSuccessful();

    Notification::assertNothingSent();
});

it('skips a free account whose only broadcast was on a station it has since deleted', function () {
    // Station soft-deletes, so the broadcast is still on record — and a person
    // who went live once and then tore the station down has done the thing
    // this email is asking them to try.
    $user = nudgeCandidate();
    $station = Station::factory()->for($user, 'user')->create();

    StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subDays(3),
        'ended_at' => now()->subDays(3)->addHour(),
    ]);

    $station->delete();

    $this->artisan('app:nudge-inactive-broadcasters')->assertSuccessful();

    Notification::assertNothingSent();
});

it('skips an account that was already nudged', function () {
    // The guard the whole design leans on: a second nudge is worse than none,
    // and the only thing standing between the two is a row in `notifications`.
    $user = nudgeCandidate();

    $user->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => InactiveBroadcasterNudge::class,
        'data' => (new BellPayload(title: 'Ready for your first broadcast?'))->toArray(),
        'read_at' => null,
    ]);

    $this->artisan('app:nudge-inactive-broadcasters')->assertSuccessful();

    Notification::assertNothingSent();
});

it('skips accounts with an unverified email', function () {
    nudgeCandidate(['email_verified_at' => null]);

    $this->artisan('app:nudge-inactive-broadcasters')->assertSuccessful();

    Notification::assertNothingSent();
});

it('sends nothing on a dry run', function () {
    $user = nudgeCandidate();

    $this->artisan('app:nudge-inactive-broadcasters --dry-run')
        ->expectsOutputToContain($user->email)
        ->assertSuccessful();

    Notification::assertNothingSent();
});
