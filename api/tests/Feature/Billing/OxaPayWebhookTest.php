<?php

use App\Models\Discount;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\ProAccessGranted;
use App\Services\Billing\OxaPaySignature;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;

use function Pest\Laravel\call;

/**
 * /api/webhooks/oxapay: the signature, the once-only grant, and every status
 * that must NOT grant. Bodies are shaped like OxaPay's documented IPNs,
 * capitalised status and all.
 */
const OXAPAY_TEST_KEY = 'test-merchant-key';

beforeEach(function () {
    config([
        'services.oxapay.merchant_key' => OXAPAY_TEST_KEY,
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);
    Notification::fake();
    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
});

/**
 * @param  array<string, mixed>  $overrides
 */
function oxapayWebhook(Payment $payment, string $status, array $overrides = [], ?string $key = OXAPAY_TEST_KEY): TestResponse
{
    $body = json_encode(array_merge([
        'track_id' => $payment->track_id,
        'status' => $status,
        'type' => 'invoice',
        'module_name' => 'OxaPay',
        'amount' => 10,
        'value' => 20,
        'currency' => 'POL',
        'order_id' => $payment->uuid,
        'date' => now()->getTimestamp(),
        'txs' => [],
    ], $overrides));

    $headers = ['CONTENT_TYPE' => 'application/json'];

    if ($key !== null) {
        $headers['HTTP_HMAC'] = OxaPaySignature::sign($body, $key);
    }

    return call('POST', '/api/webhooks/oxapay', [], [], [], $headers, $body);
}

function telegramAlerts(): int
{
    // Payment alerts only — creating the account in the test sends its own.
    return collect(Http::recorded())
        ->filter(fn ($pair) => str_contains($pair[0]->url(), 'api.telegram.org') && str_contains((string) ($pair[0]['text'] ?? ''), 'ayment'))
        ->count();
}

it('grants the plan on Paid and answers ok', function () {
    $payment = Payment::factory()->create(['duration_count' => 3]);

    oxapayWebhook($payment, 'Paid')->assertOk()->assertSeeText('ok');

    $payment->refresh();
    $user = $payment->user->fresh();

    expect($payment->status)->toBe('paid')
        ->and($payment->granted_at)->not->toBeNull()
        ->and($user->plan_id)->toBe(Plan::where('slug', 'pro')->value('id'))
        ->and($user->plan_expires_at->toDateString())->toBe(now()->addMonthsNoOverflow(3)->toDateString())
        ->and($payment->granted_until->equalTo($user->plan_expires_at))->toBeTrue();

    Notification::assertSentTo($user, ProAccessGranted::class);
    expect(telegramAlerts())->toBe(1);
});

it('grants once however many times OxaPay redelivers', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Paid')->assertOk();
    $until = $payment->user->fresh()->plan_expires_at;
    oxapayWebhook($payment, 'Paid')->assertOk();
    oxapayWebhook($payment, 'Paid')->assertOk();

    expect($payment->user->fresh()->plan_expires_at->equalTo($until))->toBeTrue();
    Notification::assertSentToTimes($payment->user, ProAccessGranted::class, 1);
});

it('adds the term to a running Pro term instead of restarting it', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(10)]);
    $payment = Payment::factory()->for($user)->create();

    oxapayWebhook($payment, 'Paid');

    expect($user->fresh()->plan_expires_at->toDateString())->toBe(now()->addDays(10)->addMonthNoOverflow()->toDateString());
});

it('grants a lifetime purchase with no end date, on top of a running term', function () {
    $user = User::factory()->onPlan('pro')->create(['plan_expires_at' => now()->addDays(10)]);
    $payment = Payment::factory()->for($user)->create(['duration_unit' => 'lifetime', 'duration_count' => null]);

    oxapayWebhook($payment, 'Paid')->assertOk();

    expect($user->fresh()->plan_expires_at)->toBeNull()
        ->and($payment->fresh()->granted_at)->not->toBeNull()
        ->and($payment->fresh()->granted_until)->toBeNull();

    Notification::assertSentTo($user, ProAccessGranted::class);
});

