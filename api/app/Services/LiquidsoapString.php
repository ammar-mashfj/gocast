<?php

namespace App\Services;

/**
 * Turns a PHP value into a Liquidsoap literal that is only ever data.
 *
 * json_encode alone is NOT enough. It escapes quotes, backslashes and control
 * characters, so a value cannot close the string — but Liquidsoap evaluates
 * `#{...}` inside every string literal, double- or single-quoted, and
 * json_encode leaves `#{` alone. A station named
 * `#{process.run('...')}` ran shell commands in its container on 2026-11-02.
 *
 * So every `#` is written as `\x23`. Verified against the real 2.4.5 binary:
 * `"\x23{process.run(...)}"` evaluates to the literal text `#{process.run(...)}`
 * and runs nothing. (`\#` is a lexer error, not an escape.) It is safe to do
 * on json_encode's output because no JSON escape sequence contains `#`, so
 * the replacement can only ever land on a literal `#` from the value.
 *
 * Non-strings go through json_encode unchanged — an unset password still
 * renders `null`, which fails loudly at boot rather than authenticating with
 * an empty string.
 *
 * Owner-written text (station name, description, genre) does not reach the
 * script at all: it is read at runtime from the JSON sidecar
 * (LiquidsoapSupervisor::renderStationMeta). This is for everything else.
 * Used from the template as `@liq($value)`.
 */
final class LiquidsoapString
{
    public static function literal(mixed $value): string
    {
        return str_replace(
            '#',
            '\x23',
            json_encode($value, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE),
        );
    }
}
