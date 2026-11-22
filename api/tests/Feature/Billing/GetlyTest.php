<?php

use App\Models\Admin;
use App\Models\Discount;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\User;
use App\Notifications\ProAccessGranted;
use App\Services\Billing\GetlySignature;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\artisan;
use function Pest\Laravel\call;
use function Pest\Laravel\postJson;

/**
 * Getly: checkout mints a checkout link carrying the payment uuid, the
 * signed webhook grants it once, store-page sales are matched by email,
 * refunds only flag, and reconcile polls links the webhook missed.
 */
const GETLY_TEST_SECRET = 'test-getly-secret';
const GETLY_3M = '99d78a52-055d-41c5-96b0-41e35db858e1';

beforeEach(function () {
    config([
        'services.billing.gateway' => 'getly',
        'services.getly.api_key' => 'test-getly-key',
        'services.getly.webhook_secret' => GETLY_TEST_SECRET,
        'services.getly.base_url' => 'https://getly.test/api/v1',
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);
    Notification::fake();
    Http::fake([
        'api.telegram.org/*' => Http::response(['ok' => true]),
    ]);
});

function fakeGetlyLink(?int $chargesCents = null): void
{
    Http::fake(['getly.test/api/v1/checkout-links' => Http::response(['success' => true, 'data' => array_filter([
        'id' => 'link-1',
        'url' => 'https://www.getly.store/go/link-1',
        'status' => 'open',
        'expiresAt' => now()->addDay()->toIso8601String(),
        'priceCents' => $chargesCents,
    ], fn ($v) => $v !== null)], 201)]);
}

/**
 * @param  array<string, mixed>  $data
 */
function getlyWebhook(string $event, array $data, ?string $secret = GETLY_TEST_SECRET, ?int $at = null, ?string $deliveryId = null): TestResponse
{
    $body = json_encode(['deliveryId' => $deliveryId ?? 'd-'.fake()->uuid(), 'event' => $event, 'data' => $data, 'timestamp' => now()->toIso8601String()]);
    $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_X_GETLY_EVENT' => $event];

    if ($secret !== null) {
        $headers['HTTP_X_GETLY_SIGNATURE_V2'] = GetlySignature::sign($body, $secret, $at ?? time());
    }

    return call('POST', '/api/webhooks/getly', [], [], [], $headers, $body);
}

/**
 * @return array<string, mixed>
 */
function linkSale(Payment $payment, array $overrides = []): array
{
    return array_merge([
        'orderId' => 'order-1',
        'buyerEmail' => 'someone-else@example.com',
        'items' => [['orderItemId' => 'item-1', 'productId' => GETLY_3M, 'price' => 5200, 'sellerAmount' => 4680]],
        'total' => 5200,
        'checkoutLinkId' => $payment->track_id,
        'reference' => $payment->uuid,
    ], $overrides);
}

function getlyPayment(array $attributes = []): Payment
{
    $product = Product::where('slug', 'pro-3-months')->first();

    return Payment::factory()->create(array_merge([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'duration_count' => 3,
        'amount_usd' => 52,
        'list_price_usd' => 52,
        'provider' => 'getly',
        'track_id' => 'link-1',
        'payment_url' => 'https://www.getly.store/go/link-1',
        'status' => Payment::STATUS_NEW,
    ], $attributes));
}

it('mints a Getly checkout link for the chosen term, with the payment uuid as reference', function () {
    fakeGetlyLink(5200);
    actingAs(User::factory()->create());
    $response = postJson('/api/billing/checkout', ['product' => 'pro-3-months'])->assertCreated();

    $payment = Payment::where('uuid', $response->json('data.payment'))->first();

    expect($response->json('data.payment_url'))->toBe('https://www.getly.store/go/link-1')
        ->and($payment->provider)->toBe('getly')
        ->and($payment->track_id)->toBe('link-1')
        ->and($payment->amount_usd)->toBe('52.00');

    Http::assertSent(fn (Request $request) => $request->url() === 'https://getly.test/api/v1/checkout-links'
        && $request['productId'] === GETLY_3M
        && $request['reference'] === $payment->uuid
        && ! isset($request['couponCode'])
        && $request->hasHeader('Authorization', 'Bearer test-getly-key'));
});

function fakeGetlyCoupons(): void
{
    Http::fake(['getly.test/api/v1/coupons*' => Http::response(['success' => true, 'data' => ['items' => [
        ['code' => 'FOUNDER', 'type' => 'fixed', 'value' => 6100, 'valueCents' => 6100, 'minOrderAmountCents' => 15900, 'maxUses' => null, 'usedCount' => 4, 'isActive' => true, 'expiresAt' => null],
        ['code' => 'HALF', 'type' => 'percentage', 'value' => 50, 'minOrderAmountCents' => 0, 'maxUses' => 2, 'usedCount' => 2, 'isActive' => true, 'expiresAt' => null],
        ['code' => 'OLD', 'type' => 'percentage', 'value' => 10, 'minOrderAmountCents' => 0, 'isActive' => true, 'expiresAt' => now()->subDay()->toIso8601String()],
    ], 'nextCursor' => null]])]);
}

it('quotes a coupon from the Getly store, not our discounts table', function () {
    fakeGetlyCoupons();
    actingAs(User::factory()->create());

    postJson('/api/billing/quote', ['product' => 'pro-12-months', 'code' => 'founder'])
        ->assertOk()
        ->assertJsonPath('data.price_usd', '99.00')
        ->assertJsonPath('data.discount.code', 'FOUNDER')
        ->assertJsonPath('data.coupon_error', null);
});

it('refuses Getly coupons below their minimum, used up, expired or unknown', function (string $product, string $code, string $error) {
    fakeGetlyCoupons();
    actingAs(User::factory()->create());

    postJson('/api/billing/quote', ['product' => $product, 'code' => $code])
        ->assertOk()
        ->assertJsonPath('data.coupon_error', $error);
})->with([
    'below minimum' => ['pro-1-month', 'FOUNDER', 'That coupon only works on a longer plan.'],
    'used up' => ['pro-3-months', 'HALF', 'That coupon has already been used.'],
    'expired' => ['pro-3-months', 'OLD', 'That coupon has expired.'],
    'unknown' => ['pro-3-months', 'NOPE', "That coupon isn't valid."],
]);

it('passes the Getly coupon on to the checkout link', function () {
    fakeGetlyCoupons();
    fakeGetlyLink();
    actingAs(User::factory()->create());

    $response = postJson('/api/billing/checkout', ['product' => 'pro-12-months', 'code' => 'FOUNDER'])->assertCreated();
    $payment = Payment::where('uuid', $response->json('data.payment'))->first();

    expect($payment->discount_code)->toBe('FOUNDER')
        ->and($payment->discount_id)->toBeNull()
        ->and($payment->amount_usd)->toBe('99.00');

    Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/checkout-links') && $request['couponCode'] === 'FOUNDER');
});

it('tells the buyer when Getly still refuses their coupon at checkout', function () {
    fakeGetlyCoupons();
    Http::fake(['getly.test/api/v1/checkout-links' => Http::response(['success' => false, 'error' => 'Coupon invalid', 'errorDetail' => ['code' => 'coupon_invalid', 'message' => 'Coupon invalid']], 400)]);

    actingAs(User::factory()->create());
    postJson('/api/billing/checkout', ['product' => 'pro-12-months', 'code' => 'FOUNDER'])
        ->assertStatus(422)
        ->assertJsonPath('message', "That coupon can't be used for this plan. Clear it, or try another.");
});

it('refuses checkout when no Getly key is set', function () {
    config(['services.getly.api_key' => '']);

    actingAs(User::factory()->create());
    postJson('/api/billing/checkout', ['product' => 'pro-3-months'])->assertStatus(503);
});

it('grants Pro from a link sale even when the Getly email differs, once', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment))->assertOk();
    getlyWebhook('checkout_link.completed', ['checkoutLinkId' => 'link-1', 'orderId' => 'order-1', 'reference' => $payment->uuid])->assertOk();

    $payment->refresh();
    $user = $payment->user->fresh();

    expect($payment->status)->toBe('paid')
        ->and($payment->granted_at)->not->toBeNull()
        ->and($payment->payload['getly']['orderId'])->toBe('order-1')
        ->and($user->plan_id)->toBe(Plan::where('slug', 'pro')->value('id'))
        ->and($user->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(3)->toDateString());

    Notification::assertSentToTimes($user, ProAccessGranted::class, 1);
});

