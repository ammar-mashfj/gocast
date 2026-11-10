<?php

use App\Models\Station;
use App\Services\IcecastAdmin;
use Illuminate\Support\Facades\Http;

/**
 * Icecast 2.5.0's answer to /admin/stats?mount=/stream/labx, as the relay lab
 * recorded it (trimmed of fields nothing reads). The server's own
 * instance_uuid comes first, at the top level; the source's is inside its
 * element and equals the `source-instance` its connect event sent.
 */
const ICECAST_STATS = '<?xml version="1.0"?>
<icestats><admin>lab@localhost</admin><host>localhost</host><instance_uuid>3e074017-63fd-421d-a086-8f25c7750076</instance_uuid><server_id>Icecast 2.5.0</server_id><sources>1</sources><source mount="/stream/labx"><allow-direct-access>true</allow-direct-access><genre>various</genre><instance_uuid>50c6edd5-b3f1-4e02-860b-9b025157c8fb</instance_uuid><listener_peak>0</listener_peak><listeners>0</listeners><source_ip>127.0.0.1</source_ip><user_agent>Lavf/60.16.100</user_agent></source></icestats>';

beforeEach(function () {
    config([
        'services.icecast.url' => 'http://icecast.test',
        'services.icecast.admin_password' => 'admin-secret',
    ]);
});

describe('which source is on a mount', function () {
    it('reads the source\'s own instance id, not the server\'s', function () {
        Http::fake(['icecast.test/admin/stats*' => Http::response(ICECAST_STATS)]);

        expect(app(IcecastAdmin::class)->sourceInstance('/stream/labx'))->toBe('50c6edd5-b3f1-4e02-860b-9b025157c8fb');

        Http::assertSent(fn ($request) => $request['mount'] === '/stream/labx');
    });

    it('says none when no source is on the mount', function () {
        // Icecast answers 404 with an error report.
        Http::fake(['icecast.test/admin/stats*' => Http::response('<?xml version="1.0"?><report/>', 404)]);

        expect(app(IcecastAdmin::class)->sourceInstance('/stream/labx'))->toBeNull();
    });

    it('says none for an answer about another mount', function () {
        Http::fake(['icecast.test/admin/stats*' => Http::response(ICECAST_STATS)]);

        expect(app(IcecastAdmin::class)->sourceInstance('/stream/other'))->toBeNull();
    });

    it('says none when Icecast cannot be asked or answers nonsense', function (int $status, string $body) {
        Http::fake(['icecast.test/admin/stats*' => Http::response($body, $status)]);

        expect(app(IcecastAdmin::class)->sourceInstance('/stream/labx'))->toBeNull();
    })->with([
        'server error' => [500, ''],
        'not XML' => [200, 'gateway says hi'],
        'no instance id' => [200, '<icestats><source mount="/stream/labx"><listeners>0</listeners></source></icestats>'],
    ]);
});

describe('per-call timeouts', function () {
    it('gives a call the timeout its caller asks for, and 3 s otherwise', function () {
        $timeouts = [];
        Http::fake(function ($request, array $options) use (&$timeouts) {
            $timeouts[] = [parse_url($request->url(), PHP_URL_PATH), $options['timeout'] ?? null];

            return Http::response(ICECAST_STATS);
        });
        $admin = app(IcecastAdmin::class);
        $station = Station::factory()->create(['slug' => 'labx', 'icecast_mount' => '/stream/labx']);

        $admin->sourceInstance('/stream/labx', 1.0);
        $admin->killSource($station, 1.0);
        $admin->sourceInstance('/stream/labx');
        $admin->killSource($station);

        expect($timeouts)->toBe([
            ['/admin/stats', 1.0],
            ['/admin/killsource', 1.0],
            ['/admin/stats', 3.0],
            ['/admin/killsource', 3.0],
        ]);
    });
});
