<?php

use App\Services\GeoResolver;
use App\Services\UserAgentParser;
use Illuminate\Http\Request;

/** A request as it arrives at Laravel, with a client IP and optional headers. */
function listenerRequest(string $ip, array $headers = []): Request
{
    $server = ['REMOTE_ADDR' => $ip];

    foreach ($headers as $name => $value) {
        $server['HTTP_'.strtoupper(str_replace('-', '_', $name))] = $value;
    }

    return Request::create('/api/public/stations/jazz/listen', 'POST', [], [], [], $server);
}

describe('country resolution', function () {
    it('trusts the CDN header when the edge supplies one', function () {
        config(['analytics.geo.country_header' => 'CF-IPCountry']);

        $country = app(GeoResolver::class)->country(
            listenerRequest('203.0.113.9', ['CF-IPCountry' => 'de'])
        );

        // The edge saw the actual connection, and it costs no lookup.
        expect($country)->toBe('DE');
    });

    it('treats Cloudflare\'s unknown and Tor codes as no answer', function (string $code) {
        config([
            'analytics.geo.country_header' => 'CF-IPCountry',
            'analytics.geo.maxmind_database' => '/nonexistent.mmdb',
        ]);

        expect(app(GeoResolver::class)->country(listenerRequest('203.0.113.9', ['CF-IPCountry' => $code])))
            ->toBeNull();
    })->with(['XX', 'T1']);

    it('returns null for a private address instead of guessing', function () {
        config(['analytics.geo.country_header' => '']);

        // A health check, a container, or someone on the LAN in development.
        expect(app(GeoResolver::class)->country(listenerRequest('192.168.1.40')))->toBeNull();
    });

    it('returns null rather than throwing when no geo source is configured', function () {
        config([
            'analytics.geo.country_header' => '',
            'analytics.geo.maxmind_database' => '/nonexistent.mmdb',
        ]);

        // Absence is a supported state: a session with no country is still a
        // perfectly good session, and this runs inside a listener's request.
        expect(app(GeoResolver::class)->country(listenerRequest('203.0.113.9')))->toBeNull();
    });
});

describe('visitor hashing', function () {
    it('gives the same address the same hash within a day', function () {
        $geo = app(GeoResolver::class);

        expect($geo->visitorHash('203.0.113.9'))->toBe($geo->visitorHash('203.0.113.9'));
    });

    it('gives the same address a different hash tomorrow', function () {
        $geo = app(GeoResolver::class);

        $today = $geo->visitorHash('203.0.113.9');
        $this->travel(1)->day();

        // The salt rotates daily, which caps what this data can ever be used
        // for at "count uniques within a day" and makes long-term tracking
        // impossible even for us.
        expect($geo->visitorHash('203.0.113.9'))->not->toBe($today);
    });

    it('stores nothing for a request with no address', function () {
        expect(app(GeoResolver::class)->visitorHash(null))->toBeNull();
    });
});

describe('user agent parsing', function () {
    it('classifies devices', function (string $agent, ?string $expected) {
        expect(app(UserAgentParser::class)->device($agent))->toBe($expected);
    })->with([
        'iPhone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1', 'mobile'],
        'Android phone' => ['Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36', 'mobile'],
        // Matched before mobile: an iPad's UA also says Mobile.
        'iPad' => ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1', 'tablet'],
        'desktop' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36', 'desktop'],
        'VLC' => ['VLC/3.0.20 LibVLC/3.0.20', 'player'],
    ]);

    it('classifies browsers, most specific family first', function (string $agent, string $expected) {
        expect(app(UserAgentParser::class)->browser($agent))->toBe($expected);
    })->with([
        // Edge's UA contains Chrome and Safari; Chrome's contains Safari.
        'Edge' => ['Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0', 'Edge'],
        'Chrome' => ['Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'Chrome'],
        'Safari' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15', 'Safari'],
        'Firefox' => ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox'],
    ]);

    it('returns null for a request with no user agent', function () {
        expect(app(UserAgentParser::class)->device(null))->toBeNull()
            ->and(app(UserAgentParser::class)->browser(''))->toBeNull();
    });
});
