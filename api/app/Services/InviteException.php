<?php

namespace App\Services;

use RuntimeException;

/**
 * An invite could not be redeemed, for a reason the person holding the link
 * can understand. Same shape as StationLifecycleException: a stable code for
 * the SPA to branch on and a sentence to show if it does not.
 */
class InviteException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    public static function notFound(): self
    {
        return new self('invite_not_found', "That invite code isn't valid. Check the link you were sent.", 404);
    }

    public static function exhausted(): self
    {
        return new self('invite_used', 'This invite has already been used.');
    }

    public static function expired(): self
    {
        return new self('invite_expired', 'This invite link has expired.');
    }

    public static function alreadyRedeemed(): self
    {
        return new self('invite_already_redeemed', 'Your account has already used an invite.');
    }

    public static function alreadyOnPlan(string $planName): self
    {
        return new self('invite_plan_already_held', "Your account is already on {$planName}, so this invite has nothing to add.");
    }
}