it('refuses unsigned, wrongly signed and stale deliveries', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment), secret: null)->assertStatus(401);
    getlyWebhook('sale.completed', linkSale($payment), secret: 'wrong')->assertStatus(401);
    getlyWebhook('sale.completed', linkSale($payment), at: time() - 4 * 86400)->assertStatus(401);

    expect($payment->fresh()->granted_at)->toBeNull();
});

it('refuses everything while the secret is unset', function () {
    config(['services.getly.webhook_secret' => '']);

    getlyWebhook('sale.completed', linkSale(getlyPayment()))->assertStatus(503);
});

it('grants nothing for a link it never made', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment, ['checkoutLinkId' => 'someone-elses-link']))->assertOk();

    expect($payment->fresh()->granted_at)->toBeNull();
});

it('matches a store-page sale to the account by email', function () {
    $user = User::factory()->create(['email' => 'buyer@example.com']);

    getlyWebhook('sale.completed', [
        'orderId' => 'order-9',
        'buyerEmail' => 'Buyer@Example.com',
        'items' => [['orderItemId' => 'item-9', 'productId' => GETLY_3M, 'price' => 5200]],
        'total' => 5200,
    ])->assertOk();

    $payment = Payment::where('track_id', 'order:item-9')->first();

    expect($payment->user_id)->toBe($user->id)
        ->and($payment->provider)->toBe('getly')
        ->and($payment->granted_at)->not->toBeNull()
        ->and($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(3)->toDateString());
});

