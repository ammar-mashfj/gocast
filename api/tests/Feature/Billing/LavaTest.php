<?php

use App\Models\LavaMembership;
use App\Models\LavaPayment;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\LavaMembershipRenewed;
use App\Notifications\PlanRenewalReminder;
use App\Notifications\ProAccessGranted;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\call;

/**
 * lava.top card checkout: the two routes (membership vs pack), the webhook's
 * password, confirming every charge against lava.top's API before granting,
 * once-only grants, renewals, cancellation and refunds. Bodies are shaped like
 * the examples in lava.top's OpenAPI spec.
 */
const LAVA_SECRET = 'test-webhook-password';
const LAVA_MEMBERSHIP_OFFER = '11111111-1111-4111-8111-111111111111';
const LAVA_PACK_OFFER = '22222222-2222-4222-8222-222222222222';

beforeEach(function () {
    config([
        'services.lava.driver' => 'lava',
        'services.lava.api_key' => 'test-api-key',
        'services.lava.webhook_secret' => LAVA_SECRET,
        'services.lava.base_url' => 'https://gate.lava.top',
        'services.lava.membership_offer_id' => LAVA_MEMBERSHIP_OFFER,
        'services.lava.pack_offer_id' => LAVA_PACK_OFFER,
        'services.lava.membership_product' => 'pro-1-month',
        'services.lava.membership_grace_days' => 2,
        'services.frontend_url' => 'https://gocast.test',
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);
    Notification::fake();
    Http::preventStrayRequests();
    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
});

/**
 * Fake gate.lava.top. `$invoices` maps a contract id to what
 * GET /api/v2/invoices/{id} answers.
 *
 * @param  array<string, array<string, mixed>>  $invoices
 */
function fakeLava(array $invoices = [], string $membershipPrice = '20'): void
{
    Http::fake(function (Request $request) use ($invoices, $membershipPrice) {
        $url = $request->url();

        if (str_ends_with($url, '/api/v3/invoice')) {
            return Http::response(['id' => (string) Str::uuid(), 'status' => 'new', 'paymentUrl' => 'https://app.lava.top/pay/abc'], 201);
        }

        if (str_contains($url, '/api/v2/products')) {
            // The live API's shape (products straight in `items`, not the
            // spec's {type, data}), with a yearly price listed first.
            return Http::response(['items' => [
                ['id' => 'p0', 'title' => 'GoCast Pro', 'type' => 'DIGITAL_PRODUCT', 'isDynamicPrice' => true, 'offers' => [
                    ['id' => LAVA_PACK_OFFER, 'prices' => [['amount' => 0, 'currency' => 'USD', 'periodicity' => 'ONE_TIME']]],
                ]],
                ['id' => 'p1', 'title' => 'Subscription gocast', 'type' => 'SUBSCRIPTION', 'offers' => [
                    ['id' => LAVA_MEMBERSHIP_OFFER, 'prices' => [
                        ['amount' => 99, 'currency' => 'USD', 'periodicity' => 'PERIOD_YEAR'],
                        ['amount' => (float) $membershipPrice, 'currency' => 'USD', 'periodicity' => 'MONTHLY'],
                    ]],
                ]],
            ], 'nextPage' => null]);
        }

        if (preg_match('#/api/v2/invoices/([^/?]+)#', $url, $m)) {
            return isset($invoices[$m[1]])
                ? Http::response($invoices[$m[1]])
                : Http::response(['error' => 'not found'], 404);
        }

        if (str_contains($url, '/api/v1/subscriptions')) {
            return Http::response(null, 204);
        }

        return Http::response(['error' => 'unexpected '.$url], 500);
    });
}

/** @return array<string, mixed> */
function lavaInvoice(string $id, float $amount, string $status = 'COMPLETED', ?string $parent = null, string $currency = 'USD'): array
{
    return [
        'id' => $id,
        'status' => $status,
        'type' => $parent ? 'SUBSCRIPTION_RENEWAL' : 'INVOICE',
        'receipt' => ['amount' => $amount, 'currency' => $currency, 'fee' => 1.6],
        'parentInvoice' => $parent ? ['id' => $parent] : null,
    ];
}

/**
 * @param  array<string, mixed>  $body
 * @param  array<string, string>  $headers
 */
function lavaWebhook(array $body, ?array $headers = null): TestResponse
{
    $server = ['CONTENT_TYPE' => 'application/json'];

    foreach ($headers ?? ['X-Api-Key' => LAVA_SECRET] as $name => $value) {
        $server['HTTP_'.strtoupper(str_replace('-', '_', $name))] = $value;
    }

    return call('POST', '/api/webhooks/lava', [], [], [], $server, json_encode($body));
}

/** @return array<string, mixed> */
function paidBody(LavaPayment $payment, string $status = 'completed'): array
{
    return [
        'eventType' => 'payment.success',
        'product' => ['id' => (string) Str::uuid(), 'title' => 'GoCast Pro'],
        'buyer' => ['email' => $payment->email],
        'contractId' => $payment->contract_id,
        'amount' => (float) $payment->amount_usd,
        'currency' => 'USD',
        'timestamp' => now()->toIso8601String(),
        'status' => $status,
        'errorMessage' => '',
    ];
}

function proPlan(): Plan
{
    return Plan::where('slug', 'pro')->firstOrFail();
}

// ── Checkout ────────────────────────────────────────────────────────────

it('sells a 3-month pack through the API-priced product, at our price', function () {
    fakeLava();
    $user = User::factory()->create();

    actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-3-months'])
        ->assertCreated()
        ->assertJsonPath('data.payment_url', 'https://app.lava.top/pay/abc');

    Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/v3/invoice')
        && $request->hasHeader('X-Api-Key', 'test-api-key')
        && $request['offerId'] === LAVA_PACK_OFFER
        && $request['periodicity'] === 'ONE_TIME'
        && (float) $request['amount'] === 52.0
        && $request['currency'] === 'USD'
        && $request['email'] === $user->email
        && $request['paymentProvider'] === 'UNLIMINT'
        && $request['paymentMethod'] === 'CARD'
        && str_starts_with($request['successful_return_url'], 'https://gocast.test/dashboard/settings?lava='));

    $payment = LavaPayment::sole();
    expect($payment->kind)->toBe(LavaPayment::KIND_PACK)
        ->and($payment->amount_usd)->toBe('52.00')
        ->and($payment->contract_id)->not->toBeNull()
        ->and($payment->status)->toBe(LavaPayment::STATUS_NEW);
});

