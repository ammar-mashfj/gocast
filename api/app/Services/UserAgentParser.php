<?php

namespace App\Services;

/**
 * Coarse device class and browser family from a User-Agent string.
 *
 * Deliberately crude, and deliberately dependency-free. The question a station
 * owner actually asks is "do people listen on their phone or at a desk?", and
 * that needs three buckets, not a parser library with a versioned pattern
 * database behind it. Anything finer would also sharpen these rows into
 * something closer to a fingerprint, which is the opposite of the direction
 * this schema is pointed.
 *
 * Order matters in both methods — tablets identify as mobile, Edge and Opera
 * identify as Chrome, and Chrome identifies as Safari. Each list is written
 * most-specific first.
 */
class UserAgentParser
{
    public function device(?string $agent): ?string
    {
        if ($agent === null || trim($agent) === '') {
            return null;
        }

        // iPad's modern UA says "Macintosh" and is only distinguishable by the
        // touch hint, so tablets are matched on the explicit markers first.
        if (preg_match('/\b(iPad|Tablet|PlayBook|Silk)\b/i', $agent)) {
            return 'tablet';
        }

        if (preg_match('/\b(Android|iPhone|iPod|Mobile|IEMobile|Opera Mini)\b/i', $agent)) {
            return 'mobile';
        }

        // Hardware and software players that aren't browsers at all. They can
        // only reach this code once the manifest is served through Laravel;
        // until then no non-browser client ever gets a session.
        if (preg_match('/\b(VLC|mpv|foobar2000|Winamp|iTunes|AppleCoreMedia|Sonos|Roku)\b/i', $agent)) {
            return 'player';
        }

        return 'desktop';
    }

    public function browser(?string $agent): ?string
    {
        if ($agent === null || trim($agent) === '') {
            return null;
        }

        $families = [
            'Edge' => '/\bEdg(e|A|iOS)?\//i',
            'Opera' => '/\b(OPR|Opera)\//i',
            'Samsung' => '/\bSamsungBrowser\//i',
            'Firefox' => '/\b(Firefox|FxiOS)\//i',
            'Chrome' => '/\b(Chrome|CriOS|Chromium)\//i',
            'Safari' => '/\bSafari\//i',
        ];

        foreach ($families as $name => $pattern) {
            if (preg_match($pattern, $agent)) {
                return $name;
            }
        }

        return 'Other';
    }
}
