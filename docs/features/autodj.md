---
feature: AutoDJ (playback, rotation order, handover)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - api/app/Services/AutoDjScheduler.php
  - api/app/Services/AutoDjProgramme.php
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
  - client/components/dashboard/AutoDjRotation.tsx
  - client/components/dashboard/StationPower.tsx
  - client/components/dashboard/TrackProgress.tsx
  - client/hooks/useStationStatus.ts
  - client/hooks/useTrackProgress.ts
  - client/interfaces/StationStatus.ts
  - client/lib/programme.ts
  - client/app/station/[slug]/PlayerView.tsx
  - client/components/studio/EndBroadcast.tsx
  - mobile/src/components/studio/Sheets.tsx
  - client/app/dashboard/stations/[slug]/(overview)/page.tsx
  - client/app/dashboard/stations/[slug]/StationActions.tsx
  - api/tests/Feature/NextTrackControllerTest.php
  - api/tests/Feature/AutoDjShuffleTest.php
fingerprint: ebb777e98930c62a
---

# AutoDJ

AutoDJ is the music that plays on a station when nobody is broadcasting. It is not a separate switch: there is no "AutoDJ on/off" in the API or the database. A running station always has an AutoDJ arm, and "Start AutoDJ" on the overview is the same `POST /stations/{slug}/start` as any other start. What decides whether that arm makes sound is a question the Liquidsoap container asks Laravel at every track boundary (`GET /internal/next-track`). Laravel answers with one track, or with 204 (nothing to play).

The one thing people get wrong: **the plan is enforced only inside that answer.** The rendered `.liq` is identical for every plan and a plan change never restarts a container, so a downgraded station keeps a healthy container that is simply told "nothing to play". It is not an error, it is not logged, and the station reads as running.

The schedule half (which playlist a slot picks) is documented in [Schedule](schedule.md). This file covers what happens once the playlist is chosen, and how AutoDJ meets live broadcasts. Library and playlist editing are in [Library and playlists](library-and-playlists.md); the station script is in [Liquidsoap station script](liquidsoap-station-script.md); start/stop and the sweeper are in [Station lifecycle](station-lifecycle.md).

## What it actually does

### The audio path

In `station.blade.php` the graph is:

1. `autodj = request.dynamic(id = "playlist_m3u", retry_delay = ..., autodj_next)`. `autodj_next()` does `http.get` on `nextTrackUrl` with `X-Internal-Key`, a 5 s timeout, and `Accept: text/plain`.
   - 200 with a non-blank body: `request.create(body)` and that track plays (a blank body is treated as `null`).
   - 204: returns `null`, silently ("nothing to play" is normal for a live-only station).
   - Any other status, or an exception: `log.severe(...)` "rotation stalled" and `null`.
   - After a `null`, Liquidsoap waits `retry_delay` and asks again. Rendered from `config('liquidsoap.autodj_retry_delay_seconds')` (env `LIQUIDSOAP_AUTODJ_RETRY_DELAY`, default 10.0), floored at 1.0 by `LiquidsoapSupervisor` when rendering. So every running station with no rotation calls the API every 10 s for as long as it runs.
2. `jingles` (a `playlist()` on `jingles.m3u`, gated by an interactive bool) and `autodj` are joined by `autodj_rotation = fallback(track_sensitive = true, [jingle_arm, autodj])`. Jingles are out of scope here; see [Liquidsoap station script](liquidsoap-station-script.md).
3. `amplify(1., autodj_rotation)` when `applyAmplify` is on (`LIQUIDSOAP_APPLY_AMPLIFY`, default true). It acts on the per-track `liq_amplify` annotation and wraps jingles too.
4. `cross(...)` (crossfade) only when `crossfade_enabled` (`LIQUIDSOAP_CROSSFADE_ENABLED`, default **false**). Off means hard cuts. Duration 5, fade 3, high -15 dB, medium -32 dB, margin 4 dB are the defaults in `config/liquidsoap.php`. A jingle is never crossfaded.
5. `limit(...)` on the AutoDJ arm only when `limiter_include_live` is false. By default (true) the limiter sits at the bottom of the graph instead, over live too.
6. `mixed = mksafe(fallback(track_sensitive=false, [live, autodj_mix, bed]))`. Priority: live, then AutoDJ, then `blank()`.