it('leaves out return links lava.top would refuse (not https)', function () {
    fakeLava();
    config(['services.frontend_url' => 'http://localhost:3000']);

    actingAs(User::factory()->create())->postJson('/api/billing/lava/checkout', ['product' => 'pro-3-months'])
        ->assertCreated();

    Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/v3/invoice')
        && ! isset($request['successful_return_url']));
});

it('sends PayPal as the processor when the buyer picks PayPal', function () {
    fakeLava();
    $user = User::factory()->create();

    actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-1-month', 'method' => 'paypal'])
        ->assertCreated();

    Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/v3/invoice')
        && $request['paymentProvider'] === 'PAYPAL'
        && ! isset($request['paymentMethod']));

    expect(LavaPayment::sole()->method)->toBe(LavaPayment::METHOD_PAYPAL);

    // A card attempt afterwards is a new payment, not the PayPal one reopened.
    actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-1-month', 'method' => 'card'])
        ->assertCreated();
    expect(LavaPayment::count())->toBe(2);
});

it('refuses an unknown payment method', function () {
    actingAs(User::factory()->create())->postJson('/api/billing/lava/checkout', ['product' => 'pro-3-months', 'method' => 'pix'])
        ->assertUnprocessable();
});

it('sells the monthly plan as a lava.top membership, priced by lava.top', function () {
    fakeLava();

    actingAs(User::factory()->create())->postJson('/api/billing/lava/checkout', ['product' => 'pro-1-month'])
        ->assertCreated();

    Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/v3/invoice')
        && $request['offerId'] === LAVA_MEMBERSHIP_OFFER
        && $request['periodicity'] === 'MONTHLY'
        && ! isset($request['amount']));

    expect(LavaPayment::sole()->kind)->toBe(LavaPayment::KIND_MEMBERSHIP);
});

