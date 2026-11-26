<?php

namespace App\Http\Controllers;

use App\Services\LavaSales;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Cancel the account's lava.top monthly subscription from the Account page.
 * Pro stays until the end of what was paid for; the answer says when that is.
 */
class LavaSubscriptionController extends Controller
{
    public function __invoke(Request $request, LavaSales $sales): JsonResponse
    {
        $user = $request->user();
        $refusal = $sales->cancel($user);

        if ($refusal !== null) {
            return response()->json(['message' => $refusal], $user->lava_subscription_contract_id === null ? 409 : 502);
        }

        return response()->json(['data' => ['pro_until' => $user->fresh()->plan_expires_at]]);
    }
}
