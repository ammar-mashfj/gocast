---
feature: AutoDJ (playback, rotation order, handover)
verified: 2026-10-05 against c970b2d plus uncommitted work (feat/design-system)
sources:
  - api/app/Services/AutoDjScheduler.php
  - api/app/Services/AutoDjProgramme.php
  - api/app/Services/JingleRotation.php
  - api/app/Models/JingleList.php
  - api/app/Services/PlaylistFileWriter.php
  - api/app/Services/PlaylistTracks.php
  - api/app/Services/TrackAnalysis.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Services/StationStatusService.php
  - api/app/Http/Controllers/NextTrackController.php
  - api/app/Http/Controllers/NowPlayingController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/PlaylistController.php
  - api/app/Http/Controllers/PlaylistTrackController.php
  - api/app/Http/Controllers/ListenerCountController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Requests/UpdatePlaylistRequest.php
  - api/app/Http/Requests/StorePlaylistRequest.php
  - api/app/Http/Resources/PlaylistResource.php
  - api/app/Models/Playlist.php
  - api/app/Models/Track.php
  - api/app/Models/AutodjSlot.php
  - api/app/Models/Station.php
  - api/app/Models/User.php
  - api/app/Policies/PlaylistPolicy.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Services/TrackImporter.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Controllers/TrackController.php
  - api/app/Http/Resources/StationResource.php
  - api/routes/api.php
  - api/config/liquidsoap.php
  - api/resources/views/liquidsoap/station.blade.php
  - api/database/migrations/2026_09_20_134240_create_playlists_table.php
  - api/database/migrations/2026_09_20_134241_create_playlist_track_table.php
  - api/database/migrations/2026_09_20_134242_backfill_default_playlists.php
  - api/database/migrations/2026_09_20_141103_add_autodj_last_playlist_id_to_stations_table.php
  - api/database/migrations/2026_10_05_120000_add_duration_measured_at_to_tracks_table.php
  - api/database/migrations/2026_10_05_130000_add_start_mode_to_autodj_slots_table.php
  - api/database/migrations/2026_10_05_130100_add_autodj_clock_to_stations_table.php
  - api/database/migrations/2026_10_05_130200_create_jingle_lists_table.php
  - client/hooks/useStationStatus.ts
  - client/hooks/useTrackProgress.ts
  - client/interfaces/StationStatus.ts
  - client/lib/programme.ts
  - client/app/station/[slug]/PlayerView.tsx
  - client/components/studio/EndBroadcast.tsx
  - mobile/src/components/studio/Sheets.tsx
  - client/app/dashboard/stations/[slug]/(overview)/page.tsx
  - api/tests/Feature/NextTrackControllerTest.php
  - api/tests/Feature/AutoDjShuffleTest.php
  - api/tests/Feature/AutoDjHardStartTest.php
  - api/tests/Feature/JingleRulesTest.php
  - client/components/dashboard/overview/OverviewHero.tsx
  - client/components/dashboard/overview/NowPlayingWell.tsx
  - client/lib/stationHero.ts
  - client/lib/airState.ts
  - client/components/dashboard/overview/ComingUpCard.tsx
  - client/lib/comingUp.ts
  - client/components/dashboard/overview/SetupChecklist.tsx
  - client/hooks/useStationStatusPoll.ts
fingerprint: b4fc432942c7057d
---

# AutoDJ

AutoDJ is the music that plays on a station when nobody is broadcasting. It is not a separate switch: there is no "AutoDJ on/off" in the API or the database. A running station always has an AutoDJ arm, and "Start AutoDJ" on the overview is the same `POST /stations/{slug}/start` as any other start. What decides whether that arm makes sound is a question the Liquidsoap container asks Laravel at every track boundary (`GET /internal/next-track`). Laravel answers with one track, or with 204 (nothing to play).

The one thing people get wrong: **the plan is enforced only inside that answer.** The rendered `.liq` is identical for every plan and a plan change never restarts a container, so a downgraded station keeps a healthy container that is simply told "nothing to play". It is not an error, it is not logged, and the station reads as running.

The schedule half (which playlist a slot picks) is documented in [Schedule](schedule.md). This file covers what happens once the playlist is chosen, and how AutoDJ meets live broadcasts. Library and playlist editing are in [Library and playlists](library-and-playlists.md); the station script is in [Liquidsoap station script](liquidsoap-station-script.md); start/stop and the sweeper are in [Station lifecycle](station-lifecycle.md).

## What it actually does

### The audio path

In `station.blade.php` the graph is:

1. `autodj = request.dynamic(id = "playlist_m3u", retry_delay = ..., autodj_next)`. `autodj_next()` does `http.get` on `nextTrackUrl` with `X-Internal-Key`, a 5 s timeout, `Accept: text/plain`, and two clock headers: `X-Gocast-Script` (the rendered `$scriptVersion`, `AutoDjScheduler::PLANNING_SCRIPT` = 2) and `X-Gocast-Fresh` (`"1"` on the first ask after the container booted, tracked by the `autodj_fresh` ref, `"0"` after).
   - 200 with a non-blank body: `request.create(body)` and that track plays (a blank body is treated as `null`).
   - 204: returns `null`, silently ("nothing to play" is normal for a live-only station).
   - Any other status, or an exception: `log.severe(...)` "rotation stalled" and `null`.
   - After a `null`, Liquidsoap waits `retry_delay` and asks again. Rendered from `config('liquidsoap.autodj_retry_delay_seconds')` (env `LIQUIDSOAP_AUTODJ_RETRY_DELAY`, default 10.0), floored at 1.0 by `LiquidsoapSupervisor` when rendering. So every running station with no rotation calls the API every 10 s for as long as it runs.
