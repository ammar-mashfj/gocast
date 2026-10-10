<?php

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Queue\RedisQueue;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

use function Pest\Laravel\artisan;

/**
 * The tests run on the `sync` queue, which has no backlog to measure, so the
 * connection is replaced by a stand-in that reports a chosen oldest-job age.
 */
function fakeQueueWithOldestJob(array $ageSecondsByQueue): void
{
    $connection = new class($ageSecondsByQueue)
    {
        public function __construct(private array $ages) {}

        public function creationTimeOfOldestPendingJob(?string $queue = null): ?int
        {
            return isset($this->ages[$queue]) ? now()->getTimestamp() - $this->ages[$queue] : null;
        }

        public function size(?string $queue = null): int
        {
            return isset($this->ages[$queue]) ? 12 : 0;
        }
    };

    Queue::shouldReceive('connection')->andReturn($connection);
}

beforeEach(function () {
    config([
        'services.telegram.bot_token' => 'bot-token',
        'services.telegram.admin_chat_id' => '42',
        'queue.backlog_alert_seconds' => ['realtime' => 60, 'default' => 300, 'analysis' => 3600],
    ]);

    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
});

it('alerts when the oldest default job has waited past its limit', function () {
    fakeQueueWithOldestJob(['default' => 420]);

    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertSent(fn ($request) => str_contains($request['text'], 'Queue stuck: default')
        && str_contains($request['text'], '7 min'));
});

it('stays quiet while every queue is inside its limit', function () {
    // A long analysis backlog is normal; a few seconds on default is normal.
    fakeQueueWithOldestJob(['default' => 30, 'analysis' => 1800, 'realtime' => 5]);

    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertNothingSent();
});

it('alerts once per stall, not every minute it lasts', function () {
    fakeQueueWithOldestJob(['default' => 600]);

    artisan('queue:check-backlog')->assertSuccessful();
    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertSentCount(1);
});

it('does nothing on a queue driver that cannot report job age', function () {
    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertNothingSent();
});

/**
 * A stand-in RedisQueue whose `default` list head is whatever the test sets,
 * so the command takes its Redis path (job age observed from the front of the
 * queue, not the payload's createdAt).
 *
 * @param  array{payload: ?string}  $head
 */
function fakeRedisQueue(array &$head): void
{
    $redis = new class($head)
    {
        public function __construct(private array &$head) {}

        public function lindex(string $key, int $index): ?string
        {
            return $key === 'queues:default' ? $this->head['payload'] : null;
        }
    };

    $connection = Mockery::mock(RedisQueue::class);
    $connection->shouldReceive('getConnection')->andReturn($redis);
    $connection->shouldReceive('getQueue')->andReturnUsing(fn (string $queue) => "queues:{$queue}");
    $connection->shouldReceive('size')->andReturn(1);

    Queue::shouldReceive('connection')->andReturn($connection);
}

function redisJob(string $uuid, int $createdAt, int $attempts = 0): string
{
    return json_encode(['uuid' => $uuid, 'createdAt' => $createdAt, 'attempts' => $attempts]);
}

it('does not count a retried job\'s backoff as time spent stuck', function () {
    $head = ['payload' => null];
    fakeRedisQueue($head);

    // A minute ago the queue was empty; the job dispatched 20 minutes ago was
    // waiting out a retry backoff, not the worker.
    artisan('queue:check-backlog')->assertSuccessful();

    $this->travel(1)->minute();
    $head['payload'] = redisJob('retried', now()->subMinutes(20)->getTimestamp(), attempts: 1);

    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertNothingSent();
});

it('alerts once the same job has sat at the front past the limit', function () {
    $head = ['payload' => null];
    fakeRedisQueue($head);

    artisan('queue:check-backlog')->assertSuccessful();

    $this->travel(1)->minute();
    $head['payload'] = redisJob('stuck', now()->getTimestamp());
    artisan('queue:check-backlog')->assertSuccessful();

    $this->travel(6)->minutes();
    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertSent(fn ($request) => str_contains($request['text'], 'Queue stuck: default')
        && str_contains($request['text'], '6 min'));
});

it('treats each retry of the job at the front as a fresh wait', function () {
    // A job that keeps failing fast: every minute the check finds it back at
    // the front on its next attempt, never stuck behind a dead worker.
    $createdAt = now()->getTimestamp();
    $head = ['payload' => null];
    fakeRedisQueue($head);

    foreach (range(0, 7) as $attempt) {
        $head['payload'] = redisJob('flaky', $createdAt, $attempt);
        artisan('queue:check-backlog')->assertSuccessful();
        $this->travel(1)->minute();
    }

    Http::assertNothingSent();
});

it('trusts createdAt on the first run, before anything was observed', function () {
    $head = ['payload' => redisJob('old', now()->subMinutes(30)->getTimestamp())];
    fakeRedisQueue($head);

    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertSent(fn ($request) => str_contains($request['text'], '30 min'));
});

it('tries again next minute when Telegram refused the alert', function () {
    Http::swap(new HttpFactory);
    Http::fake(['api.telegram.org/*' => Http::sequence()
        ->push(['ok' => false], 502)
        ->push(['ok' => true])]);
    fakeQueueWithOldestJob(['default' => 600]);

    artisan('queue:check-backlog')->assertSuccessful();
    artisan('queue:check-backlog')->assertSuccessful();

    Http::assertSentCount(2);
});