it('records a store-page sale with no matching account for review', function () {
    getlyWebhook('sale.completed', [
        'orderId' => 'order-10',
        'buyerEmail' => 'nobody@example.com',
        'items' => [['orderItemId' => 'item-10', 'productId' => GETLY_3M, 'price' => 5200]],
    ])->assertOk();

    $payment = Payment::where('track_id', 'order:item-10')->first();

    expect($payment->user_id)->toBeNull()
        ->and($payment->granted_at)->toBeNull()
        ->and($payment->review_reason)->toContain('nobody@example.com');
});

it('flags a refund after the grant without taking Pro away', function () {
    $payment = getlyPayment();
    getlyWebhook('sale.completed', linkSale($payment))->assertOk();

    getlyWebhook('order.refunded', ['orderId' => 'order-1', 'orderItemIds' => ['item-1'], 'amountCents' => 5200])->assertOk();

    $payment->refresh();

    expect($payment->status)->toBe('refunded')
        ->and($payment->review_reason)->toContain('Refunded on Getly')
        ->and($payment->user->fresh()->plan_id)->toBe(Plan::where('slug', 'pro')->value('id'));
});

it('ignores events it does not handle', function () {
    getlyWebhook('review.created', ['reviewId' => 'r1', 'productId' => GETLY_3M, 'rating' => 5])->assertOk();
});

it('grants a link sale the webhook missed when reconcile finds it completed', function () {
    $payment = getlyPayment();
    Http::fake(['getly.test/api/v1/checkout-links/link-1' => Http::response(['success' => true, 'data' => [
        'id' => 'link-1', 'status' => 'completed', 'reference' => $payment->uuid, 'orderId' => 'order-1',
    ]])]);

    artisan('billing:reconcile')->assertSuccessful();

    expect($payment->fresh()->granted_at)->not->toBeNull();
});

