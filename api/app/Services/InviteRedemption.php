<?php

namespace App\Services;

use App\Models\Invite;
use App\Models\User;
use App\Notifications\InviteRedeemed;
use Illuminate\Support\Facades\DB;

/**
 * The one place an invite turns into a plan.
 *
 * Three callers: AuthController::register (the code rode along with the
 * sign-up), GoogleAuthController::callback (the code rode along with the OAuth
 * round trip, in a cookie) and InviteController::redeem (a code typed into an
 * existing account after the fact). All hand over a User and get back the
 * Invite that was consumed.
 *
 * The race this guards is two submits of the same single-use link inside the
 * same second — a double-clicked button, or a link forwarded to a friend who
 * signs up at the same moment. The claim is a single conditional UPDATE
 * (`uses < max_uses`), so exactly one of them advances the counter and the
 * other sees zero affected rows. No row lock is needed for that, and the
 * whole thing sits in a transaction with the caller's user insert so a failed
 * claim never leaves a half-applied account behind.
 */
class InviteRedemption
{
    /**
     * @throws InviteException
     */
    public function redeem(string $code, User $user): Invite
    {
        return DB::transaction(function () use ($code, $user) {
            $invite = Invite::where('code', $code)->first();

            if (! $invite) {
                throw InviteException::notFound();
            }

            // One invite per account. Not a plan check: a Pro account that
            // redeems a second Pro link would otherwise just bump the counter
            // for nothing, and an admin reading `uses` would think the link
            // brought somebody new in.
            if ($user->invite_id !== null) {
                throw InviteException::alreadyRedeemed();
            }

            // An account that already holds a paid plan keeps it. Without
            // this, a permanent Pro grant from an admin would be turned into
            // a 30-day trial (or a Free-plan invite would downgrade it) the
            // moment its owner clicked a forwarded link — the Google path
            // links an existing account by email and then redeems, so the
            // caller cannot tell a new account from an old one.
            //
            // Queried rather than read off the relation so nothing stale is
            // cached on the model: a user created moments ago has no plan_id
            // in memory yet (the column default fills it in), and the plan
            // the caller reads afterwards must be the invite's, not this one.
            $current = $user->plan()->first();

            if ($current && ! $current->isFree()) {
                throw InviteException::alreadyOnPlan($current->name);
            }

            // The claim. Whichever condition fails, zero rows come back; the
            // re-read below only decides which message to show.
            $claimed = Invite::whereKey($invite->id)->redeemable()->increment('uses');

            if ($claimed === 0) {
                $invite->refresh();

                throw $invite->isExpired() ? InviteException::expired() : InviteException::exhausted();
            }

            // forceFill: none of these are in User's Fillable list, on
            // purpose — the API must never accept a plan from a request body.
            $user->forceFill([
                'plan_id' => $invite->plan_id,
                'invite_id' => $invite->id,
                'plan_expires_at' => $invite->duration_days !== null
                    ? now()->addDays($invite->duration_days)
                    : null,
            ])->save();

            // Whoever holds this model next (the Verified listener, the JSON
            // response) reads the plan through the relation, so it has to
            // reflect the row that was just written.
            $user->load('plan');

            // Only if the address is reachable. A fresh sign-up is unverified
            // and about to receive its 6-digit code; the Pro welcome for that
            // account goes out from the Verified listener instead, in place of
            // the generic one. A Google account is verified already, so it
            // gets the email now.
            if ($user->hasVerifiedEmail()) {
                $user->notify(new InviteRedeemed($invite->plan, $user->plan_expires_at));
            }

            return $invite->refresh();
        });
    }
}
