<?php

namespace App\Http\Controllers;

use App\Services\Billing\GetlySales;
use App\Services\Billing\GetlySignature;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Where Getly reports sales and refunds (registered in Getly for
 * `sale.completed` and `order.refunded`; `checkout_link.completed` is
 * handled too if it is ever added).
 *
 * Signed with the endpoint secret (GetlySignature). Processed inline, like
 * the OxaPay webhook: the work is a couple of row locks, the grant should
 * land before the buyer's dashboard tab next polls, and Getly retries
 * anything that isn't a 2xx. Every other event is acknowledged and ignored.
 */
class GetlyWebhookController extends Controller
{
    public function __invoke(Request $request, GetlySales $sales): JsonResponse
    {
        $secret = (string) config('services.getly.webhook_secret');

        // Unconfigured: refuse rather than accept unsigned payloads. Getly
        // retries, so nothing is lost while the secret is being set.
        if ($secret === '') {
            return response()->json(['error' => 'not configured'], 503);
        }

        if (! GetlySignature::verify($request->getContent(), $request->header('X-Getly-Signature-V2'), $secret)) {
            return response()->json(['error' => 'invalid signature'], 401);
        }

        $body = json_decode($request->getContent(), true);

        if (! is_array($body) || ! is_array($body['data'] ?? null)) {
            return response()->json(['error' => 'invalid body'], 400);
        }

        match ((string) ($body['event'] ?? $request->header('X-Getly-Event'))) {
            'sale.completed', 'checkout_link.completed' => $sales->completed($body['data']),
            'order.refunded' => $sales->refunded($body['data']),
            default => null,
        };

        return response()->json(['ok' => true]);
    }
}
