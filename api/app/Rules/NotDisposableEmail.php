<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Refuses an address at a throwaway mail provider.
 *
 * The 2026-10-27 probe verified its account through one (maxxspace.com): a
 * disposable inbox is how a script gets past email verification at no cost.
 * The list is resources/data/disposable-email-domains.txt; a subdomain of a
 * listed domain counts too, so `x.mailinator.com` is caught by `mailinator.com`.
 *
 * Applied where an address enters the system (sign-up, email change), never to
 * an address already on file: a few existing accounts use these providers and
 * must keep working.
 */
class NotDisposableEmail implements ValidationRule
{
    /** @var array<string, true>|null */
    private static ?array $domains = null;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! str_contains($value, '@')) {
            return;
        }

        if (self::isDisposable($value)) {
            $fail('Please use a permanent email address. Temporary inboxes can’t be used to sign up.');
        }
    }

    public static function isDisposable(string $email): bool
    {
        $domain = strtolower(trim(substr($email, strrpos($email, '@') + 1), " .\t\n\r"));

        $domains = self::domains();

        // Walk up the labels: a.b.example.com, b.example.com, example.com.
        while ($domain !== '' && str_contains($domain, '.')) {
            if (isset($domains[$domain])) {
                return true;
            }

            $domain = substr($domain, strpos($domain, '.') + 1);
        }

        return false;
    }

    /**
     * @return array<string, true>
     */
    private static function domains(): array
    {
        if (self::$domains !== null) {
            return self::$domains;
        }

        $lines = file(resource_path('data/disposable-email-domains.txt'), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];

        $domains = [];
        foreach ($lines as $line) {
            $line = strtolower(trim($line));
            if ($line !== '' && $line[0] !== '#') {
                $domains[$line] = true;
            }
        }

        return self::$domains = $domains;
    }
}
