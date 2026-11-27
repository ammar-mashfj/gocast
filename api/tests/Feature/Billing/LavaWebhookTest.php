<?php

use App\Models\LavaSale;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\ProAccessGranted;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\call;

/**
 * /api/webhooks/lava: payments made through the dashboard's lava.top links.
 * Bodies follow the examples in lava.top's OpenAPI document
 * (gate.lava.top/docs/documentation.yaml, PurchaseWebhookLog).
 */
const LAVA_TEST_SECRET = 'test-lava-secret';
const LAVA_SUBSCRIPTION = '3cf32536-429c-473e-8fde-ae3403b35dd7';
const LAVA_PAY_ONCE = '52eb6015-701b-40ec-a45d-f93d93320927';

beforeEach(function () {
    config([
        'services.lava.webhook_secret' => LAVA_TEST_SECRET,
        'services.lava.subscription_product_id' => LAVA_SUBSCRIPTION,
        'services.lava.pay_once_product_id' => LAVA_PAY_ONCE,
        'services.lava.pay_once' => ['52.00' => 3, '96.00' => 6, '160.00' => 12],
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);
    Notification::fake();
    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
});

/**
 * @param  array<string, mixed>  $overrides
 * @param  array<string, string>  $headers
 */
function lavaWebhook(array $overrides = [], ?array $headers = null): TestResponse
{
    $body = json_encode(array_replace_recursive([
        'eventType' => 'payment.success',
        'product' => ['id' => LAVA_PAY_ONCE, 'title' => 'GoCast Pro · Pay once'],
        'buyer' => ['email' => 'buyer@example.com'],
        'contractId' => (string) Str::uuid(),
        'amount' => 52.0,
        'currency' => 'USD',
        'timestamp' => now()->toIso8601String(),
        'status' => 'completed',
        'errorMessage' => '',
    ], $overrides));

    return call('POST', '/api/webhooks/lava', [], [], [], $headers ?? ['CONTENT_TYPE' => 'application/json', 'HTTP_X_API_KEY' => LAVA_TEST_SECRET], $body);
}

function lavaAlerts(string $needle): int
{
    return collect(Http::recorded())
        ->filter(fn ($pair) => str_contains($pair[0]->url(), 'api.telegram.org') && str_contains((string) ($pair[0]['text'] ?? ''), $needle))
        ->count();
}

function proId(): int
{
    return Plan::where('slug', 'pro')->value('id');
}

it('gives a new subscriber one calendar month of Pro, and a day of slack', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0, 'status' => 'subscription-active'])
        ->assertOk()->assertSeeText('ok');

    $user->refresh();
    expect($user->plan_id)->toBe(proId())
        ->and($user->plan_expires_at->toDateString())->toBe(now()->addMonthNoOverflow()->addDay()->toDateString())
        ->and(LavaSale::sole()->granted_until->equalTo($user->plan_expires_at))->toBeTrue();
    Notification::assertSentTo($user, ProAccessGranted::class);
    expect(lavaAlerts('New monthly subscriber'))->toBe(1);
});

it('adds a renewal month after the running one, without emailing', function () {
    $user = User::factory()->onPlan('pro')->create(['email' => 'buyer@example.com', 'plan_expires_at' => now()->addHours(3)]);

    lavaWebhook([
        'eventType' => 'subscription.recurring.payment.success',
        'product' => ['id' => LAVA_SUBSCRIPTION],
        'parentContractId' => (string) Str::uuid(),
        'amount' => 20.0,
        'status' => 'subscription-active',
    ])->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addHours(3)->addMonthNoOverflow()->toDateString());
    Notification::assertNothingSent();
    expect(lavaAlerts('Monthly renewal'))->toBe(1);
});

it('reads the pay-once length off the USD amount', function (float $amount, int $months) {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['amount' => $amount])->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow($months)->toDateString())
        ->and(LavaSale::sole()->months)->toBe($months);
    Notification::assertSentTo($user, ProAccessGranted::class);
})->with([[52.0, 3], [96.0, 6], [160.0, 12]]);

it('keeps the day of slack, without adding another, across renewals', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);
    $first = (string) Str::uuid();

    lavaWebhook(['contractId' => $first, 'product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0]);
    $this->travelTo(now()->addMonthNoOverflow());
    lavaWebhook(['eventType' => 'subscription.recurring.payment.success', 'parentContractId' => $first, 'product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0]);

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addMonthNoOverflow()->addDay()->toDateString());
});

it('gives pay-once time no slack', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['amount' => 52.0]);

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(3)->toDateString());
});

it('adds pay-once time after a running Pro term', function () {
    $user = User::factory()->onPlan('pro')->create(['email' => 'buyer@example.com', 'plan_expires_at' => now()->addDays(10)]);

    lavaWebhook(['amount' => 96.0]);

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addDays(10)->addMonthsNoOverflow(6)->toDateString());
});

