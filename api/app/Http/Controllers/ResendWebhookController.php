<?php

namespace App\Http\Controllers;

use App\Jobs\HandleResendWebhook;
use App\Webhooks\Resend\EmailReceived;
use App\Webhooks\Resend\ResendWebhookHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Resend\Exceptions\WebhookSignatureVerificationException;
use Resend\WebhookSignature;

/**
 * Single entry point for every Resend webhook.
 *
 * Verifies the Svix signature, drops redeliveries of an event already
 * accepted, and hands known event types to their handler on the queue. The
 * request itself does no work: Resend times out slow endpoints and retries
 * them, which would turn one slow Telegram call into duplicate alerts.
 *
 * Unknown event types are acknowledged and ignored, so subscribing to a new
 * event in the Resend dashboard before its handler ships is harmless.
 */
class ResendWebhookController extends Controller
{
    /**
     * Event type => handler. Adding an event is one class and one line here.
     *
     * @var array<string, class-string<ResendWebhookHandler>>
     */
    public const HANDLERS = [
        'email.received' => EmailReceived::class,
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('services.resend.webhook_secret');

        // Unconfigured: refuse rather than accept unsigned payloads. Resend
        // retries non-2xx, so nothing is lost while the secret is being set.
        if ($secret === '') {
            return response()->json(['message' => 'Webhook not configured.'], 503);
        }

        try {
            WebhookSignature::verify($request->getContent(), [
                'svix-id' => (string) $request->header('svix-id'),
                'svix-timestamp' => (string) $request->header('svix-timestamp'),
                'svix-signature' => (string) $request->header('svix-signature'),
            ], $secret);
        } catch (WebhookSignatureVerificationException) {
            return response()->json(['message' => 'Invalid signature.'], 401);
        }

        $type = (string) $request->input('type');
        $handler = self::HANDLERS[$type] ?? null;

        if ($handler === null) {
            return response()->json(['status' => 'ignored']);
        }

        // svix-id is stable across Resend's retries of one event, so it is the
        // idempotency key. Verified above, so it is present and not forged.
        $dedupeKey = 'resend-webhook:'.$request->header('svix-id');

        if (! Cache::add($dedupeKey, true, now()->addDay())) {
            return response()->json(['status' => 'duplicate']);
        }

        try {
            HandleResendWebhook::dispatch($handler, (array) $request->input('data', []));
        } catch (\Throwable $e) {
            // Not queued, so let Resend's retry get through the dedupe.
            Cache::forget($dedupeKey);

            throw $e;
        }

        return response()->json(['status' => 'queued']);
    }
}