it('flags a second Getly order paid on the same link instead of keeping it silently', function () {
    $payment = getlyPayment();
    getlyWebhook('sale.completed', linkSale($payment))->assertOk();

    getlyWebhook('sale.completed', linkSale($payment, ['orderId' => 'order-2']))->assertOk();

    $payment->refresh();

    expect($payment->granted_at)->not->toBeNull()
        ->and($payment->review_reason)->toContain('second Getly order (order-2)')
        ->and($payment->payload['getly']['orderId'])->toBe('order-1');
});

it('stores what Getly charged and flags it when it differs from the quote', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment, ['total' => 4000]))->assertOk();

    $payment->refresh();

    expect($payment->granted_at)->not->toBeNull()
        ->and($payment->amount_usd)->toBe('40.00')
        ->and($payment->discount_usd)->toBe('12.00')
        ->and($payment->review_reason)->toContain('Getly charged $40.00 but checkout quoted $52.00');
});

it('does not flag a sale charged at the quoted price', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment))->assertOk();

    expect($payment->fresh()->review_reason)->toBeNull();
});

it('flags a dispute without taking Pro away', function () {
    $payment = getlyPayment();
    getlyWebhook('sale.completed', linkSale($payment))->assertOk();

    getlyWebhook('dispute.created', ['disputeId' => 'dp1', 'orderId' => 'order-1', 'orderItemId' => 'item-1', 'reason' => 'fraudulent', 'status' => 'open'])->assertOk();

    $payment->refresh();

    expect($payment->review_reason)->toContain('Dispute opened on Getly (fraudulent)')
        ->and($payment->status)->toBe('paid')
        ->and($payment->user->fresh()->plan_id)->toBe(Plan::where('slug', 'pro')->value('id'));
});

it('holds a store-page gift for review instead of granting it to the giver', function () {
    $giver = User::factory()->create(['email' => 'giver@example.com']);

    getlyWebhook('sale.completed', [
        'orderId' => 'order-11',
        'buyerEmail' => 'giver@example.com',
        'items' => [['orderItemId' => 'item-11', 'productId' => GETLY_3M, 'price' => 5200, 'isGift' => true]],
    ])->assertOk();

    $payment = Payment::where('track_id', 'order:item-11')->first();

    expect($payment->granted_at)->toBeNull()
        ->and($payment->user_id)->toBeNull()
        ->and($payment->review_reason)->toContain('gift')
        ->and($giver->fresh()->plan_expires_at)->toBeNull();
});

it('does not grant a store-page sale to an unverified email', function () {
    $user = User::factory()->unverified()->create(['email' => 'unverified@example.com']);

    getlyWebhook('sale.completed', [
        'orderId' => 'order-12',
        'buyerEmail' => 'unverified@example.com',
        'items' => [['orderItemId' => 'item-12', 'productId' => GETLY_3M, 'price' => 5200]],
    ])->assertOk();

    $payment = Payment::where('track_id', 'order:item-12')->first();

    expect($payment->granted_at)->toBeNull()
        ->and($payment->review_reason)->toContain("hasn't verified")
        ->and($user->fresh()->plan_expires_at)->toBeNull();
});

it('flags only the refunded items of a multi-item order', function () {
    User::factory()->create(['email' => 'two@example.com']);

    getlyWebhook('sale.completed', [
        'orderId' => 'order-13',
        'buyerEmail' => 'two@example.com',
        'items' => [
            ['orderItemId' => 'item-a', 'productId' => GETLY_3M, 'price' => 5200],
            ['orderItemId' => 'item-b', 'productId' => GETLY_3M, 'price' => 5200],
        ],
    ])->assertOk();

    getlyWebhook('order.refunded', ['orderId' => 'order-13', 'orderItemIds' => ['item-b'], 'amountCents' => 5200])->assertOk();

    expect(Payment::where('track_id', 'order:item-a')->first()->status)->toBe('paid')
        ->and(Payment::where('track_id', 'order:item-b')->first()->status)->toBe('refunded');
});

