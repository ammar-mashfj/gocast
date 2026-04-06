<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class UpdateMetadataController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'station_id' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'artist' => ['nullable', 'string', 'max:255'],
        ]);

        Redis::set("metadata:{$request->station_id}", json_encode([
            'title' => $request->title,
            'artist' => $request->artist ?? '',
        ]));

        return response()->json(['message' => 'Metadata updated.']);
    }
}
