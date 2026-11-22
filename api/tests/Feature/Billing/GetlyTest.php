<?php

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

function fakeGetlyLink(): void
{
    Http::fake(['getly.test/api/v1/checkout-links' => Http::response(['success' => true, 'data' => [
        'id' => 'link-1',
        'url' => 'https://www.getly.store/go/link-1',
        'status' => 'open',
        'expiresAt' => now()->addDay()->toIso8601String(),
    ]], 201)]);
}

/**
 * @param  array<string, mixed>  $data
 */
function getlyWebhook(string $event, array $data, ?string $secret = GETLY_TEST_SECRET, ?int $at = null): TestResponse
{
    $body = json_encode(['deliveryId' => 'd-'.fake()->uuid(), 'event' => $event, 'data' => $data, 'timestamp' => now()->toIso8601String()]);
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
    fakeGetlyLink();
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
    getlyWebhook('sale.completed', linkSale($payment), at: time() - 600)->assertStatus(401);

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
