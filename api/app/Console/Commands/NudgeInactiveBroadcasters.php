<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Notifications\InactiveBroadcasterNudge;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Send a one-time "you haven't broadcast yet" nudge to users who:
 *   - Have a verified email (we have permission to email them)
 *   - Signed up roughly 7 days ago
 *   - Are still on the free plan
 *   - Have never completed a broadcast
 *
 * "Never completed a broadcast" is narrower than it sounds, and the free-plan
 * gate is what keeps it honest. `stream_sessions` rows are written only when a
 * human connects, so a station on air with AutoDJ is invisible to this query —
 * see App\Models\StreamSession. AutoDJ is paid-only, so gating on the free
 * plan excludes the accounts that exception actually misreads. It is a proxy,
 * not a fix: a paid account that has genuinely never broadcast is now never
 * nudged, and a free account that is live *right now* still reads as inactive
 * because the check below wants a closed session.
 *
 * Idempotency comes from the notifications table — we check whether this
 * notification class has already been sent to the user before dispatching.
 */
#[Signature('app:nudge-inactive-broadcasters {--dry-run : Show who would be notified without sending}')]
#[Description('Email users who signed up ~7 days ago and have never broadcast')]
class NudgeInactiveBroadcasters extends Command
{
    public function handle(): int
    {
        $candidates = User::query()
            ->whereNotNull('email_verified_at')
            ->whereBetween('created_at', [now()->subDays(8), now()->subDays(7)])
            // Free accounts only. Both routes onto a paid plan — an admin
            // approving an access request, an invite redeemed at sign-up —
            // are conversations that already happened, so the copy below
            // ("you signed up about a week ago") is addressed to the wrong
            // person. It also spares the account most likely to be broadcasting
            // invisibly to the check beneath: AutoDJ is itself a paid feature
            // (`plans.autodj_enabled` is false on free), and a station running
            // an unattended playlist writes no stream_sessions rows at all.
            ->whereRelation('plan', 'slug', 'free')
            // Deleted stations still count as having broadcast. Station soft-
            // deletes, and a has-many-through hides rows whose intermediate
            // model is trashed, so without withTrashed() somebody who went live
            // and then deleted the station reads as if they never had — and is
            // invited to try their first broadcast. The 30-day deleted-station
            // retention (stations:prune-deleted) comfortably outlives this
            // command's 8-day window, so the evidence is still on the table to
            // find. Written against `stations` rather than the `streamSessions`
            // has-many-through because the scope has to be lifted from the
            // intermediate model, which is exactly what that relation hides.
            ->whereDoesntHave('stations', function ($q) {
                $q->withTrashed()->whereHas('streamSessions', function ($session) {
                    $session->whereNotNull('ended_at');
                });
            })
            ->get();

        $sent = 0;
        foreach ($candidates as $user) {
            $alreadySent = $user->notifications()
                ->where('type', InactiveBroadcasterNudge::class)
                ->exists();

            if ($alreadySent) {
                continue;
            }

            $station = $user->stations()->first();

            if ($this->option('dry-run')) {
                $this->line("would nudge: {$user->email} (station: ".($station?->slug ?? 'none').')');

                continue;
            }

            $user->notify(new InactiveBroadcasterNudge($station?->slug));
            $sent++;
        }

        $this->info("Nudged {$sent} of {$candidates->count()} candidates.");

        return self::SUCCESS;
    }
}
