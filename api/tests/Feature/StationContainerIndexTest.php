<?php

use App\Models\Station;
use App\Models\User;

/**
 * Allocation of `container_index`, which is what every station's container
 * address is derived from.
 *
 * The invariant these protect is narrow and absolute: no two stations may ever
 * hold the same index, because two stations holding the same index means two
 * Liquidsoap containers on one address.
 */
it('allocates an index to every new station', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    expect($station->container_index)->toBeInt()->toBeGreaterThan(0);
});

it('hands each station a distinct index', function () {
    $user = User::factory()->create();

    $indexes = collect(range(1, 5))
        ->map(fn () => Station::factory()->for($user, 'user')->create()->container_index);

    expect($indexes->unique())->toHaveCount(5);
});

it('never reissues the index of a soft-deleted station', function () {
    $user = User::factory()->create();

    $first = Station::factory()->for($user, 'user')->create();
    $taken = $first->container_index;

    $first->delete();

    expect($first->trashed())->toBeTrue();

    $second = Station::factory()->for($user, 'user')->create();

    // Reusing it would hand a live station an address the soft-deleted one
    // still owns — and `restored` brings that station back onto it.
    expect($second->container_index)->not->toBe($taken);
});

it('keeps its index across a soft delete and restore', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();
    $index = $station->container_index;

    $station->delete();
    $station->restore();

    expect($station->fresh()->container_index)->toBe($index);
});

it('leaves an explicitly supplied index alone', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'container_index' => 4242,
    ]);

    expect($station->container_index)->toBe(4242);
});
