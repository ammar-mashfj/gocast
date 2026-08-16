<?php

use App\Models\Station;
use App\Models\User;
use App\Services\PlaylistFileWriter;
use Illuminate\Support\Facades\View;

/**
 * The .liq template is rendered per station and mounted into a container.
 * A Blade error or a missing variable here doesn't fail a request — it
 * produces a script that Liquidsoap refuses to start, so the station goes
 * silent with the failure buried in a container log.
 *
 * These tests render it the same way LiquidsoapSupervisor does and assert on
 * the parts other code depends on. Liquidsoap's own syntax check
 * (`liquidsoap --check`) is the complement to this and runs against the image.
 */
function renderStationScript(Station $station, array $overrides = []): string
{
    return View::make('liquidsoap.station', array_merge([
        'station' => $station,
        'icecastPassword' => 'icecast-secret',
        'internalApiKey' => 'internal-secret',
        'icecastHost' => 'icecast',
        'icecastPort' => 8000,
        'apiUrl' => 'http://api',
        'rtspHost' => 'mediamtx',
        'rtspPort' => 8554,
        'harborPort' => 8080,
        'blankMax' => 15.0,
        'blankThreshold' => -40.0,
    ], $overrides))->render();
}

beforeEach(function () {
    $this->station = Station::factory()->for(User::factory(), 'user')->make([
        'slug' => 'night-shift',
        'name' => 'Night Shift',
        'icecast_mount' => '/stream/night-shift',
    ]);
});

it('renders a script for a station', function () {
    $script = renderStationScript($this->station);

    expect($script)->toContain('# === GoCast station: night-shift ===')
        ->and($script)->toContain('output.icecast')
        ->and($script)->toContain('output.file.hls');
});

it('names the playlist source so telnet commands keep working', function () {
    // PlaylistFileWriter sends "<id>.reload" and the skip endpoint sends
    // "<id>.skip"; if the id here drifts, both silently stop working.
    $script = renderStationScript($this->station);

    expect($script)->toContain('id = "'.PlaylistFileWriter::LIQ_SOURCE.'"');
});

it('exposes the harbor control surface on the configured port', function () {
    $script = renderStationScript($this->station, ['harborPort' => 9123]);

    expect($script)->toContain('harbor.http.register(port=9123, method="GET", "/status"')
        ->and($script)->toContain('harbor.http.register(port=9123, method="GET", "/healthz"')
        ->and($script)->toContain('output_source.last_metadata()');
});

it('guards the live input against dead air', function () {
    $script = renderStationScript($this->station);

    expect($script)->toContain('blank.strip(')
        ->and($script)->toContain('max_blank=15.0')
        ->and($script)->toContain('threshold=-40.0');
});

it('emits liquidsoap-valid floats for fractional blank settings', function () {
    // `{{ $blankMax }}.` would render "12.5." — a syntax error that only
    // shows up when a container refuses to boot.
    $script = renderStationScript($this->station, ['blankMax' => 12.5, 'blankThreshold' => -37.5]);

    expect($script)->toContain('max_blank=12.5')
        ->and($script)->toContain('threshold=-37.5')
        ->and($script)->not->toContain('12.5.')
        ->and($script)->not->toContain('-37.5.');
});

it('omits the dead-air guard when it is disabled', function () {
    $script = renderStationScript($this->station, ['blankMax' => 0.0]);

    expect($script)->not->toContain('blank.strip')
        ->and($script)->toContain('live = live_raw');
});

it('persists HLS state so restarts do not break mid-stream listeners', function () {
    $script = renderStationScript($this->station);

    expect($script)->toContain('persist_at = "/data/hls/state.json"');
});

