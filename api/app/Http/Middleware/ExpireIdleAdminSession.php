<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class ExpireIdleAdminSession
{
    private const IDLE_SECONDS = 8 * 60 * 60;

    public function handle(Request $request, Closure $next): Response
    {
        $session = $request->session();
        $lastActivity = $session->get('admin.last_activity');
        $now = now()->timestamp;

        if ($lastActivity !== null && ($now - $lastActivity) > self::IDLE_SECONDS) {
            Auth::guard('admin')->logout();
            $session->invalidate();
            $session->regenerateToken();

            return redirect('/admin/login');
        }

        $session->put('admin.last_activity', $now);

        return $next($request);
    }
}
