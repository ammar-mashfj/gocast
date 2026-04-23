<?php

namespace App\Http\Controllers;

use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Models\PasswordResetCode;
use App\Models\User;
use App\Notifications\PasswordChangedNotification;
use App\Notifications\PasswordResetCode as PasswordResetCodeNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Public password-reset flow using a 6-digit code emailed to the user.
 *
 * forgot() issues a code (always 200 to prevent account enumeration).
 * reset() consumes a valid code, rotates the password, and revokes every
 * existing Sanctum token for the user so any hijacked session dies with
 * the credential rotation.
 */
class PasswordResetController extends Controller
{
    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        $email = Str::lower($request->string('email')->value());
        $user = User::where('email', $email)->first();

        // Respond the same regardless of whether the account exists — attackers
        // shouldn't be able to probe which emails are registered. Only issue
        // and send a code if there's actually a user waiting for it.
        if ($user) {
            $code = (string) random_int(100000, 999999);

            PasswordResetCode::updateOrCreate(
                ['email' => $email],
                [
                    'code_hash' => Hash::make($code),
                    'attempts' => 0,
                    'expires_at' => now()->addMinutes(PasswordResetCode::CODE_TTL_MINUTES),
                ],
            );

            $user->notify(new PasswordResetCodeNotification($code, PasswordResetCode::CODE_TTL_MINUTES));
        }

        return response()->json([
            'message' => 'If that email is registered, we\'ve sent a reset code.',
        ]);
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $email = Str::lower($request->string('email')->value());
        $submittedCode = $request->string('code')->value();

        $record = PasswordResetCode::query()->find($email);

        // A missing record for an otherwise-validated email is almost always
        // a forged or expired-and-swept attempt. Fail the same way as a bad
        // code so the attacker can't distinguish.
        if (! $record || $record->isExpired()) {
            throw ValidationException::withMessages([
                'code' => 'Code expired. Request a new one.',
            ]);
        }

        if ($record->attempts >= PasswordResetCode::MAX_ATTEMPTS) {
            throw ValidationException::withMessages([
                'code' => 'Too many attempts. Request a new code.',
            ]);
        }

        if (! Hash::check($submittedCode, $record->code_hash)) {
            $record->increment('attempts');

            throw ValidationException::withMessages([
                'code' => 'Invalid code.',
            ]);
        }

        $user = User::where('email', $email)->first();

        // Extremely unlikely (the user would have to be deleted between
        // forgot and reset) but treat it as a tampering attempt.
        if (! $user) {
            throw ValidationException::withMessages([
                'code' => 'Invalid code.',
            ]);
        }

        DB::transaction(function () use ($user, $record, $request) {
            $user->password = Hash::make($request->string('password')->value());
            $user->save();

            // Revoke every Sanctum token — any session compromised before the
            // reset is now dead. The user will log in again on the next
            // protected request (the axios 401 interceptor handles it).
            $user->tokens()->delete();

            // Single-use code.
            $record->delete();
        });

        $user->notify(new PasswordChangedNotification($request->ip()));

        return response()->json([
            'message' => 'Password reset. Sign in with your new password.',
        ]);
    }
}
