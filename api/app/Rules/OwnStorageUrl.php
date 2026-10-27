<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts only a URL to a file GoCast itself serves from public storage — what
 * `/upload/images` hands back (`asset('storage/…')`).
 *
 * Station artwork used to take any http(s) URL. On 2026-10-27 a probe set it to
 * an out-of-band callback host (dnslog.cn) to learn whether anything on our
 * side would fetch it: an SSRF test. Nothing did, but an external URL is also
 * rendered as an <img> on a public page, where it can track listeners or be
 * swapped for anything. Every legitimate value in production was already on
 * our own storage host, so the rule costs no real user anything.
 *
 * Host and port must match the storage URL exactly, the path must sit under
 * its `/storage/` prefix, and no `..` segment is allowed. The scheme may differ
 * (http vs https) so a value saved before TLS changed still validates.
 */
class OwnStorageUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! self::passes($value)) {
            $fail('Upload the artwork instead of linking to it.');
        }
    }

    public static function passes(string $url): bool
    {
        $parts = parse_url($url);
        $storage = parse_url(asset('storage/'));

        if ($parts === false || $storage === false || ! isset($parts['host'], $parts['path'], $storage['host'])) {
            return false;
        }

        if (! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
            return false;
        }

        // Credentials in the authority (user@host) are never part of ours.
        if (isset($parts['user']) || isset($parts['pass'])) {
            return false;
        }

        if (strtolower($parts['host']) !== strtolower($storage['host'])
            || ($parts['port'] ?? null) !== ($storage['port'] ?? null)) {
            return false;
        }

        $prefix = rtrim($storage['path'] ?? '/storage', '/').'/';
        $path = rawurldecode($parts['path']);

        return str_starts_with($path, $prefix)
            && ! in_array('..', explode('/', $path), true);
    }
}