it('finds the account by the link’s utm_content before the email', function () {
    $linked = User::factory()->create(['email' => 'dj@example.com']);
    $other = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['clientUtm' => ['utm_content' => (string) $linked->id]])->assertOk();

    expect($linked->fresh()->plan_id)->toBe(proId())
        ->and($other->fresh()->plan_id)->not->toBe(proId());
});

it('falls back to the email when utm_content names no account', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['clientUtm' => ['utm_content' => '999999']])->assertOk();

    expect($user->fresh()->plan_id)->toBe(proId());
});

it('counts a charge once however many times lava.top retries it', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);
    $contract = (string) Str::uuid();

    lavaWebhook(['contractId' => $contract])->assertOk();
    lavaWebhook(['contractId' => $contract])->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(3)->toDateString())
        ->and(LavaSale::count())->toBe(1);
    Notification::assertSentToTimes($user, ProAccessGranted::class, 1);
});

it('leaves a payment with no matching account to the admin', function () {
    lavaWebhook(['buyer' => ['email' => 'stranger@example.com']])->assertOk();

    expect(LavaSale::sole())->review_reason->toContain('stranger@example.com')->granted_until->toBeNull();
    expect(lavaAlerts('needs you'))->toBe(1);
});

it('leaves another currency or an unknown amount to the admin', function (array $paid) {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook($paid)->assertOk();

    expect($user->fresh()->plan_id)->not->toBe(proId())
        ->and(LavaSale::sole()->review_reason)->toContain('matches none');
    expect(lavaAlerts('needs you'))->toBe(1);
})->with([
    'euros' => [['amount' => 47.38, 'currency' => 'EUR']],
    'an old price' => [['amount' => 40.0]],
]);

it('takes a subscription paid in any currency as one month', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 18.22, 'currency' => 'EUR'])->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addMonthNoOverflow()->addDay()->toDateString());
});

it('leaves a product the dashboard does not sell to the admin', function () {
    User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook(['product' => ['id' => (string) Str::uuid(), 'title' => 'GoCast Pro — 12 Months, Special Offer'], 'amount' => 99.0])->assertOk();

    expect(LavaSale::sole()->review_reason)->toContain("don't sell");
    expect(lavaAlerts('Special Offer'))->toBe(1);
});

it('never turns a permanent Pro into one that ends', function () {
    $user = User::factory()->onPlan('pro')->create(['email' => 'buyer@example.com', 'plan_expires_at' => null]);

    lavaWebhook()->assertOk();

    expect($user->fresh()->plan_expires_at)->toBeNull()
        ->and(LavaSale::sole()->review_reason)->toContain('no end date');
});

it('ignores failures, cancellations and refunds', function (array $event) {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook($event)->assertOk();

    expect(LavaSale::count())->toBe(0)
        ->and($user->fresh()->plan_id)->not->toBe(proId());
})->with([
    [['eventType' => 'payment.failed', 'status' => 'failed']],
    [['eventType' => 'subscription.recurring.payment.failed']],
    [['eventType' => 'subscription.cancelled']],
    [['eventType' => 'refund.success']],
]);

it('accepts the secret as the Basic-auth password', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook([], ['CONTENT_TYPE' => 'application/json', 'PHP_AUTH_USER' => 'lava', 'PHP_AUTH_PW' => LAVA_TEST_SECRET])->assertOk();

    expect($user->fresh()->plan_id)->toBe(proId());
});