it('refuses the monthly plan when lava.top charges a different price than ours', function () {
    fakeLava(membershipPrice: '25');

    actingAs(User::factory()->create())->postJson('/api/billing/lava/checkout', ['product' => 'pro-1-month'])
        ->assertStatus(503);

    expect(LavaPayment::count())->toBe(0);
});

it('refuses a coupon on the monthly plan', function () {
    fakeLava();

    actingAs(User::factory()->create())->postJson('/api/billing/lava/checkout', ['product' => 'pro-1-month', 'code' => 'FOUNDER'])
        ->assertStatus(422);
});

it('refuses a second membership while one still renews', function () {
    fakeLava();
    $user = User::factory()->create();
    LavaMembership::factory()->create(['user_id' => $user->id]);

    actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-1-month'])
        ->assertStatus(409);
});

it('allows a pack while the membership renews', function () {
    fakeLava();
    $user = User::factory()->create();
    LavaMembership::factory()->create(['user_id' => $user->id]);

    actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-12-months'])
        ->assertCreated();
});

it('reopens the waiting payment instead of creating a second one', function () {
    fakeLava();
    $user = User::factory()->create();

    $first = actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-6-months'])->json('data.payment');
    $second = actingAs($user)->postJson('/api/billing/lava/checkout', ['product' => 'pro-6-months'])->json('data.payment');

    expect($second)->toBe($first)->and(LavaPayment::count())->toBe(1);
});

it('refuses checkout until lava.top is configured', function () {
    config(['services.lava.webhook_secret' => null]);

    actingAs(User::factory()->create())->postJson('/api/billing/lava/checkout', ['product' => 'pro-3-months'])
        ->assertStatus(503);

    actingAs(User::factory()->create())->getJson('/api/billing/lava')
        ->assertJsonPath('data.enabled', false);
});

it('shows a payment only to its buyer', function () {
    $payment = LavaPayment::factory()->create();

    actingAs(User::factory()->create())->getJson("/api/billing/lava/payments/{$payment->uuid}")->assertNotFound();
    actingAs($payment->user)->getJson("/api/billing/lava/payments/{$payment->uuid}")
        ->assertOk()
        ->assertJsonPath('data.state', 'pending');
});

// ── Webhook password ───────────────────────────────────────────────────

it('rejects a webhook without the password', function () {
    $payment = LavaPayment::factory()->create();

    lavaWebhook(paidBody($payment), ['X-Api-Key' => 'wrong'])->assertUnauthorized();
    lavaWebhook(paidBody($payment), [])->assertUnauthorized();

    expect($payment->fresh()->granted_at)->toBeNull();
});

it('accepts the password as Basic auth too', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);

    lavaWebhook(paidBody($payment), ['Authorization' => 'Basic '.base64_encode('lava:'.LAVA_SECRET)])->assertOk();

    expect($payment->fresh()->granted_at)->not->toBeNull();
});

// ── Packs ──────────────────────────────────────────────────────────────

it('grants a pack once lava.top confirms the charge, and only once', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);

    lavaWebhook(paidBody($payment))->assertOk();
    lavaWebhook(paidBody($payment))->assertOk();

    $user = $payment->user->fresh();
    $fresh = $payment->fresh();

    expect($user->plan_id)->toBe(proPlan()->id)
        ->and($user->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(3)->toDateString())
        ->and($fresh->status)->toBe(LavaPayment::STATUS_PAID)
        ->and($fresh->granted_until->toDateString())->toBe($user->plan_expires_at->toDateString());

    Notification::assertSentToTimes($user, ProAccessGranted::class, 1);
});

it('does not grant when lava.top says the charge failed', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52, 'FAILED')]);

    lavaWebhook(paidBody($payment))->assertOk();

    expect($payment->fresh()->granted_at)->toBeNull()
        ->and($payment->fresh()->status)->toBe(LavaPayment::STATUS_REVIEW)
        ->and($payment->user->fresh()->plan_expires_at)->toBeNull();
});

it('does not grant when lava.top charged a different amount', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 1)]);

    lavaWebhook(paidBody($payment))->assertOk();

    expect($payment->fresh()->granted_at)->toBeNull()
        ->and($payment->fresh()->review_reason)->toContain('$52.00');
});