`autodj.register_command("skip", ...)` adds a telnet command `playlist_m3u.skip` that calls `autodj.skip()`. The value `playlist_m3u` (`PlaylistFileWriter::LIQ_SOURCE`) is a leftover name from when the rotation was a playlist file; it is kept because it is a wire name in every rendered script.

### What Laravel answers (`AutoDjScheduler::next`)

In order:

1. **Plan gate.** `$station->user?->canUseAutoDj()` (`User::canUseAutoDj`: `plan.autodj_enabled`, no plan row means false). If false, return null. This happens *before* anything moves, on purpose: the container keeps polling every retry delay while unentitled, and moving the cursor or dealing a deck on each poll would destroy the running order the owner gets back on re-subscribing. Tested in `NextTrackControllerTest` ("does not move the cursor while it is refusing", "does not deal a new shuffle deck...", "picks the rotation back up unchanged").
2. **Resolve the playlist** with `AutoDjProgramme::resolve($station)` (slot playlist, or the default playlist; empty slot playlist falls through to default). Null playlist returns null. See [Schedule](schedule.md).
3. **`noteSwitch`**: if `stations.autodj_last_playlist_id` differs from this playlist, write the new id with `DB::table` (so no observer or `updated_at` fires) and record a `playlist_changed` `StationEvent` (source system; properties `from_playlist_id`, `to_playlist_id`, `playlist`, `slot_id`, `slot`). The column has no foreign key (`char(26)`); a deleted playlist leaves a dangling id, which only means the next boundary logs a change. Monitoring only.
4. **Advance** by the playlist's `order`: `advanceShuffled` for `shuffle`, otherwise `advanceSequential`.
5. Return `PlaylistFileWriter::annotateTrack($track, playlist: $playlist->name)`, or null if the playlist had no tracks.

### Sequential order

`advanceSequential`: takes the first track on the playlist relation whose pivot `position` is greater than `playlists.cursor_position` (or the first track if the cursor is null), wraps to the first track when none is left, then writes `cursor_position = that track's pivot position` with `DB::table('playlists')` and syncs the in-memory model. The cursor is a **position number, not a track id**. The order is exactly the owner's drag order in the library (`playlist_track.position`, 1-based, gap-free).

### Shuffle order (deck-based)

`playlists.deck` is a JSON list of track ids: the **unplayed remainder of the current cycle**. `advanceShuffled` runs in a transaction that `lockForUpdate`s the playlist row, then `popShuffled`:

- Shift ids off the front until one resolves via `$playlist->tracks()->whereKey($id)` (dead ids from deleted, removed, or re-categorised-as-jingle tracks are skipped lazily).
- If none resolves (no deck yet, first shuffle after a switch, or a deck emptied by deletions) it `deal()`s a fresh permutation of all the playlist's tracks and takes the head. If that head then fails to resolve (delete racing in), it returns null and the next request deals again.
- **Eager refill**: as soon as the last card is taken (`$deck === []`) it deals the next deck immediately with `avoidHead` = the track just taken, so the seam between two decks never puts the same track back to back. If the head equals `avoidHead` and the deck has more than one entry it swaps the head with a random later slot. A one-track playlist repeats that track (guarded by `count > 1`).
- The remaining deck is written back with `json_encode` through `DB::table` (the model cast is bypassed there, so passing the array would store the string "Array").

Result: every track airs exactly once per cycle. There is no "last played" column and no history; "no repeats" is structural. `dealIn()` splices newly added tracks into the *remaining* deck at random offsets so an upload airs this cycle. It is called by `PlaylistTracks::attach` and `replace` (inside their transaction, under the playlist row lock) and does nothing for a sequential playlist or an empty/null deck.

Switching a playlist between orders is a plain `PATCH /playlists/{playlist}` `order` (`sequential|shuffle`); it touches neither `cursor_position` nor `deck` and never restarts a container. The values from the earlier order survive (see Gaps).

### The annotate URI (the contract with the script)

`PlaylistFileWriter::annotateUri` builds `annotate:<pairs>:/data/playlists/<basename(path)>`. Pair order and meaning:

