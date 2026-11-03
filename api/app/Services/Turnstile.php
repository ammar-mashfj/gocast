<?php

namespace App\Services;

use App\Rules\PassesTurnstile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Cloudflare Turnstile's server-side check of a widget token.
 *
 * A token proves the browser passed Cloudflare's bot check, once: siteverify
 * accepts each token a single time, within five minutes of its issue.
 */
class Turnstile
{
    public const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    private const TIMEOUT_SECONDS = 3;

    public function enabled(): bool
    {
        return filled(config('services.turnstile.secret'));
    }

    /**
     * Validation rules for `turnstile_token` on a form the widget guards
     * (sign-up, sign-in, forgot password): required while a secret is set,
     * ignored without one.
     *
     * @return list<mixed>
     */
    public static function rules(): array
    {
        return app(self::class)->enabled()
            ? ['required', 'string', 'max:2048', new PassesTurnstile]
            : ['nullable'];
    }

    /**
     * A missing token reads like a refused one: to the visitor both mean the
     * widget didn't get them through, and the fix is the same.
     *
     * @return array<string, string>
     */
    public static function messages(): array
    {
        return ['turnstile_token.required' => PassesTurnstile::MESSAGE];
    }

    /**
     * True when Cloudflare accepts the token, false when it refuses it, null
     * when Cloudflare could not be asked (timeout, outage), which callers
     * treat as a pass: an outage there must not lock people out here.
     */
    public function verify(string $token, ?string $ip = null): ?bool
    {
        try {
            $body = Http::asForm()
                ->timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::TIMEOUT_SECONDS)
                ->post(self::ENDPOINT, array_filter([
                    'secret' => config('services.turnstile.secret'),
                    'response' => $token,
                    'remoteip' => $ip,
                ]))
                ->throw()
                ->json();
        } catch (Throwable $e) {
            Log::warning('Turnstile siteverify failed; accepting the request', ['error' => $e->getMessage()]);

            return null;
        }

        if (! is_array($body) || ! array_key_exists('success', $body)) {
            Log::warning('Turnstile siteverify answered oddly; accepting the request', ['body' => $body]);

            return null;
        }

        if ($body['success'] !== true) {
            $codes = $body['error-codes'] ?? [];

            // A wrong or missing secret is our fault, not the visitor's.
            if (array_intersect($codes, ['missing-input-secret', 'invalid-input-secret'])) {
                Log::error('Turnstile secret key is wrong; accepting the request', ['codes' => $codes]);

                return null;
            }

            Log::info('Turnstile refused a request', ['codes' => $codes]);

            return false;
        }

        return true;
    }
}
