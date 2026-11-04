<?php

namespace App\Rules;

use App\Services\DisposableEmail;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Refuses an address at a throwaway mail provider.
 *
 * The 2026-10-27 probe verified its account through one (maxxspace.com): a
 * disposable inbox is how a script gets past email verification at no cost.
 * What counts as throwaway (a listed domain, or one whose mail servers are
 * listed) is DisposableEmail's call.
 *
 * Applied where an address enters the system (sign-up, email change, a new
 * Google account), never to an address already on file: a few existing
 * accounts use these providers and must keep working.
 */
class NotDisposableEmail implements ValidationRule
{
    public const MESSAGE = 'Please use a permanent email address. Temporary inboxes can’t be used to sign up.';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! str_contains($value, '@')) {
            return;
        }

        if (app(DisposableEmail::class)->isDisposable($value)) {
            $fail(self::MESSAGE);
        }
    }
}
