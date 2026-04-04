<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadRequest;
use Illuminate\Http\JsonResponse;

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