2. `autodj_rotation = fade.out(track_sensitive=true, duration=0.1, autodj)`. There is no jingle source in the script any more: jingles arrive through the same `next-track` answer as songs, annotated `jingle="true"`. The `fade.out` exists for hard starts: a song trimmed to end on a boundary carries `liq_fade_out` (seconds), which `fade.out` reads per track; every other track end gets the inaudible 0.1 s default.
3. `amplify(1., autodj_rotation)` when `applyAmplify` is on (`LIQUIDSOAP_APPLY_AMPLIFY`, default true). It acts on the per-track `liq_amplify` annotation and wraps jingles too.
4. `cross(...)` (crossfade) only when `crossfade_enabled` (`LIQUIDSOAP_CROSSFADE_ENABLED`, default **false**). Off means hard cuts. Duration 5, fade 3, high -15 dB, medium -32 dB, margin 4 dB are the defaults in `config/liquidsoap.php`. A jingle is never crossfaded.
5. `limit(...)` on the AutoDJ arm only when `limiter_include_live` is false. By default (true) the limiter sits at the bottom of the graph instead, over live too.
6. `mixed = mksafe(fallback(track_sensitive=false, [live, autodj_mix, bed]))`. Priority: live, then AutoDJ, then `blank()`.

The `autodj.register_command("skip", ...)` block that used to add a `playlist_m3u.skip` telnet command is commented out in the template (dated 2026-10-05), along with the skip route (see Skip). The source id `playlist_m3u` (`PlaylistFileWriter::LIQ_SOURCE`) is a leftover name from when the rotation was a playlist file; it is kept because it is a wire name in every rendered script.

### What Laravel answers (`AutoDjScheduler::next`)