it('asks lava.top to retry while its API still reports the charge in progress', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52, 'IN_PROGRESS')]);

    lavaWebhook(paidBody($payment))->assertStatus(503);

    expect($payment->fresh()->granted_at)->toBeNull()
        ->and($payment->fresh()->status)->toBe(LavaPayment::STATUS_NEW);
});

it('acknowledges a payment it did not start, and grants nothing', function () {
    fakeLava();
    $orphan = LavaPayment::factory()->make(['contract_id' => (string) Str::uuid(), 'email' => 'someone@example.com']);

    lavaWebhook(paidBody($orphan))->assertOk();

    Http::assertSent(fn (Request $request) => str_contains($request->url(), 'api.telegram.org'));
});

it('adds a pack to the end of a running term', function () {
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => now()->addDays(10)]);
    $payment = LavaPayment::factory()->create(['user_id' => $user->id]);
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);

    lavaWebhook(paidBody($payment))->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())
        ->toBe(now()->addDays(10)->addMonthsNoOverflow(3)->toDateString());
});

it('marks a failed attempt, and still grants when the buyer then pays', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);

    lavaWebhook(['eventType' => 'payment.failed', 'contractId' => $payment->contract_id, 'errorMessage' => 'Not sufficient funds'])->assertOk();
    expect($payment->fresh()->status)->toBe(LavaPayment::STATUS_FAILED);

    lavaWebhook(paidBody($payment))->assertOk();
    expect($payment->fresh()->granted_at)->not->toBeNull();
});

// ── Membership ─────────────────────────────────────────────────────────

it('grants a month plus the grace days on the first membership payment', function () {
    $payment = LavaPayment::factory()->membership()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 20)]);

    lavaWebhook(paidBody($payment, 'subscription-active'))->assertOk();

    $user = $payment->user->fresh();
    $membership = LavaMembership::sole();

    expect($user->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(1)->addDays(2)->toDateString())
        ->and($membership->contract_id)->toBe($payment->contract_id)
        ->and($membership->user_id)->toBe($user->id)
        ->and($membership->isActive())->toBeTrue()
        ->and($payment->fresh()->lava_membership_id)->toBe($membership->id);

    Notification::assertSentTo($user, ProAccessGranted::class);
});

it('adds a month on each renewal, once per charge', function () {
    $first = LavaPayment::factory()->membership()->create();
    $renewalId = (string) Str::uuid();
    fakeLava([
        $first->contract_id => lavaInvoice($first->contract_id, 20),
        $renewalId => lavaInvoice($renewalId, 20, parent: $first->contract_id),
    ]);

    lavaWebhook(paidBody($first, 'subscription-active'))->assertOk();
    $afterFirst = $first->user->fresh()->plan_expires_at;

    $renewal = [
        'eventType' => 'subscription.recurring.payment.success',
        'product' => ['id' => (string) Str::uuid(), 'title' => 'GoCast Pro monthly'],
        'buyer' => ['email' => $first->email],
        'contractId' => $renewalId,
        'parentContractId' => $first->contract_id,
        'amount' => 20,
        'currency' => 'USD',
        'status' => 'subscription-active',
    ];

    lavaWebhook($renewal)->assertOk();
    lavaWebhook($renewal)->assertOk();

    $user = $first->user->fresh();
    $row = LavaPayment::where('contract_id', $renewalId)->sole();

    expect($user->plan_expires_at->toDateString())->toBe($afterFirst->copy()->addMonthsNoOverflow(1)->toDateString())
        ->and($row->kind)->toBe(LavaPayment::KIND_RENEWAL)
        ->and($row->amount_usd)->toBe('20.00')
        ->and($row->lava_membership_id)->toBe(LavaMembership::sole()->id);

    Notification::assertSentToTimes($user, LavaMembershipRenewed::class, 1);
});

