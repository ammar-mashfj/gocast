<?php

namespace App\Services;

use App\Jobs\SendAdminTelegramAlert;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Models\WaitlistEntry;

/**
 * Operator alerts to a single admin Telegram chat: new registrations, access
 * requests, new stations and every broadcast start.
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
