<?php

namespace App\Services;

use RuntimeException;

/**
 * A Google identity that checked out but must not get an account here: a
 * throwaway address for a new account, or an address Google has not verified
 * that would be linked to an existing one. Unlike InvalidGoogleIdToken, the
 * message is for the person, and `reason` is the code the web popup reports.
 */
class GoogleSignInRefused extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
