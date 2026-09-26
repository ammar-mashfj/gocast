<?php

namespace App\Jobs;

use App\Webhooks\Resend\ResendWebhookHandler;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Runs one verified Resend webhook event through its handler. Dispatched only
 * by ResendWebhookController, which has already checked the signature and
 * dropped duplicates.
 */
class HandleResendWebhook implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [10, 60];

    /**
     * @param  class-string<ResendWebhookHandler>  $handler
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        public string $handler,
        public array $data,
    ) {}

    public function handle(): void
    {
        /** @var ResendWebhookHandler $handler */
        $handler = app($this->handler);

        $handler->handle($this->data);
    }
}
