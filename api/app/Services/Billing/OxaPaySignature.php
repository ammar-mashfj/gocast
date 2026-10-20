<?php

namespace App\Services\Billing;

/**
 * OxaPay's webhook signature: an HMAC-SHA512 of the raw request body, keyed
 * with the merchant API key, in the `HMAC` header.
 *
 * Over the raw bytes, never re-encoded JSON — a re-encode reorders or
 * re-escapes and the hash no longer matches. sign() is what
 * billing:simulate and the tests use to produce a webhook OxaPay would.
 */
final class OxaPaySignature
{
    public static function sign(string $rawBody, string $merchantKey): string
    {
        return hash_hmac('sha512', $rawBody, $merchantKey);
    }

    public static function verify(string $rawBody, ?string $header, string $merchantKey): bool
    {
        if ($merchantKey === '' || $header === null || $header === '') {
            return false;
        }

        return hash_equals(self::sign($rawBody, $merchantKey), strtolower(trim($header)));
    }
}
