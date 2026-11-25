<?php

namespace App\Http\Controllers;

use App\Models\LavaMembership;
use App\Models\LavaPayment;
use App\Services\Billing\CheckoutRefused;
use App\Services\Lava\LavaCheckout;
use App\Services\Lava\LavaClient;
use App\Services\Lava\LavaException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Card checkout (lava.top) for the dashboard.
 *
 * - status(): whether card checkout is on, which product is the monthly
 *   membership, and the account's own membership, if any.
 * - checkout(): starts a purchase and returns lava.top's payment page.
 * - show(): how far one of the buyer's charges has got, polled by the
 *   dialog while lava.top's page is open in another tab.
 * - cancelMembership(): turns auto-renew off. Pro stays to the end of the
 *   month already paid for.
 */
class LavaBillingController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $membership = LavaMembership::where('user_id', $request->user()->id)->latest('id')->first();

        return response()->json(['data' => [
            'enabled' => LavaCheckout::enabled(),
            'membership_product' => (string) config('services.lava.membership_product'),
            'membership' => $membership ? [
                'status' => $membership->status,
                'renews' => $membership->isActive(),
                'started_at' => $membership->created_at->toIso8601String(),
                'cancelled_at' => $membership->cancelled_at?->toIso8601String(),
                // While it renews, the next charge is roughly when Pro would
                // otherwise end, less the grace days.
                'paid_until' => $request->user()->plan_expires_at?->toIso8601String(),
            ] : null,
        ]]);
    }

    public function checkout(Request $request, LavaCheckout $checkout): JsonResponse
    {
        $data = $request->validate([
            'product' => ['required', 'string', 'max:60'],
            'code' => ['nullable', 'string', 'max:60'],
            'method' => ['nullable', Rule::in(LavaPayment::METHODS)],
        ]);

        try {
            $payment = $checkout->start($request->user(), $data['product'], $data['code'] ?? null, $data['method'] ?? LavaPayment::METHOD_CARD);
        } catch (CheckoutRefused $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }

        return response()->json(['data' => [
            'payment' => $payment->uuid,
            'payment_url' => $payment->payment_url,
        ]], 201);
    }

    public function show(Request $request, LavaPayment $payment): JsonResponse
    {
        // 404, not 403: whether somebody else's payment exists is not ours to confirm.
        abort_unless($payment->user_id === $request->user()->id, 404);

        $state = match (true) {
            $payment->granted_at !== null => 'granted',
            $payment->status === LavaPayment::STATUS_FAILED => 'failed',
            $payment->status === LavaPayment::STATUS_NEW => 'pending',
            default => 'attention',
        };

        return response()->json(['data' => [
            'payment' => $payment->uuid,
            'state' => $state,
            'kind' => $payment->kind,
            'product_name' => $payment->product_name,
            'amount_usd' => $payment->amount_usd,
            'granted_until' => $payment->granted_until?->toIso8601String(),
            'payment_url' => in_array($state, ['pending', 'failed'], true) ? $payment->payment_url : null,
        ]]);
    }

    public function cancelMembership(Request $request, LavaClient $lava): JsonResponse
    {
        $membership = LavaMembership::activeFor($request->user());

        if ($membership === null) {
            return response()->json(['message' => "You don't have a monthly plan that renews."], 404);
        }

        try {
            $lava->cancelMembership($membership->contract_id, $membership->email);
        } catch (LavaException $e) {
            report($e);

            return response()->json(['message' => "We couldn't reach the payment provider. Please try again in a minute."], 502);
        }

        // Marked now rather than waiting for lava.top's webhook, so the page
        // reloads into the right state; the webhook then finds it done.
        $membership->forceFill([
            'status' => LavaMembership::STATUS_CANCELLED,
            'cancelled_at' => now(),
        ])->save();

        return response()->json(['data' => ['renews' => false]]);
    }
}
