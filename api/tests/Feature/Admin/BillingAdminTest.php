<?php

use App\Models\Admin;
use App\Models\CardPaymentInterest;
use App\Models\Discount;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

/**
 * /admin/payments, /admin/billing/products and /admin/billing/discounts:
 * prices and coupons are edited here, never in code.
 */
beforeEach(function () {
    test()->actingAs(Admin::factory()->create(), 'admin');
    config(['services.oxapay.driver' => 'oxapay', 'services.oxapay.merchant_key' => 'test-merchant-key']);
    Notification::fake();
});

it('lists payments with the ones needing review findable', function () {
    $flagged = Payment::factory()->create(['review_reason' => 'Underpaid. Accept it in the OxaPay panel.']);
    $fine = Payment::factory()->granted(now()->addMonth())->create();

    $this->get(route('admin.payments.index'))->assertOk()->assertSee($flagged->user->email)->assertSee($fine->user->email);

    $this->get(route('admin.payments.index', ['filter' => 'review']))
        ->assertOk()
        ->assertSee($flagged->user->email)
        ->assertDontSee($fine->user->email);
});

it('rechecks a payment with OxaPay and applies the answer', function () {
    $payment = Payment::factory()->create(['track_id' => '777']);
    Http::fake(['api.oxapay.com/v1/payment/777' => Http::response(['data' => ['track_id' => '777', 'status' => 'Paid', 'order_id' => $payment->uuid], 'status' => 200])]);

    $this->post(route('admin.payments.recheck', $payment))->assertSessionHas('status');

    expect($payment->fresh()->granted_at)->not->toBeNull();
});

it('clears a review flag without touching the account', function () {
    $payment = Payment::factory()->create(['review_reason' => 'x']);
    $plan = $payment->user->plan_id;

    $this->post(route('admin.payments.clear-review', $payment));

    expect($payment->fresh()->review_reason)->toBeNull()->and($payment->user->fresh()->plan_id)->toBe($plan);
});

it('creates a product that checkout sells straight away', function () {
    $pro = Plan::where('slug', 'pro')->value('id');

    $this->post(route('admin.products.store'), [
        'name' => 'Pro · 2 years', 'slug' => 'pro-24-months', 'price_usd' => '280', 'plan_id' => $pro,
        'duration_unit' => 'month', 'duration_count' => 24, 'active' => '1', 'visible' => '1', 'sort' => 50,
    ])->assertRedirect(route('admin.products.index'));

    $this->getJson('/api/billing/catalog')->assertJsonPath('data.4.slug', 'pro-24-months')->assertJsonPath('data.4.price_usd', '280.00');
});

it('creates a lifetime product with no length and no per-month price', function () {
    $pro = Plan::where('slug', 'pro')->value('id');

    $this->post(route('admin.products.store'), [
        'name' => 'Pro · Lifetime', 'slug' => 'pro-lifetime', 'price_usd' => '199', 'plan_id' => $pro,
        'duration_unit' => 'lifetime', 'duration_count' => '', 'active' => '1', 'visible' => '1', 'sort' => 50,
    ])->assertRedirect(route('admin.products.index'));

    $this->getJson('/api/billing/catalog')
        ->assertJsonPath('data.4.slug', 'pro-lifetime')
        ->assertJsonPath('data.4.duration', ['unit' => 'lifetime', 'count' => null, 'label' => 'Lifetime'])
        ->assertJsonPath('data.4.per_month_usd', null);
});

it('changes a price without touching past payments', function () {
    $product = Product::where('slug', 'pro-1-month')->first();
    $paid = Payment::factory()->granted(now()->addMonth())->create(['product_id' => $product->id, 'amount_usd' => 20]);

    $this->post(route('admin.products.update', $product), [
        'name' => $product->name, 'slug' => $product->slug, 'price_usd' => '25', 'plan_id' => $product->plan_id,
        'duration_unit' => 'month', 'duration_count' => 1, 'active' => '1', 'visible' => '1',
    ])->assertRedirect();

    expect($product->fresh()->price_usd)->toBe('25.00')->and($paid->fresh()->amount_usd)->toBe('20.00');
});

it('rejects a malformed product slug', function () {
    $this->post(route('admin.products.store'), [
        'name' => 'X', 'slug' => 'Bad Slug', 'price_usd' => '5', 'plan_id' => Plan::where('slug', 'pro')->value('id'),
        'duration_unit' => 'month', 'duration_count' => 1,
    ])->assertSessionHasErrors('slug');
});

it('creates a single-use coupon with an upper-cased code', function () {
    $this->post(route('admin.discounts.store'), [
        'name' => 'Founder — MAF FM', 'code' => 'founder-maf', 'kind' => 'percent', 'value' => '25',
        'max_redemptions' => 1, 'active' => '1',
    ])->assertRedirect(route('admin.discounts.index'));

    $coupon = Discount::sole();

    expect($coupon->code)->toBe('FOUNDER-MAF')
        ->and($coupon->percent_off)->toBe('25.00')
        ->and($coupon->max_redemptions)->toBe(1)
        ->and($coupon->products)->toBeEmpty();
});

it('creates a limited-time sale on chosen products', function () {
    $yearly = Product::where('slug', 'pro-12-months')->value('id');

    $this->post(route('admin.discounts.store'), [
        'name' => 'Black Friday', 'code' => '', 'kind' => 'amount', 'value' => '40',
        'starts_at' => now()->subHour()->format('Y-m-d\TH:i'), 'ends_at' => now()->addDays(3)->format('Y-m-d\TH:i'),
        'products' => [$yearly], 'active' => '1',
    ])->assertRedirect();

    $this->getJson('/api/billing/catalog')
        ->assertJsonPath('data.3.price_usd', '120.00')
        ->assertJsonPath('data.0.price_usd', '20.00');
});

it('refuses a 100% coupon', function () {
    $this->post(route('admin.discounts.store'), ['name' => 'Free', 'code' => 'FREE', 'kind' => 'percent', 'value' => '100'])
        ->assertSessionHasErrors('value');
});

it('refuses a duplicate coupon code whatever the case', function () {
    Discount::factory()->create(['code' => 'TAKEN']);

    $this->post(route('admin.discounts.store'), ['name' => 'Again', 'code' => 'taken', 'kind' => 'percent', 'value' => '10'])
        ->assertSessionHasErrors('code');
});

it('renders the products and discounts pages', function () {
    Discount::factory()->create();

    $this->get(route('admin.products.index'))->assertOk()->assertSee('pro-12-months');
    $this->get(route('admin.discounts.index'))->assertOk()->assertSee('Founder price');
});

it('lists the card payments waitlist on the payments page', function () {
    $user = User::factory()->create(['email' => 'wants-cards@example.com']);
    CardPaymentInterest::create(['user_id' => $user->id, 'email' => $user->email]);

    $this->get(route('admin.payments.index'))->assertOk()->assertSee('Card payments waitlist (1)')->assertSee('wants-cards@example.com');
});
