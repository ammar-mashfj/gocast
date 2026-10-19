<?php

use App\Models\CardPaymentInterest;
use App\Models\Discount;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\getJson;
use function Pest\Laravel\postJson;

/**
 * Catalog, quote and checkout: prices come from the database, discounts
 * never stack, and the invoice OxaPay is asked for is priced by the server.
 */
beforeEach(function () {
    config([
        'services.oxapay.driver' => 'oxapay',
        'services.oxapay.merchant_key' => 'test-merchant-key',
        'services.oxapay.sandbox' => false,
        'services.oxapay.callback_url' => null,
        'services.frontend_url' => 'https://gocast.test',
    ]);

    Http::fake([
        'api.oxapay.com/v1/payment/invoice' => Http::response([
            'data' => ['track_id' => '184747701', 'payment_url' => 'https://pay.oxapay.com/12345/184747701', 'expired_at' => now()->addHour()->getTimestamp(), 'date' => now()->getTimestamp()],
            'message' => 'Operation completed successfully!',
            'error' => null,
            'status' => 200,
            'version' => '1.0.0',
        ]),
    ]);
});

it('lists the seeded products with their prices', function () {
    getJson('/api/billing/catalog')
        ->assertOk()
        ->assertJsonCount(4, 'data')
        ->assertJsonPath('data.0.slug', 'pro-1-month')
        ->assertJsonPath('data.0.price_usd', '20.00')
        ->assertJsonPath('data.3.slug', 'pro-12-months')
        ->assertJsonPath('data.3.per_month_usd', '13.33')
        ->assertJsonPath('data.3.badge', 'Best value');
});

it('leaves hidden and switched-off products out of the catalog', function () {
    Product::factory()->hidden()->create(['slug' => 'secret']);
    Product::factory()->inactive()->create(['slug' => 'retired']);

    $slugs = collect(getJson('/api/billing/catalog')->json('data'))->pluck('slug');

    expect($slugs)->not->toContain('secret')->not->toContain('retired');
});

it('applies a running sale to the catalog price, with its end date', function () {
    $sale = Discount::factory()->sale()->create(['percent_off' => 25, 'ends_at' => now()->addDays(3)]);
    $sale->products()->attach(Product::where('slug', 'pro-1-month')->value('id'));

    getJson('/api/billing/catalog')
        ->assertJsonPath('data.0.list_price_usd', '20.00')
        ->assertJsonPath('data.0.price_usd', '15.00')
        ->assertJsonPath('data.0.discount.label', '25% off')
        ->assertJsonPath('data.1.price_usd', '52.00');
});

it('ignores a sale outside its dates', function () {
    Discount::factory()->sale()->create(['starts_at' => now()->addDay()]);
    Discount::factory()->sale()->create(['ends_at' => now()->subMinute()]);

    getJson('/api/billing/catalog')->assertJsonPath('data.0.price_usd', '20.00');
});

it('creates an OxaPay invoice priced by the server, fee on us, settled in USDT', function () {
    $user = User::factory()->create();

    actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-3-months', 'amount' => 1])
        ->assertCreated()
        ->assertJsonPath('data.payment_url', 'https://pay.oxapay.com/12345/184747701');

    $payment = Payment::sole();

    expect($payment->user_id)->toBe($user->id)
        ->and($payment->amount_usd)->toBe('52.00')
        ->and($payment->duration_count)->toBe(3)
        ->and($payment->track_id)->toBe('184747701')
        ->and($payment->status)->toBe('new');

    Http::assertSent(function (Request $request) use ($payment) {
        return $request->url() === 'https://api.oxapay.com/v1/payment/invoice'
            && $request->header('merchant_api_key')[0] === 'test-merchant-key'
            && $request['amount'] === 52.0
            && $request['fee_paid_by_payer'] === 0
            && $request['to_currency'] === 'USDT'
            && $request['order_id'] === $payment->uuid
            && $request['callback_url'] === route('webhooks.oxapay')
            && $request['return_url'] === "https://gocast.test/dashboard/settings?payment={$payment->uuid}"
            && $request['sandbox'] === false;
    });
});

it('sends webhooks to the override URL when one is set', function () {
    config(['services.oxapay.callback_url' => 'https://abc.ngrok-free.app/api/webhooks/oxapay']);

    actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->assertCreated();

    Http::assertSent(fn (Request $request) => $request['callback_url'] === 'https://abc.ngrok-free.app/api/webhooks/oxapay');
});

