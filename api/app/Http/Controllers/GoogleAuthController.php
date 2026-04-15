<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

/**
 * Handles Google OAuth2 authentication via Socialite.
 */
class GoogleAuthController extends Controller
{
    /**
     * Initiate the stateless Google OAuth flow.
     *
     * Stateless is required because the API and frontend are on separate
     * domains, so session-based CSRF state cannot be shared.
     */
    public function redirect(): RedirectResponse
    {
        return Socialite::driver('google')->stateless()->redirect();
    }

    /**
     * Handle the OAuth callback from Google.
     *
     * Finds an existing user by Google ID or email, or creates a new one.
     * If the user already exists by email (e.g. registered with password),
     * their account is linked to Google. Email is auto-verified since
     * Google already confirmed ownership.
     */
    public function callback(): RedirectResponse
    {
        $frontendUrl = config('services.frontend_url');

        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable) {
            return redirect("{$frontendUrl}/auth/callback?error=google_auth_failed");
        }

        $user = User::where('google_id', $googleUser->getId())->first();

        if (! $user) {
            $user = User::where('email', $googleUser->getEmail())->first();

            if ($user) {
                $user->update([
                    'google_id' => $googleUser->getId(),
                    'avatar_url' => $user->avatar_url ?? $googleUser->getAvatar(),
                ]);
            } else {
                $user = User::create([
                    'name' => $googleUser->getName(),
                    'email' => $googleUser->getEmail(),
                    'google_id' => $googleUser->getId(),
                    'avatar_url' => $googleUser->getAvatar(),
                    'password' => Hash::make(Str::random(32)),
                ]);
            }
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        $token = $user->createToken('auth')->plainTextToken;

        return redirect("{$frontendUrl}/auth/callback?token={$token}");
    }
}
