<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Tells a throwaway mail address from a permanent one.
 *
 * Two checks, cheapest first:
 *   1. The domain (or a parent of it) is on resources/data/disposable-email-domains.txt,
 *      the maintained list that email:refresh-disposable keeps current.
 *   2. The domain's mail servers are on resources/data/disposable-mx-hosts.txt.
 *      A name list is always one domain behind: mail.tm registers new domains
 *      every few days (fldubai.com got five sign-ups on 2026-11-02 before any
 *      list had it), but they all receive on in.mail.tm.
 *
 * The MX lookup fails open: when DNS cannot answer, the address is accepted
 * (MxLookup logs it). A resolver hiccup must never stop real people signing
 * up. Answers are cached per domain for a day, so a run of sign-ups at the
 * same provider costs one lookup.
 */
class DisposableEmail
{
    private const MX_CACHE_HOURS = 24;

    /** @var array<string, true>|null */
    private static ?array $domains = null;

    /** @var array<string, true>|null */
    private static ?array $mailServers = null;

    public function __construct(private MxLookup $mx) {}

    public function isDisposable(string $email): bool
    {
        $domain = self::domainOf($email);

        if ($domain === '') {
            return false;
        }

        return self::isListedDomain($domain) || $this->usesDisposableMailServer($domain);
    }

    /**
     * The name check alone; a subdomain of a listed domain counts too, so
     * `x.mailinator.com` is caught by `mailinator.com`.
     */
    public static function isListedDomain(string $domain): bool
    {
        return self::inSet(strtolower($domain), self::domains());
    }

    public function usesDisposableMailServer(string $domain): bool
    {
        // Only something shaped like a hostname goes to DNS. Junk that the
        // `email` rule is about to reject anyway would only fill the logs
        // with failed lookups.
        if (! preg_match('/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,}$/', $domain)) {
            return false;
        }

        $key = 'disposable-email:mx:'.$domain;
        $hosts = Cache::get($key);

        if (! is_array($hosts)) {
            $hosts = $this->mx->hosts($domain);

            // A failed lookup is not cached: the next sign-up asks again.
            if ($hosts === null) {
                return false;
            }

            Cache::put($key, $hosts, now()->addHours(self::MX_CACHE_HOURS));
        }

        $servers = self::mailServers();

        foreach ($hosts as $host) {
            if (self::inSet($host, $servers)) {
                return true;
            }
        }

        return false;
    }

    private static function domainOf(string $email): string
    {
        if (! str_contains($email, '@')) {
            return '';
        }

        return strtolower(trim(substr($email, strrpos($email, '@') + 1), " .\t\n\r"));
    }

    /**
     * Whether the name or any parent of it is in the set: a.b.example.com,
     * b.example.com, example.com.
     *
     * @param  array<string, true>  $set
     */
    private static function inSet(string $name, array $set): bool
    {
        while ($name !== '' && str_contains($name, '.')) {
            if (isset($set[$name])) {
                return true;
            }

            $name = substr($name, strpos($name, '.') + 1);
        }

        return false;
    }

    /**
     * The refreshed list when email:refresh-disposable has run, else the copy
     * bundled with the code, plus our own additions either way, so an entry
     * added to the ours file works from the deploy that ships it.
     *
     * @return array<string, true>
     */
    private static function domains(): array
    {
        if (self::$domains !== null) {
            return self::$domains;
        }

        $refreshed = (string) config('security.disposable_domains_list');
        $maintained = is_file($refreshed) ? $refreshed : resource_path('data/disposable-email-domains.txt');

        return self::$domains = self::readList($maintained) + self::readList(self::oursPath());
    }

    /**
     * Domains we block that the maintained list may not have (yet). Never
     * overwritten by the refresh.
     */
    public static function oursPath(): string
    {
        return resource_path('data/disposable-email-domains-ours.txt');
    }

    /**
     * Drop the lists read so far, for a process that outlives a refresh.
     */
    public static function forgetLists(): void
    {
        self::$domains = null;
        self::$mailServers = null;
    }

    /**
     * @return array<string, true>
     */
    private static function mailServers(): array
    {
        return self::$mailServers ??= self::readList(resource_path('data/disposable-mx-hosts.txt'));
    }

    /**
     * One entry per line; blank lines and `#` comments are skipped.
     *
     * @return array<string, true>
     */
    public static function readList(string $path): array
    {
        $lines = is_file($path) ? (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []) : [];

        $entries = [];

        foreach ($lines as $line) {
            $line = strtolower(trim($line));

            if ($line !== '' && $line[0] !== '#') {
                $entries[$line] = true;
            }
        }

        return $entries;
    }
}
