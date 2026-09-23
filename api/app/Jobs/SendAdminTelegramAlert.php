<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;

/**
 * Posts one operator alert to the admin's Telegram chat.
 *
 * Queued so a slow or unreachable Telegram never adds latency to — or fails —
 * the sign-up, request or broadcast that triggered it. Built by AdminTelegram;
 * nothing else should dispatch this directly.
 */
class SendAdminTelegramAlert implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [10, 60];

    public function __construct(
        public string $text,
    ) {}

    public function handle(): void
    {
        $token = (string) config('services.telegram.bot_token');
        $chatId = (string) config('services.telegram.admin_chat_id');

        // Re-checked here as well as at dispatch: a job queued before the
        // token was removed must not keep trying to send.
        if ($token === '' || $chatId === '') {
            return;
        }

        Http::timeout(10)
            ->asJson()
            ->post("https://api.telegram.org/bot{$token}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $this->text,
                'parse_mode' => 'HTML',
                'disable_web_page_preview' => true,
            ])
            ->throw();
    }
}
