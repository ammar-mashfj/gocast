<?php

namespace App\Http\Controllers;

use App\Models\LavaMembership;
use App\Models\LavaPayment;
use App\Services\Billing\CheckoutRefused;
use App\Services\Lava\LavaCheckout;
use App\Services\Lava\LavaMemberships;
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
 * - cancelMembership(): turns auto-renew off, for every membership the
 *   account has. Pro stays to the end of the time already paid for.
 */
class LavaBillingController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        $active = LavaMembership::where('user_id', $user->id)->where('status', LavaMembership::STATUS_ACTIVE)->get();
        $latest = $active->sortByDesc('id')->first() ?? LavaMembership::where('user_id', $user->id)->latest('id')->first();

        return response()->json(['data' => [
            'enabled' => LavaCheckout::enabled(),
            'membership_product' => (string) config('services.lava.membership_product'),
            'membership' => $latest ? [
                'status' => $latest->status,
                // True while ANY membership still charges: an account can
                // have two, and one cancelled must not hide the other.
                'renews' => $active->isNotEmpty(),
                'started_at' => $latest->created_at->toIso8601String(),
                'cancelled_at' => $latest->cancelled_at?->toIso8601String(),
                'next_charge_at' => $active->map(fn (LavaMembership $m) => $m->nextChargeAt())->filter()->sort()->first()?->toIso8601String(),
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

    public function cancelMembership(Request $request, LavaMemberships $memberships): JsonResponse
    {
        $user = $request->user();

        if (LavaMembership::activeFor($user) === null) {
            return response()->json(['message' => "You don't have a monthly plan that renews."], 404);
        }

        if ($memberships->cancelAll($user) !== []) {
            return response()->json(['message' => "We couldn't reach the payment provider. Please try again in a minute."], 502);
        }

        return response()->json(['data' => ['renews' => false]]);
    }
}
