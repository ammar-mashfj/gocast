<?php

namespace App\Http\Controllers;

use App\Models\EmailVerificationCode;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Handles 6-digit code email verification.
 *
 * send() issues/refreshes a code for the current user and emails it.
 * verify() validates a submitted code, marks the email verified, and fires
 * the Verified event so the WelcomeNotification listener runs.
 */
class EmailVerificationController extends Controller
{
    public function send(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            // Return the user payload too so the frontend — which may be acting
            // on a stale cookie — can refresh local state and redirect past the
            // verification page without a second round-trip.
            return response()->json([
                'data' => $user,
                'message' => 'Email already verified.',
            ]);
        }

        $user->sendEmailVerificationNotification();

        return response()->json([
            'data' => $user,
            'message' => 'Verification email sent.',
        ]);
    }

    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json([
                'data' => $user,
                'message' => 'Email already verified.',
            ]);
        }

        $record = EmailVerificationCode::query()->find($user->id);

        if (! $record || $record->isExpired()) {
            throw ValidationException::withMessages([
                'code' => 'Code expired. Request a new one.',
            ]);
        }

        if ($record->attempts >= EmailVerificationCode::MAX_ATTEMPTS) {
            throw ValidationException::withMessages([
                'code' => 'Too many attempts. Request a new code.',
            ]);
        }

        if (! Hash::check($request->string('code')->value(), $record->code_hash)) {
            $record->increment('attempts');

            throw ValidationException::withMessages([
                'code' => 'Invalid code.',
            ]);
        }

        $user->markEmailAsVerified();
        event(new Verified($user));

        // Single-use: consume the record on success so the same code can't be
        // replayed and so a stale hash doesn't linger in the DB.
        $record->delete();

        return response()->json([
            'data' => $user->fresh(),
            'message' => 'Email verified.',
        ]);
    }
}