| Key | Present when | Read by |
|---|---|---|
| `jingle="true"` | jingles only (never from `next()`) | crossfade, now-playing push, listener metadata |
| `liq_cue_in`, `liq_cue_out` | analysed and `TrackAnalysis::cuePoints` keeps them (skipped if playable length under `cue_min_playable_seconds`, default 5, floor 1; an out within 0.05 s of the end is dropped; an in of 0.05 s or less is dropped) | Liquidsoap request layer |
| `liq_amplify="<n> dB"` | analysed, `apply_amplify` true, and gain at least 0.1 dB | the `amplify` operator |
| `duration` | `duration_seconds > 0`; 3 decimals | crossfade |
| `title`, `artist` | always title; artist if non-blank after trim | metadata, now-playing |
| `playlist` | name of the resolved playlist | nothing (see Gaps) |

Amplify gain = target LUFS (`-14`) minus measured loudness, capped so true peak stays under the ceiling (`-1` dBFS), capped above at `+12` dB, attenuation unlimited. It is computed at answer time from stored raw measurements, so changing the config re-levels the library at each station's next boundary. Quotes and backslashes in values are backslash-escaped.

`PlaylistFileWriter` no longer writes any music playlist file. `write()` only creates the station directory and rewrites `jingles.m3u`; `reload()` only sends `jingles_m3u.reload` over telnet, and only if `jingles_enabled`. It is still called after every track import/delete/reorder (`TrackImporter`), so a music upload sends a harmless jingle reload for jingle-enabled stations.

### The endpoint contract

`GET /api/internal/next-track?slug=<slug>` (route in the `internal` group with `throttle:internal`).

| Aspect | Value |
|---|---|
| Auth | `internal` middleware, `X-Internal-Key` header |
| Rate limit | `internal` limiter: 300 per minute per client IP (`AppServiceProvider`) |
| Validation | `slug` required string, max 255 |
| Loads | `Station` with `user.plan`, `defaultPlaylist`, `autodjSlots.playlist` |
| 404 | empty body, unknown slug |
| 204 | empty body, when `next()` returns null (unentitled, no playlist, empty playlist) |
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

`POST /stations/{slug}/skip` (`throttle:30,1`, policy `update`) sends `playlist_m3u.skip` over telnet, returning 409 `station_not_running` if the station is not running, 503 `station_unreachable` if telnet fails, else `{message: "Skipped."}` and forgets the cached status. **No client calls it today** (see Gaps). Skipping consumes a track from the cursor/deck like any other boundary; it is not undoable.

## How AutoDJ interacts with live broadcasts

- **Priority.** `fallback(track_sensitive=false, [live, autodj_mix, bed])`: a connected broadcaster takes over immediately mid-track, not at a boundary. The live arm reads from `input.harbor` with `buffer=5.` then `buffer(buffer=2., max=10.)`, so audio switches after about 5 s of harbor pre-buffer (plus the 2 s `buffer()`; the exact figure needs a live container). During that window `broadcaster` is true but `source` is still `autodj`.
- **Live to AutoDJ.** When the broadcaster disconnects, harbor's `on_disconnect` sets `live_connected := false` and posts `live_disconnected`. The live arm still plays out its buffered audio (`source` stays `live` until it drains), then the fallback falls to AutoDJ. This tail is why the dashboard shows "Handing back to AutoDJ" and polls at 2 s (`useStationStatus.intervalFor`).
- **AutoDJ keeps no timer across a show.** The container does not tell Laravel to pause anything. Nothing in `next()` looks at live state; `next()` runs whenever Liquidsoap asks, live or not. What Liquidsoap does with an unselected `request.dynamic` (does it freeze the current track, or has it already fetched the next one) is upstream runtime behaviour: nothing in the script or Laravel decides it, and it can only be observed against a live container. [Schedule](schedule.md) says the next boundary after a show "resolves at that moment"; that is true of when *Laravel* resolves, but the file that plays first after a show may be one already fetched earlier.
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

Other AutoDJ fields: `stations.autodj_last_playlist_id` (monitoring), `stations.timezone` (slots), `tracks.kind` (`music` or `jingle`; only music can be in a playlist), the analysis columns on `tracks` (`loudness_lufs`, `true_peak_db`, `cue_in_seconds`, `cue_out_seconds`, `analyzed_at`, `analysis_error`), and `plans.autodj_enabled`.

The stations table used to hold the cursor, deck and order (`autodj_order`, `autodj_cursor_position`, `autodj_deck`); `2026_09_20_134242_backfill_default_playlists` moved them into each station's default playlist and `..._134243_drop_autodj_columns_from_stations_table` dropped them.

### Playlist endpoints (all inside the authenticated, verified group)

