<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * When a fixed-term grant of a plan ends.
 *
 * One rule for every admin path that writes `plan_expires_at` — approving or
 * renewing a request (AccessRequestController) and an unprompted upgrade from
 * the stations list (StationController). They used to disagree: the request
 * path extended a running grant while the stations path restarted the term
 * from today, so a 1-month gift on top of a paid year cut the year short.
 *
 * conflict() is the other half of that rule, and is shared for the same
 * reason. The two paths act on it differently on purpose: a request grant
 * refuses, because the request is not the place to decide about the account;
 * the stations upgrade IS that place ("change the account by hand"), so its
 * preview shows the same sentence as a warning and the admin decides.
 */
final class PlanTerm
{
    /**
     * Where a new term of $plan starts for $user: the end of a running grant
     * of the same plan, or null for today.
     *
     * Extended, not restarted: somebody who pays while their trial still has
     * days left, or renews a week early, has paid for the full term, and
     * starting it today would take those days back. A different plan, an
     * expired date, or no date at all starts today.
     */
    public static function extendsFrom(User $user, Plan $plan): ?Carbon
    {
        return $user->plan_id === $plan->id && $user->plan_expires_at?->isFuture()
            ? $user->plan_expires_at->copy()
            : null;
    }

    /**
     * Why granting $plan to $user would overwrite something no request asked
     * to change, or null when it is safe.
     *
     * Only Free and $plan itself are safe to write over. An account on any
     * other paid plan was put there by hand — a Custom deal, say — and setting
     * plan_id would silently replace it, possibly with a downgrade. One
     * already on $plan with NO end date has a permanent grant, and a term
     * would turn it into one that expires.
     *
     * Read off the row as given, so callers that act on the answer pass the
     * row they locked.
     */
    public static function conflict(User $user, Plan $plan, bool $withTerm): ?string
    {
        if ($user->plan_id === $plan->id) {
            return $withTerm && $user->plan_expires_at === null
                ? "{$user->email} is already on {$plan->name} with no end date, and a term would make it expire."
                : null;
        }

        $current = Plan::find($user->plan_id);

        if ($current === null) {
            // Without the row there is no telling a Free account from a
            // hand-made deal, and guessing either way could overwrite the deal.
            return "{$user->email} is on a plan that no longer exists, so there is no telling what granting {$plan->name} would replace.";
        }

        return $current->isFree()
            ? null
            : "{$user->email} is on {$current->name}, and granting {$plan->name} would replace it.";
    }

    /**
     * Put $user on $plan for $term, extending a running grant of the same plan.
     *
     * The one writer every grant path shares — an admin approving a request
     * and a confirmed payment — so they cannot disagree about where a term
     * starts or what it may overwrite. The caller holds the user's row lock
     * (lockForUpdate inside its transaction), which is what orders this
     * against plans:expire.
     *
     * Returns [end date, whether it extended a running grant], or conflict()'s
     * sentence when granting would overwrite something nobody asked to change.
     * Nothing is written in that case.
     *
     * @param  array{label: string, weeks: int, months: int}  $term
     * @return array{0: Carbon, 1: bool}|string
     */
    public static function apply(User $user, Plan $plan, array $term): array|string
    {
        $conflict = self::conflict($user, $plan, withTerm: true);

        if ($conflict !== null) {
            return $conflict;
        }

        $start = self::extendsFrom($user, $plan);
        $endsAt = self::endOfTerm($start, $term);

        // An extension of the plan they are already on changes no plan_id,
        // so the common renewal triggers no container fan-out at all.
        $user->forceFill(['plan_id' => $plan->id, 'plan_expires_at' => $endsAt])->save();

        return [$endsAt, $start !== null];
    }

    /**
     * Put $user on $plan with no end date — a lifetime purchase.
     *
     * conflict() without a term: an account already on $plan (on a term or
     * not) is simply made permanent, and one on a hand-made plan is refused
     * exactly as a term would be. Same row-lock contract as apply().
     *
     * @return array{0: null, 1: bool}|string
     */
    public static function applyPermanent(User $user, Plan $plan): array|string
    {
        $conflict = self::conflict($user, $plan, withTerm: false);

        if ($conflict !== null) {
            return $conflict;
        }

        $wasRunning = self::extendsFrom($user, $plan) !== null;

        $user->forceFill(['plan_id' => $plan->id, 'plan_expires_at' => null])->save();

        return [null, $wasRunning];
    }

    /**
     * NoOverflow: three months from 30 November is the end of February, not
     * the 2nd of March. Carbon overflows by default, which would put the
     * account's real end date a couple of days past the one the email names.
     *
     * @param  array{label: string, weeks: int, months: int}  $term
     */
    public static function endOfTerm(?Carbon $from, array $term): Carbon
    {
        return ($from ?? now())->copy()->addWeeks($term['weeks'])->addMonthsNoOverflow($term['months']);
    }
}
