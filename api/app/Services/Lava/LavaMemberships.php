<?php

namespace App\Services\Lava;

use App\Models\LavaMembership;
use App\Models\User;
use App\Services\AdminTelegram;

/**
 * Stopping an account's monthly lava.top charges.
 *
 * Every active membership, not just the newest: an account can end up with
 * two (two payment pages both paid), and turning auto-renew off must stop
 * all of them.
 */
class LavaMemberships
{
    public function __construct(
        private readonly LavaClient $lava,
        private readonly AdminTelegram $telegram,
    ) {}

    /**
     * Cancel every active membership on $user's account with lava.top, and
     * mark each one cancelled here. Returns the ones lava.top could not be
     * reached for, still active.
     *
     * @return list<LavaMembership>
     */
    public function cancelAll(User $user): array
    {
        $failed = [];

        $memberships = LavaMembership::where('user_id', $user->id)
            ->where('status', LavaMembership::STATUS_ACTIVE)
            ->get();

        foreach ($memberships as $membership) {
            try {
                $this->lava->cancelMembership($membership->contract_id, $membership->email);
            } catch (LavaException $e) {
                report($e);
                $failed[] = $membership;

                continue;
            }

            // Marked now rather than waiting for lava.top's webhook, so the
            // page reloads into the right state; the webhook then fills in
            // the end date.
            $membership->forceFill([
                'status' => LavaMembership::STATUS_CANCELLED,
                'cancelled_at' => now(),
            ])->save();
        }

        return $failed;
    }

    /**
     * The account is being deleted: stop its charges. A deletion is never
     * refused over this (that would trap the user in an account they want
     * gone), so whatever lava.top didn't accept goes to the admin instead.
     */
    public function cancelForDeletedAccount(User $user): void
    {
        foreach ($this->cancelAll($user) as $membership) {
            $this->telegram->lavaNeedsReview(
                'Deleted account still has a monthly plan',
                "The account was deleted, but lava.top could not be reached to cancel membership {$membership->contract_id}. Cancel it in lava.top by hand, or they keep being charged.",
                $membership->email,
            );
        }
    }
}
