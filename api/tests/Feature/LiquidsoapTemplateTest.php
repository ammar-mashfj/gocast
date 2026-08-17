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
        'harborPort' => 8080,
        'harborInputPort' => 8090,
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

it('opens a harbor ingest on the station mount', function () {
    $script = renderStationScript($this->station, ['harborInputPort' => 8090]);

    // Broadcasters connect straight into this container — over the webcast
    // WebSocket protocol from the studio, or the Icecast source protocol from
    // BUTT/Mixxx. The mount is the slug, which is what the studio publishes to.
    expect($script)->toContain('input.harbor(')
        ->and($script)->toContain(json_encode('night-shift'))
        ->and($script)->toContain('port=8090')
        ->and($script)->toContain('auth=harbor_auth');
});

it('authenticates broadcasters against laravel and fails closed', function () {
    $script = renderStationScript($this->station, ['apiUrl' => 'http://api']);

    expect($script)->toContain('def harbor_auth(login)')
        ->and($script)->toContain(json_encode('http://api/api/internal/harbor-auth'))
        // Anything but a clean 200 must refuse — a timeout or a 500 cannot
        // become an open door onto the ingest port.
        ->and($script)->toContain('if response.status_code == 200 then')
        // An unreachable API must refuse too, and must SAY so: this script
        // runs at log level 2, so a message logged any lower is invisible and
        // the operator only sees "the stream server closed the connection".
        ->and($script)->toContain('catch _ do')
        ->and($script)->toContain('log.severe');
});

it('reports broadcaster connect and disconnect so laravel can track sessions', function () {
    $script = renderStationScript($this->station);

    // Method form, not the deprecated constructor arguments — and asynchronous,
    // because notify() makes a 5s-timeout HTTP call and a synchronous callback
    // runs on the streaming thread, stalling audio for every listener.
    expect($script)->toContain('live_in.on_connect(synchronous=false, fun (_) -> notify("live_connected"))')
        ->and($script)->toContain('live_in.on_disconnect(synchronous=false, fun () -> notify("live_disconnected"))')
        ->and($script)->not->toContain('on_connect=fun');
});

it('no longer pulls the live input from an external media server', function () {
    // The RTSP pull from MediaMTX is gone: it needed ICE, and ICE needs UDP
    // that a VPN or firewall may simply refuse. Harbor reaches anyone who can
    // load the studio page.
    $script = renderStationScript($this->station);

    expect($script)->not->toContain('rtsp://')
        // The call, not the comment above it explaining why it went away.
        ->and($script)->not->toContain('input.ffmpeg(');
});

it('crossfades autodj tracks without fading the live input', function () {
    // crossfade is a track-boundary operator. Wrapping the fallback applied
    // its fade envelopes to live audio, and because a live broadcast has no
    // track boundaries the fallback re-triggered it constantly — hundreds of
    // overlapping 2s ramps ("clock.cross: possible source leak"), heard as the
    // volume sliding down and snapping back up. It belongs on the playlist,
    // where a track change is a real event.
    $script = renderStationScript($this->station);

    expect($script)->toContain('cross(duration=2., autodj_transition, autodj)')
        // Only the playlist arm of the fallback is faded.
        ->and($script)->toContain('fallback(track_sensitive=false, [live, autodj_mix, bed])')
        // The mix reaches the outputs unfaded; source switches are cuts.
        ->and($script)->toContain('output_source = mixed')
        ->and($script)->not->toContain('crossfade(duration=2., mixed)')
        // The convenience wrapper cannot inspect the transition, so it must
        // not creep back in — see the self-loop test below.
        ->and($script)->not->toContain('crossfade(');
});

it('hard cuts instead of fading a track into itself', function () {
    // A one-track playlist loops forever. Fading it overlaps the track's tail
    // with its own head, i.e. two copies of one recording summed 2s apart —
    // a flanging artifact, not a transition. Compared on `filename` because
    // annotate: tags can be identical across different files.
    $script = renderStationScript($this->station);

    expect($script)->toContain('def autodj_transition(ending, starting) =')
        ->and($script)->toContain('ending.metadata["filename"]')
        ->and($script)->toContain('starting.metadata["filename"]')
        // Non-empty guard: two tagless requests must not compare equal.
        ->and($script)->toContain('if a != "" and a == b then')
        ->and($script)->toContain('sequence([ending.source, starting.source])');
});

it('limits the autodj arm so summed transitions cannot clip', function () {
    // Modern masters are brick-walled to 0.0 dBFS, so a 2s overlap of two
    // tracks exceeds full scale and the encoder turns it into crackle.
    $script = renderStationScript($this->station);

    expect($script)
        // Scoped to the AutoDJ arm: it wraps cross(), not the output. Putting
        // it after the fallback would process live audio too.
        ->toContain('autodj_mix = limit(threshold=-1.0, cross(')
        // add()'s own normalization would duck every transition by 6dB;
        // the limiter is what keeps the sum bounded instead.
        ->and($script)->toContain('add(normalize=false, [');
});

it('reports the incoming track during a transition, not the outgoing one', function () {
    // add() relays metadata from the FIRST available source only. Listing
    // `ending` first would make /status announce the track that just
    // finished for the whole 2s overlap.
    $script = renderStationScript($this->station);

    $addCall = strstr($script, 'add(normalize=false, [');

    expect($addCall)->toContain('fade.in(duration=2., starting.source)')
        ->and(strpos($addCall, 'starting.source'))
        ->toBeLessThan(strpos($addCall, 'ending.source'));
});

it('keeps the raw playlist bound so its own methods survive', function () {
    // crossfade returns a plain source. Rebinding `autodj` to it drops
    // remaining_files()/length(), which the status endpoint calls — and that
    // fails at `liquidsoap --check`, i.e. the station never boots.
    $script = renderStationScript($this->station);

    expect($script)->toContain('autodj = playlist(')
        ->and($script)->toContain('autodj.remaining_files()')
        ->and($script)->toContain('autodj.length()')
        // The actual regression guard: `autodj` must stay bound to the
        // playlist. Asserting the playlist binding exists is not enough — a
        // later `autodj = cross(...)`/`limit(...)` line would leave it intact.
        ->and($script)->not->toContain('autodj = cross')
        ->and($script)->not->toContain('autodj = limit')
        // Readiness must be read off the same source the fallback selects.
        ->and($script)->toContain('elsif autodj_mix.is_ready() then');
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
