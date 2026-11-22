<?php

namespace App\Services\Billing;

/**
 * Getly's webhook signature (V2): `X-Getly-Signature-V2: t=<unix>,v1=<hex>`
 * where v1 is the HMAC-SHA256 of "<t>.<raw body>" keyed with the endpoint
 * secret.
 *
 * The timestamp window is three days, not the five minutes Getly suggests:
 * it's undocumented whether a retry (1 min, 5 min, 30 min, 2 h) is signed
 * afresh, and a refused retry of a store-page sale, refund or dispute has no
 * other way in. A replay of a genuine delivery can't do anything new — every
 * handler is once-only (GetlySales) — and a forged one still fails the HMAC.
 *
 * Over the raw bytes, never re-encoded JSON. sign() is what the tests use to
 * produce a delivery Getly would.
 */
final class GetlySignature
{
    public const TOLERANCE_SECONDS = 3 * 24 * 60 * 60;

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
