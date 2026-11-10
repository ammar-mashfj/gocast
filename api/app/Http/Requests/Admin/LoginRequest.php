<?php

namespace App\Http\Requests\Admin;

use App\Models\Admin;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Admin login attempt. Mirrors Laravel's own starter-kit LoginRequest so the
 * behaviour is the conventional one — throttled by email+IP, failures
 * reported on the `email` field, lockout raised as a Lockout event.
 *
 * On top of that, a per-IP budget that ignores the email: the email+IP key
 * alone gives a client five fresh guesses for every address it types in,
 * which is exactly what a credential-stuffing run looks like.
 *
 * Authenticates against the `admin` guard only; a `users` row can never log
 * in here no matter what credentials it presents.
 *
 * Checks the password without signing in: an admin with two-factor login
 * still has a code to give (TwoFactorChallengeController), so signing in is
 * the controller's call once it knows which step comes next.
 */
class LoginRequest extends FormRequest
{
    /**
     * Attempts allowed per email+IP before the lockout kicks in.
     */
    private const MAX_ATTEMPTS = 5;

    /**
     * Failed attempts allowed from one IP, across every email, per window.
     * Shared with the two-factor code step, so guesses there spend it too.
     */
    public const MAX_ATTEMPTS_PER_IP = 20;

    /**
     * How long the per-IP budget takes to refill, in seconds.
     */
    public const IP_DECAY_SECONDS = 900;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ];
    }

    /**
     * @throws ValidationException
     */
    public function authenticate(): Admin
    {
        $this->ensureIsNotRateLimited();

        $guard = Auth::guard('admin');
        $credentials = $this->only('email', 'password');

        if (! $guard->validate($credentials)) {
            RateLimiter::hit($this->throttleKey());
            RateLimiter::hit($this->ipThrottleKey(), self::IP_DECAY_SECONDS);

            // attempt() would raise this itself; validate() does not, and the
            // authentication log records failures from it.
            event(new Failed('admin', $guard->getLastAttempted(), $credentials));

            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        RateLimiter::clear($this->throttleKey());

        /** @var Admin $admin */
        $admin = $guard->getLastAttempted();

        return $admin;
    }

    /**
     * @throws ValidationException
     */
    public function ensureIsNotRateLimited(): void
    {
        $key = match (true) {
            RateLimiter::tooManyAttempts($this->ipThrottleKey(), self::MAX_ATTEMPTS_PER_IP) => $this->ipThrottleKey(),
            RateLimiter::tooManyAttempts($this->throttleKey(), self::MAX_ATTEMPTS) => $this->throttleKey(),
            default => null,
        };

        if ($key === null) {
            return;
        }

        event(new Lockout($this));

        $seconds = RateLimiter::availableIn($key);

        throw ValidationException::withMessages([
            'email' => trans('auth.throttle', [
                'seconds' => $seconds,
                'minutes' => ceil($seconds / 60),
            ]),
        ]);
    }

    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('email')->value()).'|'.$this->ip());
    }

    /**
     * Not cleared by a successful login: one valid admin credential must not
     * reset the budget for guesses against every other admin.
     */
    public function ipThrottleKey(): string
    {
        return self::ipThrottleKeyFor((string) $this->ip());
    }

    public static function ipThrottleKeyFor(string $ip): string
    {
        return 'admin-login-ip|'.$ip;
    }
}
