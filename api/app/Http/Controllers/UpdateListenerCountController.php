<?php

namespace App\Http\Controllers;

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

        return response()->json(['message' => 'Listener count updated.']);
    }
}
