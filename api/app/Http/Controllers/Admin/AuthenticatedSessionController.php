<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

/**
 * Session login/logout for the `admin` guard.
 *
 * Session-based, not token-based: the panel is server-rendered Blade on the
 * API host, so there is no SPA to hand a token to, and nothing here shares a
 * credential with the public application.
 */
class AuthenticatedSessionController extends Controller
{
    public function create(): View
    {
        return view('admin.login');
    }

    public function store(LoginRequest $request): RedirectResponse
    {
        $admin = $request->authenticate();

        // Password right, code still owed: park who this is in the session
        // and ask for it. Nothing is signed in until the code checks out.
        if ($admin->hasTwoFactorEnabled()) {
            $request->session()->regenerate();
            $request->session()->put(TwoFactorChallengeController::SESSION_KEY, [
                'id' => $admin->getKey(),
                'remember' => $request->boolean('remember'),
                'expires_at' => now()->addMinutes(TwoFactorChallengeController::PENDING_MINUTES)->getTimestamp(),
            ]);

            return redirect()->route('admin.two-factor.challenge');
        }

        Auth::guard('admin')->login($admin, $request->boolean('remember'));

        $request->session()->regenerate();

        return redirect()->intended(route('admin.stations.index'));
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('admin')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('admin.login');
    }
}
