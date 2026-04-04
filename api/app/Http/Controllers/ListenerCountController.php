<?php

namespace App\Http\Controllers;

use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Redis;

class ListenerCountController extends Controller
{
    public function show(string $slug): JsonResponse
    {
        $station = Station::where('slug', $slug)->firstOrFail();

        $count = (int) Redis::get("listeners:{$station->id}") ?: 0;

        return response()->json(['data' => ['count' => $count]]);
    }
}
