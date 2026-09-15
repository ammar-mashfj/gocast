<?php

namespace App\Services;

use RuntimeException;

/**
 * A second send of the same announcement started while the first was running.
 *
 * Refused rather than queued behind the first one, because the two callers who
 * hit this are an admin who clicked the button twice and an admin running the
 * command in a second terminal — and in both cases the honest answer is "that
 * is already happening", not a request that blocks for a minute and then
 * reports that it sent to nobody.
 *
 * Nothing is lost by refusing: the run still in flight is sending to exactly
 * the accounts this one would have, and if it dies halfway the same command
 * run again finishes it. See AnnouncementSender for the guard this protects.
 */
class AnnouncementInProgressException extends RuntimeException
{
    public static function for(string $key): self
    {
        return new self(
            "The announcement [{$key}] is being sent right now. "
            .'Wait for it to finish, then re-run to reach anybody it missed.'
        );
    }
}
