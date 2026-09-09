<?php

namespace App\Http\Controllers;

use App\Models\Invite;
use App\Services\InviteException;
use App\Services\InviteRedemption;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The public face of an invite link.
 *
 * show()   What the sign-up page calls on load, so a dead link says so before
 *          anyone fills in a form. Public, throttled, and deliberately thin:
 *          the plan name and whether the code still works. Nothing about who
 *          minted it or who used it.
 * redeem() Applies a code to the signed-in account: how a code typed after
 *          the fact is honoured.
 *
 * A code that arrives with a sign-up does not come here at all —
 * AuthController::register redeems it inside the insert transaction, and
 * GoogleAuthController::callback redeems the one it carried through OAuth.
 */
class InviteController extends Controller
{
    public function show(string $code): JsonResponse
    {
        $invite = Invite::with('plan:id,name,slug')->where('code', $code)->first();

        if (! $invite) {
            throw InviteException::notFound();
        }

        return response()->json([
            'data' => [
                'plan' => [
                    'slug' => $invite->plan->slug,
                    'name' => $invite->plan->name,
                ],
                'duration_days' => $invite->duration_days,
                'redeemable' => $invite->isRedeemable(),
                // Which of the two reasons, so the page can say "used" rather
                // than "expired" — they suggest different next steps.
                'reason' => match (true) {
                    $invite->isExpired() => 'expired',
                    $invite->isExhausted() => 'used',
                    default => null,
                },
            ],
        ]);
    }

    public function redeem(Request $request, InviteRedemption $invites): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40'],
        ]);

        $invite = $invites->redeem($data['code'], $request->user());

        return response()->json([
            'data' => [
                'plan' => [
                    'slug' => $invite->plan->slug,
                    'name' => $invite->plan->name,
                ],
                'plan_expires_at' => $request->user()->plan_expires_at,
            ],
            'message' => "You're on {$invite->plan->name}.",
        ]);
    }
}
