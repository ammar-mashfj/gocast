<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Request-side security signals, sent to the admin Telegram chat.
 *
 * Added after the 2026-10-27 probe, which was noticed only because an operator
 * happened to look at the station list. Two of its tells are visible from
 * inside Laravel: several sign-ups from one address, and an out-of-band
 * callback host (dnslog.cn) typed into a form. The log-side tells — 4xx storms
 * and connections refused for bypassing Cloudflare — are in
 * ScanAccessLogs, because they never reach PHP.
 *
 * Nothing here blocks anything. Every method swallows its own failures: a
 * broken cache must not fail a sign-up.
 */
class SecuritySignals
{
    public function __construct(private readonly AdminTelegram $telegram) {}

    public function registered(string $ip, string $email): void
    {
        try {
            $window = (int) config('security.registrations.window_minutes');
            $perIp = $this->count("registrations:ip:{$ip}", $window);
            $total = $this->count('registrations:total', $window);
        } catch (Throwable $e) {
            Log::warning('Could not count registration for security signals', ['error' => $e->getMessage()]);

            return;
        }

        if ($perIp >= (int) config('security.registrations.per_ip')) {
            $this->telegram->securityAlert(
                "registrations-ip:{$ip}",
                "🚨 <b>Sign-up burst from one address</b>\n"
                ."{$perIp} accounts from <code>{$this->e($ip)}</code> in {$window} min.\n"
                .'Latest: '.$this->e($email),
                $window,
            );
        }

        if ($total >= (int) config('security.registrations.total')) {
            $this->telegram->securityAlert(
                'registrations-total',
                "🚨 <b>Sign-up burst</b>\n{$total} accounts in {$window} min.",
                $window,
            );
        }
    }

    /**
     * The first callback-domain value found in the request, as [field, value],
     * or null. Input fields, then the two headers attackers seed the same way.
     *
     * @return array{0: string, 1: string}|null
     */
    public function findCallbackDomain(Request $request): ?array
    {
        $pattern = $this->callbackPattern();

        if ($pattern === null) {
            return null;
        }

        $sources = ['header:User-Agent' => (string) $request->userAgent(), 'header:Referer' => (string) $request->headers->get('referer')];

        foreach ($this->flatten($request->all()) as $field => $value) {
            $sources[$field] = $value;
        }

        foreach ($sources as $field => $value) {
            if ($value !== '' && preg_match($pattern, $value) === 1) {
                return [(string) $field, $value];
            }
        }

        return null;
    }

    public function callbackDomainSeen(Request $request, string $field, string $value): void
    {
        $ip = (string) $request->ip();

        Log::warning('Callback domain in request input', [
            'ip' => $ip,
            'path' => $request->path(),
            'field' => $field,
            'user_id' => $request->user()?->getAuthIdentifier(),
        ]);

        $this->telegram->securityAlert(
            "callback-domain:{$ip}",
            "🚨 <b>Callback domain in input</b>\n"
            .$this->e($request->method().' /'.$request->path())."\n"
            .'Field: <code>'.$this->e($field)."</code>\n"
            .'Value: <code>'.$this->e(mb_substr($value, 0, 200))."</code>\n"
            .'From <code>'.$this->e($ip).'</code>'
            .($request->user() ? ' · user '.$this->e((string) $request->user()->getAuthIdentifier()) : ''),
        );
    }

    /**
     * Fixed window: the counter's expiry is set by its first hit.
     */
    private function count(string $key, int $windowMinutes): int
    {
        $key = 'security:'.$key;

        Cache::add($key, 0, now()->addMinutes($windowMinutes));

        return (int) Cache::increment($key);
    }

    private function callbackPattern(): ?string
    {
        /** @var list<string> $domains */
        $domains = config('security.callback_domains', []);

        if ($domains === []) {
            return null;
        }

        $alternation = implode('|', array_map(fn (string $domain) => preg_quote($domain, '/'), $domains));

        // A host ending in one of the domains: either the domain itself or a
        // subdomain of it, not just any text containing it.
        return '/(?<![a-z0-9-])(?:[a-z0-9-]+\.)*(?:'.$alternation.')(?![a-z0-9-])/i';
    }

    /**
     * Every string in a nested input array, keyed by its dotted path. Capped,
     * so a giant payload cannot make the scan expensive.
     *
     * @param  array<mixed>  $input
     * @return array<string, string>
     */
    private function flatten(array $input, string $prefix = '', int &$budget = 500): array
    {
        $out = [];

        foreach ($input as $key => $value) {
            if ($budget <= 0) {
                break;
            }

            $path = $prefix === '' ? (string) $key : "{$prefix}.{$key}";

            // The matched value goes to Telegram; a secret never should.
            if (preg_match('/password|token|secret|code/i', (string) $key) === 1) {
                continue;
            }

            if (is_array($value)) {
                $out += $this->flatten($value, $path, $budget);
            } elseif (is_string($value)) {
                $budget--;
                $out[$path] = $value;
            }
        }

        return $out;
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
