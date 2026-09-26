<?php

namespace App\Webhooks\Resend;

use App\Services\AdminTelegram;
use Illuminate\Support\Facades\Http;

/**
 * `email.received`: forwards an inbound email to the admin Telegram chat.
 *
 * The webhook carries metadata only — no body, no headers — so the full email
 * is fetched from the Received Emails API. A failed fetch throws, so the job
 * retries it (HandleResendWebhook backoff).
 */
class EmailReceived implements ResendWebhookHandler
{
    public function __construct(
        private AdminTelegram $telegram,
    ) {}

    public function handle(array $data): void
    {
        $id = (string) ($data['email_id'] ?? '');

        if ($id === '') {
            return;
        }

        $email = Http::timeout(15)
            ->withToken((string) config('services.resend.key'))
            ->acceptJson()
            ->get('https://api.resend.com/emails/receiving/'.rawurlencode($id))
            ->throw()
            ->json();

        $this->telegram->emailReceived(is_array($email) ? $email + $data : $data);
    }
}
