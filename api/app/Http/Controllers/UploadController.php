<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadRequest;
use Illuminate\Http\JsonResponse;

/**
 * Handles file uploads (e.g. station artwork) to public storage.
 */
class UploadController extends Controller
{
    public function __invoke(UploadRequest $request, string $type): JsonResponse
    {
        $path = $request->file('file')->store(
            "uploads/{$type}",
            'public'
        );

        return response()->json([
            'data' => [
                'url' => asset("storage/{$path}"),
            ],
        ], 201);
    }
}
