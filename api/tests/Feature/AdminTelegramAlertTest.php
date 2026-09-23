<?php

use App\Models\Station;
use App\Models\User;
use App\Models\WaitlistEntry;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * Operator alerts to the admin's Telegram chat (AdminTelegram).
 *
 * The hooks sit on the models, so these create rows directly rather than
 * going through each controller — which is also what proves that every path
 * creating the row alerts, not just the one controller a test happened to hit.
 */
beforeEach(function () {
    config([
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);

    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
});

/** @return list<string> */
function telegramTexts(): array
{
    return Http::recorded()
        ->map(fn (array $pair) => $pair[0])
        ->filter(fn (Request $r) => str_contains($r->url(), 'api.telegram.org/bottest-token/sendMessage'))
        ->map(fn (Request $r) => $r['text'])
        ->values()
        ->all();
}

it('alerts on a new registration', function () {
    User::factory()->create(['name' => 'Ada <DJ>', 'email' => 'ada@example.com']);

    expect(telegramTexts())->toHaveCount(1)
        ->and(telegramTexts()[0])->toContain('New registration')
        ->toContain('ada@example.com')
        // HTML parse mode: user input must be escaped or Telegram rejects it.
        ->toContain('Ada &lt;DJ&gt;');
});

it('alerts on a new station', function () {
    $station = Station::factory()->create(['name' => 'Night Shift']);

    expect(collect(telegramTexts())->last())->toContain('New station')
        ->toContain('Night Shift')
        ->toContain($station->user->email);
});

it('alerts on every broadcast start, unthrottled', function () {
    $station = Station::factory()->create(['name' => 'Night Shift']);
    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);

    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'external', 'client' => 'BUTT']);
    $station->streamSessions()->create(['started_at' => now(), 'source_type' => 'browser']);

    $broadcasts = collect(telegramTexts())->filter(fn ($t) => str_contains($t, 'Broadcast started'));

    expect($broadcasts)->toHaveCount(2)
        ->and($broadcasts->first())->toContain('external (BUTT)')
        ->toContain("/station/{$station->slug}");
});

it('alerts once on a pro request and once on a reopened resubmission', function () {
    $user = User::factory()->create();

    $entry = WaitlistEntry::create([
        'user_id' => $user->id, 'email' => $user->email, 'plan' => 'pro', 'social' => 'ig/show',
    ]);
    $entry->forceFill(['status' => WaitlistEntry::STATUS_REJECTED])->save();

    // What WaitlistController does on a resubmit: update in place, then
    // reopen. Two saves, one alert.
    $entry->update(['social' => 'ig/better']);
    $entry->reopen();

    $requests = collect(telegramTexts())->filter(fn ($t) => str_contains($t, 'access request'))->values();

    expect($requests)->toHaveCount(2)
        ->and($requests[0])->toContain('New Pro access request')->toContain('ig/show')
        ->and($requests[1])->toContain('Updated Pro access request')->toContain('ig/better');
});

it('sends nothing when the bot token is blank', function () {
    config(['services.telegram.bot_token' => null]);

    User::factory()->create();

    expect(telegramTexts())->toBeEmpty();
});