it('grants on manual accept', function () {
    $payment = Payment::factory()->create(['status' => 'underpaid']);

    oxapayWebhook($payment, 'Manual Accept')->assertOk();

    expect($payment->fresh())->status->toBe('manual_accept')->granted_at->not->toBeNull()->review_reason->toBeNull();
});

it('does not grant while the payment is only paying', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Paying')->assertOk();

    expect($payment->fresh())->status->toBe('paying')->granted_at->toBeNull();
    expect($payment->user->fresh()->plan_expires_at)->toBeNull();
});

it('flags an underpaid invoice for review without granting, and alerts once', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Underpaid');
    oxapayWebhook($payment, 'Underpaid');

    expect($payment->fresh())->granted_at->toBeNull()->review_reason->toContain('Underpaid');
    expect(telegramAlerts())->toBe(1);
});

it('never moves a granted payment backwards on a late Paying', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Paid');
    oxapayWebhook($payment, 'Paying');

    expect($payment->fresh()->status)->toBe('paid');
});

it('flags a refund after the grant but leaves the plan alone', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Paid');
    oxapayWebhook($payment, 'Refunded');

    expect($payment->fresh())->status->toBe('refunded')->review_reason->toContain('Revoke it by hand');
    expect($payment->user->fresh()->plan_id)->toBe(Plan::where('slug', 'pro')->value('id'));
});

it('flags a paid invoice it cannot grant instead of overwriting a hand-made plan', function () {
    $custom = Plan::factory()->create();
    $user = User::factory()->create(['plan_id' => $custom->id]);
    $payment = Payment::factory()->for($user)->create();

    oxapayWebhook($payment, 'Paid')->assertOk();

    expect($payment->fresh())->status->toBe('paid')->granted_at->toBeNull()->review_reason->toContain('Paid, but not granted');
    expect($user->fresh()->plan_id)->toBe($custom->id);
});

it('flags a paid invoice whose account was deleted', function () {
    $payment = Payment::factory()->create();
    $payment->user->delete();

    oxapayWebhook($payment, 'Paid')->assertOk();

    expect($payment->fresh())->granted_at->toBeNull()->review_reason->toContain('account has been deleted');
});

it('refuses to act on an order id that is not this payment', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Paid', ['order_id' => 'someone-else'])->assertOk();

    expect($payment->fresh())->granted_at->toBeNull()->review_reason->toContain('order id');
});

it('counts a coupon use when its payment is granted', function () {
    $coupon = Discount::factory()->create();
    $payment = Payment::factory()->create(['discount_id' => $coupon->id, 'discount_code' => $coupon->code]);

    oxapayWebhook($payment, 'Paid');
    oxapayWebhook($payment, 'Paid');

    expect($coupon->fresh()->redemptions_count)->toBe(1);
});

it('records an expired invoice', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Expired');

    expect($payment->fresh()->status)->toBe('expired');
});

it('acknowledges a track id it never issued', function () {
    $payment = Payment::factory()->make(['track_id' => '999', 'uuid' => 'not-ours']);

    oxapayWebhook($payment, 'Paid')->assertOk();
});

it('rejects a bad or missing signature', function () {
    $payment = Payment::factory()->create();

    oxapayWebhook($payment, 'Paid', key: 'wrong-key')->assertUnauthorized();
    oxapayWebhook($payment, 'Paid', key: null)->assertUnauthorized();

    expect($payment->fresh()->granted_at)->toBeNull();
});

it('refuses everything while no merchant key is set', function () {
    $payment = Payment::factory()->create();
    config(['services.oxapay.merchant_key' => '']);

    oxapayWebhook($payment, 'Paid', key: '')->assertStatus(503);
});