it('leaves Pro on when the membership is cancelled', function () {
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => now()->addDays(20)]);
    $membership = LavaMembership::factory()->create(['user_id' => $user->id]);

    lavaWebhook([
        'eventType' => 'subscription.cancelled',
        'contractId' => $membership->contract_id,
        'cancelledAt' => now()->toIso8601String(),
        'willExpireAt' => now()->addDays(18)->toIso8601String(),
    ])->assertOk();

    expect($membership->fresh()->status)->toBe(LavaMembership::STATUS_CANCELLED)
        ->and($membership->fresh()->ends_at)->not->toBeNull()
        ->and($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addDays(20)->toDateString());
});

it('turns auto-renew off from the Account page', function () {
    fakeLava();
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => now()->addDays(20)]);
    $membership = LavaMembership::factory()->create(['user_id' => $user->id]);

    actingAs($user)->postJson('/api/billing/lava/membership/cancel')
        ->assertOk()
        ->assertJsonPath('data.renews', false);

    Http::assertSent(fn (Request $request) => $request->method() === 'DELETE'
        && str_contains($request->url(), '/api/v1/subscriptions?')
        && str_contains($request->url(), 'contractId='.$membership->contract_id));

    expect($membership->fresh()->status)->toBe(LavaMembership::STATUS_CANCELLED);

    actingAs($user)->getJson('/api/billing/lava')
        ->assertJsonPath('data.membership.renews', false);
});

// ── Refunds and chargebacks ───────────────────────────────────────────

it('flags a refund without taking Pro away', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);
    lavaWebhook(paidBody($payment))->assertOk();
    $until = $payment->user->fresh()->plan_expires_at;

    lavaWebhook([
        'event_id' => (string) Str::uuid(),
        'event_type' => 'refund.success',
        'created_at' => now()->toIso8601String(),
        'data' => [
            'refund_id' => (string) Str::uuid(),
            'parent_invoice_id' => $payment->contract_id,
            'refund_type' => 'full',
            'amount' => 52,
            'currency' => 'USD',
            'customer_email' => $payment->email,
            'subscription_cancelled' => false,
        ],
    ])->assertOk();

    expect($payment->fresh()->status)->toBe(LavaPayment::STATUS_REFUNDED)
        ->and($payment->user->fresh()->plan_expires_at->equalTo($until))->toBeTrue();
});

it('flags a chargeback', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);
    lavaWebhook(paidBody($payment))->assertOk();

    lavaWebhook([
        'event_type' => 'chargeback.initiated',
        'data' => ['parent_invoice_id' => $payment->contract_id, 'amount' => 52, 'currency' => 'USD', 'customer_email' => $payment->email],
    ])->assertOk();

    expect($payment->fresh()->status)->toBe(LavaPayment::STATUS_CHARGEBACK);
});

// ── Renewal reminders ─────────────────────────────────────────────────

it('reminds a card pack buyer before the term ends', function () {
    $until = now()->addDays(5)->startOfSecond();
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => $until]);
    $payment = LavaPayment::factory()->create([
        'user_id' => $user->id,
        'status' => LavaPayment::STATUS_PAID,
        'granted_at' => now()->subDays(80),
        'granted_until' => $until,
    ]);

    $this->artisan('billing:remind-renewals')->assertSuccessful();

    Notification::assertSentTo($user, PlanRenewalReminder::class);
    expect($payment->fresh()->reminded_7d_at)->not->toBeNull();
});

it('does not remind while the monthly membership still renews', function () {
    $until = now()->addDays(2)->startOfSecond();
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => $until]);
    $membership = LavaMembership::factory()->create(['user_id' => $user->id]);
    LavaPayment::factory()->membership()->create([
        'user_id' => $user->id,
        'lava_membership_id' => $membership->id,
        'status' => LavaPayment::STATUS_PAID,
        'granted_at' => now()->subDays(28),
        'granted_until' => $until,
    ]);

    $this->artisan('billing:remind-renewals')->assertSuccessful();

    Notification::assertNothingSentTo($user);
});

// ── Review fixes ──────────────────────────────────────────────────────

