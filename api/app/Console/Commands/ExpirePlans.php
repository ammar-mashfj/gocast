<?php

namespace App\Console\Commands;

use App\Models\Plan;
use App\Models\User;
use App\Notifications\PlanExpired;
use Illuminate\Console\Command;

/**
 * Moves accounts whose time-limited plan has run out back to Free.
 *
 * The first thing in the codebase to end a plan automatically. Before this,
 * every grant was open-ended in practice whatever the email promised, and
 * ending one meant an admin remembering to click Revoke. `plan_expires_at` is
 * set only by InviteRedemption today, from the invite's `duration_days`.
 *
 * What it does NOT do, deliberately and for the same reason as
 * AccessRequestController::revoke: nothing is deleted or stopped. The caps are
 * enforced when a station is created and when one is started, never on the
 * way down, so a downgraded account keeps its station and its library and is
 * simply held to the free limits from here on. Deleting somebody's work
 * because a trial ended would be a far worse default than letting them sit
 * over a line.
 *
 * Each user is saved individually rather than mass-updated so UserObserver
 * fires and pushes the watermark into any running container, exactly as a
 * hand revoke does.
 */
class ExpirePlans extends Command
{
    protected $signature = 'plans:expire';

    protected $description = 'Move accounts whose time-limited plan has ended back to the free plan';

    public function handle(): int
    {
        $free = Plan::where('slug', 'free')->first();

        if (! $free) {
            $this->error('No plan with the slug "free" exists, so there is nowhere to move expired accounts to.');

            return self::FAILURE;
        }

        $expired = 0;

        // lazyById, not each(): the loop nulls the very column the WHERE
        // matches on, so offset pagination would skip every second page once
        // more than a chunk of accounts expire in the same hour (a shared
        // invite with a high use count does exactly that). Keyset paging is
        // immune — the same reason AnalyzeTracksCommand uses it.
        $users = User::query()
            ->with('plan')
            ->where('plan_expires_at', '<=', now())
            // Already free with a stale date is a no-op we still want to
            // clear, so the row stops matching tomorrow.
            ->lazyById(500);

        foreach ($users as $user) {
            $endedPlan = $user->plan;

            $user->forceFill([
                'plan_id' => $free->id,
                'plan_expires_at' => null,
            ])->save();

            if ($endedPlan && $endedPlan->isNot($free)) {
                $user->notify(new PlanExpired($endedPlan, $free));
                $expired++;
            }
        }

        $this->info("Moved {$expired} account(s) back to {$free->name}.");

        return self::SUCCESS;
    }
}
