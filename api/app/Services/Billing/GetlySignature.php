<?php

namespace App\Services\Billing;

/**
 * Getly's webhook signature (V2): `X-Getly-Signature-V2: t=<unix>,v1=<hex>`
 * where v1 is the HMAC-SHA256 of "<t>.<raw body>" keyed with the endpoint
 * secret. A delivery older or newer than five minutes is refused, so a
 * captured request can't be replayed later.
 *
 * Over the raw bytes, never re-encoded JSON. sign() is what the tests use to
 * produce a delivery Getly would.
 */
final class GetlySignature
{
    public const TOLERANCE_SECONDS = 300;

    public static function sign(string $rawBody, string $secret, int $timestamp): string
    {
        return 't='.$timestamp.',v1='.hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);
    }

    public static function verify(string $rawBody, ?string $header, string $secret, ?int $now = null): bool
    {
        if ($secret === '' || $header === null || $header === '') {
            return false;
        }

        $timestamp = null;
        $signatures = [];

        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');

            if ($key === 't' && ctype_digit($value)) {
                $timestamp = (int) $value;
            } elseif ($key === 'v1' && $value !== '') {
                $signatures[] = strtolower($value);
            }
        }

        if ($timestamp === null || $signatures === [] || abs(($now ?? time()) - $timestamp) > self::TOLERANCE_SECONDS) {
            return false;
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);

        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return false;
    }
}
