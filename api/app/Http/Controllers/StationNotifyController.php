<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StationNotifySubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Anonymous "notify me when this station goes live" opt-in endpoint.
 *
 * Idempotent — submitting the same email twice returns success without
 * creating a duplicate row. If that email was already notified for a previous
 * live session, submitting again opts it into the next live session.
 */
class StationNotifyController extends Controller
{
    public function store(Request $request, string $slug): JsonResponse
    {
        $email = strtolower(trim((string) $request->input('email')));
        $request->merge(['email' => $email]);

        $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
        ]);

        $station = Station::where('slug', $slug)->firstOrFail();

        $subscription = StationNotifySubscription::firstOrNew(
            ['station_id' => $station->id, 'email' => $email],
        );

        $subscription->notified_at = null;
        $subscription->save();

        return response()->json([
            'message' => "We'll email you when {$station->name} goes live.",
        ]);
    }
}