it('applies a coupon at checkout and records it on the payment', function () {
    $coupon = Discount::factory()->create(['code' => 'FOUNDER-MAF', 'percent_off' => 25]);

    actingAs(User::factory()->create())
        ->postJson('/api/billing/checkout', ['product' => 'pro-1-month', 'code' => 'founder-maf'])
        ->assertCreated();

    $payment = Payment::sole();

    expect($payment->amount_usd)->toBe('15.00')
        ->and($payment->discount_usd)->toBe('5.00')
        ->and($payment->discount_id)->toBe($coupon->id)
        ->and($payment->discount_code)->toBe('FOUNDER-MAF')
        // Counted when paid, not at checkout.
        ->and($coupon->fresh()->redemptions_count)->toBe(0);
});

it('refuses checkout with a coupon that does not apply, instead of charging full price', function (array $coupon, string $message) {
    Discount::factory()->create(['code' => 'CODE'] + $coupon);

    actingAs(User::factory()->create())
        ->postJson('/api/billing/checkout', ['product' => 'pro-1-month', 'code' => 'CODE'])
        ->assertUnprocessable()
        ->assertJsonPath('message', $message);

    expect(Payment::count())->toBe(0);
    Http::assertNothingSent();
})->with([
    'used up' => [['redemptions_count' => 1, 'max_redemptions' => 1], 'That coupon has already been used.'],
    'expired' => [['ends_at' => now()->subDay()], 'That coupon has expired.'],
    'not started' => [['starts_at' => now()->addDay()], "That coupon isn't valid yet."],
    'switched off' => [['active' => false], "That coupon isn't valid."],
]);

it('refuses an unknown coupon', function () {
    actingAs(User::factory()->create())
        ->postJson('/api/billing/checkout', ['product' => 'pro-1-month', 'code' => 'NOPE'])
        ->assertUnprocessable()
        ->assertJsonPath('message', "That coupon isn't valid.");
});

it('refuses a coupon limited to other products', function () {
    $coupon = Discount::factory()->create(['code' => 'YEARLY']);
    $coupon->products()->attach(Product::where('slug', 'pro-12-months')->value('id'));

    actingAs(User::factory()->create())
        ->postJson('/api/billing/quote', ['product' => 'pro-1-month', 'code' => 'YEARLY'])
        ->assertOk()
        ->assertJsonPath('data.coupon_error', "That coupon doesn't apply to Pro · 1 month.")
        ->assertJsonPath('data.price_usd', '20.00');
});

it('does not stack a coupon on a sale, and keeps whichever is lower', function () {
    Discount::factory()->sale()->create(['percent_off' => 30]);
    Discount::factory()->create(['code' => 'SMALL', 'percent_off' => 10]);
    Discount::factory()->create(['code' => 'BIG', 'percent_off' => 50]);
    $user = User::factory()->create();

    actingAs($user)->postJson('/api/billing/quote', ['product' => 'pro-1-month', 'code' => 'SMALL'])
        ->assertJsonPath('data.price_usd', '14.00')
        ->assertJsonPath('data.coupon_error', 'The sale price is already lower than this coupon.');

    actingAs($user)->postJson('/api/billing/quote', ['product' => 'pro-1-month', 'code' => 'BIG'])
        ->assertJsonPath('data.price_usd', '10.00')
        ->assertJsonPath('data.coupon_error', null);
});

it('sells a hidden product by its slug', function () {
    Product::factory()->hidden()->create(['slug' => 'smoke-test', 'price_usd' => 1]);

    actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'smoke-test'])->assertCreated();

    expect(Payment::sole()->amount_usd)->toBe('1.00');
});

it('sells a lifetime product and snapshots it on the payment', function () {
    Product::factory()->create(['slug' => 'pro-lifetime', 'price_usd' => 199, 'duration_unit' => 'lifetime', 'duration_count' => null]);

    actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'pro-lifetime'])->assertCreated();

    expect(Payment::sole())->duration_unit->toBe('lifetime')->amount_usd->toBe('199.00');
});

it('refuses a lifetime to an account that already has Pro with no end date', function () {
    Product::factory()->create(['slug' => 'pro-lifetime', 'duration_unit' => 'lifetime', 'duration_count' => null]);
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => null]);

    actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-lifetime'])->assertStatus(409);
});