it('grants a second paid membership but alerts that the account now has two', function () {
    $user = User::factory()->create();
    $first = LavaPayment::factory()->membership()->create(['user_id' => $user->id]);
    $second = LavaPayment::factory()->membership()->create(['user_id' => $user->id]);
    fakeLava([
        $first->contract_id => lavaInvoice($first->contract_id, 20),
        $second->contract_id => lavaInvoice($second->contract_id, 20),
    ]);

    lavaWebhook(paidBody($first, 'subscription-active'))->assertOk();
    lavaWebhook(paidBody($second, 'subscription-active'))->assertOk();

    expect($second->fresh()->granted_at)->not->toBeNull()
        ->and(LavaMembership::where('user_id', $user->id)->where('status', LavaMembership::STATUS_ACTIVE)->count())->toBe(2);

    Http::assertSent(fn (Request $request) => str_contains($request->url(), 'api.telegram.org')
        && str_contains((string) $request['text'], 'Two monthly plans'));
});

it('keeps a refund when lava.top later repeats the payment-success notice', function () {
    $payment = LavaPayment::factory()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 1)]);

    // Flagged: the amount did not match, so nothing was granted.
    lavaWebhook(paidBody($payment))->assertOk();
    expect($payment->fresh()->status)->toBe(LavaPayment::STATUS_REVIEW);

    lavaWebhook(['event_type' => 'refund.success', 'data' => ['parent_invoice_id' => $payment->contract_id, 'amount' => 52]])->assertOk();

    // Even with lava.top now reporting the charge as paid in full.
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 52)]);
    lavaWebhook(paidBody($payment))->assertOk();

    expect($payment->fresh()->status)->toBe(LavaPayment::STATUS_REFUNDED)
        ->and($payment->fresh()->granted_at)->toBeNull()
        ->and($payment->user->fresh()->plan_expires_at)->toBeNull();
});

it('adds no grace days when the membership extends time already paid for', function () {
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => now()->addDays(60)]);
    $payment = LavaPayment::factory()->membership()->create(['user_id' => $user->id]);
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 20)]);

    lavaWebhook(paidBody($payment, 'subscription-active'))->assertOk();

    expect($user->fresh()->plan_expires_at->toDateString())
        ->toBe(now()->addDays(60)->addMonthsNoOverflow(1)->toDateString());
});

it('records the end date when lava.top confirms a cancellation made on the Account page', function () {
    fakeLava();
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => now()->addDays(20)]);
    $membership = LavaMembership::factory()->create(['user_id' => $user->id]);

    actingAs($user)->postJson('/api/billing/lava/membership/cancel')->assertOk();

    lavaWebhook([
        'eventType' => 'subscription.cancelled',
        'contractId' => $membership->contract_id,
        'cancelledAt' => now()->toIso8601String(),
        'willExpireAt' => now()->addDays(18)->toIso8601String(),
    ])->assertOk();

    expect($membership->fresh()->status)->toBe(LavaMembership::STATUS_CANCELLED)
        ->and($membership->fresh()->ends_at?->toDateString())->toBe(now()->addDays(18)->toDateString());
});

// ── Review round 2 ────────────────────────────────────────────────────

it('cancels the monthly plan when the account is deleted', function () {
    fakeLava();
    $user = User::factory()->create();
    $membership = LavaMembership::factory()->create(['user_id' => $user->id]);

    actingAs($user)->deleteJson('/api/account', ['confirmation' => $user->email])->assertOk();

    Http::assertSent(fn (Request $request) => $request->method() === 'DELETE'
        && str_contains($request->url(), 'contractId='.$membership->contract_id));
    expect($membership->fresh()->status)->toBe(LavaMembership::STATUS_CANCELLED);
});

it('still deletes the account when lava.top is unreachable, and alerts the admin', function () {
    Http::fake(['gate.lava.top/*' => Http::response(['error' => 'down'], 500)]);
    $user = User::factory()->create();
    $membership = LavaMembership::factory()->create(['user_id' => $user->id]);

    actingAs($user)->deleteJson('/api/account', ['confirmation' => $user->email])->assertOk();

    expect(User::withTrashed()->find($user->id)->trashed())->toBeTrue()
        ->and($membership->fresh()->status)->toBe(LavaMembership::STATUS_ACTIVE);
    Http::assertSent(fn (Request $request) => str_contains($request->url(), 'api.telegram.org')
        && str_contains((string) $request['text'], 'Deleted account still has a monthly plan'));
});