it('ignores our automatic sales while Getly is the checkout', function () {
    Discount::factory()->sale()->create(['percent_off' => 50]);

    $this->getJson('/api/billing/catalog')
        ->assertOk()
        ->assertJsonPath('data.0.price_usd', '20.00')
        ->assertJsonPath('data.0.discount', null);
});

it('reconciles each open payment on the provider it was made with', function () {
    config(['services.oxapay.merchant_key' => 'test-merchant-key', 'services.oxapay.driver' => 'oxapay']);
    $getly = getlyPayment();
    $oxapay = Payment::factory()->create(['track_id' => '555']);
    Http::fake([
        'getly.test/api/v1/checkout-links/link-1' => Http::response(['success' => true, 'data' => ['id' => 'link-1', 'status' => 'completed', 'reference' => $getly->uuid, 'orderId' => 'order-1']]),
        'api.oxapay.com/v1/payment/555' => Http::response(['data' => ['track_id' => '555', 'status' => 'Paid', 'order_id' => $oxapay->uuid], 'status' => 200]),
    ]);

    artisan('billing:reconcile')->assertSuccessful();

    expect($getly->fresh()->granted_at)->not->toBeNull()
        ->and($oxapay->fresh()->granted_at)->not->toBeNull();
});

it('accepts a delivery signed hours ago, as a retry may be', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment), at: time() - 3 * 3600)->assertOk();

    expect($payment->fresh()->granted_at)->not->toBeNull();
});

it('refuses a link Getly would charge a different price for, before anyone pays', function () {
    fakeGetlyLink(6000);
    actingAs(User::factory()->create());

    postJson('/api/billing/checkout', ['product' => 'pro-3-months'])->assertStatus(502);

    $payment = Payment::latest('id')->first();

    expect($payment->status)->toBe('failed')
        ->and($payment->review_reason)->toContain('Getly would charge $60.00')
        ->and($payment->review_reason)->toContain('quoted $52.00');
});

it('hands out a coupon link when Getly charges the discounted price', function () {
    fakeGetlyCoupons();
    Http::fake(['getly.test/api/v1/checkout-links' => Http::response(['success' => true, 'data' => [
        'id' => 'link-1', 'url' => 'https://www.getly.store/go/link-1', 'status' => 'open',
        'priceCents' => 16000, 'discountedPriceCents' => 9900, 'couponApplied' => true,
    ]], 201)]);
    actingAs(User::factory()->create());

    postJson('/api/billing/checkout', ['product' => 'pro-12-months', 'code' => 'FOUNDER'])->assertCreated();
});

it('marks a held store-page sale refunded before any grant as not to be granted', function () {
    getlyWebhook('sale.completed', [
        'orderId' => 'order-20',
        'buyerEmail' => 'nobody@example.com',
        'items' => [['orderItemId' => 'item-20', 'productId' => GETLY_3M, 'price' => 5200]],
    ])->assertOk();

    getlyWebhook('order.refunded', ['orderId' => 'order-20', 'orderItemIds' => ['item-20'], 'amountCents' => 5200])->assertOk();

    $payment = Payment::where('track_id', 'order:item-20')->first();

    expect($payment->status)->toBe('refunded')
        ->and($payment->granted_at)->toBeNull()
        ->and($payment->review_reason)->toContain('before it was granted')
        ->and($payment->review_reason)->toContain("Don't grant it")
        ->and($payment->review_reason)->not->toContain('Grant it by hand');
});

it('says how much was refunded', function () {
    $payment = getlyPayment();
    getlyWebhook('sale.completed', linkSale($payment))->assertOk();

    getlyWebhook('order.refunded', ['orderId' => 'order-1', 'orderItemIds' => ['item-1'], 'amountCents' => 2600])->assertOk();

    expect($payment->fresh()->review_reason)->toContain('Refunded $26.00 of $52.00');
});

