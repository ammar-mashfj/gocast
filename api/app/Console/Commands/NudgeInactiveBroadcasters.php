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
 *   - Have never completed a broadcast
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
            ->whereDoesntHave('streamSessions', function ($q) {
                $q->whereNotNull('ended_at');
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
