<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class StreamTokenController extends Controller
{
    use AuthorizesRequests;

    public function __invoke(Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $token = Str::random(64);

        cache()->put("stream-token:{$station->id}", $token, now()->addMinutes(5));

        return response()->json([
            'data' => [
                'token' => $token,
                'expires_in' => 300,
            ],
        ]);
    }
}
