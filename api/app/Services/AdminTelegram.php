<?php

namespace App\Services;

use App\Jobs\SendAdminTelegramAlert;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Models\WaitlistEntry;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Operator alerts to a single admin Telegram chat: new registrations, access
 * requests, new stations, every broadcast start, and inbound email (from the
 * Resend webhook, see App\Webhooks\Resend\EmailReceived).
 *
 * Wired to model `created` / `saved` hooks in AppServiceProvider rather than
 * to controllers, so every path that creates the row is covered — email and
 * Google sign-up alike, browser studio and external encoder alike.
 *
 * Deliberately unthrottled: a burst of broadcast alerts from one station is
 * itself the signal (a flapping encoder, a reconnect loop) and worth seeing.
 *
 * Inert when TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is blank, which is
 * how dev and tests stay quiet (phpunit.xml forces the token empty).
 */
class AdminTelegram
{
    public function userRegistered(User $user): void
    {
        $via = $user->google_id ? 'Google' : 'email';

        $this->send(
            "👤 <b>New registration</b>\n"
            .$this->e($user->name).' — '.$this->e($user->email)."\n"
            ."via {$via}"
            .($user->invite_id ? ' · invite' : '')
        );
    }

    /**
     * Fires for a first submission and for a resubmission that lands back in
     * the pending queue — WaitlistController upserts, so a resubmit is an
     * update, and a previously dismissed one is reopened by a second save.
     * Requiring `pending` means that two-save sequence alerts exactly once.
     */
    public function accessRequested(WaitlistEntry $entry, bool $isNew): void
    {
        // `status` is a column default, so a row fresh from create() has none in
        // memory yet — and a new request is always pending.
        if (($entry->status ?? WaitlistEntry::STATUS_PENDING) !== WaitlistEntry::STATUS_PENDING) {
            return;
        }

        if (! $isNew && ! $entry->wasChanged(['social', 'message', 'status'])) {
            return;
        }

        $this->send(
            '🔑 <b>'.($isNew ? 'New' : 'Updated')." {$this->e(ucfirst($entry->plan))} access request</b>\n"
            .$this->e($entry->email)."\n"
            .($entry->social ? 'Social: '.$this->e($entry->social)."\n" : '')
            .($entry->message ? 'Message: '.$this->e($entry->message)."\n" : '')
            .'<a href="'.$this->e(route('admin.requests.index')).'">Review</a>'
        );
    }

    public function stationCreated(Station $station): void
    {
        $owner = $station->user;

        $this->send(
            "📻 <b>New station</b>\n"
            .$this->e($station->name)."\n"
            .'by '.$this->e($owner?->email ?? 'unknown')."\n"
            .'<a href="'.$this->e(route('admin.stations.show', $station)).'">Admin</a>'
        );
    }

    public function broadcastStarted(StreamSession $session): void
    {
        $station = $session->station;

        if ($station === null) {
            return;
        }

        $source = $session->source_type ?: 'browser';
        $client = $session->client ? ' ('.$this->e($session->client).')' : '';

        $this->send(
            "🎙 <b>Broadcast started</b>\n"
            .$this->e($station->name)."\n"
            .'by '.$this->e($station->user?->email ?? 'unknown')."\n"
            ."via {$this->e($source)}{$client}\n"
            .'<a href="'.$this->e($this->stationUrl($station)).'">Listen</a>'
            .' · <a href="'.$this->e(route('admin.stations.show', $station)).'">Admin</a>'
        );
    }

