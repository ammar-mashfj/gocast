<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * API-only replacement for Laravel's EnsureEmailIsVerified.
 *
 * Emits a stable machine-readable `code: "email_unverified"` field alongside
 * the message so the frontend can distinguish verification 403s from policy
 * 403s without string-matching the English message (which would break under
 * translation or Laravel's own wording changes).
 */
class EnsureEmailIsVerified
{
    public const CODE = 'email_unverified';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ($user instanceof MustVerifyEmail && ! $user->hasVerifiedEmail())) {
            return response()->json([
                'message' => 'Your email address is not verified.',
                'code' => self::CODE,
            ], 403);
        }

        return $next($request);
    }
}
