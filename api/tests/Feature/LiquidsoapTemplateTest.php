<?php

use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapSupervisor;
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
        'harborInputTimeout' => 10.0,
        'rmsWindow' => 2.0,
        'blankMax' => 15.0,
        'blankThreshold' => -40.0,
        'crossfadeEnabled' => true,
        'crossfadeDuration' => 5.0,
        'crossfadeFade' => 3.0,
        'crossfadeHigh' => -15.0,
        'crossfadeMedium' => -32.0,
        'crossfadeMargin' => 4.0,
        'jinglesEnabled' => false,
        'autodjRetryDelay' => 10.0,
        'nextTrackUrl' => 'http://api/api/internal/next-track?slug=night-shift',
        'liqSource' => PlaylistFileWriter::LIQ_SOURCE,
        'jinglesLiqSource' => PlaylistFileWriter::JINGLES_LIQ_SOURCE,
        'jinglesFilename' => PlaylistFileWriter::JINGLES_FILENAME,
        'jinglesEnabledVar' => LiquidsoapSupervisor::VAR_JINGLES_ENABLED,
        'jingleByTracksVar' => LiquidsoapSupervisor::VAR_JINGLE_BY_TRACKS,
        'jingleIntervalVar' => LiquidsoapSupervisor::VAR_JINGLE_INTERVAL,
        'jingleEveryTracksVar' => LiquidsoapSupervisor::VAR_JINGLE_EVERY_TRACKS,
        'jingleInterval' => 1800.0,
        'jingleByTracks' => false,
        'jingleEveryTracks' => 5,
        // Watermark defaults here mirror a FREE station on a normal install:
        // the machinery is compiled in and the switch is on. Tests that care
        // about the paid case override `watermarkEnabled`.
        'watermarkSupported' => true,
        'watermarkEnabled' => true,
        'watermarkEnabledVar' => LiquidsoapSupervisor::VAR_WATERMARK_ENABLED,
        'watermarkIntervalVar' => LiquidsoapSupervisor::VAR_WATERMARK_INTERVAL,
        'watermarkDuckVar' => LiquidsoapSupervisor::VAR_WATERMARK_DUCK,
        'watermarkContainerDir' => '/data/system',
        'watermarkInterval' => 600.0,
        'watermarkDuck' => 0.15,
        'watermarkFade' => 1.0,
        // Defaults mirror config/liquidsoap.php: the limiter guards the whole
        // broadcast, and the GC block is emitted at the balanced preset.
        'limiterThreshold' => -1.0,
        'limiterIncludeLive' => true,
        'liveBroadcastText' => 'Live Broadcast',
        'metadataCharset' => 'UTF-8',
        'gcSpaceOverhead' => 80,
        'applyAmplify' => true,
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

