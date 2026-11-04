<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The mail servers a domain receives on (its MX hosts), looked up over
 * DNS-over-HTTPS.
 *
 * DoH rather than dns_get_record(): PHP's resolver takes its timeout from
 * resolv.conf (5 seconds per attempt by default) and cannot be told
 * otherwise, and this runs inside a sign-up request. Over HTTP the whole
 * lookup is capped at TIMEOUT_SECONDS. Only the domain leaves the server,
 * never the address.
 */
class MxLookup
{
    public const ENDPOINT = 'https://cloudflare-dns.com/dns-query';

    private const TIMEOUT_SECONDS = 2;

    private const TYPE_MX = 15;

    private const STATUS_NOERROR = 0;

    private const STATUS_NXDOMAIN = 3;

    /**
     * Lowercased hosts without the trailing dot; an empty list when the
     * domain has no MX records or does not exist; null when the lookup itself
     * failed (timeout, resolver error), which callers treat as "don't know".
     *
     * @return list<string>|null
     */
    public function hosts(string $domain): ?array
    {
        try {
            $body = Http::timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::TIMEOUT_SECONDS)
                ->withHeaders(['Accept' => 'application/dns-json'])
                ->get(self::ENDPOINT, ['name' => $domain, 'type' => 'MX'])
                ->throw()
                ->json();
        } catch (Throwable $e) {
            Log::warning('MX lookup failed; accepting the address', ['domain' => $domain, 'error' => $e->getMessage()]);

            return null;
        }

        $status = is_array($body) ? ($body['Status'] ?? null) : null;

        if ($status === self::STATUS_NXDOMAIN) {
            return [];
        }

        if ($status !== self::STATUS_NOERROR) {
            Log::warning('MX lookup failed; accepting the address', ['domain' => $domain, 'status' => $status]);

            return null;
        }

        $hosts = [];

        foreach ($body['Answer'] ?? [] as $record) {
            if (($record['type'] ?? null) !== self::TYPE_MX || ! is_string($record['data'] ?? null)) {
                continue;
            }

            // "10 in.mail.tm."
            $parts = preg_split('/\s+/', trim($record['data']));
            $host = strtolower(rtrim((string) end($parts), '.'));

            if ($host !== '') {
                $hosts[] = $host;
            }
        }

        return array_values(array_unique($hosts));
    }
}
