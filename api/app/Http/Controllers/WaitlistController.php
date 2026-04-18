<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreWaitlistRequest;
use App\Models\WaitlistEntry;
use Illuminate\Http\JsonResponse;

/**
 * Captures public waitlist signups for Pro and add-on plans.
 */
class WaitlistController extends Controller
{
    public function store(StoreWaitlistRequest $request): JsonResponse
    {
        WaitlistEntry::create($request->validated());

        return response()->json([
            'message' => "You're on the list! We'll email you when Pro is ready.",
        ], 201);
    }
}
