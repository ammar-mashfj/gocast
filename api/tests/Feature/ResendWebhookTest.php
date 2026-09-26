<?php

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * /api/webhooks/resend: signature check, dedupe, per-type routing, and the
 * email.received handler that forwards inbound mail to the admin Telegram.
 */
const RESEND_TEST_SECRET = 'whsec_'.'dGVzdC1zZWNyZXQtZm9yLXJlc2VuZC13ZWJob29rcw==';

beforeEach(function () {
    config([
        'services.resend.key' => 're_test',
        'services.resend.webhook_secret' => RESEND_TEST_SECRET,
        'services.telegram.bot_token' => 'test-token',
        'services.telegram.admin_chat_id' => '42',
    ]);

    Http::fake([
        'api.telegram.org/*' => Http::response(['ok' => true]),
        'api.resend.com/emails/receiving/em_1' => Http::response([
            'object' => 'email',
            'id' => 'em_1',
            'from' => 'Fan <fan@example.com>',
            'to' => ['hello@gocast.fm'],
            'subject' => 'Love the <station>',
            'html' => '<p>Hi there &amp; thanks</p><style>p{}</style>',
            'text' => null,
            'authentication' => ['spf' => 'pass', 'dkim' => 'fail', 'dmarc' => 'pass'],
            'attachments' => [['id' => 'a1', 'filename' => 'demo.mp3']],
        ]),
    ]);
});

/** @return array<string, string> */
function resendHeaders(string $body, string $id = 'msg_1', ?string $secret = null): array
{
    $timestamp = (string) time();
    $key = base64_decode(substr($secret ?? RESEND_TEST_SECRET, strlen('whsec_')));
    $signature = base64_encode(hash_hmac('sha256', "{$id}.{$timestamp}.{$body}", $key, true));

    return [
        'svix-id' => $id,
        'svix-timestamp' => $timestamp,
        'svix-signature' => "v1,{$signature}",
        'Content-Type' => 'application/json',
    ];
}

function postResend(array $event, string $id = 'msg_1', ?string $secret = null)
{
    $body = json_encode($event);

    return test()->call('POST', '/api/webhooks/resend', [], [], [],
        collect(resendHeaders($body, $id, $secret))
            ->mapWithKeys(fn ($v, $k) => ['HTTP_'.strtoupper(str_replace('-', '_', $k)) => $v])
            ->put('CONTENT_TYPE', 'application/json')
            ->all(),
        $body,
    );
}

/** @return list<string> */
function sentTelegramTexts(): array
{
    return Http::recorded()
        ->map(fn (array $pair) => $pair[0])
        ->filter(fn (Request $r) => str_contains($r->url(), 'api.telegram.org'))
        ->map(fn (Request $r) => $r['text'])
        ->values()
        ->all();
}

$received = ['type' => 'email.received', 'data' => ['email_id' => 'em_1', 'subject' => 'Love the <station>']];

it('forwards a received email to telegram', function () use ($received) {
    postResend($received)->assertOk()->assertJson(['status' => 'queued']);

    Http::assertSent(fn (Request $r) => $r->url() === 'https://api.resend.com/emails/receiving/em_1'
        && $r->hasHeader('Authorization', 'Bearer re_test'));

    expect(sentTelegramTexts())->toHaveCount(1)
        ->and(sentTelegramTexts()[0])
        ->toContain('Email received')
        ->toContain('Fan &lt;fan@example.com&gt;')
        ->toContain('Love the &lt;station&gt;')
        ->toContain('Hi there &amp; thanks')
        ->toContain('Failed DKIM')
        ->toContain('demo.mp3')
        ->not->toContain('p{}');
});

it('rejects a bad signature', function () use ($received) {
    postResend($received, secret: 'whsec_'.base64_encode('someone-else'))->assertUnauthorized();

    expect(sentTelegramTexts())->toBeEmpty();
});

it('refuses everything when no secret is configured', function () use ($received) {
    config(['services.resend.webhook_secret' => '']);

    postResend($received)->assertStatus(503);
});

it('handles a redelivered event only once', function () use ($received) {
    postResend($received, 'msg_dup')->assertJson(['status' => 'queued']);
    postResend($received, 'msg_dup')->assertJson(['status' => 'duplicate']);

    expect(sentTelegramTexts())->toHaveCount(1);
});

it('acknowledges event types it has no handler for', function () {
    postResend(['type' => 'email.delivered', 'data' => ['email_id' => 'x']])
        ->assertOk()->assertJson(['status' => 'ignored']);

    expect(sentTelegramTexts())->toBeEmpty();
});

it('unwraps a data-uri html body and truncates long mail', function () {
    Http::fake([
        'api.resend.com/emails/receiving/em_2' => Http::response([
            'from' => 'a@example.com',
            'subject' => 'Long',
            'html' => 'data:text/html;base64,'.base64_encode('<p>'.str_repeat('word ', 1000).'</p>'),
            'html_format' => 'data_uri',
        ]),
    ]);

    postResend(['type' => 'email.received', 'data' => ['email_id' => 'em_2']], 'msg_long')->assertOk();

    expect(sentTelegramTexts()[0])->toContain('word word')->toContain('truncated')
        ->and(mb_strlen(sentTelegramTexts()[0]))->toBeLessThan(4096);
});