it('refuses a wrong or missing secret, and an empty X-Api-Key does not hide Basic auth', function () {
    lavaWebhook([], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_API_KEY' => 'wrong'])->assertUnauthorized();
    lavaWebhook([], ['CONTENT_TYPE' => 'application/json'])->assertUnauthorized();
    lavaWebhook([], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_API_KEY' => '', 'PHP_AUTH_USER' => 'lava', 'PHP_AUTH_PW' => LAVA_TEST_SECRET])->assertOk();

    expect(LavaSale::count())->toBe(1);
});

it('refuses everything while no secret is set', function () {
    config(['services.lava.webhook_secret' => '']);

    lavaWebhook()->assertStatus(503);
});

/*
 * The subscription remembered on the account, and cancelling it.
 */

function subscriber(array $attributes = []): User
{
    return User::factory()->onPlan('pro')->create(array_merge([
        'email' => 'dj@example.com',
        'plan_expires_at' => now()->addDays(12),
        'lava_subscription_contract_id' => 'c5a0cacc-3453-44b0-9532-aa492f1ba191',
        'lava_subscription_email' => 'buyer@example.com',
    ], $attributes));
}

it('remembers the subscription on the account from its first payment, not from a pay-once', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);
    $contract = (string) Str::uuid();

    lavaWebhook(['amount' => 52.0]);
    expect($user->fresh()->lava_subscription_contract_id)->toBeNull();

    lavaWebhook(['contractId' => $contract, 'product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0]);

    expect($user->fresh())
        ->lava_subscription_contract_id->toBe($contract)
        ->lava_subscription_email->toBe('buyer@example.com');
    $this->actingAs($user->fresh())->getJson('/api/user')->assertJsonPath('data.plan.subscribed', true);
});

it('fills a missing subscription in from a renewal’s parent, and never overwrites one', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);
    $parent = (string) Str::uuid();
    $renewal = ['eventType' => 'subscription.recurring.payment.success', 'product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0, 'parentContractId' => $parent];

    lavaWebhook($renewal);
    expect($user->fresh()->lava_subscription_contract_id)->toBe($parent);

    lavaWebhook(array_merge($renewal, ['parentContractId' => (string) Str::uuid()]));
    expect($user->fresh()->lava_subscription_contract_id)->toBe($parent);
});

it('cancels at lava.top, keeps the paid Pro, and says until when', function () {
    $user = subscriber();
    Http::fake(['gate.lava.top/*' => Http::response(null, 204)]);
    config(['services.lava.api_key' => 'test-api-key']);

    $this->actingAs($user)->postJson('/api/billing/subscription/cancel')
        ->assertOk()
        ->assertJsonPath('data.pro_until', $user->plan_expires_at->toJSON());

    Http::assertSent(fn ($request) => $request->method() === 'DELETE'
        && str_starts_with($request->url(), 'https://gate.lava.top/api/v1/subscriptions?')
        && str_contains($request->url(), 'contractId=c5a0cacc-3453-44b0-9532-aa492f1ba191')
        && str_contains($request->url(), 'email=buyer%40example.com')
        && $request->header('X-Api-Key') === ['test-api-key']);

    expect($user->fresh())
        ->lava_subscription_contract_id->toBeNull()
        ->plan_id->toBe(proId())
        ->plan_expires_at->toDateString()->toBe(now()->addDays(12)->toDateString());
    expect(lavaAlerts('subscription cancelled'))->toBe(1);
});

it('keeps the subscription when lava.top refuses or can’t be reached', function (Closure $answer) {
    $user = subscriber();
    Http::fake(['gate.lava.top/*' => $answer]);
    config(['services.lava.api_key' => 'test-api-key']);

    $this->actingAs($user)->postJson('/api/billing/subscription/cancel')
        ->assertStatus(502)
        ->assertJsonStructure(['message']);

    expect($user->fresh()->lava_subscription_contract_id)->not->toBeNull();
})->with([
    'refused' => fn () => fn () => Http::response(['error' => 'nope'], 500),
    'unreachable' => fn () => fn () => throw new ConnectionException('timeout'),
]);

it('refuses to cancel for an account that is not a subscriber', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addMonths(3)]);
    config(['services.lava.api_key' => 'test-api-key']);

    $this->actingAs($user)->postJson('/api/billing/subscription/cancel')->assertStatus(409);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'gate.lava.top'));
});

it('forgets a subscription cancelled on lava.top’s side', function (array $event) {
    $user = subscriber();

    lavaWebhook(array_merge(['eventType' => 'subscription.cancelled', 'product' => ['id' => LAVA_SUBSCRIPTION]], $event))->assertOk();

    expect($user->fresh())
        ->lava_subscription_contract_id->toBeNull()
        ->plan_expires_at->toDateString()->toBe(now()->addDays(12)->toDateString());
})->with([
    'by its contract' => [['contractId' => 'c5a0cacc-3453-44b0-9532-aa492f1ba191', 'buyer' => ['email' => 'someone@else.com']]],
    'by a renewal of it' => [['contractId' => '9b1f3c2e-5d47-4a8e-9f0b-2c6d8e1a7b34', 'parentContractId' => 'c5a0cacc-3453-44b0-9532-aa492f1ba191']],
]);

it('keeps the subscription when lava.top cancels another one bought with the same email', function () {
    $user = subscriber();

    lavaWebhook(['eventType' => 'subscription.cancelled', 'product' => ['id' => LAVA_SUBSCRIPTION], 'contractId' => (string) Str::uuid()])->assertOk();

    expect($user->fresh()->lava_subscription_contract_id)->toBe('c5a0cacc-3453-44b0-9532-aa492f1ba191');
});

