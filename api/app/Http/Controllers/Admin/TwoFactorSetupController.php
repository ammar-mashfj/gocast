<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\TwoFactorCodeRequest;
use App\Models\Admin;
use App\Services\Totp;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Turning on two-factor sign-in for the signed-in admin.
 *
 * The new secret lives in the session until a code from it is accepted, and
 * only then is written to the admin row — so closing the tab halfway leaves
 * the account exactly as it was. Every admin passes through here once:
 * EnsureAdminTwoFactor sends anyone without it to this page.
 *
 * Turning it off, or resetting a lost phone, is `php artisan
 * admin:reset-two-factor` on the server, like admin:reset-password.
 */
class TwoFactorSetupController extends Controller
{
    private const SESSION_KEY = 'admin.two_factor_setup_secret';

    public function show(Request $request, Totp $totp): View|RedirectResponse
    {
        /** @var Admin $admin */
        $admin = $request->user('admin');

        if ($admin->hasTwoFactorEnabled()) {
            return redirect()->route('admin.stations.index');
        }

        $secret = $request->session()->get(self::SESSION_KEY);

        if (! is_string($secret)) {
            $secret = $totp->generateSecret();
            $request->session()->put(self::SESSION_KEY, $secret);
        }

        return view('admin.two-factor-setup', [
            'secret' => trim(chunk_split($secret, 4, ' ')),
            'uri' => $totp->provisioningUri($secret, $admin->email, config('app.name').' Admin'),
        ]);
    }

    public function store(TwoFactorCodeRequest $request, Totp $totp): RedirectResponse
    {
        /** @var Admin $admin */
        $admin = $request->user('admin');
        $secret = $request->session()->get(self::SESSION_KEY);

        if ($admin->hasTwoFactorEnabled()) {
            return redirect()->route('admin.stations.index');
        }

        if (! is_string($secret)) {
            return redirect()->route('admin.two-factor.setup');
        }

        $step = $totp->verify($secret, $request->string('code')->value());

        if ($step === null) {
            throw ValidationException::withMessages(['code' => 'That code isn’t right. Check the time on your phone and try the newest one.']);
        }

        $admin->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => now(),
            'two_factor_last_step' => $step,
        ])->save();

        $request->session()->forget(self::SESSION_KEY);

        return redirect()->intended(route('admin.stations.index'))
            ->with('status', 'Two-factor sign-in is on. You’ll need a code from your app every time you sign in.');
    }
}
