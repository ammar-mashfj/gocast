<?php

use App\Models\User;
use App\Notifications\Bell\BellPayload;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Retention for the bell feed.
 *
 * Nothing else deletes from `notifications`: the feed is append-only, marking
 * a row read hides nothing, and the only user-driven delete is one row at a
 * time. So this command is the whole answer to "does this table ever stop
 * growing", which is why it is tested rather than assumed.
 */
function oldNotification(User $user, int $daysAgo, ?string $readAt = null): DatabaseNotification
{
    return $user->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => 'App\\Notifications\\Whatever',
        'data' => (new BellPayload(title: 'Aged'))->toArray(),
        'read_at' => $readAt,
        'created_at' => now()->subDays($daysAgo),
    ]);
}

it('deletes notifications past the retention window and keeps the rest', function () {
    config(['notifications.retention_days' => 30]);
    $user = User::factory()->create();

    oldNotification($user, 45);
    oldNotification($user, 31);
    $kept = oldNotification($user, 29);

    $this->artisan('notifications:prune')->assertSuccessful();

    expect($user->notifications()->pluck('id')->all())->toBe([$kept->id]);
});

it('prunes unread notifications too', function () {
    // An unread notification from three months ago has already failed at the
    // only thing it was for, and keeping it means the badge greets a returning
    // user with a number made mostly of history.
    config(['notifications.retention_days' => 30]);
    $user = User::factory()->create();

    oldNotification($user, 60);

    $this->artisan('notifications:prune')->assertSuccessful();

    expect($user->notifications()->count())->toBe(0);
});

it('does nothing when retention is disabled', function () {
    config(['notifications.retention_days' => 0]);
    $user = User::factory()->create();

    oldNotification($user, 400);

    $this->artisan('notifications:prune')
        ->expectsOutputToContain('disabled')
        ->assertSuccessful();

    expect($user->notifications()->count())->toBe(1);
});

it('clears a backlog larger than one chunk', function () {
    // The first run after this ships has to get through whatever accumulated
    // before it existed, and the chunk loop is what stops that being one
    // lock-held DELETE. The backlog has to exceed the chunk for the loop to
    // run twice, and the command floors --chunk at 100, so this inserts 150.
    config(['notifications.retention_days' => 1]);
    $user = User::factory()->create();

    $payload = json_encode((new BellPayload(title: 'Aged'))->toArray());
    $rows = [];

    for ($i = 0; $i < 150; $i++) {
        $rows[] = [
            'id' => (string) Str::uuid(),
            'type' => 'App\\Notifications\\Whatever',
            'notifiable_type' => $user->getMorphClass(),
            'notifiable_id' => $user->getKey(),
            'data' => $payload,
            'read_at' => null,
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(10),
        ];
    }

    DatabaseNotification::insert($rows);

    // Asserting the STATEMENTS, not just the outcome. "Pruned 150" is the
    // output whether or not the limit is honoured — on a driver whose grammar
    // drops `delete ... limit` the loop silently collapses into the single
    // lock-held statement it exists to avoid, and a row-count assertion would
    // pass all the way through that.
    $deletes = [];
    DB::listen(function ($query) use (&$deletes) {
        if (str_starts_with(strtolower($query->sql), 'delete')) {
            $deletes[] = $query->sql;
        }
    });

    $this->artisan('notifications:prune', ['--chunk' => 100])
        ->expectsOutputToContain('Pruned 150 notifications')
        ->assertSuccessful();

    // 100, then 50, then the empty one that ends the loop.
    expect($deletes)->toHaveCount(3)
        ->and($deletes[0])->toContain('limit 100')
        ->and($user->notifications()->count())->toBe(0);
});
