<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Handles email/password authentication (register, login, logout, user profile).
 */
class AuthController extends Controller
{
    private const AUTH_COOKIE = 'token';

    /**
     * Per-account lockout threshold — after this many failed attempts against
     * the same email+IP combo, the account is locked for LOCKOUT_SECONDS.
     * Complements the per-IP throttle:auth limiter (10/min) which only blocks
     * a single attacker's IP; this one slows distributed credential-stuffing.
     */
    private const MAX_LOGIN_ATTEMPTS = 5;

    private const LOCKOUT_SECONDS = 900; // 15 minutes

    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
        ]);

        $user->sendEmailVerificationNotification();

        $token = $user->createToken('auth')->plainTextToken;

        return response()->json([
            'data' => $user,
            'message' => 'Registration successful. Please verify your email.',
        ], 201)->withCookie($this->authCookie($request, $token));
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $key = $this->loginRateKey($request);

        if (RateLimiter::tooManyAttempts($key, self::MAX_LOGIN_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($key);

            throw ValidationException::withMessages([
                'email' => "Too many login attempts. Try again in {$seconds} seconds.",
            ])->status(429);
        }

        if (! Auth::attempt($request->only('email', 'password'))) {
            RateLimiter::hit($key, self::LOCKOUT_SECONDS);

            return response()->json([
                'message' => 'Invalid credentials.',
            ], 401);
        }

        RateLimiter::clear($key);

        $user = Auth::user();
        $token = $user->createToken('auth')->plainTextToken;

        // If the user's still pending verification, issue a fresh code now so
        // the client can open the verify modal on a code that's guaranteed
        // live — otherwise a user logging in after the 15-min TTL would land
        // on an empty modal and have to click Resend.
        if (! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
        }

        return response()->json([
            'data' => $user,
            'message' => 'Login successful.',
        ])->withCookie($this->authCookie($request, $token));
    }

    /**
     * Build the per-account lockout key. Scoped to email+IP so a single
     * malicious IP can't DoS a legit user by spamming wrong passwords against
     * their email — a different IP (the real owner) isn't locked out.
     */
    private function loginRateKey(LoginRequest $request): string
    {
        return 'login:'.Str::lower((string) $request->input('email')).'|'.$request->ip();
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out.',
        ])->withCookie($this->forgetAuthCookie());
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user(),
        ]);
    }

    private function authCookie(Request $request, string $token): Cookie
    {
        return cookie(
            self::AUTH_COOKIE,
            $token,
            (int) config('sanctum.expiration', 43200),
            '/',
            config('session.domain'),
            $request->isSecure(),
            true,
            false,
            'lax',
        );
    }

    private function forgetAuthCookie(): Cookie
    {
        return cookie()->forget(
            self::AUTH_COOKIE,
            '/',
            config('session.domain'),
        );
    }
}