it('records a store-page sale with a very long email in one go, held for review', function () {
    $email = str_repeat('a', 200).'@example.com';

    getlyWebhook('sale.completed', [
        'orderId' => 'order-21',
        'buyerEmail' => $email,
        'items' => [['orderItemId' => 'item-21', 'productId' => GETLY_3M, 'price' => 5200]],
    ])->assertOk();

    $payment = Payment::where('track_id', 'order:item-21')->first();

    expect($payment->status)->toBe('paid')
        ->and(strlen($payment->review_reason))->toBeLessThanOrEqual(255);
});

it('never asks Getly about a store-page sale during reconcile', function () {
    getlyPayment(['track_id' => 'order:item-22']);
    Http::fake();

    artisan('billing:reconcile')->assertSuccessful();

    Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'checkout-links'));
});

it('says nothing was granted when Getly charged a different price and the grant failed', function () {
    $payment = getlyPayment();
    $payment->user->delete();

    getlyWebhook('sale.completed', linkSale($payment, ['total' => 4000]))->assertOk();

    $payment->refresh();

    expect($payment->granted_at)->toBeNull()
        ->and($payment->amount_usd)->toBe('40.00')
        ->and($payment->review_reason)->toContain('account has been deleted. Refund it on Getly')
        ->and($payment->review_reason)->toContain('Getly charged $40.00 but checkout quoted $52.00. Nothing was granted.')
        ->and($payment->review_reason)->not->toContain('Pro was granted');
});

it('keeps "don\'t grant it" when a dispute follows a refund, and never says Pro was taken away', function () {
    getlyWebhook('sale.completed', [
        'orderId' => 'order-30',
        'buyerEmail' => 'nobody@example.com',
        'items' => [['orderItemId' => 'item-30', 'productId' => GETLY_3M, 'price' => 5200]],
    ])->assertOk();
    getlyWebhook('order.refunded', ['orderId' => 'order-30', 'orderItemIds' => ['item-30'], 'amountCents' => 5200])->assertOk();

    getlyWebhook('dispute.created', ['disputeId' => 'dp-1', 'orderId' => 'order-30', 'orderItemId' => 'item-30', 'reason' => 'fraud'])->assertOk();

    $reason = Payment::where('track_id', 'order:item-30')->value('review_reason');

    expect($reason)->toContain("Don't grant it")
        ->and($reason)->toContain('Dispute opened on Getly (fraud)')
        ->and($reason)->toContain('Pro was never granted')
        ->and($reason)->not->toContain('not taken away');
});

it('never grants a held store-page sale on a redelivery after its review is cleared', function () {
    $user = User::factory()->unverified()->create(['email' => 'held@example.com']);
    $sale = [
        'orderId' => 'order-31',
        'buyerEmail' => 'held@example.com',
        'items' => [['orderItemId' => 'item-31', 'productId' => GETLY_3M, 'price' => 5200]],
    ];
    getlyWebhook('sale.completed', $sale, deliveryId: 'd-31')->assertOk();

    actingAs(Admin::factory()->create(), 'admin')
        ->post(route('admin.payments.clear-review', Payment::where('track_id', 'order:item-31')->first()))
        ->assertRedirect();
    expect(Payment::where('track_id', 'order:item-31')->value('review_reason'))->toBeNull();

    getlyWebhook('sale.completed', $sale, deliveryId: 'd-31')->assertOk();

    expect(Payment::where('track_id', 'order:item-31')->value('granted_at'))->toBeNull()
        ->and($user->fresh()->plan_expires_at)->toBeNull();
});

