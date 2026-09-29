---
feature: Liquidsoap station script (the audio path as code)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - api/resources/views/liquidsoap/station.blade.php
  - api/config/liquidsoap.php
  - api/config/services.php
  - infra/liquidsoap/Dockerfile
  - infra/liquidsoap/standby.liq
  - infra/liquidsoap/reference-station.liq
  - infra/liquidsoap/README.md
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Services/PlaylistFileWriter.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Controllers/NextTrackController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Controllers/NowPlayingController.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/routes/api.php
  - api/app/Jobs/ReloadWatermarkClips.php
  - api/app/Observers/StationObserver.php
  - api/app/Observers/UserObserver.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Models/StationEvent.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Services/StationStatusService.php
fingerprint: 0f0f6306976445a7
---

# Liquidsoap station script

Every station is one Docker container running one Liquidsoap 2.4.5 process, and that process runs one generated script. The script is the Blade template `api/resources/views/liquidsoap/station.blade.php` (1403 lines), rendered by `LiquidsoapSupervisor::renderLiqFile()` to `{liq_dir}/{slug}.liq` and bind-mounted read-only at `/station.liq`. This document is the script itself: what is in the audio graph, in what order, with which timings, and every call it makes back to Laravel. How containers are started, stopped and reconciled is in [Liquidsoap supervisor](liquidsoap-supervisor.md); how a broadcaster gets in is in [Broadcasting web studio](broadcasting-web-studio.md) and [Encoder ingest](encoder-ingest.md); what AutoDJ chooses is in [AutoDJ](autodj.md).

**The one thing people get wrong:** there are two different answers to "is somebody on air", and they disagree on purpose. `broadcaster` is a plain flag flipped by harbor's connect/disconnect callbacks. `source` (`live` / `autodj` / `silence`) only says which arm of the fallback is feeding the encoder, and it lags a connection by harbor's buffer on the way in and on the way out. Neither of them means "sound is coming out"; that is `rms`. Product logic about people must read `broadcaster`.

## Pull chain

Liquidsoap is pull-based: the two outputs ask `broadcast_out` for audio, and each operator asks the one below it. Reading the graph from the outputs back to the inputs:

```
output.icecast (mp3 128k, 44.1k)   output.file.hls (adts AAC 128k)
              \                     /
               broadcast_out   = limit(-1 dB) over broadcast_source        [if limiter_include_live]
                  broadcast_source = smooth_add(normal=listener_source, special=watermark_arm)  [if watermark supported]
                     listener_source = metadata.map(replay_jingle_metadata, output_source)
                        output_source = rms(window, mixed)      <- what /status and now-playing read
                           mixed = mksafe(fallback(track_sensitive=false, [live, autodj_mix, bed]))
                              live         = buffer(2s, max 10s, metadata.map(live_metadata, input.harbor(...)))
                              autodj_mix   = limit(-1 dB, autodj_faded)   [only if limiter_include_live=false]
                                             else autodj_faded
                                 autodj_faded   = cross(...) over autodj_leveled   [only if crossfade_enabled]
                                 autodj_leveled = amplify(1., autodj_rotation)      [only if apply_amplify]
                                    autodj_rotation = fallback(track_sensitive=true, [jingle_arm, autodj])
                                       jingle_arm = source.available(delay(initial, jingle_delay, jingles), jingle_due)
                                       autodj     = request.dynamic(autodj_next)   <- asks Laravel
                              bed          = mksafe(blank())
```

Both outputs take the same `broadcast_out` source, so listeners on Icecast and HLS hear the same audio. `output_source` is deliberately upstream of the watermark and the jingle metadata rewrite: the API sees what the station plays, listeners see what the station wants shown.

Priority in `mixed` is live, then AutoDJ, then silence. `track_sensitive=false` means a broadcaster connecting mid-track interrupts immediately. There is no fade between live and AutoDJ, by design: fading a live stream needs an operator on the live path, which once produced hundreds of stacked gain ramps ("possible source leak"). Going live is a hard cut in, and a broadcaster dropping is a hard cut to AutoDJ (or silence).

## Script, section by section

### Header and settings (lines 54-70)

