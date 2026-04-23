<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePasswordRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Notifications\EmailChangedNotification;
use App\Notifications\PasswordChangedNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * Account self-service: update profile, change password, delete account.
 *
 * Privacy policy commits to "delete your account from the dashboard" — these
 * routes back that promise. Password change revokes all sibling tokens so a
 * leaked old session can't continue.
 */
class AccountController extends Controller
{
    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        // Strip current_password before fill — it's a confirmation field, not
        // a column. UpdateProfileRequest already validated it via current_password.
        $data = collect($request->validated())->except('current_password')->all();

        // An email change means the new address is unvetted — revoke the
        // verified status, issue a fresh code, and tell the previous address
        // so the original owner can detect an unauthorised change.
        $emailChanged = array_key_exists('email', $data) && $data['email'] !== $user->email;
        $previousEmail = $user->email;

        $user->fill($data);

        if ($emailChanged) {
            $user->email_verified_at = null;
        }

        $user->save();

        if ($emailChanged) {
            $user->sendEmailVerificationNotification();

            // Route to the now-stale previous address using an on-demand
            // notification — the old email is no longer on any user record.
            Notification::route('mail', $previousEmail)
                ->notify(new EmailChangedNotification($user->name, $user->email));
        }

        return response()->json([
            'data' => $user->fresh(),
            'message' => $emailChanged
                ? 'Profile updated. Check your new email for a verification code.'
                : 'Profile updated.',
        ]);
    }

    public function updatePassword(UpdatePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->password = Hash::make($request->validated('password'));
        $user->save();

        // Revoke every other access token for this user so a stolen session
        // is invalidated by the password change.
        $currentTokenId = $user->currentAccessToken()?->id;
        $user->tokens()->where('id', '!=', $currentTokenId)->delete();

        // Out-of-band alert: if an attacker drove this change from a hijacked
        // session, the real owner gets a heads-up in their inbox.
        $user->notify(new PasswordChangedNotification($request->ip()));

        return response()->json(['message' => 'Password updated.']);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => ['required', 'string', 'current_password'],
        ]);

        $user = $request->user();

        // Soft-delete (User uses SoftDeletes). Tokens revoked so the current
        // session can't continue acting on a "deleted" account. Release unique
        // identifiers first so the owner can re-register with the same email
        // and Google account later.
        $user->tokens()->delete();
        $user->forceFill([
            'email' => 'deleted-'.$user->id.'-'.Str::uuid().'@deleted.gocast.local',
            'google_id' => null,
            'avatar_url' => null,
            'email_verified_at' => null,
        ])->save();
        $user->delete();

        return response()->json(['message' => 'Account deleted.']);
    }
}