it('turns auto-renew off on every membership, and says it renews while any is active', function () {
    fakeLava();
    $user = User::factory()->create(['plan_id' => proPlan()->id, 'plan_expires_at' => now()->addDays(20)]);
    $a = LavaMembership::factory()->create(['user_id' => $user->id]);
    $b = LavaMembership::factory()->create(['user_id' => $user->id]);
    $b->forceFill(['status' => LavaMembership::STATUS_CANCELLED])->save();

    // The newest is cancelled, the older one still charges.
    actingAs($user)->getJson('/api/billing/lava')->assertJsonPath('data.membership.renews', true);

    $b->forceFill(['status' => LavaMembership::STATUS_ACTIVE])->save();
    actingAs($user)->postJson('/api/billing/lava/membership/cancel')->assertOk();

    expect($a->fresh()->status)->toBe(LavaMembership::STATUS_CANCELLED)
        ->and($b->fresh()->status)->toBe(LavaMembership::STATUS_CANCELLED);
    actingAs($user)->getJson('/api/billing/lava')->assertJsonPath('data.membership.renews', false);
});

it('grants nothing for a renewal that was refunded before its webhook arrived', function () {
    $first = LavaPayment::factory()->membership()->create();
    $renewalId = (string) Str::uuid();
    fakeLava([
        $first->contract_id => lavaInvoice($first->contract_id, 20),
        $renewalId => lavaInvoice($renewalId, 20, parent: $first->contract_id),
    ]);
    lavaWebhook(paidBody($first, 'subscription-active'))->assertOk();
    $until = $first->user->fresh()->plan_expires_at;

    lavaWebhook(['event_type' => 'refund.success', 'data' => ['parent_invoice_id' => $renewalId, 'amount' => 20, 'customer_email' => $first->email]])->assertOk();
    lavaWebhook([
        'eventType' => 'subscription.recurring.payment.success',
        'contractId' => $renewalId,
        'parentContractId' => $first->contract_id,
        'buyer' => ['email' => $first->email],
        'amount' => 20,
        'currency' => 'USD',
    ])->assertOk();

    expect($first->user->fresh()->plan_expires_at->equalTo($until))->toBeTrue()
        ->and(LavaPayment::where('contract_id', $renewalId)->sole()->status)->toBe(LavaPayment::STATUS_REFUNDED);
});

it('grants a renewal whose row already exists instead of failing on the unique id', function () {
    $first = LavaPayment::factory()->membership()->create();
    $renewalId = (string) Str::uuid();
    fakeLava([
        $first->contract_id => lavaInvoice($first->contract_id, 20),
        $renewalId => lavaInvoice($renewalId, 20, parent: $first->contract_id),
    ]);
    lavaWebhook(paidBody($first, 'subscription-active'))->assertOk();
    $membership = LavaMembership::sole();

    // What the other of two simultaneous deliveries would have inserted.
    LavaPayment::factory()->create([
        'user_id' => $first->user_id,
        'contract_id' => $renewalId,
        'lava_membership_id' => $membership->id,
        'kind' => LavaPayment::KIND_RENEWAL,
        'duration_count' => 1,
        'amount_usd' => 20,
    ]);

    lavaWebhook([
        'eventType' => 'subscription.recurring.payment.success',
        'contractId' => $renewalId,
        'parentContractId' => $first->contract_id,
        'amount' => 20,
        'currency' => 'USD',
    ])->assertOk();

    expect(LavaPayment::where('contract_id', $renewalId)->sole()->granted_at)->not->toBeNull();
});

it('reports the next charge from the last charge, not from a pack on top', function () {
    $payment = LavaPayment::factory()->membership()->create();
    fakeLava([$payment->contract_id => lavaInvoice($payment->contract_id, 20)]);
    lavaWebhook(paidBody($payment, 'subscription-active'))->assertOk();

    $user = $payment->user->fresh();
    $user->forceFill(['plan_expires_at' => $user->plan_expires_at->copy()->addMonths(12)])->save();

    actingAs($user)->getJson('/api/billing/lava')
        ->assertJsonPath('data.membership.renews', true)
        ->assertJsonPath('data.membership.next_charge_at', $payment->fresh()->paid_at->copy()->addMonthNoOverflow()->toIso8601String());
});