- `settings.log.stdout.set(true)`, `settings.log.level.set(2)` (Liquidsoap's severe level: 1 critical, 2 severe, 3 important, 4 info). Level 3 would log one line per retry all day. `log.severe` lines therefore print; `log.important` (3) would not. The `on_fail` handlers of the jingle and watermark playlists log at level 2 and so do print.
- Telnet server on `0.0.0.0:1234`, no authentication. Only reachable on `gocast-network`. `LiquidsoapSupervisor::TELNET_PORT` hardcodes the same 1234.

### OCaml GC block (lines 71-106)

Rendered only when `gc_space_overhead > 0`. Sets `runtime.gc` `space_overhead` to the config value (default 80) and `allocation_policy = 2` (best fit). `LIQUIDSOAP_GC_SPACE_OVERHEAD=0` omits the block. The comment says the container cap is 512m against a roughly 85MB steady state.

### Lifecycle reporting (lines 107-157)

`post_event(body)` does an HTTP POST to `{apiUrl}/api/internal/station-event`, 5s timeout, return value ignored. `notify(event)` sends `{slug, event}`. `notify_live_connected(client, via)` is a separate function because Liquidsoap records are statically typed and the other events must not carry empty `client`/`via` fields. `on_start` sends `boot`, `on_shutdown` sends `shutdown`. `ice_up = ref(false)` is declared here and flipped by the Icecast output callbacks further down.

### harbor_auth (lines 159-210)

Passed as `auth=` to `input.harbor`. POSTs `{slug, user, password, address}` to `/api/internal/harbor-auth` (5s timeout). Only an exact HTTP 200 is an accept. Any other status logs `harbor: refused ...` at `log.severe` and returns false. A thrown exception (API unreachable, DNS failure, dev server on loopback) logs `harbor: cannot reach the auth API ...` and also returns false. It fails closed. Laravel side, every refusal is logged and counted in `IngestMetrics`.

### The live input (lines 212-278)

```
live_in = input.harbor(<slug>, port=harbor_input_port, auth=harbor_auth,
  buffer=5., max=10., timeout=harbor_input_timeout, icy=true,
  icy_metadata_charset=<charset>, metadata_charset=<charset>)
```

| Argument | Value | Source | Meaning |
|---|---|---|---|
| mount | the slug | `$station->slug` | Both the webcast WebSocket path (`/{slug}`) and the Icecast-protocol mount. Note this is NOT `icecast_mount` (`/stream/{slug}`), which is the listener output mount. |
| `port` | 8090 | `liquidsoap.harbor_input_port` | Same number in every container. |
| `buffer` | 5.0 | literal in the template | How much broadcaster audio harbor holds before playing any. Liquidsoap's default is 12s. It is the biggest term in live latency. Not configurable. |
| `max` | 10.0 | literal | Cap on drift for a sender whose clock runs fast (default 20). Not configurable. |
| `timeout` | 10.0 | `liquidsoap.harbor_input_timeout` (`LIQUIDSOAP_HARBOR_INPUT_TIMEOUT`) | How long a stalled source keeps holding the mount before harbor declares it gone. Default Liquidsoap is 30. |
| `icy` | true | literal | Accept in-band metadata from source clients (BUTT, Mixxx). |
| charsets | `UTF-8` | `liquidsoap.metadata_charset` | Set for both the Icecast-protocol and the webcast path. |

Two protocols share the port: the webcast WebSocket (the browser studio) and the Icecast source protocol (BUTT, Mixxx, libshout clients). The router container that lets encoders reach it is in [Encoder ingest](encoder-ingest.md).

### Connection callbacks, `live_connected`, `via` (lines 280-410)

- `live_connected = ref(false)` is set true in `live_in.on_connect` and false in `live_in.on_disconnect`. Both are registered as methods (the argument form is deprecated) with `synchronous=false`, because each does an HTTP post and a synchronous callback would stall the streaming thread.
- `on_connect` posts `live_connected` with `client` (the User-Agent header, trimmed, clipped to 255 chars by `live_clip`) and `via`. `on_disconnect` posts `live_disconnected`.
- `live_header(headers, label)` lower-cases every header name before looking up. This is required, not defensive: on 2.4.5 an Icecast source client's headers arrive with the original case (the docs say lowercase; they are wrong).
- `live_via(headers)` returns `"browser"` if `Upgrade` contains `websocket` or `Sec-WebSocket-Protocol` is non-empty, otherwise `"external"`. Only three values ever leave the container: the user-agent, and the via label. The `Authorization` header carries the stream key and is deliberately never forwarded.
- `broadcaster_attached()` is exactly `live_connected()`. It used to be `live_connected() or live_in.is_ready()`; the OR made a DJ who pressed Stop read as a broadcaster for about another 12 seconds (the buffer tail). Removed.

### Live metadata and the live arm (lines 412-453)

- `live_metadata(m)`: if the broadcaster sent no metadata (`m == []`), emit `[("title", live_broadcast_text)]` (default `Live Broadcast`, env `LIQUIDSOAP_LIVE_BROADCAST_TEXT`). Otherwise pass through untouched. `metadata.map(insert_missing=true, ...)` is what makes it fire for a client that never sends any. A real title arriving later replaces the placeholder.
- `live_raw = buffer(buffer=2., max=10., live_tagged)`: a second buffer on top of harbor's own, to decouple arrival timing from the main clock. Literal values, not configurable.
- `live = live_raw`. There is no dead-air guard. A connected but silent broadcaster keeps the fallback. (The old `blank.strip` demotion, which is still in `reference-station.liq`, was removed because it changed `current_source()` underneath a live DJ.) What still ends a dead broadcast is harbor's `timeout` for a stalled source.

Approximate live latency budget: harbor 5s + `buffer()` 2s + encoder and HLS (4s segments, players hold roughly 2 segments). The Icecast mount is the low-latency path. These are all reasoning from the constants; no latency measurement was taken for this doc.

### AutoDJ rotation: `request.dynamic` (lines 455-534)

`autodj_next()` does `GET {nextTrackUrl}` with headers `Accept: text/plain` and `X-Internal-Key`, 5s timeout. `nextTrackUrl` is built in the supervisor: `{api_url}/api/internal/next-track?slug={rawurlencode(slug)}`.

| Response | Effect |
|---|---|
| 200 with non-empty body | `request.create(body)`. The body is an `annotate:` URI (see below). |
| 200 with empty body | `null` (nothing to play). |
| 204 | `null`, silently. This is the normal answer for an empty library, a Free plan, or no resolvable playlist. |
| any other status | `log.severe("autodj: next-track answered HTTP N — rotation stalled")`, returns `null`. |
| exception | `log.severe("autodj: cannot reach the next-track API ...")`, returns `null`. |

`autodj = request.dynamic(id="playlist_m3u", retry_delay={N}, autodj_next)`. `retry_delay` is `liquidsoap.autodj_retry_delay_seconds` (default 10.0, floored at 1.0 by the supervisor) and is rendered as a getter, `{ 10.0 }`. It is how long Liquidsoap waits before re-asking after a `null`. Everything else about `request.dynamic` (prefetch, queue length) is left at Liquidsoap's defaults; the script sets nothing.

The id `playlist_m3u` is a leftover from when the rotation was an m3u file. It is a wire name shared with `PlaylistFileWriter::LIQ_SOURCE` and `StationPowerController`'s skip; renaming it breaks skip on every running container until relaunch.

`request.dynamic` has no `.skip` telnet command (it has `.flush_and_skip`), so the script registers `playlist_m3u.skip` itself: `autodj.register_command("skip", fun (_) -> begin autodj.skip() ; "Done" end)`.

What the server answers is decided in Laravel (`AutoDjScheduler::next()`, see [AutoDJ](autodj.md) and [Schedule](schedule.md)). The plan gate (`canUseAutoDj`) is there: a Free station always gets 204, so its AutoDJ arm is permanently unavailable and its `source` is `live` or `silence`. `NextTrackController` returns 404 for an unknown slug, which the script treats as "any other status".

The URI is built by `PlaylistFileWriter::annotateUri()`: `annotate:` then, in order, `jingle="true"` (jingles only), the analyser's `liq_cue_in` / `liq_cue_out` / `liq_amplify="<n> dB"`, `duration="<3dp>"` (only when positive), `title`, `artist`, `playlist="<name>"`, then `:/data/playlists/<file>`. Empty artist and playlist are omitted. Backslash and double quote are escaped. The rotation entry is annotated with `playlist` (the name of the playlist it came from) which the script never reads, but which reaches `on_metadata`.

### Jingles (lines 536-685)

- `jingles = playlist(id="jingles_m3u", "/data/playlists/jingles.m3u", mode="randomize", reload_mode="never", on_fail=... [])`. It is the only m3u left in the graph. It is rendered for every station, including ones that never enable jingles. An empty file makes the `on_fail` handler log `jingles: no playable jingle` at level 2; how many lines and how often needs a live Liquidsoap to observe. Laravel reloads it over telnet (`jingles_m3u.reload`) when jingle files change.
- Four interactive variables, settable at runtime with `var.set` over telnet: `jingles_enabled` (bool), `jingle_by_tracks` (bool), `jingle_interval` (float, seconds), `jingle_every_tracks` (int). Initial values come from the station row at render time (`jinglesAudible()`, i.e. `jingles_enabled` AND owner `canUseAutoDj()`; `jingle_mode === 'tracks'`; `jingle_interval_seconds` floored at 60; `jingle_every_tracks` floored at 1). `LiquidsoapSupervisor::applyJingleSettings()` sends the four `var.set` commands live. Type matters: a float must contain a decimal point and an int must not, or Liquidsoap refuses the command.
- `tracks_since_jingle` counts tracks. `autodj.on_track` increments and `jingles.on_track` resets it to 0. Both are `synchronous=true`, the only synchronous callbacks in the script, because they do a single integer assignment and must be ordered with the boundary that triggered them.
- Two gates and one graph. `delay(initial=true, jingle_delay, jingles)` is the time gate; `jingle_delay()` is 0.0 in track mode and `jingle_interval()` in interval mode. `jingle_due()` is `jingles_enabled() and (not jingle_by_tracks() or tracks_since_jingle() >= jingle_every_tracks())`. `source.available(..., jingle_due)` applies the count gate and is deliberately not `track_sensitive` (that was a bug that latched a stale true).
- `initial=true`: a station never opens with a jingle; the delay counts from boot.
- `autodj_rotation = fallback(track_sensitive=true, [jingle_arm, autodj])`. Track-sensitive is what stops a jingle from cutting a song in half: the switch waits for the track boundary. Contrast the outer fallback, which is track-insensitive.
- Turning jingles off mid-jingle is expected to cut it short: the predicate is deliberately not track-sensitive (per the template's comments; the runtime behaviour itself needs a live Liquidsoap to confirm).

### Loudness (`amplify`) (lines 687-725)

If `apply_amplify` (default true): `autodj_leveled = amplify(1., autodj_rotation)`. The factor 1.0 is a no-op except for tracks carrying `liq_amplify`, which overrides it per track (the value has a `dB` suffix; without it Liquidsoap reads a linear multiplier). It sits above the crossfade so `cross()` compares levelled tracks, and it wraps both the rotation and jingles. If false, the operator is dropped and any `liq_amplify` annotation is inert (and `PlaylistFileWriter::analysisAnnotations()` stops writing it, but still writes `liq_cue_in`/`liq_cue_out`). This is one static gain per track, not a compressor.

### Crossfade (lines 727-865)

Only when `crossfade_enabled` is true, and **the config default is false** (`LIQUIDSOAP_CROSSFADE_ENABLED`). With it false, transitions are hard cuts (`autodj_faded = autodj_leveled`). When true:

`autodj_faded = cross(duration=autodj_cross_duration, autodj_cross, autodj_leveled)`, with the transition `autodj_cross(a, b)` choosing in order:

| Condition (dB values are the `db_level` of outgoing `a` and incoming `b`) | Transition |
|---|---|
| either has `jingle == "true"` metadata | `sequence([a, b])`, hard cut |
| both `<= medium` and `abs(a-b) <= margin` | fade out a, fade in b, summed |
| `b >= a + margin` and `a >= medium` and `b <= high` | fade out a under b |
| `a >= b + margin` and `b >= medium` and `a <= high` | fade in b under a |
| `b >= a + margin` and `a <= medium` and `b <= high` | overlap with no fade (a already near silence) |
| anything else (too loud or too far apart) | hard cut |

Fades are `sin` type via `fade.out` / `fade.in`. The sum is `add(normalize=false, [starting, ending])`, with the incoming track listed first so metadata reports the new track during the overlap (`add` relays the first source's metadata).

Numbers, all from config and rendered with one decimal: window `duration` 5.0 (`LIQUIDSOAP_CROSSFADE_DURATION`), fade 3.0 (`LIQUIDSOAP_CROSSFADE_FADE`), high -15 (`_HIGH_DB`), medium -32 (`_MEDIUM_DB`), margin 4 (`_MARGIN_DB`). The supervisor clamps the fade to `min(fade, max(duration - 0.5, 0.1))` so fades are always strictly shorter than the window. The Liquidsoap 2.4.0 wedge that made this unusable (savonet#4851, fixed in 2.4.3) is why the image is pinned to 2.4.5; the config still defaults it off because nobody has yet confirmed it healthy in production here.

### Limiter (lines 867-896 and 1059-1074)

`limit(threshold=<-1.0>, ...)`, threshold `LIQUIDSOAP_LIMITER_THRESHOLD_DB`. Placement depends on `limiter_include_live` (default true, `LIQUIDSOAP_LIMITER_INCLUDE_LIVE`):

- true: `autodj_mix = autodj_faded` and `broadcast_out = limit(..., broadcast_source)`, at the bottom of the graph, guarding live, AutoDJ and the watermark.
- false: `autodj_mix = limit(..., autodj_faded)` and `broadcast_out = broadcast_source`. Live audio then reaches the encoders unguarded.

`limit()` is static gain above a threshold, no track logic, so it is safe on the live path (unlike `cross`). The script does not run `normalize()` anywhere, on purpose.

### The fallback, silence bed and RMS meter (lines 898-931)

`bed = mksafe(blank())`. `mixed = mksafe(fallback(track_sensitive=false, [live, autodj_mix, bed]))`. `mksafe` is a type-checker promise; output operators refuse fallible sources.

`output_source = rms(duration=<2.0>, mixed)` (`LIQUIDSOAP_RMS_WINDOW_SECONDS`, default 2). `rms()` reports 0.0 until the first window completes and then refreshes once per window, so the window is also the update interval. It is inserted once as a permanent operator; `/status` only reads the float. It must never be applied per request.

### Listener metadata rewrite (lines 933-972)

`replay_jingle_metadata` is a `metadata.map(update=false, strip=true, ...)` that, for any metadata carrying `jingle == "true"`, substitutes the last non-jingle metadata (kept in a ref) so listeners' ICY/ID3 title never flips to a station ID. `output_source` (the truth) is not rewritten. `listener_source` feeds the watermark stage and the outputs.

### Free-tier watermark (lines 974-1057)

Rendered only when `watermark_enabled` is true (`LIQUIDSOAP_WATERMARK_ENABLED`, install-wide switch, default true); otherwise `broadcast_source = listener_source`. Details of clips and plan wiring are in [Watermark clips](watermark-clips.md).

- `watermark = playlist(id="watermark", "/data/system", mode="randomize", reload_mode="never", on_fail=...)`. A directory, not a file. An empty directory makes it unavailable, so the station plays unmarked. The container path is `LiquidsoapSupervisor::CONTAINER_SYSTEM_DIR` = `/data/system`, mounted read-only and shared by every station. `ReloadWatermarkClips` sends `watermark.reload` over telnet to each running station when clips change.
- Interactive variables: `watermark_enabled` (bool; initial value is `$station->user->watermarked()`, that is the install switch AND `plans.watermark_enabled`), `watermark_interval` (float, default 600s), `watermark_duck` (float, default 0.15). Pushed live by `LiquidsoapSupervisor::applyWatermarkSettings()` when the owner's plan changes. The fade duration is **not** interactive.
- `watermark_due() = watermark_enabled() and (live.is_ready() or autodj_mix.is_ready())`: it never fires over the silence bed.
- `watermark_arm = source.available(delay(initial=true, watermark_interval, watermark), watermark_due)`. Not track-sensitive. `initial=true` means the first watermark is one interval after boot.
- `broadcast_source = smooth_add(duration=<fade>, p=watermark_duck, normal=listener_source, special=watermark_arm)`. `p` is the portion of the station audio KEPT (0.15 leaves the host at 15%), not the amount removed. `duration` is `watermark_fade_seconds` (default 1.0).
- Supervisor floors and clamps: interval at least 60s, duck within [0.01, 1.0] (`watermarkInterval()`, `watermarkDuck()`).

### Harbor HTTP control surface (lines 1083-1210)

`harbor.http.register` on `harbor_port` (default 8080, `LIQUIDSOAP_HARBOR_PORT`). Not published to the host; reached over `gocast-network` at the container IP (see [Liquidsoap supervisor](liquidsoap-supervisor.md) for how the address is computed).

**`GET /status`** requires `X-Internal-Key` equal to the rendered key (either header spelling is checked); otherwise 403 with body `forbidden`. Response JSON:

| Field | Value |
|---|---|
| `slug` | station slug |
| `ready` | `output_source.is_ready()` |
| `icecast` | `ice_up()`: is the Icecast source connection currently up |
| `source` | `current_source()`: `"live"` if `live.is_ready()`, else `"autodj"` if `autodj_mix.is_ready()`, else `"silence"` |
| `broadcaster` | `broadcaster_attached()` = `live_connected()` |
| `rms` | `output_source.rms()` (0.0 to 1.0) |
| `title`, `artist` | from `output_source.last_metadata()`; empty string when absent |
| `elapsed` | `finite(output_source.elapsed())` |
| `remaining` | `finite(output_source.remaining())` |

`finite()` maps NaN and infinity to `-1.` because `response.json` raises on them and a raised handler closes the socket, which Laravel reads as "container unreachable". `remaining()` is infinite whenever the source has no end (the silence bed, a live stream). Laravel treats negative durations as null (`StationStatusService`). `playlist_length` and `up_next` are intentionally absent: calling `length()`/`remaining_files()` on the source `cross()` is driving is a second operator on it, every poll; Laravel serves those fields from the database. Laravel calls `/status` with `X-Internal-Key` and a 1.5s timeout (`liquidsoap.harbor_timeout`) and caches the answer 2s (`status_ttl_seconds`), 15s when Docker says the container is gone (`status_down_ttl_seconds`).

**`GET /healthz`** is unauthenticated on purpose. It returns 200 with `{ready, icecast, source}`, or 503 if `output_source.is_ready()` is false. The status code is the contract; Docker's healthcheck (`bash /dev/tcp`, since the image has no curl) greps the status line for ` 200 `. Icecast state is reported in the body but is NOT part of the verdict, so an Icecast outage does not mark the whole fleet unhealthy and get every container recreated.

### Now-playing push (lines 1212-1274)

`output_source.on_metadata(synchronous=false, push_now_playing)`. For every metadata event:

1. If `m["jingle"] == "true"`, do nothing (Laravel keeps the last payload).
2. If title and artist both equal the last pushed pair, do nothing. The refs start as `""`, so a first event with no title and no artist is also dropped.
3. Otherwise store them and POST `{slug, title, artist}` to `/api/internal/now-playing`, 5s timeout, `X-Internal-Key`. Missing keys read as `""`.

Laravel (`NowPlayingController`): validates slug `^[a-z0-9-]+$` (max 255), title and artist nullable strings max 500, trims them, treats blank as null. Both null means clear: `Redis::del("metadata:{id}")`. Otherwise `Redis::setex("metadata:{id}", 6h, json)`. It broadcasts `audio_started` / `audio_stopped` only when a station moves between having and not having any metadata, never on a plain track change.

### Outputs (lines 1276-1403)

**Icecast**: `output.icecast(%mp3(bitrate=128, samplerate=44100), host, port, password, mount, name, description, genre, encoding="UTF-8", broadcast_out)`.

| Argument | Source |
|---|---|
| host, port | `liquidsoap.icecast_host` (default `host.docker.internal`), `icecast_port` (8000) |
| password | `services.icecast.source_password`, NOT the station's `icecast_password` column |
| mount | `$station->icecast_mount` (defaults to `/stream/{slug}` in the model) |
| name, description, genre | `$station->name`, `description`, `genre` (empty string if null) |

`encoding="UTF-8"` so non-Latin titles are not turned into `*`. Callbacks (all `synchronous=false`): `on_connect` sets `ice_up := true` and posts `icecast_connected`; `on_disconnect` sets `ice_up := false` and posts `icecast_disconnected`; `on_error` sets `ice_up := false`, calls `restart_in(5.)` and posts `icecast_error`. `restart_in` is mandatory: without it the output gives up permanently. There is no other reconnect logic.

**HLS**: `output.file.hls("/data/hls", ...)`.

| Setting | Value |
|---|---|
| `segment_duration` | 4.0s |
| `segments` | 5 |
| `segments_overhead` | 5 |
| `persist_at` | `/data/hls/state.json` (written on graceful shutdown, read on boot, so a restart continues the media sequence) |
| `playlist` | `playlist.m3u8` (a master; listeners are given the media playlist directly) |
| rendition | one, labelled `{hls_variant}` (default `aac`), so the media playlist is `{hls_variant}.m3u8` |
| encoder | `%ffmpeg(format="adts", %audio(codec="aac", b="128k"))`, raw ADTS AAC, not mpegts or fMP4 |
| `segment_name` | `{stream_name}_{hls_boot}_{position}.{ext}`, where `hls_boot` = `string(int(time()))` at boot |

The per-boot token exists because segments are served `immutable`; the default name restarts at position 0 on every boot, so a cached `aac_522.aac` from a previous run was replayed as the new run's 522. Two boots cannot share a second. Listener URL is `{hls_base_url}/{slug}/{hls_variant}.m3u8`; the file layout and nginx caching are outside this doc. HLS resolution is served from `/var/gocast/hls/{slug}` mounted at `/data/hls`.

## What the supervisor injects

`LiquidsoapSupervisor::renderLiqFile()` calls `View::make('liquidsoap.station', [...])`, writes `{liq_dir}/{slug}.liq`, and is called from `up()` (which then starts or restarts the container). Every render is from scratch, so a stopped station picks changes up whenever it next starts. `up()` is the only renderer. Which station edits cause a re-render and restart is decided by `StationObserver` (`LIQ_RELEVANT_COLUMNS`: `name`, `slug`, `description`, `genre`, `icecast_mount`, `icecast_password`, `artwork_url`) and only while the station is running (or when the slug changed).

Every template variable and where it comes from:

| Variable | Source |
|---|---|
| `$station` | the `Station` model (`slug`, `name`, `description`, `genre`, `icecast_mount`) |
| `$icecastPassword` | `services.icecast.source_password` |
| `$internalApiKey` | `services.internal_api_key` (env `INTERNAL_API_KEY`); baked into the script and sent as `X-Internal-Key` |
| `$icecastHost`, `$icecastPort` | `liquidsoap.icecast_host`, `icecast_port` |
| `$apiUrl` | `liquidsoap.api_url`, trailing slash trimmed |
| `$nextTrackUrl` | `{api_url}/api/internal/next-track?slug={rawurlencode(slug)}` |
| `$harborPort` | `liquidsoap.harbor_port` |
| `$harborInputPort`, `$harborInputTimeout` | `liquidsoap.harbor_input_port`, `harbor_input_timeout` |
| `$hlsVariant` | `liquidsoap.hls_variant` |
| `$rmsWindow` | `liquidsoap.rms_window_seconds` |
| `$liqSource`, `$jinglesLiqSource`, `$jinglesFilename` | `PlaylistFileWriter::LIQ_SOURCE` (`playlist_m3u`), `JINGLES_LIQ_SOURCE` (`jingles_m3u`), `JINGLES_FILENAME` (`jingles.m3u`) |
| `$autodjRetryDelay` | `max(1.0, autodj_retry_delay_seconds)` |
| `$jinglesEnabled`, `$jingleByTracks`, `$jingleEveryTracks`, `$jingleInterval` | station row via `jinglesAudible()`, `jingle_mode`, `jingle_every_tracks` (min 1), `jingle_interval_seconds` (min 60) |
| `$jinglesEnabledVar`, `$jingleByTracksVar`, `$jingleIntervalVar`, `$jingleEveryTracksVar` | constants `VAR_JINGLES_ENABLED` etc. (`jingles_enabled`, `jingle_by_tracks`, `jingle_interval`, `jingle_every_tracks`) |
| `$watermarkSupported` | `liquidsoap.watermark_enabled` |
| `$watermarkEnabled` | `$station->user->watermarked()` (false if owner or plan is unresolved) |
| `$watermarkEnabledVar`, `$watermarkIntervalVar`, `$watermarkDuckVar` | `VAR_WATERMARK_*` constants |
| `$watermarkContainerDir` | `/data/system` |
| `$watermarkInterval`, `$watermarkDuck`, `$watermarkFade` | config, clamped as above |
| `$crossfadeEnabled`, `$crossfadeDuration`, `$crossfadeFade`, `$crossfadeHigh`, `$crossfadeMedium`, `$crossfadeMargin` | `liquidsoap.crossfade_*` (fade clamped) |
| `$limiterThreshold`, `$limiterIncludeLive` | `liquidsoap.limiter_threshold_db`, `limiter_include_live` |
| `$liveBroadcastText`, `$metadataCharset` | `liquidsoap.live_broadcast_text`, `metadata_charset` |
| `$gcSpaceOverhead` | `max(0, gc_space_overhead)` |
| `$applyAmplify` | `liquidsoap.apply_amplify` |

Escaping: every string emitted into Liquidsoap source goes through `{!! json_encode(...) !!}`, never `{{ }}` (HTML escaping would corrupt `&`). Booleans are written as bare `true`/`false` and floats through `number_format(..., '.', '')` so Liquidsoap sees a float, not an int. The slug appears raw in the header comment and inside `json_encode` elsewhere. The slug comes from `Str::slug()`.

Container-side facts the script depends on (set in `LiquidsoapSupervisor::mountFlags()` and `baseRunCommand()`): mounts `{liq_dir}/{slug}.liq` at `/station.liq:ro`, `{playlists_dir}/{slug}` at `/data/playlists:ro`, `{hls_dir}/{slug}` at `/data/hls` (rw), `{system_dir}` at `/data/system:ro`; `--add-host host.docker.internal:host-gateway`; `--stop-timeout` (default 5s, clamped to at most 7s) so SIGTERM lets HLS write `state.json` and Icecast close cleanly; memory 512m (`--memory-swap` equal), cpus 0.5, pids 256, all capabilities dropped, `--restart unless-stopped`, log rotation 10m x 3.

## Every call the script makes to Laravel

All go to `{api_url}` (default `http://host.docker.internal:8081`, the internal-only nginx vhost) and carry `X-Internal-Key`. The `internal` middleware (`VerifyInternalKey`) does a `hash_equals` on it: 401 `{"message":"Unauthorized."}` on mismatch, and it throws (500) if `INTERNAL_API_KEY` is unset. All are inside the `internal` middleware group in `api/routes/api.php`, which also applies `throttle:internal` (300 requests per minute per IP, `AppServiceProvider`) to everything except `/api/internal/metrics`, which is exempted with `withoutMiddleware`. All calls from all stations share one source IP bucket when they come through the same bridge address, so a large fleet can in principle throttle itself (unverified at scale).

| When | Method and path | Payload | Timeout | Meaning of response |
|---|---|---|---|---|
| Container start | POST `/api/internal/station-event` | `{slug, event:"boot"}` | 5s | ignored |
| Container stop | same | `event:"shutdown"` | 5s | ignored |
| Broadcaster connects | same | `{slug, event:"live_connected", client, via}` | 5s | ignored; Laravel opens a `StreamSession` |
| Broadcaster disconnects | same | `{slug, event:"live_disconnected"}` | 5s | ignored; Laravel closes sessions and deletes `metadata:{id}` |
| Icecast connect / drop / error | same | `event: icecast_connected \| icecast_disconnected \| icecast_error` | 5s | ignored |
| Each broadcaster connection attempt | POST `/api/internal/harbor-auth` | `{slug, user, password, address}` | 5s | 200 accept, anything else refuse, exception refuse |
| Every track boundary (and every retry) | GET `/api/internal/next-track?slug=` | none | 5s | see AutoDJ table above |
| Metadata change | POST `/api/internal/now-playing` | `{slug, title, artist}` | 5s | ignored |

The `/api/internal/metrics` route (`MetricsController`, Prometheus format, same key) exists in Laravel but the station script never calls it and the script has no Prometheus exporter.

`StationEventController` details that matter to the script: `event` must be one of `StationEvent::CONTAINER_TYPES` (`boot`, `shutdown`, `icecast_connected`, `icecast_disconnected`, `icecast_error`, `live_connected`, `live_disconnected`); anything else is 422. Unknown slug is 404. `slug` max 64, `event` max 32, `client` max 255 nullable, `via` nullable in (`browser`, `external`), an absent `via` defaults to `browser`. `client` is trimmed and an empty string becomes null. Effects: cache `station-event:{id}` for 3600s, a `StationEvent` row, `last_ready_at` on `icecast_connected`, a `StreamSession` opened on `live_connected` (idempotent: an open session is left alone; a `SendStationLiveNotifications` job is dispatched delayed 2 minutes) and closed on `live_disconnected`. A queued `StationStateChanged` broadcast goes out for `shutdown`, the three Icecast events, and both live events (not `boot`). The old `live_silent` / `live_audio` events (from the removed dead-air guard) now get 422 from a container that was rendered before the removal.

`HarborAuthController` details: validation `slug` required max 255, `password` nullable max 2048, `user` nullable max 255, `address` nullable max 255. Empty password refused. Station looked up first (deleted station refuses even a valid token). A valid broadcast token (MAC, expiry, station binding; `BroadcastTokenService::verify`) is accepted for any plan. Otherwise the station's `stream_key` is compared with `hash_equals` and requires the owner's `canUseEncoder()`. Refusals answer 403 with the reason as the body. Harbor authenticates once when the socket opens, so a plan downgrade does not cut a running broadcast. The `address` in an encoder refusal is the station-router's address, not the broadcaster's (routed TCP without PROXY protocol).

## Control channels the other way (Laravel to the container)

| Channel | Used by | Commands |
|---|---|---|
| Telnet `:1234`, plain TCP, 3s connect and read timeout, newlines stripped (`LiquidsoapSupervisor::telnet()`) | `StationPowerController::skip` sends `playlist_m3u.skip` (409 `station_not_running` if the station is off, 503 `station_unreachable` if telnet fails). `PlaylistFileWriter::reload()` sends `jingles_m3u.reload`, but only when the station's `jingles_enabled` column is true. `ReloadWatermarkClips` sends `watermark.reload` to every running station. `applyJingleSettings` (from `StationObserver` on jingle column changes to a running station, and `UserObserver` on plan change) and `applyWatermarkSettings` (`UserObserver`, plan change) send `var.set <name> = <value>`. | see left |
| Harbor HTTP `:8080` | `StationStatusService` polls `/status`. Docker healthcheck polls `/healthz`. | see above |

Telnet is a no-op returning `''` when running unit tests (`LiquidsoapSupervisor::inTestMode()`, which is `app()->runningUnitTests()`).

## Timings at a glance

| What | Value | Where |
|---|---|---|
| Harbor pre-buffer | 5s (literal) | template |
| Live `buffer()` | 2s, max 10s (literal) | template |
| Harbor stalled-source timeout | 10s | `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` |
| All HTTP calls from the script | 5s | template |
| Empty-rotation re-ask | 10s (floor 1s) | `LIQUIDSOAP_AUTODJ_RETRY_DELAY` |
| Jingle interval | station value, min 60s | station row |
| Watermark interval | 600s default, min 60s | `LIQUIDSOAP_WATERMARK_INTERVAL` |
| Watermark fade | 1.0s | `LIQUIDSOAP_WATERMARK_FADE` |
| Crossfade window / fade | 5s / 3s (only if enabled) | `LIQUIDSOAP_CROSSFADE_*` |
| RMS window | 2s | `LIQUIDSOAP_RMS_WINDOW_SECONDS` |
| Icecast reconnect | 5s after an error | literal `restart_in(5.)` |
| HLS segment | 4s, 5 segments plus 5 overhead | literal |
| Track-to-jingle switch | at the next track boundary | `track_sensitive=true` |
| Live to AutoDJ switch | after harbor's `timeout` for a stall, or immediately on clean close, plus buffer drain of the live arm (5s harbor buffer plus 2s `buffer()`) | not measured; derived from the constants |
| Live in | on connect, after the buffers fill | not measured |
| Container start check | 750ms | `LIQUIDSOAP_START_VERIFY_DELAY_MS` |

## Environment and config knobs

All in `api/config/liquidsoap.php`; the script reads them only at render time, so a change needs a re-render plus a container relaunch (`stations:relaunch`) except where noted as live.

| Env var | Default | Effect on the script |
|---|---|---|
| `LIQUIDSOAP_LIQ_DIR`, `_PLAYLISTS_DIR`, `_HLS_DIR`, `_SYSTEM_DIR` | `/var/gocast/{liq,playlists,hls,system}` | host paths of the bind mounts |
| `LIQUIDSOAP_HLS_VARIANT` | `aac` | encoder label and media playlist filename; renaming breaks existing player URLs |
| `LIQUIDSOAP_HLS_BASE_URL` | empty | not in the script; empty makes the API report no HLS URL |
| `LIQUIDSOAP_ICECAST_HOST`, `_PORT` | `host.docker.internal`, 8000 | Icecast target as seen from the container |
| `LIQUIDSOAP_API_URL` | `http://host.docker.internal:8081` | base for every callback |
| `LIQUIDSOAP_HARBOR_INPUT_PORT` | 8090 | ingest port inside the container |
| `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` | 10.0 | harbor `timeout` |
| `LIQUIDSOAP_HARBOR_PORT` | 8080 | `/status` and `/healthz` port |
| `LIQUIDSOAP_HARBOR_TIMEOUT` | 1.5 | not in the script; Laravel's status call timeout |
| `LIQUIDSOAP_RMS_WINDOW_SECONDS` | 2 | `rms(duration=)` |
| `LIQUIDSOAP_CROSSFADE_ENABLED` | **false** | include `cross()` |
| `LIQUIDSOAP_CROSSFADE_DURATION`, `_FADE`, `_HIGH_DB`, `_MEDIUM_DB`, `_MARGIN_DB` | 5, 3, -15, -32, 4 | transition thresholds |
| `LIQUIDSOAP_LIMITER_THRESHOLD_DB` | -1.0 | limiter ceiling |
| `LIQUIDSOAP_LIMITER_INCLUDE_LIVE` | true | limiter placement |
| `LIQUIDSOAP_LIVE_BROADCAST_TEXT` | `Live Broadcast` | placeholder title |
| `LIQUIDSOAP_METADATA_CHARSET` | `UTF-8` | harbor charsets |
| `LIQUIDSOAP_APPLY_AMPLIFY` | true | include `amplify()`; also stops `liq_amplify` being written |
| `LIQUIDSOAP_GC_SPACE_OVERHEAD` | 80 | GC block; 0 omits it |
| `LIQUIDSOAP_WATERMARK_ENABLED` | true | install-wide watermark machinery |
| `LIQUIDSOAP_WATERMARK_INTERVAL`, `_DUCK`, `_FADE` | 600, 0.15, 1.0 | watermark levels (interval and duck also pushed live) |
| `LIQUIDSOAP_AUTODJ_RETRY_DELAY` | 10.0 | `retry_delay` |
| `LIQUIDSOAP_IMAGE` | `gocast/liquidsoap:latest` | image the containers run |
| `LIQUIDSOAP_CONTAINER_CPUS`, `_MEMORY`, `_PIDS_LIMIT`, `_INIT` | 0.5, 512m, 256, false | `docker run` caps; memory below 448m SIGKILLs at boot |
| `LIQUIDSOAP_HEALTHCHECK`, `_HEALTH_INTERVAL`, `_HEALTH_TIMEOUT`, `_HEALTH_RETRIES`, `_HEALTH_START_PERIOD` | true, 15, 3, 3, 45 | Docker healthcheck on `/healthz` |
| `LIQUIDSOAP_STOP_TIMEOUT` | 5 | graceful stop window |
| `INTERNAL_API_KEY` (`services.internal_api_key`) | none | rendered into every script and checked on every callback |
| `ICECAST_SOURCE_PASSWORD` (`services.icecast.source_password`) | none | Icecast source password rendered into the script |

Knobs that exist in the config file but are NOT read by the script (they belong to the supervisor, sweep or analyser): `analysis_*`, `loudness_*`, `silence_*`, `cue_min_playable_seconds` (analyser), `silent_stop_seconds`, `studio_gone_stop_seconds`, `silence_rms_threshold` (sweep), `station_storage_bytes`, `deleted_station_retention_days`, `ingest_url`, `encoder_host`, `encoder_port`, `telnet_resolve`, `container_subnet`, `status_*`, `start_verify_delay_ms`, `unhealthy_*`, `stranded_session_strikes`.

## The image and the other files in `infra/liquidsoap/`

- **`Dockerfile`**: `FROM savonet/liquidsoap:v2.4.5`, installs `ffmpeg` as root, drops back to user `liquidsoap`, copies `standby.liq`, `ENTRYPOINT ["liquidsoap"]`, `CMD ["/standby.liq"]`. Stations override the command with `/station.liq`. Built by `infra/native/setup-native.sh` as `gocast/liquidsoap:latest`. Its comments still mention `input.ffmpeg` RTSP pulls from MediaMTX; that path no longer exists in the script.
- **`standby.liq`**: 12 lines, sets log level 3 and `output.dummy(blank())`. It only runs when the image is started with no script (a deploy sanity check). It plays no part in any station. Its header comment names a template file (`station.liq.blade.php`) that does not exist.
- **`reference-station.liq`**: 80 lines. **Not used by anything**: no code or script references it, and the only mentions are in docs. It is an older or alternative design kept as a reference. It pulls live from MediaMTX over RTSP (`input.ffmpeg`), has the `blank.strip` dead-air guard and `live_silent`/`live_audio` events, a separate `enc` harbor input with a `password=`, `playlist_m3u` as a real file playlist with `normalize_track_gain`, `crossfade(duration=2.)`, a `POST /control` endpoint that runs `server.execute`, an hourly-rotating MP3 archive, HLS as mpegts with 2s segments, `settings.crossfade.assume_autocue`, and a Prometheus server on 9599 with `prometheus.latency`. None of that is in the live script. Do not treat it as documentation of the running graph.
- **`README.md`**: describes a "standby container" that feeds an Icecast `/standby.mp3` fallback mount. That architecture does not exist any more; treat as stale.

## Surfaces

The script has no UI. Its outputs surface as: the Icecast mount and HLS URL listeners use ([Public player and embed](public-player-and-embed.md)); the `broadcaster`, `source`, `rms` and `icecast` fields that feed the dashboard's station state and the sweep ([Station lifecycle](station-lifecycle.md)); `station_events` rows and the admin timeline ([Observability and events](observability-and-events.md)); and the `docker logs` of `gocast-liquidsoap-{slug}` for the `log.severe` lines listed above.

## Gaps and traps

1. **`source` is not `broadcaster`.** `source` reads `live.is_ready()` which stays true while the live arm drains (and is false until it fills), so it lags connects and disconnects. The dashboard and sweep must use `broadcaster`. (`current_source()` vs `broadcaster_attached()` in the template.)
2. **A live broadcast has no fade in or out.** Hard cuts both ways, and the 5s harbor buffer plus 2s `buffer()` keep the live arm "ready" for several seconds after the DJ leaves, so AutoDJ does not resume instantly on a clean disconnect. The 5s and 2s values are literals, not config.
3. **Crossfade is off by default in config** even though every comment in the template talks as if it were on. Production stations do hard cuts unless `LIQUIDSOAP_CROSSFADE_ENABLED=true`. The `cross()` block, its 5s/3s numbers and the loudness thresholds are inert until then.
4. **Cue points are annotated but not applied in the script.** `PlaylistFileWriter` writes `liq_cue_in` and `liq_cue_out`, and its docblock says Liquidsoap's request layer reads them (`settings.playlist.cue_in_metadata`). The template sets no cue setting and does not call `enable_autocue_metadata`. Whether cue trimming actually happens on 2.4.5 with this graph cannot be read from code; it needs a running container.
5. **Stale docblock claims contradict the code.** `PlaylistFileWriter` says the jingle source "only exists in the rendered script while the station has jingles enabled" and its `reload()` is gated on that; the template renders `jingles` for every station always. Consequence: files added while jingles are off are not reloaded (the `reload()` call is skipped), so the running container's list may be empty or stale after the owner switches jingles on until a restart or a later reload. `applyJingleSettings` only sends `var.set`, not a reload. Whether Liquidsoap re-reads an m3u that was empty at boot needs a live container to answer; treat it as a risk.
6. **`healthFlags()` docblock in the supervisor says `/healthz` answers 200 only when the graph is producing frames AND Icecast is up. The template does the opposite** (Icecast is reported but excluded from the 200/503 verdict). The template is right and is the intent.
7. **Stale variable documentation.** The template header lists `$rtspHost` and `$rtspPort` (from the removed MediaMTX pull). The supervisor does not pass them and the template does not use them.
8. **`icecast_password` and `artwork_url` restart a running station for no reason.** They are in `StationObserver::LIQ_RELEVANT_COLUMNS` but the script uses neither (the Icecast password is the global `services.icecast.source_password`, and no artwork is rendered).
9. **Harbor input mount is the slug, Icecast output mount is `/stream/{slug}`.** They are different things; the ingest URL a broadcaster uses ends in the slug, and listeners use the `icecast_mount`. A custom `icecast_mount` does not change ingest.
10. **Telnet is unauthenticated** and bound on `0.0.0.0` in the container. Protection is network isolation only. Skip, jingle and watermark control all rely on it. Jingle/watermark pushes and clip/jingle reloads are best effort (failure logged at info, never surfaced); skip answers 503 to the user.
11. **Interactive variables are not persisted.** After a container restart they reset to the rendered initial values, which come from the row and plan at render time. This is by design, but an admin editing the config for watermark interval must relaunch, or wait for the next plan-change push, because only a plan change (`UserObserver`) calls `applyWatermarkSettings`.
12. **Watermark clip reload is skipped when the install switch is off**, since the `watermark` source does not exist. Any telnet call to it would answer "unknown command".
13. **Old `live_silent` / `live_audio` events**: containers rendered before the dead-air guard was removed keep posting them and get 422 until recreated. Harmless noise.
14. **The `internal` throttle (300/min per IP) is shared** across all stations if they arrive from the same address. Each station makes one `next-track` call per track plus its retry (every 10s while empty), plus now-playing and events. Not measurable from code; watch for 429s in station logs (`autodj: next-track answered HTTP 429`).
15. **The rendered script contains the internal API key and Icecast source password in plain text** on disk in `{liq_dir}` and visible to anything that can read the bind mount or run `docker inspect`-adjacent reads of `/station.liq`. This is inherent to the design.
16. **`reference-station.liq`, `standby.liq`'s comment, `README.md` and the Dockerfile comments describe designs that are gone** (RTSP/MediaMTX pull, standby mount, file playlists, dead-air guard, Prometheus). Only the Dockerfile's `FROM` and `ffmpeg` install and the pinned version matter for the running system.
17. **No Prometheus or telemetry from the container.** The only telemetry is the `/status` poll and the event posts. Nothing scrapes Liquidsoap directly.
18. **Old HLS segments from previous boots** are named with the previous `hls_boot` token. Whether Liquidsoap's `segments_overhead` cleanup removes them across a restart (with `persist_at`) cannot be determined from code (needs a live Liquidsoap).

## Tests

`api/tests/Feature/LiquidsoapTemplateTest.php` renders the template and asserts on the text (names read, not each body verified for this doc): live passthrough with no dead-air guard, `broadcaster` from the connection alone, HLS `persist_at` and per-boot segment names, escaping of secrets, harbor auth fail-closed, connect/disconnect and `via` reporting with no header leakage, 5s harbor buffer, crossfade and limiter placement in both modes, jingle gates and interactive variables, watermark presence and absence, `request.dynamic` with the skip command and retry delay, jingle-metadata replay, in-band metadata and the live placeholder, `/healthz` status codes, finite `/status` numbers. Related: `HarborAuthTest.php`, `NextTrackControllerTest.php`, `StationEventControllerTest.php`, `NowPlayingControllerTest.php`, `PlaylistFileWriterTest.php`, `LiquidsoapSupervisorTest.php` (all under `api/tests/Feature`). These test the text of the script and the controllers, never Liquidsoap itself. Nothing in the suite runs the rendered script through a Liquidsoap parser, so a syntax error only shows up when a container dies at boot.

## History

- Rotation as `request.dynamic` instead of `playlist()`: `docs/AUTODJ-SCHEDULING-HANDOFF.md` and the comments in the template explain why (reload restarts the list at 0).
- Harbor replacing the MediaMTX RTSP pull, the dead-air guard removal, the 12s to 5s harbor buffer, per-boot HLS segment names, ADTS HLS, and the limiter move are all explained in inline comments in `station.blade.php`, which are the closest thing to a change log and are not otherwise verified.
- `station-hardening-plan.md` at the repo root holds the older P0 list for container teardown and metrics.