it('grants a second subscription, keeps the first for Cancel, and asks the admin to cancel the second', function () {
    $user = subscriber(['plan_expires_at' => now()->addDays(12)]);

    lavaWebhook(['product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0, 'clientUtm' => ['utm_content' => (string) $user->id]])->assertOk();

    expect($user->fresh())
        ->lava_subscription_contract_id->toBe('c5a0cacc-3453-44b0-9532-aa492f1ba191')
        ->plan_expires_at->toDateString()->toBe(now()->addDays(12)->addMonthNoOverflow()->toDateString());
    expect(lavaAlerts('Second lava.top subscription'))->toBe(1);
});

it('remembers a subscription whose charge was flagged, so it can still be cancelled', function () {
    $user = User::factory()->onPlan('pro')->create(['email' => 'buyer@example.com', 'plan_expires_at' => null]);
    $contract = (string) Str::uuid();

    lavaWebhook(['product' => ['id' => LAVA_SUBSCRIPTION], 'amount' => 20.0, 'contractId' => $contract])->assertOk();

    expect(LavaSale::sole()->review_reason)->not->toBeNull()
        ->and($user->fresh()->lava_subscription_contract_id)->toBe($contract);
});

it('flags a renewal of a deleted account’s subscription instead of giving it to a new account with the email', function () {
    $gone = subscriber();
    $gone->delete();
    $newcomer = User::factory()->create(['email' => 'buyer@example.com']);

    lavaWebhook([
        'eventType' => 'subscription.recurring.payment.success',
        'product' => ['id' => LAVA_SUBSCRIPTION],
        'parentContractId' => 'c5a0cacc-3453-44b0-9532-aa492f1ba191',
        'amount' => 20.0,
    ])->assertOk();

    expect($newcomer->fresh())
        ->plan_expires_at->toBeNull()
        ->lava_subscription_contract_id->toBeNull();
    expect(LavaSale::sole()->review_reason)->toContain('deleted');
});

it('answers 200 and keeps the grant when the Pro email can’t be queued', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);
    Notification::shouldReceive('send')->andThrow(new RuntimeException('queue down'));

    lavaWebhook()->assertOk();

    expect($user->fresh()->plan_id)->toBe(proId());
});

it('answers 503 when cancelling isn’t set up', function () {
    $user = subscriber();
    config(['services.lava.api_key' => '']);

    $this->actingAs($user)->postJson('/api/billing/subscription/cancel')->assertStatus(503);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'gate.lava.top'));
});

it('cancels a running subscription when the account is deleted', function () {
    $user = subscriber();
    Http::fake(['gate.lava.top/*' => Http::response(null, 204)]);
    config(['services.lava.api_key' => 'test-api-key']);

    $this->actingAs($user)->deleteJson('/api/account', ['confirmation' => 'dj@example.com'])->assertOk();

    Http::assertSent(fn ($request) => $request->method() === 'DELETE'
        && str_contains($request->url(), 'contractId=c5a0cacc-3453-44b0-9532-aa492f1ba191')
        && str_contains($request->url(), 'email=buyer%40example.com'));
    expect(User::withTrashed()->find($user->id))->trashed()->toBeTrue()->lava_subscription_contract_id->toBeNull();
    expect(lavaAlerts('account deleted'))->toBe(1);
});

it('still deletes the account when lava.top won’t cancel, and asks the admin to', function () {
    $user = subscriber();
    Http::fake(['gate.lava.top/*' => Http::response(['error' => 'down'], 503)]);
    config(['services.lava.api_key' => 'test-api-key']);

    $this->actingAs($user)->deleteJson('/api/account', ['confirmation' => 'dj@example.com'])->assertOk();

    expect(User::withTrashed()->find($user->id)->trashed())->toBeTrue();
    expect(lavaAlerts('Cancel a lava.top subscription by hand'))->toBe(1);
});

it('calls nothing at lava.top when a non-subscriber deletes their account', function () {
    $user = User::factory()->create(['email' => 'dj@example.com']);
    config(['services.lava.api_key' => 'test-api-key']);

    $this->actingAs($user)->deleteJson('/api/account', ['confirmation' => 'dj@example.com'])->assertOk();

    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'gate.lava.top'));
});

it('finds a renewal’s account by its subscription, even after the email changed', function () {
    $user = subscriber(['email' => 'new-address@example.com', 'plan_expires_at' => now()->addHours(3)]);

    lavaWebhook([
        'eventType' => 'subscription.recurring.payment.success',
        'product' => ['id' => LAVA_SUBSCRIPTION],
        'parentContractId' => 'c5a0cacc-3453-44b0-9532-aa492f1ba191',
        'buyer' => ['email' => 'old-address@example.com'],
        'amount' => 20.0,
    ])->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addHours(3)->addMonthNoOverflow()->toDateString())
        ->and(LavaSale::sole()->user_id)->toBe($user->id);
});
