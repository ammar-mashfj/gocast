<?php

namespace App\Services;

// Imported as an alias only — geoip2 is an OPTIONAL dependency and this class
// is guarded by class_exists() below. A `use` statement never autoloads, so
// this is safe with the package absent; don't replace the guard with a
// constructor injection.
use GeoIp2\Database\Reader;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Turns a listener's request into a two-letter country code, and their IP into
 * an unlinkable daily hash.
 *
 * This runs ONCE per listening session, at the moment the token is issued —
 * never on a check-in, and never anywhere near the audio path. That single
 * placement is what makes listener geography possible at all here: the
 * /listen call is an ordinary HTTPS request to the API, where Laravel's
 * trusted-proxy config resolves the real client IP. Icecast, sitting behind
 * the same nginx, sees 127.0.0.1 for every listener on earth.
 *
 * The IP is used and discarded. Nothing that leaves this class can be turned
 * back into one.
 */
class GeoResolver
{
    /**
     * Reader instances are expensive to construct (they mmap the database) and
     * cheap to reuse, so one is kept for the life of the process. `false` is
     * the "we already tried and there is no reader" marker, so a missing file
     * costs one failed attempt rather than one per listener.
     */
    private object|false|null $reader = null;

    /**
     * Best available country for this request, or null.
     *
     * Order matters: the CDN header wins because the edge saw the actual
     * connection and we don't have to pay for a lookup. The local database is
     * the fallback for a deployment with no CDN in front.
     */
    public function country(Request $request): ?string
    {
        $header = (string) config('analytics.geo.country_header');

        if ($header !== '' && $request->hasHeader($header)) {
            $code = strtoupper(trim((string) $request->header($header)));

            // Cloudflare sends XX for clients it cannot place and T1 for Tor
            // exit nodes. Both are honest answers to "which country" — the
            // answer is "unknown" — so neither should be stored as one.
            if (preg_match('/^[A-Z]{2}$/', $code) && ! in_array($code, ['XX', 'T1'], true)) {
                return $code;
            }
        }

        return $this->lookup($request->ip());
    }

    /**
     * A per-day, per-installation hash of the IP.
     *
     * Two properties are load-bearing. It is keyed with APP_KEY, so the hashes
     * are useless to anyone who obtains only the database. And the day is part
     * of the key, so the same listener produces a different hash tomorrow —
     * which caps what the data can ever be used for at "count uniques within a
     * day" and makes long-term tracking impossible even for us.
     */
    public function visitorHash(?string $ip): ?string
    {
        if ($ip === null || $ip === '') {
            return null;
        }

        return hash_hmac('sha256', $ip, config('app.key').':'.now()->toDateString());
    }

    /**
     * MaxMind lookup, or null if the database or the package is absent.
     *
     * Absence is a supported state, not an error: geoip2 is an optional
     * dependency and a session with no country is still a perfectly good
     * session. Everything here degrades to null rather than throwing into a
     * listener's request.
     */
    private function lookup(?string $ip): ?string
    {
        if ($ip === null || $ip === '') {
            return null;
        }

        // A private or reserved address means the request never crossed the
        // internet — a health check, a container, or someone on the LAN in
        // development. There is no country to find and no point looking.
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return null;
        }

        $reader = $this->reader();

        if ($reader === false) {
            return null;
        }

        try {
            $country = $reader->country($ip)->country->isoCode;

            return is_string($country) ? strtoupper($country) : null;
        } catch (\Throwable $e) {
            // AddressNotFoundException is the common, boring case — plenty of
            // real addresses simply aren't in GeoLite2. Not worth a log line
            // per listener.
            return null;
        }
    }

    private function reader(): object|false
    {
        if ($this->reader !== null) {
            return $this->reader;
        }

        $path = (string) config('analytics.geo.maxmind_database');

        if (! class_exists(Reader::class) || $path === '' || ! is_readable($path)) {
            return $this->reader = false;
        }

        try {
            return $this->reader = new Reader($path);
        } catch (\Throwable $e) {
            // A corrupt or truncated database file — worth saying once,
            // because it looks identical to "no geo configured" from the
            // dashboard and would otherwise never be noticed.
            Log::warning('GeoResolver could not open the MaxMind database', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);

            return $this->reader = false;
        }
    }
}
