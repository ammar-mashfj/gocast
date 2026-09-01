<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProAccessRequest;
use App\Http\Requests\StoreWaitlistRequest;
use App\Models\WaitlistEntry;
use Illuminate\Http\JsonResponse;

/**
 * Captures access requests for the plans that have no checkout behind them.
 *
 * Two entry points on purpose, because the two audiences are different:
 *
 * - store()    Custom/enterprise enquiries. Public, from strangers who may
 *              never have signed up. The email is untrusted input.
 * - storePro() Pro access. Authenticated, from an account we can open and
 *              look at. The email comes from the session.
 *
 * Both land in the same table so the admin queue stays one list; `user_id`
 * tells the reviewer which kind they are looking at.
 */
class WaitlistController extends Controller
{
    public function store(StoreWaitlistRequest $request): JsonResponse
    {
        $data = $request->validated();

        return $this->record(
            email: $data['email'],
            plan: $data['plan'],
            social: $data['social'],
            message: $data['message'] ?? null,
        );
    }

    /**
     * Pro access, requested from inside the dashboard.
     *
     * `email` and `plan` are deliberately not read from the body — see
     * StoreProAccessRequest. The account email is also the verified one
     * (User implements MustVerifyEmail), which is most of why moving this
     * behind auth was worth doing at all.
     */
    public function storePro(StoreProAccessRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();

        return $this->record(
            email: $user->email,
            plan: 'pro',
            social: $data['social'],
            message: $data['message'] ?? null,
            userId: $user->id,
        );
    }

    /**
     * Latest submission wins: someone resubmitting is almost always fixing
     * their link or adding detail, not creating a second request. The unique
     * (email, plan) index would otherwise turn that into a 500.
     */
    private function record(
        string $email,
        string $plan,
        string $social,
        ?string $message,
        ?int $userId = null,
    ): JsonResponse {
        $entry = WaitlistEntry::updateOrCreate(
            ['email' => $email, 'plan' => $plan],
            [
                'user_id' => $userId,
                'social' => $social,
                'message' => $message,
            ],
        );

        // A resubmit after a dismissal is almost always someone adding the
        // detail that was missing the first time, so it goes back in the
        // queue. Without this the row silently updates behind a `rejected`
        // status the admin queue filters out, and their second attempt is
        // never seen by anyone.
        //
        // An approved request is deliberately left alone: they already have
        // the plan, and reopening it would ask an admin to grant it twice.
        if ($entry->status === WaitlistEntry::STATUS_REJECTED) {
            $entry->reopen();
        }

        return response()->json([
            'message' => 'Request received.',
        ], 201);
    }
}