it('names the rotation source so telnet commands keep working', function () {
    // StationPowerController sends "<id>.skip" built from this same constant;
    // if the id here drifts, skip-track silently stops working.
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

    expect($script)->not->toContain('live = blank.strip(')
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
    expect($script)->toContain('live_in.on_connect(synchronous=false, fun (_) -> begin')
        ->and($script)->toContain('live_in.on_disconnect(synchronous=false, fun () -> begin')
        ->and($script)->toContain('notify("live_connected")')
        ->and($script)->toContain('notify("live_disconnected")')
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

it('keeps the fade operators off the live path', function () {
    // Wrapping the fallback in crossfade applied its fade envelopes to live
    // audio, and because a live broadcast has no track boundaries the fallback
    // re-triggered it constantly — hundreds of overlapping 2s ramps
    // ("clock.cross: possible source leak"), heard as the volume sliding down
    // and snapping back up.
    $script = renderStationScript($this->station);

    expect($script)->toContain('fallback(track_sensitive=false, [live, autodj_mix, bed])')
        // The mix reaches the outputs carrying only a meter — rms() reads the
        // signal and alters nothing, so switches are still hard cuts.
        ->and($script)->toContain('output_source = rms(duration=2.0, mixed)')
        ->and($script)->not->toContain('crossfade(duration=2., mixed)');
});

it('decides transitions by loudness instead of always overlapping', function () {
    // Ported from AzuraCast's cross.smart. The point is that it does NOT always
    // overlap: two loud tracks are hard cut rather than summed, which is what
    // stops a master limited to 0.0 dBFS from clipping during the overlap.
    // Verified in a throwaway container — equal-loudness tracks take the hard
    // cut arm, and 11 transitions ran without wedging.
    $script = renderStationScript($this->station);

    expect($script)->toContain('def autodj_cross(a, b) =')
        ->and($script)->toContain('a.db_level')
        ->and($script)->toContain('b.db_level')
        // The hard-cut arm for loud/far-apart pairs.
        ->and($script)->toContain('sequence([a.source, b.source])')
        ->and($script)->toContain('cross(duration=autodj_cross_duration, autodj_cross, autodj_leveled)')
        // Thresholds come from config, not hardcoded.
        ->and($script)->toContain('autodj_cross_high = -15.0')
        ->and($script)->toContain('autodj_cross_medium = -32.0')
        ->and($script)->toContain('autodj_cross_margin = 4.0')
        // The fade must be strictly shorter than the cross window, or the
        // envelopes never complete (book §6.4). These were one value once.
        ->and($script)->toContain('autodj_cross_duration = 5.0')
        ->and($script)->toContain('autodj_cross_fade = 3.0')
        ->and($script)->toContain('duration=autodj_cross_fade, s)')
        ->and($script)->not->toContain('fade.out(type="sin", duration=autodj_cross_duration');
});

it('reports the incoming track during a transition, not the outgoing one', function () {
    // add() relays metadata from the FIRST available source only, so the
    // incoming track must be listed first or /status announces the track that
    // just finished for the whole overlap.
    $script = renderStationScript($this->station);

    expect($script)->toContain('add(normalize=false, [starting, ending])');
});

it('falls back to hard cuts when the crossfade is disabled', function () {
    // The kill switch. Transitions have wedged AutoDJ playback twice by a
    // mechanism that is still not understood, so flipping one env var has to be
    // enough to get back to known-good behaviour without a code change.
    $script = renderStationScript($this->station, ['crossfadeEnabled' => false]);

    expect($script)->toContain('autodj_faded = autodj_leveled')
        ->and($script)->toContain('autodj_mix = autodj_faded')
        // No transition machinery at all in this mode.
        ->and($script)->not->toContain('def autodj_cross(')
        ->and($script)->not->toMatch('/^[^#\n]*\bcross\(/m');
});

it('emits liquidsoap-valid floats for the crossfade thresholds', function () {
    // Same lexer trap as the blank settings: a bare interpolation would render
    // "-15." or "2." and refuse to parse.
    $script = renderStationScript($this->station, [
        'crossfadeDuration' => 3.0,
        'crossfadeHigh' => -12.5,
    ]);

    expect($script)->toContain('autodj_cross_duration = 3.0')
        ->and($script)->toContain('autodj_cross_high = -12.5')
        ->and($script)->not->toContain('3..')
        ->and($script)->not->toContain('-12.5.');
});

it('never puts a cross-family operator on the live path', function () {
    // A live broadcast is one continuous track with no boundaries, so a fade
    // operator anywhere downstream of the fallback re-triggers constantly:
    // hundreds of stacked 2s ramps ("clock.cross: there are currently 551
    // sources, possible source leak"), heard as the volume sliding down and
    // snapping back up, plus enough source churn to starve the streaming
    // thread into "Latency is too high: we must catchup 1.22 seconds".
    //
    // The transition may only ever wrap the AutoDJ arm.
    $script = renderStationScript($this->station);

    expect($script)->toContain('cross(duration=autodj_cross_duration, autodj_cross, autodj_leveled)')
        // `autodj_rotation` IS the AutoDJ arm — the rotation playlist and the
        // jingle arm, and nothing else. It is strictly upstream of the
        // live/AutoDJ fallback, which is the property this test protects.
        ->and($script)->toContain('autodj_rotation = fallback(track_sensitive = true, [jingle_arm, autodj])')
        // Never the mix, and never the live source.
        ->and($script)->not->toContain('cross(duration=2., mixed)')
        ->and($script)->not->toMatch('/^[^#\n]*\bcross(fade)?\([^)]*\b(mixed|live|output_source)\b/m')
        ->and($script)->toContain('output_source = rms(duration=2.0, mixed)');
});

it('limits the whole broadcast, not just the autodj arm', function () {
    // Overflow protection, not loudness shaping: masters brick-walled to
    // 0.0 dBFS leave the MP3 encoder no headroom, and so does a broadcaster
    // running hot. The limiter used to wrap the AutoDJ arm alone, which
    // protected the one arm whose levels we already control and left live
    // audio to hit the encoder unguarded.
    $script = renderStationScript($this->station);

    expect($script)
        // Bottom of the graph: past the live/AutoDJ fallback AND past the
        // watermark, so the peak being guarded is the one that ships.
        ->toContain('broadcast_out = limit(threshold=-1.0, broadcast_source)')
        // ...and therefore NOT on the AutoDJ arm any more.
        ->and($script)->toContain('autodj_mix = autodj_faded')
        // Both outputs take the limited source, or the limiter guards nothing.
        ->and(substr_count($script, "\n  broadcast_out\n"))->toBe(2);
});

it('restores the old autodj-only limiter placement on request', function () {
    // The rollback for an audio-path change, same as the crossfade and
    // rotation switches: an env var and a relaunch, no code change. This has
    // to reproduce the previous graph exactly — limiter on the AutoDJ arm,
    // nothing on the broadcast path.
    $script = renderStationScript($this->station, ['limiterIncludeLive' => false]);

    expect($script)->toContain('autodj_mix = limit(threshold=-1.0, autodj_faded)')
        ->and($script)->toContain('broadcast_out = broadcast_source')
        ->and($script)->not->toContain('limit(threshold=-1.0, broadcast_source)');
});

it('renders a liquidsoap-valid float for the limiter threshold', function () {
    // Same lexer trap as the blank and crossfade settings: a bare
    // interpolation renders "-2" where Liquidsoap demands "-2.0".
    $script = renderStationScript($this->station, ['limiterThreshold' => -2.0]);

    expect($script)->toContain('limit(threshold=-2.0, broadcast_source)');
});

it('keeps the raw rotation bound under its own name', function () {
    // `autodj` must stay the rotation source itself. cross() takes it as its
    // argument, and the skip command is registered on it, so rebinding the
    // name to a wrapper (as an early version did) silently breaks both — and
    // fails at `liquidsoap --check`, i.e. the station never boots.
    //
    // Its METHODS are no longer called from /status: doing so made this a
    // second operator on a source cross() fast-forwards. See the test below.
    $script = renderStationScript($this->station);

    expect($script)->toContain('autodj = request.dynamic(')
        ->and($script)->not->toContain('autodj = cross')
        ->and($script)->not->toContain('autodj = limit')
        // Readiness is read off the arm the fallback actually selects.
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

it('never reads playlist methods from the status endpoint', function () {
    // autodj.length()/remaining_files() are methods on the source cross()
    // fast-forwards during a transition. The Liquidsoap book (§6.4) says such a
    // source may only be used by one operator, "otherwise we will run into
    // synchronization issues" — and /status is polled every couple of seconds.
    // Laravel serves playlist_length and up_next from its tracks table instead.
    $script = renderStationScript($this->station);

    expect($script)->not->toMatch('/^[^#\n]*autodj\.(length|remaining_files)\(/m')
        ->and($script)->not->toContain('def up_next(')
        // The container still reports what it alone knows.
        ->and($script)->toContain('elapsed = finite(output_source.elapsed())')
        ->and($script)->toContain('remaining = finite(output_source.remaining())');
});

it('holds jingles behind a delay so they cannot cut into a track', function () {
    // The three flags here ARE the feature:
    //
    //   delay(initial=true, N)     — a jingle is unavailable for N seconds
    //                                after the last one ended, and at boot.
    //   source.available(...)      — gated on the owner's switch, at a track
    //                                boundary so turning it off never cuts a
    //                                jingle that is already on air.
    //   fallback(track_sensitive)  — the switch is only reconsidered at a
    //                                track boundary, so a jingle becoming
    //                                ready mid-song waits for the song.
    //
    // Drop track_sensitive and the station starts chopping songs in half on a
    // half-hour timer, which is the exact failure this feature must not have.
    $script = renderStationScript($this->station, ['jinglesEnabled' => true]);

    expect($script)->toContain('jingles = playlist(')
        ->and($script)->toContain('id = "jingles_m3u"')
        // Slash-escaped because every string here goes through json_encode —
        // same as the api URLs above. Verified against 2.4.5: the lexer
        // unescapes `\/` back to `/`.
        ->and($script)->toContain('"\/data\/playlists\/jingles.m3u"')
        // randomize: three station IDs must not play in a fixed cycle.
        ->and($script)->toContain('mode = "randomize"')
        ->and($script)->toContain('delay(initial=true, jingle_delay, jingles)')
        ->and($script)->toContain('track_sensitive = true,')
        ->and($script)->toContain('autodj_rotation = fallback(track_sensitive = true, [jingle_arm, autodj])');
});

it('re-reads the jingle count continuously, not only when a jingle ends', function () {
    // REGRESSION. source.available(track_sensitive=true, ...) defers evaluation
    // of the PREDICATE to an end-of-track of the source it wraps — the jingle,
    // which is not playing while music runs. The count was therefore only
    // re-read when a jingle ended, latching a stale "true": observed on a real
    // station firing a jingle at counter=1 against a threshold of 3, and
    // sometimes two jingles back to back.
    //
    // track_sensitive belongs on the fallback, which defers the SWITCH. Putting
    // it here deferred the QUESTION.
    $script = renderStationScript($this->station, ['jinglesEnabled' => true]);

    // Just the source.available call — bounded at the fallback that follows,
    // which legitimately does carry track_sensitive.
    $start = strpos($script, 'jingle_arm = source.available(');
    $arm = substr($script, $start, strpos($script, 'autodj_rotation =', $start) - $start);

    expect($arm)->not->toContain('track_sensitive')
        // ...while the fallback that consumes it must still have it, or a
        // jingle becoming due would chop the current song in half.
        ->and($script)->toContain('autodj_rotation = fallback(track_sensitive = true,');
});

it('neutralises the gate belonging to the mode that is not in use', function () {
    // One graph, two gates. In track mode the time gate must go to zero, and
    // in interval mode the count gate must be vacuously true — otherwise the
    // two modes AND together and a station waits for both, which reads as
    // "jingles are broken" rather than as a config mistake.
    $script = renderStationScript($this->station, ['jinglesEnabled' => true]);

    expect($script)->toContain('if jingle_by_tracks() then 0.0 else jingle_interval() end')
        ->and($script)->toContain('and (not jingle_by_tracks() or tracks_since_jingle() >= jingle_every_tracks())');
});

it('counts rotation tracks on the leaf sources, synchronously', function () {
    // Counted on the playlists themselves, not on the fallback: a track mark
    // downstream has already been through cross(), so it would count
    // transitions rather than tracks.
    //
    // synchronous=true is load-bearing and deliberately against the
    // convention in the rest of this script. The fallback re-evaluates
    // availability at the same boundary that fires this handler, so a counter
    // updated on a separate task can land after the decision it informs. It is
    // safe here only because the handler does no I/O.
    $script = renderStationScript($this->station, ['jinglesEnabled' => true]);

    expect($script)->toContain('tracks_since_jingle = ref(0)')
        ->and($script)->toContain('autodj.on_track(synchronous=true,')
        ->and($script)->toContain('jingles.on_track(synchronous=true,')
        // The jingle resets the counter; without this it only ever fires once.
        ->and($script)->toContain('tracks_since_jingle := 0');
});

it('renders the track count as an int and the interval as a float', function () {
    // Liquidsoap's var.set is typed both ways: interactive.float refuses "5"
    // and interactive.int refuses "5.0". Getting either wrong means the
    // setting silently never applies.
    $script = renderStationScript($this->station, [
        'jingleByTracks' => true,
        'jingleEveryTracks' => 8,
        'jingleInterval' => 600.0,
    ]);

    expect($script)->toContain('interactive.int("jingle_every_tracks", 8)')
        ->and($script)->not->toContain('interactive.int("jingle_every_tracks", 8.0)')
        ->and($script)->toContain('interactive.float("jingle_interval", 600.0)')
        ->and($script)->toContain('interactive.bool("jingle_by_tracks", true)');
});

it('builds the jingle source for every station, on or off', function () {
    // The graph must not depend on the switch, because the switch is settable
    // at runtime — a station that rendered without the jingle source could
    // never be turned on without a restart, which is the whole thing this
    // design exists to avoid.
    $off = renderStationScript($this->station, ['jinglesEnabled' => false]);
    $on = renderStationScript($this->station, ['jinglesEnabled' => true]);

    foreach ([$off, $on] as $script) {
        expect($script)->toContain('jingles = playlist(')
            ->and($script)->toContain('jingle_arm = source.available(');
    }

    // Only the initial value of the switch differs between the two.
    expect($off)->toContain('interactive.bool("jingles_enabled", false)')
        ->and($on)->toContain('interactive.bool("jingles_enabled", true)');
});

it('declares jingle settings as interactive variables so they need no restart', function () {
    // Literals here would mean re-rendering and restarting the container to
    // change how often a station ID plays — dropping every listener mid-track
    // for a scheduling tweak. The names must match the constants Laravel sends
    // over telnet; a typo on either side fails silently.
    $script = renderStationScript($this->station, [
        'jinglesEnabled' => true,
        'jingleInterval' => 900.0,
    ]);

    expect($script)->toContain(
        'jingles_enabled = interactive.bool("'.LiquidsoapSupervisor::VAR_JINGLES_ENABLED.'", true)'
    )
        ->and($script)->toContain(
            'jingle_interval = interactive.float("'.LiquidsoapSupervisor::VAR_JINGLE_INTERVAL.'", 900.0)'
        )
        // The interval reaches delay() through the variable, never inlined —
        // inlining would silently re-freeze it at render time.
        ->and($script)->not->toMatch('/delay\(initial=true, [0-9]/');
});

it('emits a liquidsoap-valid float for the jingle interval', function () {
    // Same lexer trap as every other numeric setting here: a bare
    // interpolation of 1800 renders "1800" where interactive.float wants a
    // float, and "1800." for a fractional value renders "1800.5." — a syntax
    // error either way.
    $script = renderStationScript($this->station, ['jingleInterval' => 1800.0]);

    expect($script)->toContain('interactive.float("jingle_interval", 1800.0)')
        ->and($script)->not->toContain('1800.0.');
});

it('never crossfades a jingle', function () {
    // Sliding a produced station ID under the tail of a song defeats the
    // point of playing it. The flag rides in on the annotate URI
    // PlaylistFileWriter emits, because by the time the cross transition runs
    // there is nothing left to say which source a request came from.
    $script = renderStationScript($this->station, ['jinglesEnabled' => true]);

    expect($script)->toContain('a.metadata["jingle"] == "true" or b.metadata["jingle"] == "true"')
        ->and($script)->toContain('sequence([a.source, b.source])');
});

it('keeps jingles out of the now-playing push', function () {
    // No push means Laravel's cached payload stays on the last real track,
    // so the player keeps showing the song rather than flashing "Station ID"
    // for eight seconds.
    $script = renderStationScript($this->station, ['jinglesEnabled' => true]);

    expect($script)->toMatch('/def push_now_playing\(m\) =\s*\n\s*if m\["jingle"\] == "true" then/');
});

it('mixes the watermark over the station instead of replacing it', function () {
    // smooth_add, not fallback: a watermark rides on top and ducks the
    // carrier. A fallback would take the station off its own air for the
    // duration, which on a live show means cutting the host off mid-sentence.
    $script = renderStationScript($this->station);

    expect($script)->toContain('broadcast_source = smooth_add(')
        ->and($script)->toContain('normal = listener_source,')
        ->and($script)->toContain('special = watermark_arm')
        ->and($script)->toContain('p = watermark_duck,');
});

it('watermarks what listeners hear without touching what the api reports', function () {
    // The whole reason for a separate `broadcast_source`. /status and the
    // now-playing push read `output_source`, which must keep describing what
    // the STATION is playing: a platform ID is not the station's now-playing,
    // and routing it through would also let the clip's own metadata overwrite
    // a real track title.
    $script = renderStationScript($this->station);

    expect($script)->toContain('output_source = rms(duration=2.0, mixed)')
        // Both outputs — Icecast and HLS — carry the mark.
        ->and(substr_count($script, "\n  broadcast_out\n"))->toBe(2)
        // ...and neither the status endpoint nor the metadata push does.
        ->and($script)->toContain('output_source.on_metadata(synchronous=false, push_now_playing)')
        ->and($script)->toContain('m = output_source.last_metadata()')
        ->and($script)->not->toContain('broadcast_source.on_metadata')
        ->and($script)->not->toContain('broadcast_source.last_metadata')
        ->and($script)->not->toContain('listener_source.on_metadata')
        ->and($script)->not->toContain('listener_source.last_metadata');
});

it('catches a free station going live, which is all a free station can do', function () {
    // Free plans have autodj_enabled = false, so the AutoDJ arm is silence and
    // everything audible is a live broadcast. The watermark therefore has to
    // sit BELOW the live/AutoDJ fallback — applied to the AutoDJ arm it would
    // be inaudible, and applied above the fallback it would be evaded simply
    // by going live.
    $script = renderStationScript($this->station);

    $fallback = strpos($script, 'mixed = mksafe(fallback(');
    $watermark = strpos($script, 'broadcast_source = smooth_add(');

    expect($fallback)->not->toBeFalse()
        ->and($watermark)->not->toBeFalse()
        ->and($watermark)->toBeGreaterThan($fallback);
});

it('stays silent when the station itself is silent', function () {
    // "Powered by GoCast" alone into an otherwise empty stream reads as a
    // fault rather than as branding. Same readiness test /status uses to name
    // the current source, so the two cannot disagree about whether anything
    // is playing.
    $script = renderStationScript($this->station);

    expect($script)->toContain('watermark_enabled() and (live.is_ready() or autodj_mix.is_ready())');
});

it('does not wait for a track boundary, unlike a jingle', function () {
    // A jingle replaces a track and must wait for a boundary. A watermark
    // rides on top, and on a live stream there are no boundaries to wait for.
    $script = renderStationScript($this->station);

    $arm = substr($script, strpos($script, 'watermark_arm = source.available('), 200);

    expect($arm)->not->toContain('track_sensitive');
});

it('reads the watermark from a directory so a missing clip cannot break a station', function () {
    // playlist() over a directory: an empty one makes the source fallible and
    // the station simply plays unmarked. A fixed filename that does not exist
    // would be an unresolvable request on every station on the box.
    $script = renderStationScript($this->station);

    expect($script)->toContain('id = "watermark"')
        ->and($script)->toContain('"\/data\/system"')
        ->and($script)->toContain('mode = "randomize"');
});

it('drops the watermark machinery entirely when the install disables it', function () {
    $script = renderStationScript($this->station, ['watermarkSupported' => false]);

    expect($script)->toContain('broadcast_source = listener_source')
        ->and($script)->not->toContain('smooth_add(')
        ->and($script)->not->toContain('id = "watermark"');
});

it('renders the watermark switch off for a paid station but keeps it settable', function () {
    // Still compiled in, just off. That is what lets a DOWNGRADE take effect
    // over telnet later without recreating the container.
    $script = renderStationScript($this->station, ['watermarkEnabled' => false]);

    expect($script)->toContain('interactive.bool("watermark_enabled", false)')
        ->and($script)->toContain('broadcast_source = smooth_add(');
});

it('emits liquidsoap-valid floats for the watermark levels', function () {
    // Same lexer trap as everywhere else, plus one specific to the duck: it is
    // a fraction, so a bare interpolation of 0.15 must not lose its leading
    // zero or gain a trailing dot.
    $script = renderStationScript($this->station, [
        'watermarkInterval' => 900.0,
        'watermarkDuck' => 0.2,
        'watermarkFade' => 1.5,
    ]);

    expect($script)->toContain('interactive.float("watermark_interval", 900.0)')
        ->and($script)->toContain('interactive.float("watermark_duck", 0.200)')
        ->and($script)->toContain('duration = 1.5,');
});

/**
 * The rotation is the one part of this script that talks back to Laravel on
 * the audio path, so what it emits is asserted rather than eyeballed.
 */
it('builds the rotation as request.dynamic, not a playlist file', function () {
    $script = renderStationScript($this->station);

    // json_encode escapes the slashes, which is the file's convention for
    // every string it emits; Liquidsoap resolves \/ back to / at parse time
    // (verified against the image, same as the harbor-auth URL above).
    expect($script)->toContain('request.dynamic(')
        ->toContain('next-track?slug=night-shift')
        ->toContain('X-Internal-Key')
        // The whole point: no list in the container means no reload to send.
        ->not->toContain('"/data/playlists/playlist.m3u"');
});

/**
 * `request.dynamic` registers `.flush_and_skip`, never `.skip` — and
 * StationPowerController sends "{source}.skip". Without this registration the
 * skip-track button answers "unknown command" and silently does nothing.
 */
it('registers the skip command the power controller sends', function () {
    $script = renderStationScript($this->station);

    expect($script)->toContain('autodj.register_command(')
        ->toContain('"skip"');
});

it('never asks the API on a tight loop when a station has no rotation', function () {
    $script = renderStationScript($this->station, ['autodjRetryDelay' => 10.0]);

    // Liquidsoap's own default is 0.1s — ten requests a second, forever.
    expect($script)->toContain('retry_delay = { 10.0 }');
});

it('keeps a jingle out of the listener-facing title without hiding it from the api', function () {
    // Two metadata streams, deliberately. `output_source` is the truth — it is
    // what /status reports and what the now-playing push reads, and a station
    // ID genuinely IS on air. `listener_source` is what a player displays, and
    // flipping every listener's StreamTitle to the jingle for eight seconds and
    // back is worse than leaving the last real track up.
    $script = renderStationScript($this->station);

    expect($script)->toContain('listener_source = replay_jingle_metadata(output_source)')
        ->and($script)->toContain('if m["jingle"] == "true" then')
        // update=false replaces wholesale, so the jingle's own title cannot
        // survive underneath; strip=true covers the case with nothing to
        // replay by emitting no metadata rather than an empty title.
        ->and($script)->toContain('metadata.map(update=false, strip=true, rewrite, s)');

    // The rewrite must sit BELOW the truth surface, or /status starts lying.
    $truth = strpos($script, 'output_source = mixed');
    $rewrite = strpos($script, 'listener_source = replay_jingle_metadata');
    expect($truth)->toBeLessThan($rewrite);
});

it('accepts the metadata a broadcaster sends in band', function () {
    // BUTT and Mixxx already push a title on every song change; without
    // icy=true those frames were parsed and discarded, so a DJ running a
    // playlist showed listeners whichever AutoDJ track was up when they
    // connected, for the whole show.
    $script = renderStationScript($this->station, ['metadataCharset' => 'UTF-8']);

    expect($script)->toContain('icy=true')
        // Both spellings: harbor configures the Icecast source protocol and
        // the webcast path separately.
        ->and($script)->toContain('icy_metadata_charset="UTF-8"')
        ->and($script)->toContain('metadata_charset="UTF-8"');
});

it('names a broadcaster who sends no metadata at all', function () {
    // The studio page sends none, and so does any client with its title field
    // blank. Without this the stale AutoDJ title sits in every listener's
    // player for the whole show — the stream asserting something false.
    $script = renderStationScript($this->station, ['liveBroadcastText' => 'On Air Now']);

    expect($script)->toContain('[("title", "On Air Now")]')
        // insert_missing is what makes it fire: metadata.map only runs on
        // metadata events, and a client that sends none never produces one.
        ->and($script)->toContain('metadata.map(insert_missing=true, live_metadata, live_in)')
        // Attached at the source, so it survives the buffer and blank.strip.
        ->and($script)->toContain('buffer(buffer=2., max=10., live_tagged)');
});

it('does not re-push metadata that has not changed', function () {
    // Metadata events are not one per track: harbor re-sends a broadcaster's
    // title and a source switch re-announces whatever is playing, so the same
    // title arrives several times in a row and Laravel writes the identical
    // Redis value each time.
    $script = renderStationScript($this->station);

    expect($script)->toContain('last_pushed_title = ref("")')
        ->and($script)->toContain('elsif m["title"] == last_pushed_title() and m["artist"] == last_pushed_artist() then');
});

it('tunes the gc towards memory, which is what actually kills stations', function () {
    // The 256m cap SIGKILLed every station at boot with empty logs. Trading
    // CPU for a smaller heap is the right side of that trade here.
    $script = renderStationScript($this->station, ['gcSpaceOverhead' => 20]);

    expect($script)->toContain('space_overhead = 20')
        ->and($script)->toContain('allocation_policy = 2')
        // Already true in the image; setting it would only be a claim. The
        // template still mentions it in a comment, so match a real statement.
        ->and($script)->not->toMatch('/^settings\.init\.compact_before_start/m');
});

it('runs the stock gc when the tuning is switched off', function () {
    $script = renderStationScript($this->station, ['gcSpaceOverhead' => 0]);

    expect($script)->not->toContain('runtime.gc.set');
});

it('levels tracks before the crossfade decides how to transition', function () {
    // cross() picks its transition by comparing the db_level of the outgoing
    // and incoming tracks, so it has to see the levels a listener will hear.
    // Leveling afterwards would leave it reasoning about the raw files and
    // hard cutting pairs that are, once corrected, safe to fade.
    $script = renderStationScript($this->station);

    expect($script)->toContain('autodj_leveled = amplify(1., autodj_rotation)');

    $level = strpos($script, 'autodj_leveled = amplify(');
    $cross = strpos($script, 'autodj_faded = cross(');
    expect($level)->toBeLessThan($cross);
});

it('levels jingles too, not just the rotation', function () {
    // A station ID recorded on a phone should not be the loudest thing on the
    // station. Wrapping the fallback rather than the rotation source is what
    // puts both arms through it.
    $script = renderStationScript($this->station);

    $fallback = strpos($script, 'autodj_rotation = fallback(track_sensitive = true, [jingle_arm, autodj])');
    $amplify = strpos($script, 'autodj_leveled = amplify(');
    expect($fallback)->toBeLessThan($amplify);
});

it('drops the amplify operator when loudness correction is switched off', function () {
    // The fleet-wide kill switch: every liq_amplify annotation goes inert
    // without touching a single row.
    $script = renderStationScript($this->station, ['applyAmplify' => false]);

    expect($script)->toContain('autodj_leveled = autodj_rotation')
        ->and($script)->not->toContain('amplify(1.,');
});

it('renders the harbor source timeout as a Liquidsoap float', function () {
    // This is the reconnect window: until it expires, harbor still believes a
    // dropped broadcaster holds the mount and refuses the studio's retries. A
    // bare integer is a syntax error in Liquidsoap, so the station would not
    // start at all.
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $script = renderStationScript($station, ['harborInputTimeout' => 10.0]);

    expect($script)->toContain('timeout=10.0,');
});

it('keeps a fractional harbor timeout intact', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    $script = renderStationScript($station, ['harborInputTimeout' => 7.5]);

    expect($script)->toContain('timeout=7.5,');
});