it('still grants a store-page sale whose first delivery stopped before the grant', function () {
    $user = User::factory()->create(['email' => 'crashed@example.com']);
    $payment = getlyPayment(['user_id' => $user->id, 'track_id' => 'order:item-32', 'payment_url' => null]);

    getlyWebhook('sale.completed', [
        'orderId' => 'order-32',
        'buyerEmail' => 'crashed@example.com',
        'items' => [['orderItemId' => 'item-32', 'productId' => GETLY_3M, 'price' => 5200]],
    ])->assertOk();

    expect($payment->fresh()->granted_at)->not->toBeNull();
});

it('refuses a delivery signed more than four hours ago', function () {
    $payment = getlyPayment();

    getlyWebhook('sale.completed', linkSale($payment), at: time() - 5 * 3600)->assertUnauthorized();
});

it('does not bring a refunded payment back to paid on Recheck', function () {
    // Getly's link still reads "completed" after the refund.
    $payment = getlyPayment(['status' => Payment::STATUS_REFUNDED, 'review_reason' => "Refunded on Getly before it was granted. Don't grant it."]);
    Http::fake(['getly.test/api/v1/checkout-links/link-1' => Http::response(['success' => true, 'data' => [
        'id' => 'link-1', 'status' => 'completed', 'reference' => $payment->uuid, 'orderId' => 'order-1',
    ]])]);

    actingAs(Admin::factory()->create(), 'admin')->post(route('admin.payments.recheck', $payment))->assertSessionHas('status');
    Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/checkout-links/link-1'));

    $payment->refresh();

    expect($payment->status)->toBe('refunded')
        ->and($payment->granted_at)->toBeNull();
});

it('notes a second partial refund, but not a retry of the same one', function () {
    $payment = getlyPayment();
    getlyWebhook('sale.completed', linkSale($payment))->assertOk();

    getlyWebhook('order.refunded', ['orderId' => 'order-1', 'orderItemIds' => ['item-1'], 'amountCents' => 1000], deliveryId: 'r-1')->assertOk();
    getlyWebhook('order.refunded', ['orderId' => 'order-1', 'orderItemIds' => ['item-1'], 'amountCents' => 1000], deliveryId: 'r-1')->assertOk();
    getlyWebhook('order.refunded', ['orderId' => 'order-1', 'orderItemIds' => ['item-1'], 'amountCents' => 1500], deliveryId: 'r-2')->assertOk();

    $reason = $payment->fresh()->review_reason;

    expect(substr_count($reason, 'Refunded $10.00 of $52.00'))->toBe(1)
        ->and($reason)->toContain('Refunded $15.00 of $52.00');
});

it('notes the refund of an extra order on its payment instead of calling it unknown', function () {
    $payment = getlyPayment();
    getlyWebhook('sale.completed', linkSale($payment))->assertOk();
    getlyWebhook('sale.completed', linkSale($payment, ['orderId' => 'order-2']))->assertOk();

    getlyWebhook('order.refunded', ['orderId' => 'order-2', 'orderItemIds' => ['item-9'], 'amountCents' => 5200])->assertOk();

    $payment->refresh();

    expect($payment->review_reason)->toContain('The extra Getly order order-2 was refunded.')
        ->and($payment->status)->toBe('paid');
    Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'telegram') && str_contains((string) $request['text'], 'no payment for'));
});

it('tells the buyer about the coupon when Getly ignores it on the link', function () {
    fakeGetlyCoupons();
    Http::fake(['getly.test/api/v1/checkout-links' => Http::response(['success' => true, 'data' => [
        'id' => 'link-1', 'url' => 'https://www.getly.store/go/link-1', 'status' => 'open',
        'priceCents' => 16000, 'discountedPriceCents' => null, 'couponApplied' => false,
    ]], 201)]);
    actingAs(User::factory()->create());

    postJson('/api/billing/checkout', ['product' => 'pro-12-months', 'code' => 'FOUNDER'])
        ->assertStatus(422)
        ->assertJsonPath('message', "That coupon can't be used right now. Remove it to pay the full price, or try again later.");
});