| Route | Notes |
|---|---|
| `GET /stations/{slug}/playlists` | index with `track_count` and `duration_seconds` |
| `POST /stations/{slug}/playlists` | `name` required max 60 unique per station, `order` optional; appended at max position + 1; 201 |
| `PATCH /playlists/{playlist}` | `name` (max 60, unique ignoring self), `order`, `is_default` (rule `accepted`, i.e. only ever true). Making a playlist default un-defaults the old one in one transaction |
| `DELETE /playlists/{playlist}` | 409 with "The default playlist cannot be deleted..." for the default; otherwise deletes it and cascades its slots and membership rows (tracks stay in the library) |
| `GET/PUT/POST /playlists/{playlist}/tracks`, `PATCH .../reorder`, `DELETE .../tracks/{track}` | `PlaylistTrackController` via `PlaylistTracks`; index, replace, store and reorder return the full ordered list; DELETE returns 204 (404 if the track is not a member) |

`PlaylistPolicy`: owner only for every action; **no plan check anywhere on playlists**. The controller says why: the entitlement is enforced where the audio is (`next()`) and on upload (`TrackController::store` calls `StationLifecycleService::assertAutoDjEnabled`, `StationController::update` also calls it, only when `jingles_enabled` is being switched on). Listing and deleting tracks stay open on every plan so a downgrade never traps files. The details of these endpoints belong to [Library and playlists](library-and-playlists.md).

`PlaylistTracks` keeps `position` 1-based and gap-free. `attach` appends and deals into the deck; `replace` rewrites the set (added ids dealt in, dropped ids skipped lazily); `detach` and `detachEverywhere` delete then decrement every later position; `reorder` renumbers. It writes only pivot rows and the deck, never the `stations` row, so none of it can reach `StationObserver` and restart a container.

## Surfaces

### Web dashboard overview

