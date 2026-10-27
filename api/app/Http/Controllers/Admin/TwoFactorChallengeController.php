<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use App\Http\Requests\Admin\TwoFactorCodeRequest;
use App\Models\Admin;
use App\Services\Totp;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * The second step of an admin sign-in: the six-digit code from the
 * authenticator app, after AuthenticatedSessionController has accepted the
 * password and parked the admin's id in the session.
 *
 * Wrong codes are limited twice over: five per pending sign-in, after which
 * the password has to be given again, and the same per-IP budget the
 * password step spends (LoginRequest::MAX_ATTEMPTS_PER_IP).
 */
class TwoFactorChallengeController extends Controller
{
    public const SESSION_KEY = 'admin.two_factor_pending';

    /** How long a correct password stays good for while the code is typed. */
    public const PENDING_MINUTES = 5;

    private const MAX_ATTEMPTS = 5;

    public function create(Request $request): View|RedirectResponse
    {
        if ($this->pendingAdmin($request) === null) {
            return redirect()->route('admin.login');
        }

        return view('admin.two-factor-challenge');
    }

    public function store(TwoFactorCodeRequest $request, Totp $totp): RedirectResponse
    {
        $admin = $this->pendingAdmin($request);

        if ($admin === null) {
            return redirect()->route('admin.login')
                ->withErrors(['email' => 'That sign-in expired. Enter your password again.']);
        }

        $ipKey = LoginRequest::ipThrottleKeyFor((string) $request->ip());
        $adminKey = 'admin-two-factor|'.$admin->getKey();

        if (RateLimiter::tooManyAttempts($ipKey, LoginRequest::MAX_ATTEMPTS_PER_IP)) {
            event(new Lockout($request));
            $request->session()->forget(self::SESSION_KEY);

            return redirect()->route('admin.login')->withErrors(['email' => trans('auth.throttle', [
                'seconds' => RateLimiter::availableIn($ipKey),
                'minutes' => ceil(RateLimiter::availableIn($ipKey) / 60),
            ])]);
        }

        $step = $totp->verify((string) $admin->two_factor_secret, $request->string('code')->value(), $admin->two_factor_last_step);

        if ($step === null) {
            RateLimiter::hit($ipKey, LoginRequest::IP_DECAY_SECONDS);
            RateLimiter::hit($adminKey, self::PENDING_MINUTES * 60);

            if (RateLimiter::tooManyAttempts($adminKey, self::MAX_ATTEMPTS)) {
                RateLimiter::clear($adminKey);
                $request->session()->forget(self::SESSION_KEY);

                return redirect()->route('admin.login')
                    ->withErrors(['email' => 'Too many wrong codes. Enter your password again.']);
            }

            throw ValidationException::withMessages(['code' => 'That code isn’t right. Check the time on your phone and try the newest one.']);
        }

        RateLimiter::clear($adminKey);

        $admin->forceFill(['two_factor_last_step' => $step])->save();

        $remember = (bool) $request->session()->pull(self::SESSION_KEY)['remember'];

        Auth::guard('admin')->login($admin, $remember);

        $request->session()->regenerate();

        return redirect()->intended(route('admin.stations.index'));
    }

    private function pendingAdmin(Request $request): ?Admin
    {
        $pending = $request->session()->get(self::SESSION_KEY);

        if (! is_array($pending) || ($pending['expires_at'] ?? 0) < now()->getTimestamp()) {
            $request->session()->forget(self::SESSION_KEY);

            return null;
        }

        $admin = Admin::query()->find($pending['id'] ?? null);

        return $admin?->hasTwoFactorEnabled() ? $admin : null;
    }
}
