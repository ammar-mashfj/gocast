<?php

namespace App\Services;

/**
 * RFC 6238 time-based one-time codes: six digits, SHA-1, 30-second steps —
 * the defaults every authenticator app (Google Authenticator, 1Password,
 * Authy, Aegis) assumes when it scans or is given a setup key.
 *
 * Written here rather than pulled in as a package: it is forty lines of
 * HMAC, and the admin panel is its only user.
 */
class Totp
{
    private const STEP_SECONDS = 30;

    private const DIGITS = 6;

    /** Codes from one step either side are accepted, for clock drift. */
    private const WINDOW = 1;

    private const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /**
     * A new 160-bit secret, base32-encoded (32 characters).
     */
    public function generateSecret(): string
    {
        $bytes = random_bytes(20);
        $bits = '';

        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        $secret = '';
        foreach (str_split($bits, 5) as $chunk) {
            $secret .= self::BASE32[bindec(str_pad($chunk, 5, '0'))];
        }

        return $secret;
    }

    /**
     * The `otpauth://` URI an authenticator app imports.
     */
    public function provisioningUri(string $secret, string $account, string $issuer): string
    {
        return 'otpauth://totp/'.rawurlencode($issuer.':'.$account)
            .'?secret='.$secret
            .'&issuer='.rawurlencode($issuer)
            .'&algorithm=SHA1&digits='.self::DIGITS.'&period='.self::STEP_SECONDS;
    }

    public function code(string $secret, int $step): string
    {
        $hash = hash_hmac('sha1', pack('J', $step), $this->decode($secret), true);
        $offset = ord($hash[19]) & 0x0F;

        $value = ((ord($hash[$offset]) & 0x7F) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);

        return str_pad((string) ($value % 10 ** self::DIGITS), self::DIGITS, '0', STR_PAD_LEFT);
    }

    public function currentStep(?int $timestamp = null): int
    {
        return intdiv($timestamp ?? time(), self::STEP_SECONDS);
    }

    /**
     * The step `$code` belongs to, or null when it matches none in the window.
     * Steps at or before `$lastUsedStep` are refused, so a code — or an older
     * one still inside the window — cannot be replayed.
     */
    public function verify(string $secret, string $code, ?int $lastUsedStep = null, ?int $timestamp = null): ?int
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';

        if (preg_match('/^\d{'.self::DIGITS.'}$/', $code) !== 1) {
            return null;
        }

        $current = $this->currentStep($timestamp);

        for ($step = $current - self::WINDOW; $step <= $current + self::WINDOW; $step++) {
            if ($lastUsedStep !== null && $step <= $lastUsedStep) {
                continue;
            }

            if (hash_equals($this->code($secret, $step), $code)) {
                return $step;
            }
        }

        return null;
    }

    private function decode(string $secret): string
    {
        $secret = strtoupper(preg_replace('/[\s=]+/', '', $secret) ?? '');
        $bits = '';

        foreach (str_split($secret) as $char) {
            $index = strpos(self::BASE32, $char);
            if ($index !== false) {
                $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
            }
        }

        $bytes = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $bytes .= chr(bindec($chunk));
            }
        }

        return $bytes;
    }
}
