<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Rejects `#{` in station text that reaches the Liquidsoap container.
 *
 * Defence in depth only. On 2026-11-02 a station name of
 * `#{process.run('...')}` ran shell commands inside its container, because
 * Liquidsoap evaluates `#{...}` in string literals and the name was rendered
 * into the script as one. The real fix is that the name no longer goes into
 * the script at all (LiquidsoapSupervisor::renderStationMeta); this keeps the
 * payload out of the database in case a later change puts it back.
 *
 * Nobody names a station with `#{`, so the rule costs no real user anything.
 */
class NoLiquidsoapInterpolation implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && self::contains($value)) {
            $fail('The :attribute can’t contain “#{”.');
        }
    }

    public static function contains(string $value): bool
    {
        return str_contains($value, '#{');
    }
}