it('refuses a switched-off product', function () {
    Product::factory()->inactive()->create(['slug' => 'retired']);

    actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'retired'])->assertNotFound();
});

it('reopens the invoice already waiting instead of creating a second', function () {
    $user = User::factory()->create();

    $first = actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->json('data.payment');
    $second = actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->json('data.payment');

    expect($second)->toBe($first)->and(Payment::count())->toBe(1);
    Http::assertSentCount(1);
});

it('refuses to sell to an account on a hand-made plan', function () {
    $custom = Plan::factory()->create(['slug' => 'custom']);
    $user = User::factory()->create(['plan_id' => $custom->id]);

    actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])
        ->assertStatus(409)
        ->assertJsonPath('message', "Your account is on a plan we set up for you by hand, so it can't be changed here. Email hello@gocast.fm and we'll sort it out.");

    Http::assertNothingSent();
});

it('refuses to sell Pro to an account that already has it with no end date', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => null]);

    actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->assertStatus(409);
});

it('sells a renewal to an account whose Pro term is still running', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(5)]);

    actingAs($user)->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->assertCreated();
});

it('marks the payment failed and says so when OxaPay refuses', function () {
    config(['services.oxapay.base_url' => 'https://oxapay-refuses.test/v1']);
    Http::fake(['oxapay-refuses.test/*' => Http::response(['data' => [], 'message' => 'Invalid merchant', 'error' => ['message' => 'Invalid merchant API key'], 'status' => 401], 401)]);

    actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])
        ->assertStatus(502)
        ->assertJsonPath('message', "We couldn't reach the payment provider. Please try again in a minute.");

    $payment = Payment::sole();
    expect($payment->status)->toBe('failed')->and($payment->review_reason)->toContain('Invalid merchant API key');
});

it('refuses checkout while no merchant key is set', function () {
    config(['services.oxapay.merchant_key' => '']);

    actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->assertStatus(503);
});

it('requires an account to check out or quote', function () {
    postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->assertUnauthorized();
    postJson('/api/billing/quote', ['product' => 'pro-1-month'])->assertUnauthorized();
});

it('shows a buyer their own payment and nobody else\'s', function () {
    $payment = Payment::factory()->create();

    actingAs($payment->user)->getJson("/api/billing/payments/{$payment->uuid}")
        ->assertOk()
        ->assertJsonPath('data.state', 'pending')
        ->assertJsonPath('data.payment_url', 'https://pay.oxapay.com/test');

    actingAs(User::factory()->create())->getJson("/api/billing/payments/{$payment->uuid}")->assertNotFound();
});

it('reports a payment waiting on the chain as confirming, and a granted one with its end date', function () {
    $paying = Payment::factory()->create(['status' => 'paying']);
    $granted = Payment::factory()->granted(now()->addMonth())->create();

    actingAs($paying->user)->getJson("/api/billing/payments/{$paying->uuid}")->assertJsonPath('data.state', 'confirming');
    actingAs($granted->user)->getJson("/api/billing/payments/{$granted->uuid}")
        ->assertJsonPath('data.state', 'granted')
        ->assertJsonPath('data.payment_url', null);
});

it('uses the fake gateway without calling OxaPay', function () {
    config(['services.oxapay.driver' => 'fake']);

    $response = actingAs(User::factory()->create())->postJson('/api/billing/checkout', ['product' => 'pro-1-month'])->assertCreated();

    $payment = Payment::sole();
    expect($payment->track_id)->toStartWith('fake-')
        ->and($response->json('data.payment_url'))->toBe("https://gocast.test/dashboard/settings?payment={$payment->uuid}");
    Http::assertNothingSent();
});

it('remembers who wants card payments, once per account', function () {
    $user = User::factory()->create();

    actingAs($user)->getJson('/api/billing/card-interest')->assertJsonPath('data.subscribed', false);
    actingAs($user)->postJson('/api/billing/card-interest')->assertOk();
    actingAs($user)->postJson('/api/billing/card-interest')->assertOk();
    actingAs($user)->getJson('/api/billing/card-interest')->assertJsonPath('data.subscribed', true);

    expect(CardPaymentInterest::where('user_id', $user->id)->sole()->email)->toBe($user->email);
});

it('needs an account to join the card waitlist', function () {
    postJson('/api/billing/card-interest')->assertUnauthorized();
});
