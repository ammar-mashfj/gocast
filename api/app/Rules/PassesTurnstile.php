<?php

namespace App\Rules;

use App\Services\Turnstile;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Refuses a Turnstile token Cloudflare does not accept, or one minted by
 * another form's widget (`$action`, matching the client's `action` prop).
 *
 * Only a definite refusal fails; Cloudflare being unreachable passes (see
 * Turnstile::verify).
 */
class PassesTurnstile implements ValidationRule
{
    public const MESSAGE = 'We couldn’t confirm you’re not a bot. Please try again.';

    public function __construct(private readonly string $action) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || app(Turnstile::class)->verify($value, request()->ip(), $this->action) === false) {
            $fail(self::MESSAGE);
        }
    }
}