it('escapes secrets and station text as liquidsoap string literals', function () {
    // A station name with quotes or backslashes must not be able to break
    // out of the string and change the script.
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'slug' => 'quotes',
        'name' => 'He said "hi" \\ bye',
        'icecast_mount' => '/stream/quotes',
    ]);

    $script = renderStationScript($station, ['icecastPassword' => 'p"a$s\\word']);

    expect($script)->toContain('"He said \"hi\" \\\\ bye"')
        ->and($script)->toContain('"p\"a$s\\\\word"')
        // Blade's default escaping would turn the quotes into &quot;
        ->and($script)->not->toContain('&quot;');
});

it('points the live input at the station RTSP path', function () {
    $script = renderStationScript($this->station, ['rtspHost' => 'host.docker.internal', 'rtspPort' => 8554]);

    // json_encode escapes forward slashes; Liquidsoap's lexer accepts `\/`,
    // and this is the form every URL in the script has always taken.
    expect($script)->toContain(json_encode('rtsp://host.docker.internal:8554/night-shift/live'));
});

it('tracks the icecast connection so status can tell ready from audible', function () {
    // A station whose source Icecast rejected is producing audio for nobody.
    // Without these callbacks that state is indistinguishable from on air.
    $script = renderStationScript($this->station);

    expect($script)
        ->toContain('ice_up = ref(false)')
        ->toContain('icecast_out.on_connect')
        ->toContain('icecast_out.on_disconnect')
        ->toContain('icecast_out.on_error')
        // Without restart_in the output gives up permanently on the first
        // error and the station never comes back on its own.
        ->toContain('restart_in(5.)');
});

it('answers healthz with a status code, because docker greps the status line', function () {
    // /healthz is the container's HEALTHCHECK. Its body is for humans; the
    // 503 is the contract, and the reconciler acts on the result.
    $script = renderStationScript($this->station);

    expect($script)->toContain('response.status_code(503)');
});

it('keeps the icecast connection out of the health verdict', function () {
    // Health drives automation: an unhealthy container gets recreated. If a
    // lost Icecast connection counted as unhealthy, a single Icecast outage
    // would mark every station on the box unhealthy at once and the reconciler
    // would recreate the whole fleet — repeatedly, and to no effect, since
    // restarting a station cannot fix Icecast. It is surfaced as `degraded`
    // through /status instead.
    $script = renderStationScript($this->station);

    expect($script)
        ->not->toContain('output_source.is_ready() and ice_up()')
        // ...but the connection state is still reported, for humans and alerts.
        ->and($script)->toContain('icecast = ice_up()');
});

it('never emits nan or infinity into the status payload', function () {
    // response.json raises on either, and a raised handler answers nothing at
    // all — which Laravel reads as "container unreachable" and reports as
    // `starting` forever. remaining() is infinite for any station playing the
    // silence bed, so this is the common case, not a corner one.
    $script = renderStationScript($this->station);

    expect($script)
        ->toContain('float.is_nan(x) or float.is_infinite(x)')
        ->toContain('elapsed = finite(output_source.elapsed())')
        ->toContain('remaining = finite(output_source.remaining())');
});

it('reports its own lifecycle so laravel does not have to infer it', function () {
    $script = renderStationScript($this->station);

    // The URL is emitted through json_encode (which escapes slashes), the same
    // way the now-playing push is — assert on the distinctive path segment
    // rather than on the escaping.
    expect($script)
        ->toContain('internal\/station-event')
        ->toContain('on_start(fun () -> notify("boot"))')
        ->toContain('on_shutdown(fun () -> notify("shutdown"))');
});

it('tells the broadcaster when their input goes silent', function () {
    // blank.strip demotes to AutoDJ without a word; blank.detect exists purely
    // so somebody can be told why they just went off air.
    $script = renderStationScript($this->station);

    expect($script)
        ->toContain('silence_watch.on_blank')
        ->toContain('silence_watch.on_noise')
        ->toContain('notify("live_silent")');
});

it('omits the silence watcher when the dead-air guard is disabled', function () {
    $script = renderStationScript($this->station, ['blankMax' => 0.0]);

    expect($script)
        ->not->toContain('silence_watch')
        ->and($script)->toContain('live = live_raw');
});