`next(Station $station, bool $fresh = false, int $script = 1)`. `NextTrackController` passes `fresh` = (`X-Gocast-Fresh` header is `'1'`) and `script` = `(int)` `X-Gocast-Script` (default 1, i.e. a container rendered before the header existed). `$planning = $script >= PLANNING_SCRIPT` (2): only a planning script gets jingles and hard starts. An older container plays its own stale `jingles.m3u` and gets music only, never trimmed (a trim without the script's `fade.out` would be an abrupt cut). In order:

1. **Plan gate.** `$station->user?->canUseAutoDj()` (`User::canUseAutoDj`: `plan.autodj_enabled`, no plan row means false). If false, clear the clock and return null. This happens *before* anything moves, on purpose: the container keeps polling every retry delay while unentitled, and moving the cursor or dealing a deck on each poll would destroy the running order the owner gets back on re-subscribing. Because jingles are served from here too, the same gate takes jingles off air. Tested in `NextTrackControllerTest` ("does not move the cursor while it is refusing", "does not deal a new shuffle deck...", "picks the rotation back up unchanged") and `JingleRulesTest` ("plays no jingles for an owner without AutoDJ").
2. **The clock.** Liquidsoap asks for track N+1 the moment track N starts, and N is always the last thing handed out. So the answer starts at `start = now + stations.autodj_queued_seconds` (the airtime of the last track served), or at `now` when `$fresh` or when the column is null (the last answer was null, or nothing has been served). It re-anchors on `now` at every ask, so an error (a live show, a slow file) never carries forward. `$afterJingle` = the last thing served was a jingle (`autodj_queued_is_jingle`) and this is not a fresh ask.
3. **Early start** (planning only). If a hard boundary (see below) falls within `earlyStart()` seconds after `start` (`liquidsoap.hard_start_early_seconds`, env `LIQUIDSOAP_HARD_START_EARLY_SECONDS`, default 20), the plan time `planAt` becomes that boundary: the slot or jingle starts a little early rather than after a fragment of a song. Otherwise `planAt = start`.
4. **Resolve the playlist** with `AutoDjProgramme::resolve($station, $planAt)` (slot playlist, or the default playlist; empty slot playlist falls through to default). Resolving at the planned start time, not at request time, is what makes a slot begin with the first track that *starts* inside it rather than one song late. Null playlist: clear the clock, return null. See [Schedule](schedule.md).
5. **`noteSwitch`**: if `stations.autodj_last_playlist_id` differs from this playlist, write the new id with `DB::table` (so no observer or `updated_at` fires) and record a `playlist_changed` `StationEvent` (source system; properties `from_playlist_id`, `to_playlist_id`, `playlist`, `slot_id`, `slot`). The column has no foreign key (`char(26)`); a deleted playlist leaves a dangling id, which only means the next boundary logs a change. Monitoring only.
6. **Peek** the next track without consuming it: `peekShuffled` for `shuffle`, otherwise `peekSequential`. No track: clear the clock, return null.
7. **Jingle due?** (planning, and not `$afterJingle`) `JingleRotation::due($station, $planAt)`; if a list is due and has a clip, serve that jingle instead (the peeked song stays where it is). Asked only after a music track is known to exist, so a library of nothing but jingles stays silent (otherwise a clip on the meter every few minutes would keep the sweeper scoring the station as in use). See "Jingles" below.
8. **Hard boundary inside the song?** (planning, and the song has a known airtime) `boundaryBetween($planAt, start + airtime − FIT_TOLERANCE)`, where `FIT_TOLERANCE` = 0.5 s. If there is one, `gap` = seconds from `start` to it, and the ladder is:
   - **A song that ends in time** (shuffle only): `fitFromDeck($playlist, $gap)` takes the first card on the current deck that is measured (`duration_measured_at` not null) and whose `airtimeSeconds()` ≤ gap + 0.5. The skipped cards stay on the deck. Sequential playlists are never fit-picked: an owner-set order is kept.
   - **A jingle filler** (only before a hard *slot*, not before an exact-time jingle, and not right after a jingle): `JingleRotation::filler($station, $start, $gap, earlyStart())`, the longest measured clip from any enabled list open at `start` that fits in the gap and leaves less than 20 s over. Served as a jingle.
   - **Otherwise trim**: serve the peeked song with `playFor = gap`, which `annotateTrack` turns into `liq_cue_out = cue_in + gap` plus `liq_fade_out = fadeOut()` (`liquidsoap.hard_start_fade_seconds`, env `LIQUIDSOAP_HARD_START_FADE_SECONDS`, default 2, floor 0.1). The song fades out ending on the boundary.
9. **Consume**: `consumeShuffled($playlist, $track, $dead)` or `consumeSequential($playlist, $track)`. On a planning script `JingleRotation::songPlayed($station)` then increments `songs_since` on every list of the station.
10. **Write the clock** (`setClock`: `autodj_queued_starts_at` = start, `autodj_queued_seconds` = airtime (or the trimmed gap), `autodj_queued_is_jingle` = false, via `DB::table`) and return `PlaylistFileWriter::annotateTrack($track, playlist: $playlist->name, playFor:, fadeOut:)`.

**Airtime.** `Track::airtimeSeconds()` is cue-in to cue-out (by the same `TrackAnalysis::cuePoints` rule the annotation uses), null until `duration_measured_at` is set. The scheduler's private `airtime()` falls back to the header's `duration_seconds` when unmeasured, so an unmeasured song can still *trigger* a boundary and be trimmed, but only measured tracks are ever picked to fit (songs or jingle fillers). With no figure at all the clock stores null and the next answer starts at `now`. Lengths are measured by analysis; see [Library and playlists](library-and-playlists.md) for `decodedSeconds` and `tracks:measure-durations`.

**Hard boundaries** (`boundaryBetween`, strictly after `$after` and at or before `$until`, earliest wins): the start of a slot with `start_mode = hard` (`AutoDjProgramme::hardStartsBetween`, which ignores slots whose playlist has no tracks and returns nothing for a station with no timezone), and the set times of enabled lists with `frequency = times` and `exact = true` that have at least one clip (`JingleList::setTimesBetween`). A jingle and a slot on the same instant count as the jingle.

### Jingles (`JingleRotation`)

Jingles are `tracks` rows with `kind = jingle` and a `jingle_list_id`; each `jingle_lists` row carries one rule ("Play a [pick] jingle from [list] [how often], [when]"). All decided in Laravel at each boundary; the station script only plays what it is handed. Editing the lists is in [Library and playlists](library-and-playlists.md).

- **Due** (`JingleList::isDueAt($at, $tz)`, at the break's planned start, never request time): the list must be `enabled`. `frequency = songs`: `songs_since >= every_songs`. `minutes`: never played, or `last_played_at + every_minutes` reached. Both also need `isOpenAt` (the `days` the window *starts* on, 0 = Sunday, null = every day; `from_time`/`to_time` null = all day, `to <= from` runs past midnight). `times`: `dueSetTime` finds the latest set time within the last `SET_TIME_GRACE_SECONDS` (1800) plus one second of slack that is on an open day/window and later than `last_played_at`. So "08:00" plays at the first break after 08:00, but not at 09:40 if the station was off or live at 08:00.
- **One jingle per break**: `due()` sorts the due lists by exact set-time, then set-time, then everything else; then by `last_played_at` (never played first, then longest waiting); then `position`. The first whose pick yields a clip wins; the rest wait for the next break. Never two jingles in a row (`$afterJingle`).
- **Pick**: `random` keeps a shuffle deck in `jingle_lists.deck` (every clip once before any twice; a fresh deal avoids repeating the clip just played), `in_order` walks `tracks.position` from `cursor_position` and wraps, `single` plays `pinned_track_id` (or the first clip if the pin is gone).
- **`played()`** stamps `last_played_at` (= the planned break time, `planAt`), resets `songs_since`, and moves the cursor/deck, all through `DB::table`. A jingle is served with `annotateTrack($track, isJingle: true, playlist: $list->name)` and sets the clock with its airtime and `autodj_queued_is_jingle = true`.
- Saving set times through the API resets `last_played_at` to now, so a time that just passed does not fire the moment it is saved.

### Sequential order

`peekSequential`: the first track on the playlist relation whose pivot `position` is greater than `playlists.cursor_position` (or the first track if the cursor is null), wrapping to the first track when none is left. `consumeSequential` then writes `cursor_position = that track's pivot position` with `DB::table('playlists')` and syncs the in-memory model. The cursor is a **position number, not a track id**. The order is exactly the owner's drag order (`playlist_track.position`, 1-based, gap-free). A sequential playlist is never fit-picked for a hard start; the song is trimmed instead.

### Shuffle order (deck-based)

`playlists.deck` is a JSON list of track ids: the **unplayed remainder of the current cycle**. Taking a card is split in two:

- `peekShuffled` reads the deck and walks it until an id resolves via `$playlist->tracks()->whereKey($id)`, collecting the dead ids above it (deleted, removed, or re-categorised-as-jingle tracks). If none resolves (no deck yet, first shuffle after a switch, or a deck emptied by deletions) it `deal()`s and stores a fresh permutation of all the playlist's tracks and returns the head. If that head then fails to resolve (delete racing in), it returns null and the next request deals again.
- `fitFromDeck` (hard starts only) may choose a later card instead of the head; see the ladder above.
- `consumeShuffled` runs in a transaction that `lockForUpdate`s the playlist row, removes the chosen track and the dead ids wherever they sit, and writes the deck back. **Eager refill**: if that empties the deck it deals the next one immediately with `avoidHead` = the track just taken, so the seam between two decks never puts the same track back to back. If the head equals `avoidHead` and the deck has more than one entry it swaps the head with a random later slot. A one-track playlist repeats that track (guarded by `count > 1`).
- The deck is written with `json_encode` through `DB::table` (`persistDeck`; the model cast is bypassed there, so passing the array would store the string "Array").

Result: every track airs exactly once per cycle. There is no "last played" column and no history; "no repeats" is structural. `dealIn()` splices newly added tracks into the *remaining* deck at random offsets so an upload airs this cycle. It is called by `PlaylistTracks::attach` and `replace` (inside their transaction, under the playlist row lock) and does nothing for a sequential playlist or an empty/null deck.

Switching a playlist between orders is a plain `PATCH /playlists/{playlist}` `order` (`sequential|shuffle`); it touches neither `cursor_position` nor `deck` and never restarts a container. The values from the earlier order survive (see Gaps).

### The annotate URI (the contract with the script)

`PlaylistFileWriter::annotateUri` builds `annotate:<pairs>:/data/playlists/<basename(path)>`. Pair order and meaning:

| Key | Present when | Read by |
|---|---|---|
| `jingle="true"` | jingles only (`next()` sets it when it serves a jingle) | crossfade, now-playing push, listener metadata |
| `liq_cue_in`, `liq_cue_out` | analysed and `TrackAnalysis::cuePoints` keeps them (skipped if playable length under `cue_min_playable_seconds`, default 5, floor 1; an out within 0.05 s of the end is dropped; an in of 0.05 s or less is dropped). With `playFor` (hard-start trim) `liq_cue_out` is moved in to `cue_in + playFor`, never later than the stored cue-out | Liquidsoap request layer |
| `liq_amplify="<n> dB"` | analysed, `apply_amplify` true, and gain at least 0.1 dB | the `amplify` operator |
| `liq_fade_out` | only on a trimmed song (`playFor` and `fadeOut` both set); seconds, 3 decimals | the script's `fade.out` on `autodj_rotation` |
| `duration` | `duration_seconds > 0` (the decoded length once measured, else the header's); 3 decimals; the full file length even when trimmed | crossfade |
| `title`, `artist` | always title; artist if non-blank after trim | metadata, now-playing |
| `playlist` | name of the resolved playlist | nothing (see Gaps) |

Amplify gain = target LUFS (`-14`) minus measured loudness, capped so true peak stays under the ceiling (`-1` dBFS), capped above at `+12` dB, attenuation unlimited. It is computed at answer time from stored raw measurements, so changing the config re-levels the library at each station's next boundary. Quotes and backslashes in values are backslash-escaped.

`PlaylistFileWriter` writes no playlist file at all now, music or jingle. `prepare()` only ensures the station directory exists (called by `StationLifecycleService::start`, `stations:relaunch` and `stations:reconcile` before `up()`); there is no `write()`, `reload()` or `JINGLES_*` constant any more, and a track upload, edit, delete or reorder pushes nothing to the container.

### The endpoint contract

`GET /api/internal/next-track?slug=<slug>` (route in the `internal` group with `throttle:internal`).

| Aspect | Value |
|---|---|
| Auth | `internal` middleware, `X-Internal-Key` header |
| Rate limit | `internal` limiter: 300 per minute per client IP (`AppServiceProvider`) |
| Validation | `slug` required string, max 255 |
| Headers read | `X-Gocast-Fresh` (`'1'` = first ask since boot), `X-Gocast-Script` (int, default 1); both absent from scripts rendered before 2026-10-05 |
| Loads | `Station` with `user.plan`, `defaultPlaylist`, `autodjSlots.playlist`, `jingleLists` |
| 404 | empty body, unknown slug |
| 204 | empty body, when `next()` returns null (unentitled, no playlist, empty playlist; jingles alone never produce a 200) |
| 200 | `text/plain` body: the bare `annotate:` URI |

It never returns JSON and never 5xx by design. Anything else (throttle 429, 500, nginx timeout) reaches the script as "rotation stalled".

### Now-playing metadata flow

1. The `.liq` calls `output_source.on_metadata(synchronous=false, push_now_playing)`. `output_source` is the mix *before* the watermark and the jingle metadata rewrite. It skips jingles (`jingle == "true"`) and skips a push whose title and artist equal the last pushed pair. Otherwise it POSTs `{slug, title, artist}` to `/api/internal/now-playing` (5 s timeout).
2. `NowPlayingController`: validates `slug` (`^[a-z0-9-]+$`, max 255), `title` and `artist` (nullable, max 500). Trims both; empty becomes null. Unknown slug is 404 `{ok:false}`.
3. Both null: `Redis::del("metadata:{station_id}")`, response `{ok:true, cleared:true}`. Otherwise `Redis::setex("metadata:{id}", 6*3600, {"title","artist"})`. The 6 h TTL is only a safety net for a container that dies mid-track.
4. Transition broadcast: it checks `Redis::exists` before the write. Only when the key goes from absent to present (or the reverse) does it fire `StationStateChanged` `audio_started` / `audio_stopped`. Ordinary track changes deliberately broadcast nothing (about 12,000 pushes per station per month). See [Realtime events](realtime-events.md).
5. Other deleters of the key: `StreamSessionController::destroy` (session end), `StationEventController::closeSessions` (run on the `live_disconnected` event), `StationLifecycleService` on stop.
6. Readers: `ListenerCountController::show` (public `/public/stations/{slug}/listeners`) prefers the container's `title`/`artist` from `/status`, and falls back to the Redis copy when the container does not answer or reports neither field. `StationResource` (the `metadata` for `now_playing` on station payloads) reads `metadata:{id}` directly and returns null when the station is not running.

The in-stream ICY title is separate: `output.icecast` derives it from `listener_source`, which replays the previous track's metadata over a jingle.

### Status the dashboard reads (`GET /stations/{slug}/status`)

Owned by [Station lifecycle](station-lifecycle.md); the AutoDJ-specific parts are:

- `now_playing`, `elapsed`, `remaining` come from the container's `/status` (`output_source.last_metadata()`, `elapsed()`, `remaining()`; infinity/NaN become -1, which the API maps to null). Cached in `StationStatusService` for `liquidsoap.status_ttl_seconds` (2 s), 15 s when Docker confirmed the container down.
- `playlist_length` and `up_next` come **from the database, not the container** (`StationStatusController`). It loads `autodjSlots.playlist` and `defaultPlaylist`, resolves the playlist with `AutoDjProgramme`, and returns up to 5 (`UP_NEXT_LIMIT`) tracks:
  - Sequential: finds the current track in the playlist by **matching title and artist strings** to `status.now_playing`, then lists the next tracks wrapping around. No match (live, silence, jingle, duplicate-titled row) starts from the top of the playlist.
  - Shuffle: the head of `playlists.deck`, skipping dead ids. No deck means an empty list on purpose.
  - `playlist_length` counts music tracks in the resolved playlist.

### Skip

There is no skip. The `POST /stations/{slug}/skip` route and `StationPowerController::skip` are commented out (dated 2026-10-05), and so is the `playlist_m3u.skip` telnet command in the template. No web or mobile client called it after the overview Skip button was removed. The comments say why it stays off: a hand-made skip would throw off the AutoDJ clock (the next answer would be planned to start when the skipped track would have ended), so hard starts after it would land late. Bringing it back means resetting `autodj_queued_seconds` too.

## How AutoDJ interacts with live broadcasts

- **Priority.** `fallback(track_sensitive=false, [live, autodj_mix, bed])`: a connected broadcaster takes over immediately mid-track, not at a boundary. The live arm reads from `input.harbor` with `buffer=5.` then `buffer(buffer=2., max=10.)`, so audio switches after about 5 s of harbor pre-buffer (plus the 2 s `buffer()`; the exact figure needs a live container). During that window `broadcaster` is true but `source` is still `autodj`.
- **Live to AutoDJ.** When the broadcaster disconnects, harbor's `on_disconnect` sets `live_connected := false` and posts `live_disconnected`. The live arm still plays out its buffered audio (`source` stays `live` until it drains), then the fallback falls to AutoDJ. This tail is why the dashboard shows "Handing back to AutoDJ" and polls at 2 s (`useStationStatus.intervalFor`).
- **AutoDJ keeps no timer across a show.** The container does not tell Laravel to pause anything. Nothing in `next()` looks at live state; `next()` runs whenever Liquidsoap asks, live or not. The clock columns only predict the *next* answer's start from the last one's airtime, and are re-anchored on `now` at each ask, so a show leaves at most one mis-planned answer behind (tested: "re-anchors on now at every ask"). What Liquidsoap does with an unselected `request.dynamic` (does it freeze the current track, or has it already fetched the next one) is upstream runtime behaviour: nothing in the script or Laravel decides it, and it can only be observed against a live container. [Schedule](schedule.md) says the next boundary after a show "resolves at that moment"; that is true of when *Laravel* resolves, but the file that plays first after a show may be one already fetched earlier.
- **Plan interaction.** On a plan without AutoDJ, the AutoDJ arm is silence: a live show ends and the station is silence until the sweeper stops it (`StationAudioPolicy`, see [Station lifecycle](station-lifecycle.md)). `StationAudioPolicy::hasPlayableRotation` deliberately mirrors `next()`: it treats "entitled and the resolved playlist has tracks" as a rotation, so an unentitled or empty station is idle (stoppable), a playable one that produces no sound is a `Fault`.
- **Metadata during live.** A broadcaster with no title gets the placeholder `liquidsoap.live_broadcast_text` ("Live Broadcast") via `metadata.map(insert_missing=true, ...)`; that then flows through the same now-playing push. See [Encoder ingest](encoder-ingest.md) and [Broadcasting web studio](broadcasting-web-studio.md).

## Data

### `playlists` (`Playlist` model)

| Column | Notes |
|---|---|
| `id` | ULID |
| `station_id` | uuid FK, cascade on delete |
| `name` | string 60, unique per station |
| `is_default` | bool; exactly one per station (created in `Station::booted` as "Main rotation", `order` sequential) |
| `order` | string 16, `sequential` (default) or `shuffle` |
| `cursor_position` | uint nullable; pivot position of the last handed-out track (sequential only) |
| `deck` | json nullable; remaining track ids (shuffle only); cast `array` |
| `position` | uint, display order |

Fillable: `name`, `order`, `position`. `is_default` is set only with `forceFill`/forceCreate. `tracks()` is a `belongsToMany` restricted to `kind = music`, ordered by pivot `position`.

`playlist_track`: composite primary key (`playlist_id`, `track_id`), `position` uint, both FKs cascade. Deleting a track or a playlist removes rows silently.

Other AutoDJ fields: `stations.autodj_last_playlist_id` (monitoring), `stations.timezone` (slots, jingle times and days), `tracks.kind` (`music` or `jingle`; only music can be in a playlist), `tracks.jingle_list_id` (FK to `jingle_lists`, null on delete), `tracks.duration_seconds` + `tracks.duration_measured_at` (header length until analysis replaces it with the decoded one and stamps the column), the analysis columns on `tracks` (`loudness_lufs`, `true_peak_db`, `cue_in_seconds`, `cue_out_seconds`, `analyzed_at`, `analysis_error`), `autodj_slots.start_mode` (`soft` default / `hard`), and `plans.autodj_enabled`.

The clock, on `stations` (migration `2026_10_05_130100`), written only by `AutoDjScheduler::setClock`/`clearClock` through `DB::table`:

| Column | Notes |
|---|---|
| `autodj_queued_starts_at` | `timestamp(3)` nullable; planned start of the last track handed out. Written, not read by `next()` (diagnostic) |
| `autodj_queued_seconds` | double nullable; that track's airtime (or the trimmed length); null = nothing queued, the next answer starts now |
| `autodj_queued_is_jingle` | bool default false; whether it was a jingle (no two jingles in a row) |

`jingle_lists` (migration `2026_10_05_130200`, `JingleList` model, ULID): `station_id` (cascade), `name` (60), `enabled`, `pick` (`random`/`in_order`/`single`), `pinned_track_id` (FK tracks, null on delete), `frequency` (`minutes`/`songs`/`times`, default `songs`), `every_minutes`, `every_songs` (default 4 on the model), `times` (json `HH:MM` list), `exact`, `days` (json, 0 = Sunday, null = every day), `from_time`/`to_time` (null = all day), `position`, and rotation state written by `JingleRotation` with `DB::table`: `deck`, `cursor_position`, `songs_since`, `last_played_at` (`timestamp(3)`). The migration's data step gave every station that had jingles one "Jingles" list with its old `stations.jingle_*` rule (random pick). Those four `stations.jingle_*` columns still exist, unread.

The stations table used to hold the cursor, deck and order (`autodj_order`, `autodj_cursor_position`, `autodj_deck`); `2026_09_20_134242_backfill_default_playlists` moved them into each station's default playlist and `..._134243_drop_autodj_columns_from_stations_table` dropped them.

### Playlist endpoints (all inside the authenticated, verified group)

| Route | Notes |
|---|---|
| `GET /stations/{slug}/playlists` | index with `track_count` and `duration_seconds` |
| `POST /stations/{slug}/playlists` | `name` required max 60 unique per station, `order` optional; appended at max position + 1; 201 |
| `PATCH /playlists/{playlist}` | `name` (max 60, unique ignoring self), `order`, `is_default` (rule `accepted`, i.e. only ever true). Making a playlist default un-defaults the old one in one transaction |
| `DELETE /playlists/{playlist}` | 409 with "The default playlist cannot be deleted..." for the default; otherwise deletes it and cascades its slots and membership rows (tracks stay in the library) |
| `GET/PUT/POST /playlists/{playlist}/tracks`, `PATCH .../reorder`, `DELETE .../tracks/{track}` | `PlaylistTrackController` via `PlaylistTracks`; index, replace, store and reorder return the full ordered list; DELETE returns 204 (404 if the track is not a member) |

`PlaylistPolicy`: owner only for every action; **no plan check anywhere on playlists**. The controller says why: the entitlement is enforced where the audio is (`next()`) and on upload (`TrackController::store` calls `StationLifecycleService::assertAutoDjEnabled`). Jingle lists (`JingleListController`, `JingleListPolicy`) are not plan-gated either. Listing and deleting tracks stay open on every plan so a downgrade never traps files. The details of these endpoints belong to [Library and playlists](library-and-playlists.md).

`PlaylistTracks` keeps `position` 1-based and gap-free. `attach` appends and deals into the deck; `replace` rewrites the set (added ids dealt in, dropped ids skipped lazily); `detach` and `detachEverywhere` delete then decrement every later position; `reorder` renumbers. It writes only pivot rows and the deck, never the `stations` row, so none of it can reach `StationObserver` and restart a container.

## Surfaces

### Web dashboard overview

`(overview)/page.tsx` fetches the station, its sessions and its playlists in parallel. It no longer fetches a playlist's tracks: there is no AutoDJ track-preview card on the overview any more. A failed playlists fetch only affects the checklist; 404 or 403 on the station gives `notFound()`, a 401 goes to `/auth/login?expired=1`.

- **The hero** (`components/dashboard/overview/OverviewHero.tsx`, decisions in `client/lib/stationHero.ts`) on one shared status poll (`useStationStatus` → `StationStatusProvider`):
  - Labels in priority order: NOT REACHING LISTENERS (`degraded`), STARTING, LIVE, OFF AIR, CHECKING / STATUS UNKNOWN (no status yet / no answer), NO SOUND (`source` silence), ON AIR · AUTODJ. LIVE is keyed on `broadcasterAttached` (this tab's broadcast, or `status.broadcaster`, or `live_source` for old containers), not on `state`, but `degraded` and `starting` outrank it.
  - ON AIR · AUTODJ: "Your station is playing itself." and "AutoDJ is on {playlist}. It hands over when you go live, and takes back when you end." (the playlist from `programme`). That handover is wording, not a mechanism (see "How AutoDJ interacts"). During the live tail: "Your show has ended." / "Listeners are hearing its last few seconds." and "Handing back to AutoDJ soon…" when the plan has AutoDJ and the playlist has tracks.
  - Buttons: Go live whenever nobody is live (Open studio when this tab is live, "Hear your stream ↗" when someone else is). Off air: **"Start AutoDJ" for plans with AutoDJ; only "Go live" for plans without** (`useAutoDjLocked`). Running: "Stop AutoDJ" while AutoDJ plays (confirm "Stop AutoDJ on {name}?", Keep playing / Stop AutoDJ, because it drops listeners), else "Turn station off" without a confirm; hidden while another browser is live. An external-encoder stop the API refuses opens "Cut off this broadcast?", which retries with `force: true`. Start AutoDJ toasts "Your station is starting up" (`useStationPower`; the start is only accepted, the band then says what it lands on), and the listener panel says "Your station is starting. Counting begins once it’s on air." until it is.
  - **`NowPlayingWell`** while AutoDJ plays: title · artist from `status.now_playing` (held across the gaps between tracks; cleared on stop and on any broadcaster change), the time left (violet, mono) and a progress bar written per animation frame by `useTrackProgress` (only with `source` `autodj` and a non-negative `remaining`; snap-back tolerance 2.5 s), and "Up next" from `up_next[0]`. "On air — waiting for track info" when the rotation has tracks but no title yet.
  - There is **no Skip button**; it was removed from the overview.
- **Status pacing**: 2 s with no status yet, while `starting`, during a live tail, and during live takeover; 30 s when `offline`; otherwise 10 s (30 s while the realtime socket is connected), pulled in to `remaining * 1000 + 750 ms` (min 3 s) near a track end so the title updates just after a boundary; back-off up to 30 s on failures (2 s doubling); no reads while the tab is hidden, one on return. Realtime station signals trigger a refetch, coalesced over 120 ms. One poll serves the hero, the status band and the sidebar lamp.
- **Status band** (every page): ON AIR · AUTODJ with "AutoDJ is playing {title} by {artist}." and Go live; SILENCE (amber) "AutoDJ is on but has nothing to play. Listeners hear silence." with Add tracks (`client/lib/airState.ts`). Right after this tab ends a show it says SHOW ENDED, "Your show has ended. Checking what’s on air now…", until a status read shows the handover done (at most 15 s), rather than guessing from a status that still describes the show.
- **Coming up** (`ComingUpCard`, `lib/comingUp.ts`): AutoDJ's next slot change from `programme.next`, in violet, beside your next show times.
- **Setup checklist**: "Fill AutoDJ's playlist" (not on Free) is done when the **default** playlist's `track_count > 0` (from the playlists fetch).
- `playlist_length` from `/status` is also read by `client/components/studio/EndBroadcast.tsx` and the mobile studio end sheet (`EndSheet` in `mobile/src/components/studio/Sheets.tsx`, fetched only when the plan has AutoDJ) to warn about an empty rotation (web: "Your show stops for everyone listening. AutoDJ has nothing to play, so they hear silence and the station switches off in a few minutes." versus "Your show stops for everyone listening, and they hear AutoDJ straight away."). The mobile copy says "your library is empty", but the number is the resolved playlist's track count, not the library's.

### Elsewhere

- Player page: now-playing text comes from in-band ID3/ICY metadata once any has arrived on the connection, otherwise from the public listeners stats (`PlayerView.tsx`, `hasInbandMetadataRef`). See [Public player and embed](public-player-and-embed.md).
- Library, Schedule page, and the mobile app show playlists and the programme; see [Library and playlists](library-and-playlists.md), [Schedule](schedule.md), and the mobile docs.

## Gaps and traps

1. **Plan enforcement is only at playback, and it is silent.** A downgraded station keeps a running container, reads "On air" in the dashboard state (`StationStatusService::state` only looks at readiness and Icecast), and plays silence. The dashboard then shows "No sound" once `source` is `silence`, and the sweeper eventually stops it. Nothing tells the owner "your plan lost AutoDJ".
2. **Cursor and deck advance when the container *asks*, not when the track airs.** `next()` moves state on every call, and the script may fetch ahead of the boundary (whether `request.dynamic` prefetches is runtime behaviour, not decided by this repo). A track handed out but never aired (the station stopped, or a live show took the mount) is consumed. `up_next[0]` for a shuffled playlist is the head of the *remaining* deck, which may be the track after the one already fetched. The clock has the same blind spot: `next()` assumes the track it handed out *will* play next, starting when the previous one started plus its airtime. A track that never airs, a live show, or a slow decode makes the plan wrong for one ask only, because each ask re-anchors on `now`.
3. **The sequential cursor is a position number, and compaction breaks it.** `PlaylistTracks::removeMember` (used by `detach` and `detachEverywhere`, which is what `TrackImporter::destroy` and `destroyMany` call) deletes the row and decrements every later position without adjusting `cursor_position`. Removing the track *at* the cursor makes the next track take the cursor's number, so `position > cursor` skips it; removing a track *before* the cursor skips one. `reorder` and `replace` similarly leave the cursor pointing at a slot, not a track. By reading; not covered by a test (`NextTrackControllerTest` deletes with `$track->delete()`, which cascades without compacting). The docblock in `PlaylistTracks` claims a gap is the problem the compaction avoids, and the skip is the price.
4. **Shuffle deck survives a switch to sequential and back.** `PATCH order` neither clears nor deals. Going shuffle to sequential to shuffle resumes the old deck remainder (dead ids are skipped lazily), and the sequential cursor is untouched by shuffle. Harmless, but "switch to shuffle" is not "reshuffle now".
5. **`playlist` annotation is dead weight.** `annotateUri` adds `playlist="<name>"` "so now-playing and the timeline can say where a track came from", but `push_now_playing` sends only `title` and `artist`, and nothing reads the key back. The `playlist_changed` event is the only place the switch is recorded.
6. **No-rotation stations poll every 10 s each, forever, against a 300/min limit.** An unentitled, empty, or live-only running station calls `/internal/next-track` every `retry_delay` (10 s = 6 per minute per station). The limiter is keyed by client IP; whether containers share an IP behind the internal nginx vhost depends on the deployment (proxy and trusted-proxy setup), not on code in this feature. If they do share one, about 40 such stations plus the other internal traffic (now-playing pushes, events, harbor-auth) would start returning 429, which the script logs as "rotation stalled" and treats as silence, even for stations that do have music.
7. **`up_next` matches by title and artist strings.** Two tracks with the same title and artist, or a station whose now-playing text came from a live broadcaster or a jingle, mis-anchor the list (starts from the top). Each status poll also runs several small queries (slots and their playlists, the default playlist, a track count, the track list).
8. **The overview's playlist name can lag the audio.** The hero's "AutoDJ is on {playlist}" comes from `programme` in the server-rendered station, not the poll; a slot boundary passes without it updating until `router.refresh()`. The now-playing title does follow the poll.
9. **No skip at all.** The route, controller method and telnet command are commented out (2026-10-05). Owners cannot drop a track they dislike mid-air; the only lever is editing the playlist, which affects the next boundary.
10. **Free plans can build the whole arrangement.** Playlists, memberships, order and slots are not plan-gated (`PlaylistController` says so on purpose); only upload and playback are. A Free owner can end up with slots that never play. `UpdatePlaylistRequest` and the rest also accept edits on a station whose plan has no AutoDJ.
11. **Crossfade defaults off** (`LIQUIDSOAP_CROSSFADE_ENABLED=false`) and the comment on the config key says it is expected to work on the pinned 2.4.5 but has not been observed working here. Treat every "crossfade" claim in product copy as unshipped unless the env is set.
12. **`LIQ_SOURCE = "playlist_m3u"`** names an m3u that no longer exists. It is still the `request.dynamic` id in every rendered script; renaming it means relaunching every container.
13. **Stale comments.** `PlaylistController::destroy`'s comment calls the slot cascade "(Phase 3)"; the cascade exists (`autodj_slots.playlist_id` cascades on delete). The `up_next`/`playlist_length` keys are still copied by `StationStatusService::normalize` although the container no longer reports them; they always come out null/empty there and are overwritten by `StationStatusController`.
14. **Rollout needs every container recreated.** A container rendered before 2026-10-05 sends no `X-Gocast-Script`, so it is treated as script 1: it keeps playing its own stale `jingles.m3u` on its old rule, and gets no Laravel jingles and no trims (hard slots still *switch* at the boundary, softly, because the playlist is resolved at the planned start for every script). Relaunch every container (`stations:relaunch`) after deploying. The `stations.jingle_*` columns are unused but not yet dropped.
15. **The 204 is indistinguishable from "empty".** Support cannot tell "no plan", "no playlist", and "empty playlist" from the container's side. Check `plans.autodj_enabled`, then the resolved playlist's track count.
16. **Only observable against a live container:** what Liquidsoap does with the fetched-but-unplayed request when live takes the mount, and whether `prefetch` delays a slot switch by a track.
17. **Planned times are only as good as the lengths.** Hard starts and exact-time jingles land within about half a second (`FIT_TOLERANCE`) only when the playing track's `airtimeSeconds()` is right. Tracks uploaded before `duration_measured_at` existed run on the header guess until `tracks:measure-durations` has measured them; they can trigger a trim but are never chosen as a fit.
18. **A jingle-only library is silent**, by design: jingles are asked for only after a music track has been peeked. Owners who upload only station IDs hear nothing and the sweeper treats the station as idle.
19. **Set-time jingles have a 30-minute grace.** A station off air or live at 08:00 that comes back at 08:25 still plays the 08:00 jingle at its first break; at 08:31 it does not.

## Tests

- `api/tests/Feature/NextTrackControllerTest.php`: ordering and wrap, annotate URI, cursor persistence, no touch to the station row, deleted track skipped, jingles excluded, 204 cases, plan gate (does not move cursor or deck, resumes when the plan returns, `plans:expire` silences), 404, internal key required.
- `api/tests/Feature/AutoDjShuffleTest.php`: once per cycle, seam repeat, eager refill, deck JSON, deleted tracks, one-track repeat, order switch over the API and validation.
- `api/tests/Feature/AutoDjHardStartTest.php`: the clock (fresh boot, previous airtime, re-anchoring after live), slot starts with the first track inside it, sequential trim + fade, shuffle fit-pick keeping the skipped card, header-only lengths never fit, early start under 20 s, filler jingle, midnight and timezone hard slots, soft slots untouched, empty hard slot ignored, old script gets no trims or jingles.
- `api/tests/Feature/JingleRulesTest.php`: every N songs / minutes, never back to back, set times and their grace, exact-time fade then carry on, set-time beats interval, in-order / random / pinned picks, hours and days (including past midnight), off or empty lists, no jingles without AutoDJ, jingles over a scheduled playlist, none on a station with no music.
- Neighbours: `AutoDjProgrammeTest.php` (resolution), `PlaylistFileWriterTest.php` (URI building, trim + `liq_fade_out`), `TrackDurationTest.php` (decoded length, `airtimeSeconds`, `tracks:measure-durations`), `JingleListControllerTest.php`, `PlaylistControllerTest.php`, `NowPlayingControllerTest.php`, `StationStatusTest.php`, `PlaylistBackfillMigrationTest.php`.
- No tests for cursor behaviour after compaction (gap 3), the 429 case (gap 6), or any client component here. The rendered `.liq` behaviour (prefetch, fallback) is only exercised by hand against a container.

## History

- Rotation moved out of Liquidsoap (m3u reload reset the list to index 0) into `request.dynamic`; comments in `station.blade.php` and `config/liquidsoap.php` record the measurements.
- Shuffle deck design: commit range around 2026-09-12; playlists and slots: `docs/AUTODJ-SCHEDULING-PLAN.md`, `docs/AUTODJ-SCHEDULING-HANDOFF.md` (768d32d); follow-ups: `docs/AUTODJ-KNOWN-GAPS.md`.
- Plan gate moved into `next()` when downgraded stations were found still playing music.
- 2026-10-05: jingles moved out of the `.liq` into Laravel (jingle lists with rules), the AutoDJ clock and hard/soft slot starts added, track lengths measured by decoding, skip disabled. Design and decisions: `docs/JINGLES-AND-HARD-SLOTS-PLAN.md`.
