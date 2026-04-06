<?php

namespace App\Http\Controllers;

use App\Models\StreamSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class UpdateListenerCountController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'station_id' => ['required', 'string'],
            'count' => ['required', 'integer', 'min:0'],
        ]);

        Redis::set("listeners:{$request->station_id}", $request->count);

        if ($request->count > 0) {
            StreamSession::where('station_id', $request->station_id)
                ->whereNull('ended_at')
                ->where('peak_listeners', '<', $request->count)
                ->update(['peak_listeners' => $request->count]);
        }

        return response()->json(['message' => 'Listener count updated.']);
    }
}
