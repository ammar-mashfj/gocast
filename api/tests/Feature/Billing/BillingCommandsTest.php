<?php

use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Notifications\PlanRenewalReminder;
use App\Notifications\ProAccessGranted;
use App\Services\Billing\OxaPaySignature;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

use function Pest\Laravel\artisan;

/**
 * billing:reconcile (the webhook's safety net), billing:simulate (local
 * webhook testing) and billing:remind-renewals (paid terms only).
 */
beforeEach(function () {
    config(['services.oxapay.driver' => 'oxapay', 'services.oxapay.merchant_key' => 'test-merchant-key']);
    Notification::fake();
});

it('grants a payment the webhook missed when OxaPay says it is paid', function () {
    $payment = Payment::factory()->create(['track_id' => '555']);

    Http::fake(['api.oxapay.com/v1/payment/555' => Http::response([
        'data' => ['track_id' => '555', 'status' => 'paid', 'order_id' => $payment->uuid, 'amount' => 20, 'currency' => 'USD'],
        'status' => 200,
    ])]);

    artisan('billing:reconcile')->assertSuccessful();

    expect($payment->fresh()->granted_at)->not->toBeNull();
    Notification::assertSentTo($payment->user, ProAccessGranted::class);
});

it('only asks about open payments from the last few days', function () {
    Payment::factory()->granted(now()->addMonth())->create();
    Payment::factory()->create(['status' => 'expired']);
    Payment::factory()->create(['created_at' => now()->subDays(5)]);
    Http::fake();

    artisan('billing:reconcile')->assertSuccessful();

    Http::assertNothingSent();
});

it('keeps going when OxaPay fails for one payment', function () {
    $broken = Payment::factory()->create(['track_id' => '1']);
    $fine = Payment::factory()->create(['track_id' => '2']);

    Http::fake([
        'api.oxapay.com/v1/payment/1' => Http::response(['status' => 500], 500),
        'api.oxapay.com/v1/payment/2' => Http::response(['data' => ['track_id' => '2', 'status' => 'Paid', 'order_id' => $fine->uuid], 'status' => 200]),
    ]);

    artisan('billing:reconcile')->assertSuccessful();

    expect($broken->fresh()->granted_at)->toBeNull()->and($fine->fresh()->granted_at)->not->toBeNull();
});

it('does nothing without a merchant key', function () {
    config(['services.oxapay.merchant_key' => '']);
    Payment::factory()->create();
    Http::fake();

    artisan('billing:reconcile')->assertSuccessful();

    Http::assertNothingSent();
});

it('simulates a signed OxaPay webhook to the app\'s own route', function () {
    $payment = Payment::factory()->create();
    Http::fake([route('webhooks.oxapay') => Http::response('ok')]);

    artisan('billing:simulate', ['payment' => $payment->uuid, 'status' => 'paid'])->assertSuccessful();

    Http::assertSent(function (Request $request) use ($payment) {
        return $request->url() === route('webhooks.oxapay')
            && $request['status'] === 'Paid'
            && $request['order_id'] === $payment->uuid
            && $request['track_id'] === $payment->track_id
            && OxaPaySignature::verify($request->body(), $request->header('HMAC')[0], 'test-merchant-key');
    });
});

it('refuses to simulate in production', function () {
    app()->detectEnvironment(fn () => 'production');
    $payment = Payment::factory()->create();
    Http::fake();

    artisan('billing:simulate', ['payment' => $payment->uuid])->assertFailed();

    Http::assertNothingSent();
    app()->detectEnvironment(fn () => 'testing');
});

it('reminds a paying customer seven days and one day before their term ends, once each', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(6)->startOfMinute()]);
    $payment = Payment::factory()->for($user)->granted($user->plan_expires_at)->create(['plan_id' => $user->plan_id]);

    artisan('billing:remind-renewals')->assertSuccessful();
    artisan('billing:remind-renewals')->assertSuccessful();
    Notification::assertSentToTimes($user, PlanRenewalReminder::class, 1);
    expect($payment->fresh()->reminded_7d_at)->not->toBeNull();

    $this->travel(5)->days();
    $this->travel(12)->hours();

    artisan('billing:remind-renewals')->assertSuccessful();
    artisan('billing:remind-renewals')->assertSuccessful();
    Notification::assertSentToTimes($user, PlanRenewalReminder::class, 2);
    expect($payment->fresh()->reminded_1d_at)->not->toBeNull();
});

it('does not remind accounts whose term was gifted', function () {
    User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(3)]);

    artisan('billing:remind-renewals')->assertSuccessful();

    Notification::assertNothingSent();
});

it('does not remind when the end date no longer comes from the payment', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(3)->startOfMinute()]);
    Payment::factory()->for($user)->granted(now()->addDays(1))->create(['plan_id' => $user->plan_id]);

    artisan('billing:remind-renewals')->assertSuccessful();

    Notification::assertNothingSent();
});

it('does not send the seven-day reminder for a term bought in the last two days', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(6)->startOfMinute()]);
    Payment::factory()->for($user)->granted($user->plan_expires_at)->create(['plan_id' => $user->plan_id, 'granted_at' => now()->subHour()]);

    artisan('billing:remind-renewals')->assertSuccessful();

    Notification::assertNothingSent();
});

it('points the reminder at the plan card, not at checkout', function () {
    config(['services.frontend_url' => 'https://gocast.test']);
    $product = Product::where('slug', 'pro-3-months')->first();
    $user = User::factory()->onPlan('pro')->create();
    $payment = Payment::factory()->for($user)->granted(now()->addDay())->create(['product_id' => $product->id]);

    $mail = (new PlanRenewalReminder($payment, lastDay: true))->toMail($user);
    $bell = (new PlanRenewalReminder($payment, lastDay: true))->toDatabase($user);

    expect($mail->subject)->toBe('Your GoCast Pro ends tomorrow')
        ->and($mail->actionUrl)->toBe('https://gocast.test/dashboard/settings')
        ->and($bell['title'])->toBe('Your Pro ends tomorrow')
        ->and($bell['action']['url'])->toEndWith('/dashboard/settings');
});
