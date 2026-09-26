<?php

namespace App\Webhooks\Resend;

/**
 * One Resend webhook event type (email.received, email.bounced, …).
 *
 * Register an implementation in ResendWebhookController::HANDLERS. It runs on
 * the queue, after the signature has been verified and duplicate deliveries
 * dropped, so it only ever sees each event once and can throw to retry.
 */
interface ResendWebhookHandler
{
    /**
     * @param  array<string, mixed>  $data  The event's `data` object, verbatim.
     */
    public function handle(array $data): void;
}
