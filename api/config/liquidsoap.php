<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Per-station Liquidsoap host paths
    |--------------------------------------------------------------------------
    |
    | Liquidsoap runs as Docker containers spawned by LiquidsoapSupervisor —
    | one per station. These directories on the HOST are bind-mounted into
    | each container; they must exist before a station starts up. Created
    | by infra/setup-host.sh.
    |
    | Inside the container the mounts always resolve as:
    |   /station.liq         (file, read-only)
    |   /data/playlists/     (dir, read-only)
    |   /data/hls/           (dir, read-write)
    |
    | The path values here are HOST paths used as the source of those
    | bind mounts. The api container needs `/var/gocast` mounted in for
    | Laravel to write the .liq files; see docker-compose.yml.
    */

    'liq_dir' => env('LIQUIDSOAP_LIQ_DIR', '/var/gocast/liq'),
    'playlists_dir' => env('LIQUIDSOAP_PLAYLISTS_DIR', '/var/gocast/playlists'),
    'hls_dir' => env('LIQUIDSOAP_HLS_DIR', '/var/gocast/hls'),

    /*
    | Name of the single HLS rendition, and the ONE place it is defined.
    |
    | Liquidsoap names each stream's media playlist after its encoder label, so
    | this value becomes both the encoder key in station.blade.php and the
    | filename in the URL StationResource hands the player:
    |
    |     /var/gocast/hls/{slug}/{variant}.m3u8
    |
    | It has to be shared, because `playlist.m3u8` — the file Liquidsoap writes
    | alongside it — is a MASTER playlist that merely points here:
    |
    |     #EXT-X-STREAM-INF:BANDWIDTH=140800,CODECS="mp4a.40.2"
    |     aac.m3u8
    |
    | Players resolve that variant URI relative to the master and DROP any
    | query string on the way, so a master URL can never carry a per-listener
    | token to the requests that follow it. Anything that needs to identify a
    | listener from their manifest requests must therefore address the media
    | playlist directly — which means knowing this name, which means it cannot
    | be spelled independently in two places and left to drift.
    |
    | Changing it renames the file. Players holding the old URL 404 until they
    | reload, so treat it as a breaking change to a public URL.
    */
    'hls_variant' => env('LIQUIDSOAP_HLS_VARIANT', 'aac'),

    /*
    | Public base URL listeners fetch HLS from — the stream vhost, terminating
    | TLS in front of the directory above. No trailing slash.
    |
    | Empty disables HLS playback: StationResource reports a null `hls_url` and
    | the player falls back to the Icecast mount. That is the correct behaviour
    | for a deployment that has not published the stream host yet, and it is
    | why the frontend must treat the field as optional.
    */
    'hls_base_url' => rtrim((string) env('LIQUIDSOAP_HLS_BASE_URL', ''), '/'),

    /*
    | Platform-owned audio, shared by every station and mounted read-only at
    | /data/system. Currently just the free-tier watermark clip. Unlike the
    | three above this is NOT per-station — one directory, one copy on disk.
    */
    'system_dir' => env('LIQUIDSOAP_SYSTEM_DIR', '/var/gocast/system'),

    /*
    |--------------------------------------------------------------------------
    | Addresses as seen FROM INSIDE a station container
    |--------------------------------------------------------------------------
    |
    | These are rendered into every station's .liq file. The critical thing to
    | understand is whose point of view they describe: a Liquidsoap container
    | attached to `gocast-network`, NOT the machine Laravel runs on.
    |
    | The defaults are the all-Docker values, where Icecast and the API are
    | compose services reachable by service name over the Docker network. They
    | are the right values in production and must stay that way — a station
    | container renders identically whether Laravel is containerised or not,
    | so a wrong default here breaks prod silently.
    |
    | These are addresses from the STATION CONTAINER's point of view, not
    | Laravel's. Everything a station calls back to — Icecast, the Laravel API
    | — runs on the host, so the defaults are `host.docker.internal`, which
    | LiquidsoapSupervisor wires up with --add-host host-gateway on every
    | `docker run`.
    |
    | Trap: host-gateway resolves to the DEFAULT bridge gateway (172.17.0.1)
    | even for containers on gocast-network. Both services must therefore
    | listen on all interfaces, not loopback, and the firewall is what keeps
    | them off the public internet. setup-native.sh installs those rules.
    */

    'icecast_host' => env('LIQUIDSOAP_ICECAST_HOST', 'host.docker.internal'),
    'icecast_port' => (int) env('LIQUIDSOAP_ICECAST_PORT', 8000),

    /*
    | Base URL a station container uses to call Laravel back (now-playing
    | metadata pushes). No trailing slash — the .liq appends the path.
    |
    | Port 8081 is the internal-only nginx vhost (INTERNAL_API_PORT in
    | infra/native/env/domains.env), not the public one — station callbacks
    | never leave the box.
    */
    'api_url' => env('LIQUIDSOAP_API_URL', 'http://host.docker.internal:8081'),

    /*
    |--------------------------------------------------------------------------
    | Broadcaster ingest (input.harbor)
    |--------------------------------------------------------------------------
    |
    | Port inside each station container where broadcasters connect. Harbor
    | speaks two protocols on it: the webcast WebSocket protocol (the studio)
    | and the traditional Icecast source protocol (BUTT, Mixxx, and friends).
    |
    | This is per-container, so every station uses the same number — they are
    | on separate network namespaces and never collide. Nothing publishes it to
    | the host; the browser reaches it through the URL below.
    */
    'harbor_input_port' => (int) env('LIQUIDSOAP_HARBOR_INPUT_PORT', 8090),

    /*
    | Seconds harbor waits on a stalled source before declaring it gone.
    |
    | This is the reconnect window, and it is the reason it is not left at
    | Liquidsoap's default of 30. A broadcaster whose connection dies WITHOUT a
    | clean close — a sleeping laptop, a wifi handover, a tunnel dropping — is
    | not disconnected as far as harbor is concerned until this elapses, and
    | for that whole time the mount is still taken and every reconnect attempt
    | is refused. Thirty seconds of a studio being told "rejected" while it is
    | in fact the only thing entitled to that mount is a long time on air.
    |
    | Ten is comfortably above any real network stall — the studio's own
    | connect timeout is 10s and harbor is fed a continuous MP3 stream, so a
    | source with nothing to say for ten seconds has genuinely gone — and it
    | quarters the window in which a returning broadcaster is locked out.
    |
    | The studio retries for two minutes regardless (RECONNECT_BUDGET_MS in
    | client/lib/broadcast.ts), so this value tunes how FAST a reconnect lands,
    | not whether it can.
    */
    'harbor_input_timeout' => (float) env('LIQUIDSOAP_HARBOR_INPUT_TIMEOUT', 10.0),

    /*
    | Public WebSocket base the studio connects to, with `{slug}` substituted.
    |
    | In production this is a path on the ingest domain, reverse-proxied to the
    | right station container by host nginx plus the station-router container
    | — one TLS endpoint, no per-station DNS. See infra/native/nginx/
    | gocast-stream.conf.
    |
    | Leave it unset in local development and Laravel falls back to addressing
    | the container directly on the Docker bridge, which works on Linux without
    | publishing any ports. That path is plain ws:// and the IP changes on every
    | restart, so it is development-only.
    */
    'ingest_url' => env('LIQUIDSOAP_INGEST_URL'),

    /*
    |--------------------------------------------------------------------------
    | How Laravel reaches a station container's telnet control port
    |--------------------------------------------------------------------------
    |
    | LiquidsoapSupervisor::telnet() sends skip-track / playlist-reload
    | commands to a running station. How it addresses that container depends
    | on where Laravel itself runs:
    |
    |   'ip'   — compute the container's address from the station's
    |            container_index and the subnet below. This is the default and
    |            the only supported production path: Laravel runs natively on
    |            the host, where Docker's embedded DNS does not exist. Works on
    |            Linux because the host routes to container bridge IPs. Costs
    |            nothing — it is arithmetic, no daemon round trip, which is what
    |            keeps the polled /status endpoint fast.
    |
    |   'name' — connect to the container name (gocast-liquidsoap-<slug>) and
    |            let Docker's embedded DNS resolve it. Only works for a process
    |            that is itself ON gocast-network. Nothing in the shipped
    |            deployment is, so this exists for a containerised Laravel and
    |            for tests.
    |
    | Set to 'name' from the host and stations start fine, then sit in
    | `starting` forever because every status poll times out.
    */

    'telnet_resolve' => env('LIQUIDSOAP_TELNET_RESOLVE', 'ip'),

    /*
    |--------------------------------------------------------------------------
    | Per-station container addresses
    |--------------------------------------------------------------------------
    |
    | Every station container is given a FIXED address on gocast-network:
    | this base, plus the station's `container_index`, plus 2 for the network
    | address and the bridge gateway Docker reserves at the bottom.
    |
    | MUST equal GOCAST_SUBNET in infra/native/env/domains.env — that is the
    | subnet the network is actually created with, and a mismatch puts every
    | station outside its own network.
    |
    | The ceiling is the subnet size counted in stations ever created, since
    | indexes are allocated monotonically and never recycled (the migration
    | that adds the column explains why recycling is a trap). ~65k on a /16.
    | containerIp() throws rather than wrapping when it arrives, and widening
    | this value raises the ceiling without moving any existing station,
    | because what is stored is an offset rather than an address.
    |
    | Docker's own IPAM knows nothing about this. Anything else that joins the
    | network — the station router — has to be confined to a slice these
    | addresses never reach, which is what `--ip-range` at network-create time
    | does (setup-native.sh passes GOCAST_IPAM_RANGE). Without it IPAM
    | allocates from the bottom of the subnet, exactly where stations live, and
    | some later station start fails with "address already in use".
    */

    'container_subnet' => env('LIQUIDSOAP_CONTAINER_SUBNET', '172.28.0.0/16'),

    /*
    |--------------------------------------------------------------------------
    | Harbor HTTP control surface
    |--------------------------------------------------------------------------
    |
    | Each station container runs Liquidsoap's built-in harbor HTTP server and
    | serves /status and /healthz on this port. That makes the container the
    | source of truth for what is on air right now — what is playing, how far
    | into it, which source won the fallback — instead of Laravel inferring it
    | from webhooks that can desync.
    |
    | The port is bound inside the container only; it is reachable over
    | gocast-network exactly like the telnet port, and is resolved with the
    | same 'name' vs 'ip' rule as `telnet_resolve` above. Handlers additionally
    | require the X-Internal-Key header, so a foothold on the docker network
    | still cannot read station state.
    |
    | `status_ttl_seconds` is how long a pulled status is cached in Redis. Keep
    | it short — this is a live progress read — but non-zero so a busy discover
    | page doesn't hit every container once per station per request.
    |
    | `status_down_ttl_seconds` is the same cache for the one answer that does
    | NOT go stale on its own: Docker confirmed the container is gone. Nothing
    | but an explicit start changes that, and start already drops the key, so
    | there is no point re-deriving it every couple of seconds for every viewer
    | of a stopped station. Applies only to a verdict Docker confirmed — a
    | silent harbor on a container that IS up stays on the short TTL, because
    | that station is booting and about to change.
    */

    'harbor_port' => (int) env('LIQUIDSOAP_HARBOR_PORT', 8080),
    'harbor_timeout' => (float) env('LIQUIDSOAP_HARBOR_TIMEOUT', 1.5),
    'status_ttl_seconds' => (int) env('LIQUIDSOAP_STATUS_TTL', 2),
    'status_down_ttl_seconds' => (int) env('LIQUIDSOAP_STATUS_DOWN_TTL', 15),

    /*
    |--------------------------------------------------------------------------
    | Dead-air handling on the live input
    |--------------------------------------------------------------------------
    |
    | A broadcaster who mutes their mic, sleeps their laptop, or loses their
    | audio device keeps the RTSP session open — so without this the `live`
    | source stays "available" and listeners get silence indefinitely while
    | AutoDJ sits idle behind it.
    |
    | blank.strip marks the live source unavailable after `blank_max_seconds`
    | below `blank_threshold_db`, which lets the fallback demote to AutoDJ on
    | its own. Set blank_max_seconds to 0 to disable the behaviour entirely.
    |
    | 15s is deliberately generous: a dramatic pause or a quiet intro must not
    | knock a real broadcaster off air.
    */

    'blank_max_seconds' => (float) env('LIQUIDSOAP_BLANK_MAX_SECONDS', 15),
    'blank_threshold_db' => (float) env('LIQUIDSOAP_BLANK_THRESHOLD_DB', -40),

    /*
    |--------------------------------------------------------------------------
    | Output level window
    |--------------------------------------------------------------------------
    |
    | Averaging window for the `rms()` operator on the station's output, which
    | is what lets /status report whether a station is actually producing sound
    | rather than merely which source won the fallback.
    |
    | It is also the update interval: rms() reports 0.0 until the first window
    | completes and then refreshes once per window (verified against the image).
    | Keep it short — well under the status poll — so a reachable container
    | always has a real reading. Smoothing out inter-track gaps is NOT this
    | window's job; that is what the sweep's silence timer is for.
    */

    'rms_window_seconds' => (float) env('LIQUIDSOAP_RMS_WINDOW_SECONDS', 2),

    /*
    |--------------------------------------------------------------------------
    | AutoDJ crossfade
    |--------------------------------------------------------------------------
    |
    | Applies ONLY to transitions between AutoDJ tracks. A live broadcast is
    | one continuous track with no boundaries, so fading it is always wrong —
    | doing so once produced hundreds of stacked 2s gain ramps
    | ("clock.cross: possible source leak") heard as the volume sliding down
    | and snapping back up.
    |
    | `crossfade_enabled` is a kill switch, on purpose. Transitions have wedged
    | AutoDJ playback in the past (two requests of the same file stuck on air,
    | elapsed() running past 1200s on a 184s track, listeners hearing the
    | track summed with a time-shifted copy of itself). The mechanism is not
    | fully understood, so being able to fall back to hard cuts by flipping an
    | env var — with no code change and no redeploy — is worth the config knob.
    | Set LIQUIDSOAP_CROSSFADE_ENABLED=false to cut instead of fade.
    |
    | The smart-transition thresholds mirror AzuraCast's `cross.smart`, which
    | is the reference implementation for this: rather than always overlapping,
    | it compares the loudness of the outgoing and incoming track and only
    | fades when the result will not turn to mush. Two loud tracks are hard
    | cut instead of summed, which is what keeps a master limited to 0.0 dBFS
    | from clipping the encoder during the overlap.
    |
    |   high   — above this (dB) a track counts as loud
    |   medium — below this (dB) a track counts as quiet
    |   margin — dB difference beyond which two tracks are "far apart"
    */

    // Still defaults to FALSE, but the reason is now historical rather than
    // structural — read this before deciding.
    //
    // On Liquidsoap 2.4.0 cross() never survived a transition on this graph.
    // Three formulations were tried — the crossfade() wrapper, a hand-written
    // cross() transition, and the cross.smart port with duration annotated —
    // and each wedged AutoDJ, the last on its very first track boundary. Output
    // degenerated to a single buffered frame looping forever: a static harmonic
    // spectrum, unchanging for 20s, heard as a stuck-PC buzz. elapsed() climbed
    // past the track length, remaining() froze, decoder End_of_file stopped
    // firing, and nothing at all was logged.
    //
    // That was an upstream bug, not our config: savonet#4851 attached the
    // crossfade's `transition` and `pre_buffer` sources to the passive child
    // clock instead of the top-level one, so nothing animated them. Fixed in
    // Liquidsoap 2.4.3; the image is now pinned to 2.4.5, which additionally
    // fixes savonet#5194 (cross/crossfade crash when source.skip is called
    // from a harbor.http handler — this graph serves /status over harbor.http).
    //
    // So this is expected to work now. It stays off by default only because it
    // has not yet been observed working here. To adopt it: confirm the station
    // is healthy on 2.4.5 with this false, then set it true and relaunch, and
    // watch for End_of_file every track length and elapsed+remaining summing to
    // the track duration. Prefer a playlist with more than one track.
    'crossfade_enabled' => (bool) env('LIQUIDSOAP_CROSSFADE_ENABLED', false),
    // Two DIFFERENT things, which must not share a value:
    //
    //   crossfade_duration — the cross window. How much audio is buffered from
    //                        the end of the old track and the start of the new.
    //   crossfade_fade     — the length of the fade-in/fade-out envelopes drawn
    //                        inside that window.
    //
    // The Liquidsoap book (§6.4) is explicit: "The total duration should always
    // be strictly longer than the one of the fades, otherwise the fades will not
    // be complete and you will hear abrupt changes in the volume." Its worked
    // example of the broken case is fades of 3s inside a 2s duration.
    //
    // These were previously one value used for both, i.e. permanently in the
    // degenerate case. Defaults here are the book's own: 5s window, 3s fades.
    // LiquidsoapSupervisor clamps the fade below the window before rendering,
    // so a bad env pairing cannot produce incomplete transitions.
    'crossfade_duration' => (float) env('LIQUIDSOAP_CROSSFADE_DURATION', 5),
    'crossfade_fade' => (float) env('LIQUIDSOAP_CROSSFADE_FADE', 3),
    'crossfade_high_db' => (float) env('LIQUIDSOAP_CROSSFADE_HIGH_DB', -15),
    'crossfade_medium_db' => (float) env('LIQUIDSOAP_CROSSFADE_MEDIUM_DB', -32),
    'crossfade_margin_db' => (float) env('LIQUIDSOAP_CROSSFADE_MARGIN_DB', 4),

    /*
    |--------------------------------------------------------------------------
    | Peak limiter
    |--------------------------------------------------------------------------
    |
    | Overflow protection on the way to the encoders — NOT loudness shaping.
    | The gain is static above the threshold, so unlike normalize() it cannot
    | breathe on quiet passages, and unlike cross() it has no track logic that
    | could wedge on a broadcast with no track boundaries.
    |
    | `include_live` is where it sits in the graph, and the default changed:
    |
    |   true  — bottom of the graph, past the live/AutoDJ fallback and past the
    |           watermark, so everything a listener hears is guarded.
    |   false — the old placement, wrapping the AutoDJ arm alone.
    |
    | The old placement followed this file's rule of keeping operators off the
    | live path, and in doing so protected only the arm whose levels we already
    | control while leaving a hot broadcaster to hit the encoder with no
    | headroom at all. The rule is really about TRACK-BOUNDARY operators — the
    | ones that re-trigger forever on a live stream that is one endless track —
    | and limit() is not one; the same argument already puts smooth_add on the
    | live path for the watermark. Verified, not assumed: 42s of an endless,
    | mark-free carrier through limit() produced no source leak and no latency
    | catch-up on 2.4.5.
    |
    | Set LIQUIDSOAP_LIMITER_INCLUDE_LIVE=false to restore the old placement
    | exactly, on the same principle as the crossfade and rotation switches:
    | this is the audio path, so a way back should be an env var and a relaunch.
    |
    | The threshold is a ceiling in dBFS. -1.0 leaves the MP3 encoder a dB of
    | headroom, which is what a master brick-walled to 0.0 dBFS does not.
    */

    'limiter_threshold_db' => (float) env('LIQUIDSOAP_LIMITER_THRESHOLD_DB', -1.0),
    'limiter_include_live' => (bool) env('LIQUIDSOAP_LIMITER_INCLUDE_LIVE', true),

    /*
    |--------------------------------------------------------------------------
    | Broadcaster metadata
    |--------------------------------------------------------------------------
    |
    | Harbor accepts the metadata a broadcaster's own client sends in band
    | (`icy=true` in the template) — the track titles BUTT, Mixxx and friends
    | already push on every song change. Before that, those frames were parsed
    | and discarded, so a DJ running a playlist showed listeners whichever
    | AutoDJ track happened to be up when they connected, for the whole show.
    |
    | `live_broadcast_text` is the placeholder for the other case: a broadcaster
    | who sends no metadata at all, which includes the studio page. Without it
    | the stale AutoDJ title simply stays put — the stream asserting something
    | false rather than saying nothing. A real title arriving later replaces it.
    |
    | `metadata_charset` decodes what the client sends. Source clients disagree
    | about this and there is no negotiation, so it is a per-install choice
    | rather than a guess: UTF-8 is right for anything modern, and the failure
    | mode for the rest is mojibake in a track title, not lost audio. It is set
    | for both the Icecast source protocol and the webcast path, which harbor
    | configures separately.
    |
    | This is untrusted text bound for listeners and for Redis. The cap lives in
    | NowPlayingController (500 chars, trimmed), not in the container.
    */

    'live_broadcast_text' => env('LIQUIDSOAP_LIVE_BROADCAST_TEXT', 'Live Broadcast'),
    'metadata_charset' => env('LIQUIDSOAP_METADATA_CHARSET', 'UTF-8'),

    /*
    |--------------------------------------------------------------------------
    | Track analysis
    |--------------------------------------------------------------------------
    |
    | Every upload is measured once, in a queued job, for two things: how loud
    | it is (EBU R128 integrated loudness plus true peak) and where the audio
    | actually starts and stops. Those become `liq_amplify`, `liq_cue_in` and
    | `liq_cue_out` annotations on the track's request, so the corrections
    | happen at playback and the uploaded file is never modified.
    |
    | It fixes the two things a station's own library does to it. A mastered
    | single sits at 0 dBFS next to a podcast export 20 dB below it, which is a
    | listener reaching for the volume between every track; and a rip carries
    | three seconds of leading silence, which is a gap that reads as the stream
    | having died. Neither is repairable downstream — a master-bus compressor
    | can only squash the difference after the fact, and nothing can invent the
    | audio a silent lead-in isn't playing.
    |
    | `analysis_enabled` gates the job, not the annotations: switching it off
    | stops new uploads being measured and leaves everything already measured
    | playing corrected. `apply_amplify` is the separate question of whether the
    | audio graph acts on the gain at all — it drops the `amplify` operator from
    | the script, which is the kill switch for loudness correction across the
    | fleet without touching a single row.
    |
    | `analysis_ffmpeg` is the path to a local ffmpeg. Leave it empty and the
    | analyser borrows the station image's, one throwaway container per track:
    | the same build that decodes the file on air, no second ffmpeg in the API
    | image, and no new dependency, since Liquidsoap needs a container in every
    | supported run mode anyway. Set it if a local binary is available and the
    | per-track container startup is worth avoiding.
    */

    'analysis_enabled' => (bool) env('LIQUIDSOAP_ANALYSIS_ENABLED', true),
    'analysis_ffmpeg' => env('LIQUIDSOAP_ANALYSIS_FFMPEG', ''),
    'analysis_timeout_seconds' => (int) env('LIQUIDSOAP_ANALYSIS_TIMEOUT', 120),

    /*
    | Loudness leveling.
    |
    |   target  — where tracks are moved to, in LUFS. -14 is the streaming
    |             convention (Spotify, YouTube, Apple all land within a dB or
    |             two of it), so a library leveled here sounds right next to
    |             whatever the listener played before us. Broadcast radio
    |             traditionally runs hotter; going much above -14 leaves so
    |             little headroom that the ceiling below does all the work.
    |   ceiling — dBFS the true peak may not exceed after gain. Matched to the
    |             limiter threshold on purpose: the limiter is for what we
    |             failed to predict, not the plan, and a limiter working hard
    |             is audible distortion.
    |   max_gain— the most anything is lifted. A near-silent field recording
    |             needs +30 dB to reach target and that amplifies its noise
    |             floor into a hiss louder than the content ever was. Past a
    |             point the honest answer is that the file is quiet.
    |
    | Attenuation is deliberately uncapped: turning something down cannot
    | introduce noise, and the loud files are the ones causing the problem.
    |
    | These are read when the annotation is built, not when the track is
    | analysed — only the raw measurements are stored. Retuning the target
    | relevels the whole library at each station's next track boundary, with no
    | re-analysis and no restart.
    */

    'apply_amplify' => (bool) env('LIQUIDSOAP_APPLY_AMPLIFY', true),
    'loudness_target_lufs' => (float) env('LIQUIDSOAP_LOUDNESS_TARGET', -14.0),
    'loudness_ceiling_db' => (float) env('LIQUIDSOAP_LOUDNESS_CEILING', -1.0),
    'loudness_max_gain_db' => (float) env('LIQUIDSOAP_LOUDNESS_MAX_GAIN', 12.0),

    /*
    | Silence trimming.
    |
    |   silence_db      — level below which audio counts as silence. Generous
    |                     at -50: a quiet fade-in is not silence, and trimming
    |                     into real audio is far worse than leaving a gap.
    |   silence_seconds — how long it must stay there to count. Short bursts
    |                     under this are part of the music.
    |   min_playable    — a measurement that would trim a track to less than
    |                     this is discarded whole. A mis-detected threshold on
    |                     an ambient intro would otherwise truncate the track on
    |                     air while the file itself looks fine to anyone who
    |                     goes to check.
    |
    | Only the head and tail are trimmed. Silence in the middle is either
    | intentional or a gap between movements, and cutting it would be editing
    | the audio rather than trimming its edges.
    */

    'analysis_silence_db' => (float) env('LIQUIDSOAP_ANALYSIS_SILENCE_DB', -50.0),
    'analysis_silence_seconds' => (float) env('LIQUIDSOAP_ANALYSIS_SILENCE_SECONDS', 0.25),
    'cue_min_playable_seconds' => (float) env('LIQUIDSOAP_CUE_MIN_PLAYABLE', 5.0),

    /*
    |--------------------------------------------------------------------------
    | OCaml GC tuning
    |--------------------------------------------------------------------------
    |
    | `space_overhead` is the percentage of live heap the collector tolerates
    | before working harder; OCaml's default of 120 lets a process hold roughly
    | twice its live data. Lower means more frequent collection: less memory,
    | more CPU. That is the right trade on a box running one container per
    | station, where memory is the resource that has actually bitten us — the
    | 256m default SIGKILLed every station at boot (exit 137, empty logs,
    | restart loop) before the cap was raised to 512m against an ~85MB steady
    | state.
    |
    | AzuraCast ships the same knob as three presets, which are the values to
    | reach for: 20 (less memory), 80 (balanced), 140 (less CPU). We default to
    | balanced. The template also sets allocation_policy = 2 (best-fit), which
    | fragments the major heap less under the churn of decoding one track after
    | another.
    |
    | Set to 0 to omit the block entirely and run the stock GC — the rollback
    | if a station starts burning CPU. Worth re-measuring at your real station
    | count rather than adopting on faith; this is a trade, not free.
    |
    | Deliberately absent: `settings.init.compact_before_start`. The image
    | already defaults it to true (verified with --list-settings on 2.4.5), so
    | setting it would only be a claim that we chose it.
    */

    'gc_space_overhead' => (int) env('LIQUIDSOAP_GC_SPACE_OVERHEAD', 80),

    /*
    |--------------------------------------------------------------------------
    | Free-tier watermark
    |--------------------------------------------------------------------------
    |
    | A short platform-owned clip ("powered by GoCast") mixed OVER the station
    | at intervals, ducking whatever is playing rather than replacing it. Which
    | stations get it is a plan question (`plans.watermark_enabled`); how it
    | sounds is an install question, which is what lives here.
    |
    | Read this before tuning: free plans have no AutoDJ, so a free station is
    | live-only and this rides over a HUMAN TALKING, not over music. That makes
    | it noticeably more intrusive than the same numbers would be on a music
    | bed — two voices at once is worse than one, which is why the duck is deep
    | and the interval is measured in minutes.
    |
    | The audio itself is any file dropped in `system_dir`. That is a directory
    | rather than a fixed filename on purpose: Liquidsoap plays whatever is in
    | it (several variants rotate at random), and an EMPTY directory simply
    | makes the source fallible — no watermark, station unaffected. A missing
    | clip must never be able to take stations off air.
    |
    |   enabled  — global kill switch, independent of any plan. Turn the whole
    |              feature off across the fleet without touching plan rows.
    |   interval — seconds between watermarks. 600 = 6/hour; measured against a
    |              typical show length before choosing it. Do not go below a
    |              couple of minutes: over live speech it stops reading as
    |              branding and starts reading as a fault.
    |   duck     — the PORTION of the station's own audio kept while the
    |              watermark plays (Liquidsoap's `p`), not the amount removed.
    |              0.15 means the host drops to 15%, about -16dB. Liquidsoap's
    |              own default of 0.2 is tuned for music; speech wants deeper.
    |   fade     — seconds to ramp down and back. Long enough not to sound like
    |              a dropout, short enough not to swallow the clip's first word.
    */

    'watermark_enabled' => (bool) env('LIQUIDSOAP_WATERMARK_ENABLED', true),
    'watermark_interval_seconds' => (float) env('LIQUIDSOAP_WATERMARK_INTERVAL', 600),
    'watermark_duck' => (float) env('LIQUIDSOAP_WATERMARK_DUCK', 0.15),
    'watermark_fade_seconds' => (float) env('LIQUIDSOAP_WATERMARK_FADE', 1.0),

    /*
    | Largest clip the admin panel will accept into `system_dir`. These are
    | seconds-long platform IDs, not music, and the directory is mounted into
    | every container on the box — so the cap is small on purpose.
    */
    'watermark_clip_max_bytes' => (int) env('LIQUIDSOAP_WATERMARK_CLIP_MAX_BYTES', 5 * 1024 * 1024),

    /*
    |--------------------------------------------------------------------------
    | AutoDJ rotation
    |--------------------------------------------------------------------------
    |
    | A station's Liquidsoap gets its rotation from `request.dynamic`, which
    | asks Laravel for ONE track at a time over /api/internal/next-track. This
    | is what AzuraCast and LibreTime do, and it is the only way the ordering
    | can be OURS: rotation rules, dayparting and ad breaks are all "which
    | track is next", which is a question a playlist file cannot be asked.
    |
    | It replaced a `playlist()` source reading playlist.m3u, and there is no
    | switch back. Measured on 2.4.5, `playlist.reload` — which the file mode
    | had to send after every track change — restarts the list at index 0, so a
    | listener heard the rotation jump to song one because somebody uploaded a
    | track. Manual reload and reload_mode="watch" behave the same; there is no
    | cursor-preserving reload, which makes the file mode unshippable rather
    | than merely worse.
    */

    /*
    | Seconds before Liquidsoap re-asks after the API answers "nothing to
    | play" (an empty rotation) or fails. Liquidsoap's own default is 0.1s,
    | which would mean ten requests a second, forever, for every station with
    | an empty library — a busy box's worth of traffic to be told nothing.
    */
    'autodj_retry_delay_seconds' => (float) env('LIQUIDSOAP_AUTODJ_RETRY_DELAY', 10.0),

    /*
    |--------------------------------------------------------------------------
    | Auto-stop
    |--------------------------------------------------------------------------
    |
    | Seconds a station may produce NO AUDIO, with nothing attached that could
    | start producing some, before `stations:sweep` takes it off air. 0 disables
    | stopping entirely.
    |
    | WHAT THIS IS NOT. It is not an idle timeout. Listener count plays no part
    | in the decision: an AutoDJ rotation playing to an empty room is a paid
    | feature working exactly as sold, and stopping it would be an outage, not a
    | saving. The predecessor of this setting — an hourly reaper keyed on
    | listener count — only produced the right answer because the free plan has
    | no AutoDJ, so "no listeners" happened to coincide with "no broadcaster".
    |
    | A broadcaster who is CONNECTED BUT SILENT is never on this clock. Their
    | mic being muted demotes them off the live source, but the container
    | reports the socket separately, and an attached broadcaster resets the
    | window however quiet they are.
    |
    | The window is measured from the first observation of silence, not from
    | the end of the last stream session, so a station that was started and
    | never broadcast to is treated the same as one whose broadcaster left.
    | That is safe because the studio starts a station itself before going live
    | (and again on every reconnect) — nobody has to press the power button
    | first, so an on-air station with nothing attached is genuinely waste.
    |
    | Effective time to stop is one to two windows: the sweep needs one pass to
    | start the clock and another to act on it.
    */

    'silent_stop_seconds' => (int) env('LIQUIDSOAP_SILENT_STOP_SECONDS', 60),

    /*
    | Output level (0.0–1.0, from the rms() meter on the station's output) at or
    | below which a station counts as producing nothing.
    |
    | Not simply 0.0: digital silence is exactly zero, but an encoder's noise
    | floor or a DC offset can sit a hair above it, and a station inaudible to
    | every listener should not be held on air by the eighth decimal place.
    | ~0.0001 is about -80 dBFS.
    */

    'silence_rms_threshold' => (float) env('LIQUIDSOAP_SILENCE_RMS_THRESHOLD', 0.0001),

    /*
    | Per-station AutoDJ storage cap. Total bytes of all tracks combined.
    | Uploads that would push the station over this cap are rejected.
    */
    'station_storage_bytes' => (int) env('LIQUIDSOAP_STATION_STORAGE_BYTES', 3 * 1024 * 1024 * 1024),

    /*
    |--------------------------------------------------------------------------
    | Per-station container resource caps
    |--------------------------------------------------------------------------
    |
    | Passed to `docker run` as `--cpus` and `--memory` for every per-station
    | Liquidsoap container. Liquidsoap idling on a single ~128kbps Icecast
    | output uses well under 0.25 CPU and ~50MB RSS in practice; the caps
    | below are sized to absorb a transcoding spike (FFmpeg re-encode of an
    | incoming RTSP stream, HLS segment muxing) without permitting a runaway
    | station to starve its neighbors on the same host.
    |
    | Tune via env: numbers can be fractional ("0.5") for cpus, and accept
    | a "b/k/m/g" suffix for memory. Set either to an empty string to
    | disable the corresponding cap (not recommended in prod).
    |
    | The memory default was 256m until 2026-08-14, which was below what the
    | container needs to BOOT: Liquidsoap 2.4.0 spikes past 384m while
    | initialising the ffmpeg RTSP input and the HLS encoder, so the kernel
    | SIGKILLed it (exit 137) before it wrote its first log line — presenting
    | as a station that silently never starts, with a completely empty
    | `docker logs`, restart-looping every few seconds.
    |
    | Measured: killed at 320m and 384m, boots at 448m, steady state ~85MB.
    | 512m leaves headroom over the boot spike. Do not lower this below 448m
    | without re-measuring; the failure mode is silent.
    */
    'container_cpus' => env('LIQUIDSOAP_CONTAINER_CPUS', '0.5'),
    'container_memory' => env('LIQUIDSOAP_CONTAINER_MEMORY', '512m'),

    /*
    |--------------------------------------------------------------------------
    | Station image
    |--------------------------------------------------------------------------
    |
    | The image every station container runs. Config rather than a constant so
    | a bad Liquidsoap upgrade is rolled back with an env change plus
    | `stations:relaunch`, instead of a deploy.
    |
    | Prefer an explicit version tag over `:latest` in production — the tag is
    | resolved once per `docker run`, so `:latest` means two stations started
    | either side of a rebuild can be running different Liquidsoap versions.
    */

    'image' => env('LIQUIDSOAP_IMAGE', 'gocast/liquidsoap:latest'),

    /*
    |--------------------------------------------------------------------------
    | Graceful shutdown
    |--------------------------------------------------------------------------
    |
    | Seconds Docker waits after SIGTERM before it SIGKILLs a station. Measured
    | on the shipped image, Liquidsoap drains and exits in ~0.5s, so this is
    | generous — but it must stay comfortably under the 10s Process timeout on
    | every docker call, or Laravel kills the CLI mid-shutdown.
    |
    | Shutting down cleanly is what writes the HLS `persist_at` state (so a
    | restart resumes the segment sequence instead of resetting it) and closes
    | the Icecast source socket (so the mount disappears at once rather than
    | lingering until Icecast times it out).
    */

    'stop_timeout_seconds' => (int) env('LIQUIDSOAP_STOP_TIMEOUT', 5),

    /*
    |--------------------------------------------------------------------------
    | Start verification
    |--------------------------------------------------------------------------
    |
    | `docker run -d` returns when the container is CREATED, not when the
    | process survives: a station whose script is broken, or which is OOM-killed
    | while building its audio graph, reports a successful start and then sits
    | in `starting` forever.
    |
    | After starting a container we wait this long and ask Docker what actually
    | happened. Long enough to catch an immediate death (a bad .liq dies in
    | ~200ms), short enough not to matter on a start that already returns 202.
    | Set to 0 to skip verification.
    */

    'start_verify_delay_ms' => (int) env('LIQUIDSOAP_START_VERIFY_DELAY_MS', 750),

    /*
    |--------------------------------------------------------------------------
    | Container healthcheck
    |--------------------------------------------------------------------------
    |
    | Each station serves /healthz on its harbor port; without a healthcheck
    | nothing consumes it, and `docker ps --filter status=running` reports a
    | crash-looping container as running for as long as Docker's restart backoff
    | stays short (measured: 5 out of 5 samples over the first 10s of a crash
    | loop). Letting Docker poll /healthz gives `isRunning()` an honest answer
    | and hands the reconciler `--filter health=unhealthy` for free.
    |
    | The probe is written against bash's /dev/tcp because the image has no
    | curl, wget or nc.
    |
    | `start_period` is the grace window before failures count — it must cover
    | a cold boot (audio graph + Icecast connect), or a healthy station is
    | marked unhealthy while it is still coming up.
    |
    | Docker does NOT restart unhealthy containers outside Swarm. This is a
    | signal `stations:reconcile` acts on, not self-healing.
    */

    'health_enabled' => (bool) env('LIQUIDSOAP_HEALTHCHECK', true),
    'health_interval_seconds' => (int) env('LIQUIDSOAP_HEALTH_INTERVAL', 15),
    'health_timeout_seconds' => (int) env('LIQUIDSOAP_HEALTH_TIMEOUT', 3),
    'health_retries' => (int) env('LIQUIDSOAP_HEALTH_RETRIES', 3),
    'health_start_period_seconds' => (int) env('LIQUIDSOAP_HEALTH_START_PERIOD', 45),

    /*
    | How many consecutive reconciler passes a station may be unhealthy before
    | the container is recreated, and how many recreates are allowed within an
    | hour before we stop trying and leave it for a human. Without the cap, a
    | station whose script is genuinely broken is recreated every minute
    | forever.
    |
    | These are counted in PASSES, so their meaning depends on how often
    | stations:reconcile is scheduled (currently every minute). Two passes is
    | two minutes of a container continuously reporting restarting/exited/dead
    | or a failing healthcheck — a booting station never qualifies, because the
    | healthcheck's start period reports `starting` rather than `unhealthy`.
    */

    'unhealthy_passes_before_recreate' => (int) env('LIQUIDSOAP_UNHEALTHY_PASSES', 2),
    'unhealthy_recreates_per_hour' => (int) env('LIQUIDSOAP_UNHEALTHY_RECREATES_PER_HOUR', 3),

    /*
    | Consecutive passes an open StreamSession may disagree with its container
    | before the reconciler closes it as stranded.
    |
    | Far more patient than the unhealthy threshold on purpose: the signal is
    | `source != live`, which a broadcaster triggers merely by falling silent
    | for longer than the dead-air guard. Closing a live broadcaster's session
    | cannot be undone by anything the container will send afterwards, so this
    | errs towards leaving a genuinely stranded session open for a few extra
    | minutes rather than cutting a real show short.
    */

    'stranded_session_strikes' => (int) env('LIQUIDSOAP_STRANDED_SESSION_STRIKES', 10),

    /*
    |--------------------------------------------------------------------------
    | Container sandboxing
    |--------------------------------------------------------------------------
    |
    | Liquidsoap needs no capabilities beyond reading its mounts and opening
    | sockets, so every capability is dropped. `no-new-privileges` blocks setuid
    | escalation, and the pid cap bounds a fork storm.
    |
    | `--init` (a real PID 1 that reaps zombies) is off by default: the image
    | handles SIGTERM correctly on its own — verified — and nothing in the
    | current audio graph forks. Turn it on if per-track protocol resolvers
    | (autocue, replaygain) are introduced, since those fork ffmpeg per request.
    */

    'container_pids_limit' => (int) env('LIQUIDSOAP_CONTAINER_PIDS_LIMIT', 256),
    'container_init' => (bool) env('LIQUIDSOAP_CONTAINER_INIT', false),
];