`(overview)/page.tsx` fetches the station, its sessions and its playlists in parallel, then fetches `/playlists/{activeId}/tracks` where `activeId` is `station.programme.playlist.id` (a slot's playlist) or else the default playlist. A failed playlists fetch, or a failed `/playlists/{id}/tracks` fetch, degrades only the AutoDJ card (`unavailable`, tracks empty); 404 or 403 on the station gives `notFound()`.

- **`StationPower`** (the control strip; one `useStationStatus` poll shared by two halves):
  - Headline states, in priority order: Not reaching listeners (state `degraded`), Starting… (state `starting`), Live, Off air, Checking…/Status unknown (no status yet; unknown after a failed read or 10 s), Status unknown (container unreachable), No sound (source is silence), On air. "Live" is keyed on `broadcasterAttached` (this tab's broadcast, or `status.broadcaster`, or `live_source` for old containers), not on `state`, but `degraded` and `starting` outrank it.
  - Source chip while running: "AutoDJ", "Silence", "Handing back to AutoDJ" (the live tail), or the live source name.
  - Buttons: running: primary is "Go live" ("Open studio" when this tab is the broadcaster, "Hear your stream" when another browser or an encoder is), secondary "Turn station off" (hidden when another browser is live). Off: **primary "Start AutoDJ" with an outlined "Go live" for plans with AutoDJ; only "Go live" for plans without** (`useAutoDjLocked`). Hint copy says "Go live and AutoDJ pauses until you finish"; that is wording, not a mechanism (see "How AutoDJ interacts"). "Turn station off" asks for confirmation only when the headline is On air and the source is `autodj` (it drops listeners); other cases stop directly. An external-encoder stop that the API refuses opens a "Cut off this broadcast?" dialog that retries with `force: true`.
  - Now playing half (only when running): title/artist from `status.now_playing`, held across the gaps between tracks in a ref that is cleared on station stop and on any broadcaster change; special lines for `liveTakingOver` ("Taking over from AutoDJ…" / "Going live in a few seconds…") and `liveTailDraining` ("Handing back to AutoDJ soon…" only when the plan has AutoDJ and the playlist has tracks). `TrackProgress` draws a bar only when `source` is `autodj` and `elapsed` and non-negative `remaining` exist, anchored per poll and drifting locally (`useTrackProgress`, snap-back tolerance 2.5 s). "Up next: X" shows `up_next[0]` only, whenever the station is running (also during a live show).
  - There is **no Skip button**; it was removed from the overview.
- **`useStationStatus`** pacing: 2 s with no status yet, while `starting`, during a live tail, and during live takeover; 30 s when `offline`; otherwise 10 s (30 s while the realtime socket is connected), pulled in to `remaining * 1000 + 750 ms` (min 3 s) near a track end so the title updates just after a boundary; back-off up to 30 s on failures (2 s doubling); no reads while the tab is hidden, one on return. Realtime station signals trigger a refetch, coalesced over 120 ms.
- **`AutoDjRotation`** card: shows the resolved playlist name, up to 4 tracks (`PREVIEW_COUNT`) with number, title, artist and duration, "N more tracks in <playlist>", and a link to `/dashboard/stations/{slug}/library` ("Add tracks" when empty, "Manage music" otherwise). The subtitle is computed on the client from the *fetched playlist tracks*, not from what the container is playing. Precedence: unavailable ("Couldn't load the rotation just now."), locked plan, empty playlist (warns about silence), slot detail, then "<playlist> • N tracks • duration • plays whenever you're not live". Locked plans read "Your station goes silent when you close the studio. AutoDJ keeps your music playing." with a Pro badge and a "See what AutoDJ does" button; when a slot is on or coming, `describeProgramme` adds "until 12:00 · then X". The tracks list is in playlist order even for a shuffled playlist, so the preview is not the airing order.
- `playlist_length` from `/status` is also read by `client/components/studio/EndBroadcast.tsx` and the mobile studio sheets (`mobile/src/components/studio/Sheets.tsx`) to warn about an empty rotation.
- `StationChecklist` is passed `trackCount={tracks.length}` from the same fetch (the length of the resolved playlist, not the library).
- `StationActions` (`mode: "edit"` on the overview) only opens the station profile editor; the `live` mode is Go live / Open studio.

### Elsewhere

- Player page: now-playing text comes from in-band ID3/ICY metadata once any has arrived on the connection, otherwise from the public listeners stats (`PlayerView.tsx`, `hasInbandMetadataRef`). See [Public player and embed](public-player-and-embed.md).
- Library, Schedule page, and the mobile app show playlists and the programme; see [Library and playlists](library-and-playlists.md), [Schedule](schedule.md), and the mobile docs.

## Gaps and traps

1. **Plan enforcement is only at playback, and it is silent.** A downgraded station keeps a running container, reads "On air" in the dashboard state (`StationStatusService::state` only looks at readiness and Icecast), and plays silence. The dashboard then shows "No sound" once `source` is `silence`, and the sweeper eventually stops it. Nothing tells the owner "your plan lost AutoDJ".
2. **Cursor and deck advance when the container *asks*, not when the track airs.** `next()` moves state on every call, and the script may fetch ahead of the boundary (whether `request.dynamic` prefetches is runtime behaviour, not decided by this repo). A track handed out but never aired (the station stopped, or a live show took the mount) is consumed. `up_next[0]` for a shuffled playlist is the head of the *remaining* deck, which may be the track after the one already fetched.
3. **The sequential cursor is a position number, and compaction breaks it.** `PlaylistTracks::removeMember` (used by `detach` and `detachEverywhere`, which is what `TrackImporter::destroy` and `destroyMany` call) deletes the row and decrements every later position without adjusting `cursor_position`. Removing the track *at* the cursor makes the next track take the cursor's number, so `position > cursor` skips it; removing a track *before* the cursor skips one. `reorder` and `replace` similarly leave the cursor pointing at a slot, not a track. By reading; not covered by a test (`NextTrackControllerTest` deletes with `$track->delete()`, which cascades without compacting). The docblock in `PlaylistTracks` claims a gap is the problem the compaction avoids, and the skip is the price.
4. **Shuffle deck survives a switch to sequential and back.** `PATCH order` neither clears nor deals. Going shuffle to sequential to shuffle resumes the old deck remainder (dead ids are skipped lazily), and the sequential cursor is untouched by shuffle. Harmless, but "switch to shuffle" is not "reshuffle now".
5. **`playlist` annotation is dead weight.** `annotateUri` adds `playlist="<name>"` "so now-playing and the timeline can say where a track came from", but `push_now_playing` sends only `title` and `artist`, and nothing reads the key back. The `playlist_changed` event is the only place the switch is recorded.
6. **No-rotation stations poll every 10 s each, forever, against a 300/min limit.** An unentitled, empty, or live-only running station calls `/internal/next-track` every `retry_delay` (10 s = 6 per minute per station). The limiter is keyed by client IP; whether containers share an IP behind the internal nginx vhost depends on the deployment (proxy and trusted-proxy setup), not on code in this feature. If they do share one, about 40 such stations plus the other internal traffic (now-playing pushes, events, harbor-auth) would start returning 429, which the script logs as "rotation stalled" and treats as silence, even for stations that do have music.
7. **`up_next` matches by title and artist strings.** Two tracks with the same title and artist, or a station whose now-playing text came from a live broadcaster or a jingle, mis-anchor the list (starts from the top). Each status poll also runs several small queries (slots and their playlists, the default playlist, a track count, the track list).
8. **The overview AutoDJ card can disagree with the audio.** It is built once on the server render from the playlist resolved at render time and is not polled; a slot boundary passes without it updating until `router.refresh()`. Its preview is always position order.
9. **Skip has an API and no UI.** `POST /stations/{slug}/skip` is live (30 per minute per user) but no client in `client/` or `mobile/` calls it; the overview Skip button was removed on 2026-09-26.
10. **Free plans can build the whole arrangement.** Playlists, memberships, order and slots are not plan-gated (`PlaylistController` says so on purpose); only upload and playback are. A Free owner can end up with slots that never play. `UpdatePlaylistRequest` and the rest also accept edits on a station whose plan has no AutoDJ.
11. **Crossfade defaults off** (`LIQUIDSOAP_CROSSFADE_ENABLED=false`) and the comment on the config key says it is expected to work on the pinned 2.4.5 but has not been observed working here. Treat every "crossfade" claim in product copy as unshipped unless the env is set.
12. **`LIQ_SOURCE = "playlist_m3u"`** names an m3u that no longer exists. Renaming it without relaunching every container breaks skip (and any other telnet call using the constant).
13. **Stale comments.** `PlaylistController::destroy`'s comment calls the slot cascade "(Phase 3)"; the cascade exists (`autodj_slots.playlist_id` cascades on delete). The `up_next`/`playlist_length` keys are still copied by `StationStatusService::normalize` although the container no longer reports them; they always come out null/empty there and are overwritten by `StationStatusController`.
14. **Music uploads send a jingle reload.** `TrackImporter` calls `PlaylistFileWriter::reload` after every mutation; for jingle-enabled stations that restarts the jingle list at index 0 even when only music changed. Harmless because the jingle source is randomised.
15. **The 204 is indistinguishable from "empty".** Support cannot tell "no plan", "no playlist", and "empty playlist" from the container's side. Check `plans.autodj_enabled`, then the resolved playlist's track count.
16. **Only observable against a live container:** what Liquidsoap does with the fetched-but-unplayed request when live takes the mount, and whether `prefetch` delays a slot switch by a track.

## Tests

- `api/tests/Feature/NextTrackControllerTest.php`: ordering and wrap, annotate URI, cursor persistence, no touch to the station row, deleted track skipped, jingles excluded, 204 cases, plan gate (does not move cursor or deck, resumes when the plan returns, `plans:expire` silences), 404, internal key required.
- `api/tests/Feature/AutoDjShuffleTest.php`: once per cycle, seam repeat, eager refill, deck JSON, deleted tracks, one-track repeat, order switch over the API and validation.
- Neighbours: `AutoDjProgrammeTest.php` (resolution), `PlaylistFileWriterTest.php` (URI building), `PlaylistControllerTest.php`, `NowPlayingControllerTest.php`, `StationStatusTest.php`, `PlaylistBackfillMigrationTest.php`.
- No tests for cursor behaviour after compaction (gap 3), the 429 case (gap 6), or any client component here. The rendered `.liq` behaviour (prefetch, fallback) is only exercised by hand against a container.

## History

- Rotation moved out of Liquidsoap (m3u reload reset the list to index 0) into `request.dynamic`; comments in `station.blade.php` and `config/liquidsoap.php` record the measurements.
- Shuffle deck design: commit range around 2026-09-12; playlists and slots: `docs/AUTODJ-SCHEDULING-PLAN.md`, `docs/AUTODJ-SCHEDULING-HANDOFF.md` (768d32d); follow-ups: `docs/AUTODJ-KNOWN-GAPS.md`.
- Plan gate moved into `next()` when downgraded stations were found still playing music.
