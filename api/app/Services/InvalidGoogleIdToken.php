<?php

namespace App\Services;

use RuntimeException;

/**
 * A Google ID token that must not sign anyone in: a bad signature, the wrong
 * audience or issuer, an expired token, or an unverified email. The message
 * is for the logs; the person only ever sees "Google sign-in failed".
 */
class InvalidGoogleIdToken extends RuntimeException {}
