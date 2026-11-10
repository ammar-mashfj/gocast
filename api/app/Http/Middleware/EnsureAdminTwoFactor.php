<?php

namespace App\Http\Middleware;

use App\Models\Admin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sends a signed-in admin without two-factor sign-in to set it up before any
 * other panel page. Off only when security.admin_two_factor_required is false
 * — an escape hatch for the server, not a setting to live with.
 */
class EnsureAdminTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        $admin = $request->user('admin');

        if ($admin instanceof Admin
            && config('security.admin_two_factor_required')
            && ! $admin->hasTwoFactorEnabled()) {
            return redirect()->guest(route('admin.two-factor.setup'));
        }

        return $next($request);
    }
}