    /**
     * An inbound email, from the Resend `email.received` webhook. `$email` is
     * the Received Emails API object (or, failing that, the webhook metadata).
     *
     * @param  array<string, mixed>  $email
     */
    public function emailReceived(array $email): void
    {
        $to = implode(', ', array_map('strval', (array) ($email['to'] ?? [])));
        $subject = trim((string) ($email['subject'] ?? '')) ?: '(no subject)';
        $body = $this->emailBodyText($email);

        // Telegram caps a message at 4096 characters after entity parsing;
        // 3000 of body leaves room for the header lines around it.
        $limit = 3000;
        $truncated = mb_strlen($body) > $limit;
        $body = $truncated ? rtrim(mb_substr($body, 0, $limit)) : $body;

        $attachments = collect((array) ($email['attachments'] ?? []))
            ->map(fn ($a) => is_array($a) ? (string) ($a['filename'] ?? '') : '')
            ->filter()
            ->values();

        $failedAuth = collect((array) ($email['authentication'] ?? []))
            ->filter(fn ($result) => is_string($result) && $result !== 'pass')
            ->keys()
            ->map(fn ($check) => strtoupper((string) $check));

        $this->send(
            "📨 <b>Email received</b>\n"
            .'From: '.$this->e((string) ($email['from'] ?? 'unknown'))."\n"
            .($to !== '' ? 'To: '.$this->e($to)."\n" : '')
            .'Subject: <b>'.$this->e($subject)."</b>\n"
            .($failedAuth->isNotEmpty() ? '⚠️ Failed '.$this->e($failedAuth->implode('/'))."\n" : '')
            .($attachments->isNotEmpty() ? '📎 '.$this->e($attachments->implode(', '))."\n" : '')
            .($body !== '' ? "\n".$this->e($body).($truncated ? "\n\n<i>… truncated</i>" : '') : '')
        );
    }

    /**
     * Plain text for an inbound email: `text` when the sender included one,
     * else the HTML part stripped down. Resend may return `html` as a data URI
     * (`html_format: data_uri`), so that is unwrapped first.
     *
     * @param  array<string, mixed>  $email
     */
    private function emailBodyText(array $email): string
    {
        $text = trim((string) ($email['text'] ?? ''));

        if ($text === '') {
            $html = (string) ($email['html'] ?? '');

            if (preg_match('/^data:[^,]*?(;base64)?,(.*)$/s', $html, $m)) {
                $html = $m[1] !== '' ? (string) base64_decode($m[2]) : rawurldecode($m[2]);
            }

            $html = preg_replace('#<(script|style|head)\b[^>]*>.*?</\1>#is', '', $html) ?? $html;
            $html = preg_replace('#<br\s*/?>|</(p|div|li|tr|h[1-6])>#i', "\n", $html) ?? $html;
            $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        $text = preg_replace("/[ \t\x{00A0}]+/u", ' ', $text) ?? $text;
        $text = preg_replace("/\s*\n\s*\n\s*/", "\n\n", $text) ?? $text;

        return trim($text);
    }

    /**
     * An infrastructure alert, sent NOW rather than queued.
     *
     * Every other alert here goes through SendAdminTelegramAlert on the queue,
     * which is exactly what cannot carry "the queue is stuck". So this posts
     * from the calling process (a scheduled command, never a request) and
     * swallows any failure, Telegram's or the cache's: the check that called it
     * must still finish.
     *
     * Throttled per `$key` to one message per `$quietMinutes`, because the
     * checks that call this run every minute for as long as the problem lasts.
     * A send that fails gives the slot back, so the next minute tries again
     * instead of the alert going quiet for the whole window.
     */
    public function opsAlert(string $key, string $html, int $quietMinutes = 15): void
    {
        if (blank(config('services.telegram.bot_token')) || blank(config('services.telegram.admin_chat_id'))) {
            return;
        }

        $throttleKey = 'ops-alert:'.$key;
        $claimed = false;

        try {
            if (! Cache::add($throttleKey, true, now()->addMinutes($quietMinutes))) {
                return;
            }
            $claimed = true;

            // handle() directly, not dispatchSync(): that still goes through
            // the queue manager, and this path must not depend on the queue.
            (new SendAdminTelegramAlert($html))->handle();
        } catch (Throwable $e) {
            Log::warning('Could not send ops alert to Telegram', ['key' => $key, 'error' => $e->getMessage()]);

            if ($claimed) {
                try {
                    Cache::forget($throttleKey);
                } catch (Throwable) {
                    // The cache is what failed; the slot expires on its own.
                }
            }
        }
    }

    private function send(string $html): void
    {
        if (blank(config('services.telegram.bot_token')) || blank(config('services.telegram.admin_chat_id'))) {
            return;
        }

        // afterCommit: registration creates the user inside a transaction that
        // an invalid invite rolls back. Alerting before the commit would
        // announce an account that never existed.
        SendAdminTelegramAlert::dispatch($html)->afterCommit();
    }

    private function stationUrl(Station $station): string
    {
        return rtrim((string) config('services.frontend_url'), '/').'/station/'.$station->slug;
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
