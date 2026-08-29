<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;

/**
 * Station container addressing.
 *
 * containerIp() is arithmetic over `container_index` and the configured
 * subnet — no daemon, no cache, nothing to go stale. That is deliberate: it
 * sits on the /status path, which is polled, and the implementation it
 * replaced shelled out to `docker inspect` there (~10ms against an idle
 * daemon, roughly 80% of the request).
 *
 * Being pure is what makes it worth testing hard. The arithmetic IS the
 * contract, and every case below fails silently in production if it is wrong:
 * a station lands on the wrong address, or — the one that must never happen —
 * on another station's.
 */
function stationAt(int $index): Station
{
    return Station::factory()->for(User::factory(), 'user')->create([
        'container_index' => $index,
    ]);
}

function ipAt(int $index): string
{
    return app(LiquidsoapSupervisor::class)->containerIp(stationAt($index));
}

beforeEach(function () {
    config([
        'liquidsoap.container_subnet' => '172.28.0.0/16',
        'liquidsoap.telnet_resolve' => 'ip',
    ]);
});

it('starts past the addresses docker reserves at the bottom of the subnet', function () {
    // .0 is the network address and .1 the bridge gateway. A station on
    // either does not start, and the error names neither.
    expect(ipAt(1))->toBe('172.28.0.3')
        ->and(ipAt(2))->toBe('172.28.0.4');
});

it('carries into the third octet instead of overflowing the fourth', function () {
    // The bug a hand-rolled sprintf('%d.%d') over octets would have: index 254
    // silently becomes 172.28.0.256, which is not an address.
    expect(ipAt(253))->toBe('172.28.0.255')
        ->and(ipAt(254))->toBe('172.28.1.0')
        ->and(ipAt(255))->toBe('172.28.1.1');
});

it('keeps counting to the top of the block', function () {
    // The last usable host in a /16: offset 65534. 65535 is the broadcast
    // address, so index 65533 is already one too far.
    expect(ipAt(65532))->toBe('172.28.255.254');
});

it('never gives two stations the same address', function () {
    $seen = [];

    foreach ([1, 2, 3, 253, 254, 255, 256, 1000, 65532] as $index) {
        $ip = ipAt($index);
        expect($seen)->not->toContain($ip);
        $seen[] = $ip;
    }
});

it('throws rather than wrapping when the address space is exhausted', function () {
    // The important half of the contract. A modulo would hand a new station a
    // live one's address and put two Liquidsoaps on one IP — a fault nobody
    // would diagnose from the symptom. Refusing to start is the better answer.
    // 65533 maps to offset 65535 — the broadcast address, not a host.
    ipAt(65533);
})->throws(RuntimeException::class, 'address space is exhausted');

it('follows the configured subnet rather than hardcoding one', function () {
    config(['liquidsoap.container_subnet' => '10.42.0.0/16']);

    expect(ipAt(1))->toBe('10.42.0.3');
});

it('leaves every existing address where it was when the subnet widens', function () {
    // Offsets are measured from the base, so a /15 is purely more room. If this
    // ever fails, raising the ceiling becomes a migration of live stations.
    $station = stationAt(5000);
    $supervisor = app(LiquidsoapSupervisor::class);

    $before = $supervisor->containerIp($station);

    config(['liquidsoap.container_subnet' => '172.28.0.0/15']);

    expect($supervisor->containerIp($station))->toBe($before);
});

it('rejects a subnet that is not a usable CIDR block', function () {
    config(['liquidsoap.container_subnet' => '172.28.0.0']);

    ipAt(1);
})->throws(RuntimeException::class, 'not a usable CIDR');

it('pins the computed address on the run command', function () {
    $station = stationAt(9);
    $supervisor = app(LiquidsoapSupervisor::class);

    $command = (new ReflectionMethod($supervisor, 'baseRunCommand'))
        ->invokeArgs($supervisor, [$station]);

    $flag = array_search('--ip', $command, true);

    expect($flag)->not->toBeFalse()
        ->and($command[$flag + 1])->toBe('172.28.0.11');
});

it('addresses a station by that ip rather than by container name', function () {
    $station = stationAt(9);
    $supervisor = app(LiquidsoapSupervisor::class);

    expect($supervisor->containerHost($station))->toBe('172.28.0.11');

    // 'name' stays available for a Laravel that is itself on gocast-network.
    config(['liquidsoap.telnet_resolve' => 'name']);

    expect($supervisor->containerHost($station))
        ->toBe(LiquidsoapSupervisor::CONTAINER_PREFIX.$station->slug);
});
