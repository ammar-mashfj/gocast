---
feature: Library, uploads and playlists
verified: 2026-10-05 against c970b2d plus uncommitted work (feat/design-system: jingle lists, measured durations, AutoDJ nav regroup)
sources:
  - api/routes/api.php
  - api/app/Http/Controllers/TrackController.php
  - api/app/Http/Controllers/UploadController.php
  - api/app/Http/Controllers/PlaylistController.php
  - api/app/Http/Controllers/PlaylistTrackController.php
  - api/app/Services/TrackImporter.php
  - api/app/Services/TrackAnalyzer.php
  - api/app/Services/TrackAnalysis.php
  - api/app/Services/PlaylistTracks.php
  - api/app/Services/PlaylistFileWriter.php
  - api/app/Jobs/AnalyzeTrack.php
  - api/app/Console/Commands/AnalyzeTracksCommand.php
  - api/app/Models/Track.php
  - api/app/Models/Playlist.php
  - api/app/Policies/TrackPolicy.php
  - api/app/Policies/PlaylistPolicy.php
  - api/app/Http/Requests/StoreTrackRequest.php
  - api/app/Http/Requests/UpdateTrackRequest.php
  - api/app/Http/Requests/DestroyTracksRequest.php
  - api/app/Http/Requests/ReorderTracksRequest.php
  - api/app/Http/Requests/StorePlaylistRequest.php
  - api/app/Http/Requests/UpdatePlaylistRequest.php
  - api/app/Http/Requests/PlaylistTracksRequest.php
  - api/app/Http/Requests/ReorderPlaylistTracksRequest.php
  - api/app/Http/Requests/UploadRequest.php
  - api/app/Http/Resources/TrackResource.php
  - api/app/Http/Resources/PlaylistResource.php
  - api/config/filesystems.php
  - api/config/liquidsoap.php
  - api/php/uploads.ini
  - api/app/Providers/AppServiceProvider.php
  - api/app/Models/Station.php
  - api/app/Observers/StationObserver.php
  - api/app/Observers/UserObserver.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/AutoDjScheduler.php
  - api/app/Services/AutoDjProgramme.php
  - api/bootstrap/app.php
  - api/database/migrations/2026_05_10_165153_create_tracks_table.php
  - api/database/migrations/2026_08_17_160000_add_kind_to_tracks_table.php
  - api/database/migrations/2026_08_18_234430_add_analysis_to_tracks_table.php
  - api/database/migrations/2026_09_20_134240_create_playlists_table.php
  - api/database/migrations/2026_09_20_134241_create_playlist_track_table.php
  - api/database/migrations/2026_09_20_134242_backfill_default_playlists.php
  - infra/native/nginx/gocast-api.conf
  - infra/native/php/99-gocast.ini
  - infra/native/systemd/gocast-queue.service
  - infra/native/docker-compose.native.yml
  - infra/native/env/api.env.example
  - api/.env.example
  - client/app/dashboard/library/page.tsx
  - client/app/dashboard/stations/[slug]/library/page.tsx
  - client/app/dashboard/stations/[slug]/library/LibraryView.tsx
  - client/app/dashboard/stations/[slug]/library/AllTracksView.tsx
  - client/app/dashboard/stations/[slug]/library/PlaylistView.tsx
  - client/app/dashboard/stations/[slug]/library/PlaylistRail.tsx
  - client/app/dashboard/stations/[slug]/library/TrackRow.tsx
  - client/app/dashboard/stations/[slug]/library/TrackPicker.tsx
  - client/app/dashboard/stations/[slug]/library/AddToPlaylistDialog.tsx
  - client/app/dashboard/stations/[slug]/library/FixTagsDialog.tsx
  - client/app/dashboard/stations/[slug]/jingles/page.tsx
  - client/app/dashboard/stations/[slug]/jingles/JinglesView.tsx
  - client/app/dashboard/stations/[slug]/jingles/loading.tsx
  - client/app/dashboard/stations/[slug]/library/AutoDjUpsell.tsx
  - client/app/dashboard/stations/[slug]/library/UploadProgressBar.tsx
  - client/app/dashboard/stations/[slug]/library/upload.ts
  - client/app/dashboard/stations/[slug]/library/loading.tsx
  - client/app/dashboard/stations/[slug]/library/useTrackUpload.ts
  - client/interfaces/Track.ts
  - client/interfaces/Playlist.ts
  - client/lib/listenerLibrary.ts
  - client/lib/queueStore.ts
  - client/lib/station-server.ts
  - client/components/dashboard/AppSidebar.tsx
  - client/contexts/AccountContext.tsx
  - client/components/dashboard/StationFormDialog.tsx
  - mobile/src/app/station/[slug]/library.tsx
  - mobile/src/lib/api.ts
  - mobile/src/lib/station.ts
  - mobile/src/lib/auth.tsx
  - client/app/dashboard/stations/[slug]/library/useLibrary.ts
  - client/components/dashboard/autodj/AutoDjSections.tsx
  - client/app/dashboard/stations/[slug]/library/load.ts
  - client/app/dashboard/stations/[slug]/library/LibrarySkeleton.tsx
  - client/app/dashboard/stations/[slug]/playlists/page.tsx
  - client/app/dashboard/stations/[slug]/playlists/loading.tsx
  - client/app/dashboard/stations/[slug]/library/LibraryToolbar.tsx
  - client/app/dashboard/stations/[slug]/library/PlaylistNameDialog.tsx
  - client/app/dashboard/stations/[slug]/jingles/JingleRuleDialog.tsx
  - client/app/dashboard/stations/[slug]/jingles/jingleRule.ts
  - client/interfaces/JingleList.ts
  - api/app/Http/Controllers/JingleListController.php
  - api/app/Http/Requests/JingleListRequest.php
  - api/app/Http/Resources/JingleListResource.php
  - api/app/Policies/JingleListPolicy.php
  - api/app/Models/JingleList.php
  - api/app/Jobs/MeasureTrackDuration.php
  - api/app/Console/Commands/MeasureTrackDurationsCommand.php
  - api/database/migrations/2026_10_05_120000_add_duration_measured_at_to_tracks_table.php
  - api/database/migrations/2026_10_05_130200_create_jingle_lists_table.php
  - client/hooks/useTrackPreview.ts
  - client/lib/playlistSwatches.ts
  - api/config/queue.php
fingerprint: 1c37d14331e0f9e5
---

# Library, uploads and playlists

A station's **library** is every audio file its owner uploaded: music tracks and jingles, in one directory, under one storage cap. **Playlists** are named, ordered subsets of the *music* tracks. **Jingle lists** hold the jingles, each jingle in exactly one list, each list with one rule for when it plays (the rule itself is decided by `AutoDjScheduler`/`JingleRotation`; see [AutoDJ](autodj.md)). AutoDJ plays a playlist (the default one, or whichever a slot names; see [Schedule](schedule.md) and [AutoDJ](autodj.md)), never the library as such.

The one thing people get wrong: **the library's order does not decide what plays.** `tracks.position` is only the "Recently added" order shown on the Library page. What airs is a playlist's `playlist_track.position` (sequential mode) or its shuffle deck (shuffle mode). A music track that is in no playlist never airs at all. The second thing: **uploading is a Pro action; viewing, editing, deleting and even creating playlists are not gated by the API.** The only real enforcement of "free plan gets no AutoDJ" is at the audio path (`AutoDjScheduler::next` returns null for a free owner).

## The upload pipeline

There is **no chunking, no resumable upload, no direct-to-storage upload and no import-from-URL.** One upload is one plain multipart `POST` that PHP buffers in full, and the file is written to the API host's local disk. The `s3` disk in `api/config/filesystems.php` is unused by tracks.

### Client side (web)

`client/app/dashboard/stations/[slug]/library/useTrackUpload.ts` + `upload.ts`:

1. Files are filtered by `isAudioFile`: `file.type` starts with `audio/` **or** the name matches `/\.(mp3|m4a|aac|flac|ogg|wav)$/i`. Everything else is silently dropped. Nothing left means the toast "No audio files in selection."
2. If the plan is locked (`useAutoDjLocked()`, true only when the plan is known and `autodj_enabled` is false), it toasts "AutoDJ isn't included in your plan yet." and sends nothing. An unknown plan counts as unlocked.
3. A second drop while one is in flight is ignored (`busy` ref).
4. `batchFiles` groups files into requests of at most **500 MB total and 30 files** (`MAX_BATCH_BYTES`, `MAX_BATCH_FILES`). One file larger than 500 MB still gets its own batch and is left to the server rule to refuse.
5. Batches go **sequentially**. Each is `POST /stations/{slug}/tracks` with multipart fields `files[]`, plus `kind=jingle` and (when the hook was given `jingleListId`) `jingle_list_id` for jingles, or `playlist_id` (music only, and only when a playlist is open; `null` means the default). Axios `onUploadProgress` drives the meter, throttled to 10 Hz.
6. After each batch the returned rows are handed to `onUploaded` (the list fills as it goes). If the response has a non-empty `errors` array the loop stops (a quota trip would repeat), and the first message is toasted. Otherwise "Added N track(s)."
7. The bar shows "Processing N files" once the bytes are up (the server is reading tags and committing).

The same hook serves the rotation ("Add tracks" button, or a drop anywhere on the list panel) and the Jingles page (each list card's **Add jingles** button or a drop on the card, sending that list's id; the empty-state card sends none). All post to the same endpoint; only `kind` and `jingle_list_id` differ.

### Server side

`POST /api/stations/{station:slug}/tracks` (`routes/api.php`; inside `auth:sanctum` + `verified`; middleware `throttle:uploads`, **20 requests per minute per user**, `AppServiceProvider`; the same `uploads` bucket also throttles `POST /upload/{type}`). Each *batch* is one request, so a very large drop can hit 20 batches a minute only on a very fast link.

`TrackController::store`:

1. `StoreTrackRequest` validates (see the table below).
2. `authorize('create', [Track::class, $station])`: station owner only (`TrackPolicy`).
3. `StationLifecycleService::assertAutoDjEnabled` throws `StationLifecycleException::autoDjUnavailable()` when `User::canUseAutoDj()` (plan `autodj_enabled`) is false. It renders as **403** `{message: "AutoDJ is not included in your plan. …", code: "autodj_not_available"}` (`bootstrap/app.php`). This applies to jingles too.
4. If `playlist_id` is given, it is looked up in this station's playlists (the request already proved it exists for the station). For `kind=jingle`, `TrackImporter::jingleListFor(station, jingle_list_id)` resolves the list once for the batch: the one named (validated `exists` in this station's `jingle_lists`), else the station's first list, else it **creates** a list called "Jingles" (model defaults: on, random pick, every 4 songs, all day). `jingle_list_id` is ignored for music.
5. Files are imported **one at a time** with `TrackImporter::import`. A `RuntimeException` (the quota, or an unreadable file size) is caught, recorded as `{index, message}`, and the loop **breaks**: earlier files in the batch stay committed. Any other exception is not caught and becomes a 500, again leaving earlier files committed.
6. Status: all ok = **201**; none ok = **422**; some ok = **207** (the response carries `data` and `errors`).
7. Created rows are loaded with `playlists:playlists.id` so `playlist_ids` is present in the response.

`TrackImporter::import`, per file:

1. Size from `UploadedFile::getSize()`. The station directory is `{LIQUIDSOAP_PLAYLISTS_DIR}/{slug}` (`PlaylistFileWriter::stationDir`; default `/var/gocast/playlists`), created if missing and `chmod 0777` (the Liquidsoap container runs as another UID).
2. Extension = lower-cased **client-supplied** original extension, default `mp3` when empty. The stored name is `{track ULID}.{ext}`, so the file name on disk is never user-controlled, but the extension is not restricted to the allowed formats (see Gaps).
3. In a DB transaction: `Station` row is locked (`lockForUpdate`), `ensureWithinQuota` compares `SUM(file_size_bytes)` over **all** the station's tracks (music and jingles) plus this file against `liquidsoap.station_storage_bytes` (default **3 GiB**, env `LIQUIDSOAP_STATION_STORAGE_BYTES`). Over the cap throws `Station storage limit reached (X used of Y).`
4. `UploadedFile::move` into the station dir, `chmod 0644`.
5. Tags are read by getID3 (`readTags`): title, artist from `comments`, duration from `playtime_seconds`. Errors are swallowed and give null tags, duration 0.
6. Title = tag title, else the title half of a filename split `Artist - Title` (only when the stem contains exactly one `" - "` and both halves are non-empty), else the filename stem, else `Untitled`. Artist = tag artist, else the filename-split artist, else null. The filename split never overrides real tags.
7. The row is saved with `position = max(position in this station and kind) + 1`.
8. For music only, the track is attached (appended) to the target playlist: the one named, else `station->defaultPlaylist`. This is inside the same transaction, so a track cannot commit without its membership. Jingles never join a playlist; they get `jingle_list_id` set on the row instead.
9. Any throwable inside the transaction deletes the file from disk and rethrows.
10. After commit: `AnalyzeTrack::dispatch` if `liquidsoap.analysis_enabled`; then a `track_uploaded` station event (title/artist/bytes copied in). Events are monitoring only. Nothing is pushed to the station's container: there is no playlist file any more (jingles included), and every track is read from the database when `NextTrackController` next hands one out.

### Limits

| Limit | Value | Where |
|---|---|---|
| Formats | `mimes:mp3,m4a,aac,flac,ogg,wav,mpga` (Laravel content-sniffed) | `StoreTrackRequest` |
| Per file | `max:307200` KB = 300 MB | `StoreTrackRequest` |
| Files per request | 1 to 30 | `StoreTrackRequest`, `max_file_uploads` in `api/php/uploads.ini` and `infra/native/php/99-gocast.ini` |
| Body per request | `post_max_size` 640M, `upload_max_filesize` 320M; nginx `client_max_body_size 640M`, `client_body_timeout 900s` (native) | `infra/native/nginx/gocast-api.conf`, php ini |
| Time per request | `max_input_time` and `max_execution_time` 900 s, `memory_limit` 512M | php ini |
| Storage per station | 3 GiB total, music and jingles combined | `config/liquidsoap.php` `station_storage_bytes` |
| Track count | no limit | none in code |
| Upload rate | 20 requests/min/user | `throttle:uploads` |
| Title / artist edit | 200 chars each | `UpdateTrackRequest` |

The default is 3 GiB, but `infra/native/env/api.env.example` ships `LIQUIDSOAP_STATION_STORAGE_BYTES=104857600` (100 MB) while `api/.env.example` ships 3221225472 (3 GiB); a native host that copies the example unchanged gets a 100 MB cap.

Plans do not vary any of these: there is no per-plan storage or track-count number. The only plan dimension is the boolean `autodj_enabled` (Free false, Pro true).

## Analysis: loudness, cue points, duration

Purpose: level tracks against each other, skip leading and trailing silence, **at playback time**, without modifying the file, and replace the upload's header length with the real, decoded one.

- `AnalyzeTrack` (queued, `tries = 2`, `$timeout` = `TrackAnalyzer::timeoutFor(duration) + 30`, dispatched with the track's duration) loads the track, runs `TrackAnalyzer::analyze` on `{stationDir}/{basename(path)}`, and writes with `saveQuietly` (so no observers, no container restarts): `loudness_lufs`, `true_peak_db`, `cue_in_seconds`, `cue_out_seconds`, `duration_seconds`, `duration_measured_at`, `analyzed_at`, `analysis_error`. The length is ffmpeg's decoded figure (`TrackAnalysis::decodedSeconds`, parsed from the last `time=` in its output, rounded to 3 dp); when there is one, it replaces the getID3 header figure, `duration_measured_at` is stamped, and the cue points are judged against it. No measurement keeps the header length and leaves `duration_measured_at` as it was. A missing track or station is a silent return. On failure it sets `analyzed_at` and `analysis_error` (a one-line reason, max 255 chars) and does **not** fail the job. Nothing is written to disk or pushed to the container.
- `TrackAnalyzer` runs one ffmpeg pass with `silencedetect=noise=<db>dB:d=<s>,loudnorm=print_format=json` and `-f null -`; the silence threshold and minimum length are `LIQUIDSOAP_ANALYSIS_SILENCE_DB` (default -50) and `LIQUIDSOAP_ANALYSIS_SILENCE_SECONDS` (default 0.25). Binary: `LIQUIDSOAP_ANALYSIS_FFMPEG` if set, otherwise `docker run --rm --network none --entrypoint ffmpeg -v <file>:/analysis-input:ro <liquidsoap image>`. Process timeout scales with the audio (`TrackAnalyzer::timeoutFor`): one eighth of the track's length, at least `LIQUIDSOAP_ANALYSIS_TIMEOUT` (default 120 s, floor 5), at most `MAX_TIMEOUT_SECONDS` (1500 s); the Redis queue's `retry_after` (`REDIS_QUEUE_RETRY_AFTER`, default 1800 s) must stay above that ceiling.
- Success is "parsed a finite `input_i`/`input_tp` from loudnorm's JSON", not the exit code. `"-inf"` strings or loudness at or below -70 LUFS count as failure (a silent file). Cue-in is the end of the first closed silence block that starts at or before 0.05 s; cue-out is the start of the last silence block that reaches the end of the decode (never closed, or its end within 0.25 s of the decoded duration). Mid-track silence is never cut.
- What is stored is raw measurement plus filtered cues. `TrackAnalysis::cuePoints` drops a cue-out within 0.05 s of the file end, and drops **both** cues if the remaining playable span would be under `LIQUIDSOAP_CUE_MIN_PLAYABLE` (5 s).
- The gain is **derived when the annotation is built**, not stored: `TrackAnalysis::amplifyDb` = target (`LIQUIDSOAP_LOUDNESS_TARGET`, -14 LUFS) minus loudness, capped so peak stays under `LIQUIDSOAP_LOUDNESS_CEILING` (-1 dBFS), capped at `LIQUIDSOAP_LOUDNESS_MAX_GAIN` (+12 dB, attenuation uncapped), null when under 0.1 dB. Changing the target relevels the library at the next track boundary with no re-analysis.
- `PlaylistFileWriter::annotateTrack` renders `annotate:` URIs: `jingle="true"` (jingles), `liq_cue_in`, `liq_cue_out`, `liq_amplify="X dB"` (skipped when `LIQUIDSOAP_APPLY_AMPLIFY` is false; cues stay), `duration` (3 dp, only when > 0), `title`, `artist` (if non-empty), `playlist` (music from the scheduler). Quotes and backslashes are escaped. The path is `/data/playlists/{basename(path)}` inside the container.
- Kill switches: `LIQUIDSOAP_ANALYSIS_ENABLED=false` stops new jobs but leaves stored measurements applied; `LIQUIDSOAP_APPLY_AMPLIFY=false` stops gain only.
- Backfill: `php artisan tracks:analyze [--station=slug] [--force] [--retry-failed] [--limit=N]` queues jobs in chunks of 200. Default selects `analyzed_at IS NULL`; `--retry-failed` also selects rows with `analysis_error`; `--force` selects everything. It refuses to run when analysis is disabled. **It is not in `routes/console.php`'s schedule**: manual only.
- **Duration.** `duration_seconds` starts as getID3's header figure (often wrong for VBR MP3s) and becomes the decoded length once analysis runs (above). `Track::airtimeSeconds()` is the on-air span, cue-in to cue-out (via `TrackAnalysis::cuePoints`, the same rule the annotation uses), and is **null until `duration_measured_at` is set**: the AutoDJ planner only times hard slot starts and jingle fillers around measured tracks (see [AutoDJ](autodj.md)). `TrackResource` exposes it as `airtime_seconds`.
- Length backfill for tracks analysed before the length was kept: `php artisan tracks:measure-durations [--station=slug] [--limit=0]` (`MeasureTrackDurationsCommand`) queues `MeasureTrackDuration` for every track with `duration_measured_at IS NULL` (chunks of 200, oldest first; `--limit` 0 = no limit). The job runs `TrackAnalyzer::measureDuration`, a plain decode (`-vn`, no filters, so far cheaper than `tracks:analyze --force`), and on success writes `duration_seconds` + `duration_measured_at` with `saveQuietly`; an undecodable file keeps its header length, unmarked, and only logs. Not scheduled: manual, run once after deploy.

## Data model

`tracks` (ULID id, `station_id` FK cascade): `kind` (`music` default, `jingle`; 16 chars), `path` (`{ulid}.{ext}`, relative to the station dir), `original_filename`, `title`, `artist` null, `duration_seconds` float default 0, `duration_measured_at` (null until the decoded length replaced the header's; added 2026-10-05 by a `hasColumn`-guarded migration), `jingle_list_id` (FK to `jingle_lists`, null on delete; set for jingles only), `file_size_bytes`, `position`, the six analysis columns, timestamps. Indexes `(station_id, position)`, `(station_id, kind, position)`, `analyzed_at`. Only `title` and `artist` are mass-assignable; every other write uses `forceFill`.

`playlists` (ULID id, `station_id` FK cascade): `name` (60), `is_default`, `order` (`sequential` | `shuffle`, default sequential), `cursor_position`, `deck` (json; both owned by `AutoDjScheduler`), `position` (display order), timestamps. Unique `(station_id, name)`. `Station::playlists()` orders default first, then `position`, then `created_at`.

`playlist_track` (composite PK `(playlist_id, track_id)`, both FK cascade): `position`, kept 1-based and gap-free per playlist. A track can be in any number of playlists.

`jingle_lists` (ULID id, `station_id` FK cascade; `JingleList`): `name` (60), `enabled`, `pick` (`random` | `in_order` | `single`, plus `pinned_track_id` FK null-on-delete), `frequency` (`minutes` | `songs` | `times`) with `every_minutes`, `every_songs`, `times` (json `HH:MM`) and `exact`, `days` (json, 0 = Sunday, null = every day), `from_time`/`to_time` (null = all day; `to <= from` runs past midnight), `position`, and rotation state written by the scheduler (`deck`, `cursor_position`, `songs_since`, `last_played_at`). `Station::jingleLists()` orders by `position`, then `created_at`; `JingleList::tracks()` is its `kind = jingle` tracks by `tracks.position`. The creating migration (`2026_10_05_130200`) gave every station that had jingles one "Jingles" list holding all of them, with the old `stations.jingle_*` rule copied (random pick); those four station columns still exist but nothing reads them.

Two independent position sequences exist and must not be confused: `tracks.position` (per station **and kind**, library order) and `playlist_track.position` (per playlist, **play order**).

Migration `2026_09_20_134242_backfill_default_playlists.php` `up()` does nothing when `stations.autodj_order` no longer exists; otherwise, for each station that has no default playlist yet, it creates `Main rotation` with the old `autodj_order`, cursor and deck and puts every music track in it at its old `tracks.position`. Its `down()` copies each default playlist's order/cursor/deck back to `stations.autodj_*` (only if that column exists) and then deletes **all** playlists and pivot rows.

## Default playlist

- `Station::booted` `created` hook force-creates `Main rotation` (`Playlist::DEFAULT_NAME`), `is_default = true`, sequential, position 0 for every station, so factories, seeders and the admin panel get one too.
- It is what AutoDJ plays when no slot is active, and where an upload lands when no `playlist_id` is sent.
- It cannot be deleted (`PlaylistController::destroy` returns **409** "The default playlist cannot be deleted. Make another playlist the default first."). It **can** be renamed and switched to shuffle.
- `PATCH /playlists/{id}` with `is_default` (validated `accepted`, so only `true`) moves the default in one transaction: all other defaults are cleared, then this one is set. There is no way to send `is_default: false`.
- A playlist that is empty makes the station play silence when it is the default (the UI says "empty, the station goes on air to silence"); an empty scheduled playlist falls through to the default (see [Schedule](schedule.md)).

## Ordering

- **Library list** (`GET /tracks`): `Station::tracks()` orders by `position`. On the web, All tracks sorts client-side: "Recently added" (`position` ascending, so oldest upload first despite the name), Title, Longest. No drag handles: the library order changes nothing that plays.
- **Playlist members**: `Playlist::tracks()` orders by pivot `position`. Web drag-reorder is enabled only when the sort is "Play order", the search is empty, all rows are shown and the playlist is `sequential` (`canReorder` in `PlaylistView`). In shuffle mode the manual order is ignored by the scheduler and the handles are hidden. `PATCH /playlists/{id}/tracks/reorder {ids}` sends the **full** ordered list.
- **Reorder semantics** (both `PlaylistTracks::reorder` and `TrackImporter::reorder`): ids in the given order take positions 1..n, members not mentioned keep their relative order at the tail, unknown ids are skipped. Idempotent. `ReorderPlaylistTracksRequest` requires `ids` non-empty, each a ULID, distinct and already a member.
- `TrackController::reorder` (`PATCH /stations/{slug}/tracks/reorder`) reorders the **library** for one kind (`ReorderTracksRequest`: `ids` non-empty, each a ULID of that kind in this station; no `distinct`, no maximum). Nothing in the web or mobile client calls it (grep of `client/` and `mobile/src`): it is API surface with tests but no caller, and it does not affect playback.
- Jingle order matters only to a list whose pick is **in order**: `JingleRotation` walks `JingleList::tracks()` (by `tracks.position`, the jingle-kind library sequence) after its `cursor_position`, wrapping. The Jingles page has no reorder control, so in practice that is upload order. Random lists use their own shuffle deck; see [AutoDJ](autodj.md).

## Deletion

- **Single** `DELETE /api/tracks/{track}` (`TrackPolicy::delete`, owner only; not plan-gated): `TrackImporter::destroy` unlinks the file, records the details, `PlaylistTracks::detachEverywhere` (renumbers every playlist it was in), deletes the row, decrements later `tracks.position` **of the same kind**, records `track_deleted`. Returns 204. The file is unlinked *before* the row is deleted and outside a transaction.
- **Bulk** `DELETE /api/stations/{slug}/tracks {track_ids: [...]}` (`DestroyTracksRequest`: 1 to 2000 distinct ULIDs, each must exist **in this station**; **no `kind` restriction**, so jingle ids are accepted): `TrackImporter::destroyMany` does the DB work in one transaction (detach everywhere, delete rows, `resequence` each affected kind), unlinks the files **after** commit, then one `track_deleted` event per file. Answers **200 with the fresh music library** (`data`, `meta` incl. `deleted` count), not 204.
- **Remove from playlist** `DELETE /api/playlists/{playlist}/tracks/{track}`: removes only the membership (file and library row stay), compacts positions. A track that exists but is not a member is a **404** (stale client).
- **Delete playlist** `DELETE /api/playlists/{playlist}`: not allowed for the default (409). Members go via the pivot cascade, tracks stay in the library, and `autodj_slots` that reference it cascade-delete (so scheduled slots disappear silently; the web confirm dialog counts them from `station.autodj_slots`).
- **Downgrade safety**: listing, editing, deleting are never plan-gated, so a downgraded owner keeps and can manage their files. Files are also removed when a station is force-deleted (`StationObserver::forceDeleted` wipes the directory; soft-delete keeps them) and when a user is force-deleted (`UserObserver::deleting` force-deletes each station first, trashed ones included).
- Deleting a track that is in a running playlist needs no reload for music: `AutoDjScheduler::next` queries the database at every boundary. In shuffle mode dead ids in the stored deck are passed over by `peekShuffled` and swept off by `consumeShuffled`; a deck emptied by deletions is re-dealt. Deleting a jingle needs nothing either: `JingleRotation` reads the list's clips at each break, and a stale deck entry is skipped. In sequential mode `cursor_position` is a pivot `position`, and the next track is the first with `position > cursor` (wrapping to the top), so because membership removal renumbers positions, deleting or removing a member **before** the cursor shifts later tracks down and the next boundary skips one track (see Gaps).

## Endpoints

All under `/api`, `auth:sanctum`, `verified`. Authorisation is "you own the station" everywhere (`TrackPolicy`, `PlaylistPolicy`; there is no admin or collaborator path here).

| Method and path | Controller | Notes |
|---|---|---|
| `GET /stations/{slug}/tracks?kind=music\|jingle` | `TrackController::index` | Default `kind=music`. Returns `data` plus `meta {kind, storage_used_bytes, storage_cap_bytes}`. Usage is the whole station's sum, not per kind. Music rows carry `playlist_ids` (one extra query); jingles do not. Whole list, no pagination. |
| `POST /stations/{slug}/tracks` | `store` | Multipart, see above. Throttled, Pro. |
| `PATCH /tracks/{track}` | `update` | `title`, `artist`, and `jingle_list_id` (moves a jingle to another list of the same station; `prohibited` for music). Nothing is pushed to the container. Not plan-gated. |
| `DELETE /tracks/{track}` | `destroy` | 204. |
| `DELETE /stations/{slug}/tracks` | `destroyMany` | 200, fresh library. |
| `PATCH /stations/{slug}/tracks/reorder` | `reorder` | Library order per kind; no caller. |
| `GET /stations/{slug}/playlists` | `PlaylistController::index` | With `track_count` and `duration_seconds` aggregates. |
| `POST /stations/{slug}/playlists` | `store` | `name` required, max 60, unique per station; `order` optional. `position` = max + 1. **201.** Not plan-gated. |
| `PATCH /playlists/{playlist}` | `update` | `name`, `order`, `is_default`. Not plan-gated. Never touches the `stations` row, so no container restart. |
| `DELETE /playlists/{playlist}` | `destroy` | 204, or 409 for the default. |
| `GET /playlists/{playlist}/tracks` | `PlaylistTrackController::index` | Ordered members; `position` is the position **in this playlist** (`whenPivotLoaded`). |
| `PUT /playlists/{playlist}/tracks` | `replace` | `track_ids` (present, array, max 2000, distinct, each an existing music track of this station, else 422): the whole set, in order. `[]` empties it. |
| `POST /playlists/{playlist}/tracks` | `store` | Appends; already-members are ignored. Ids that are not this station's music tracks are rejected by `PlaylistTracksRequest` with **422** (the service would also drop them, but validation runs first). |
| `PATCH /playlists/{playlist}/tracks/reorder` | `reorder` | `ids[]`. |
| `DELETE /playlists/{playlist}/tracks/{track}` | `destroy` | 204 or 404. |
| `GET /stations/{slug}/jingle-lists` | `JingleListController::index` | The station's lists (`JingleListResource`: rule fields, times trimmed to `HH:MM`, `last_played_at`). |
| `POST /stations/{slug}/jingle-lists` | `store` | `name` required (60); rule fields optional, defaulting to random, every 4 songs, all day. `position` = max + 1. **201.** |
| `PATCH /jingle-lists/{jingleList}` | `update` | Any of `name`, `enabled`, `pick`, `pinned_track_id`, `frequency`, `every_minutes` (1–720), `every_songs` (1–50), `times` (≤ 48, `H:i`, distinct), `exact`, `days`, `from_time`, `to_time`. The rule is validated whole, as it will be stored (`JingleListRequest::ruleAfterSave`); fields the chosen frequency does not use are nulled; times or days need a station timezone (422 otherwise). Saving new set times resets `last_played_at` to now, so a time that just passed does not fire. |
| `DELETE /jingle-lists/{jingleList}` | `destroy` | 204. **Deletes the list's jingles too** (`TrackImporter::destroyMany`, files and rows). |
| `POST /upload/{type}` (`images` or `sounds`) | `UploadController` | **Not the library.** Stores to the `public` disk under `uploads/{type}`, returns `{data:{url}}`, 201, throttled. Images jpg/jpeg/png/webp/gif up to 5 MB; `sounds` mp3/wav/ogg/flac/aac up to 50 MB. Only `images` has a caller (station artwork in `StationFormDialog.tsx`); `sounds` is unused. |

Every playlist-write endpoint answers with the playlist's full ordered member list so clients replace state rather than patch it. `PlaylistTracks` validates against the station's **music** tracks only (`PlaylistTracksRequest` requires `kind = music` and same station), takes a row lock on the playlist, and in shuffle mode `attach`/`replace` deal newly added ids into the remaining deck via `AutoDjScheduler::dealIn` so an upload airs this cycle.

`TrackResource` fields: `id`, `station_id`, `kind`, `jingle_list_id`, `title`, `artist`, `duration_seconds`, `airtime_seconds` (cue-in to cue-out once measured, else null), `file_size_bytes`, `position` (pivot position when loaded through a playlist, else library position), `playlist_ids` (only when the relation is loaded), `original_filename`, `created_at`. The other analysis columns, `duration_measured_at` and `path` are **not** exposed. `PlaylistResource`: `id`, `station_id`, `name`, `is_default`, `order`, `position`, `track_count`, `duration_seconds` (only when the aggregates were loaded), timestamps. The cursor and deck are not exposed.

## Plan gating, precisely

| Action | Gated by plan? |
|---|---|
| Upload music or a jingle | Yes: API 403 `autodj_not_available`; web/mobile disable it |
| Create, edit, switch on/off, delete jingle lists | **No** at the API (`JingleListPolicy` checks ownership only). The Jingles page hides New list and the per-card Add jingles, and disables the switches and Edit rule, when locked. |
| Create / rename / reorder / delete playlists, add and remove members, shuffle | **No** at the API. The web UI disables New playlist, the shuffle switch and the multi-select Add to playlist when locked ("Add from library" inside a playlist, rename, make default and drag reorder stay enabled); a free client can still call every endpoint. |
| List, edit tags, delete tracks | No |
| Playback | Yes: `AutoDjScheduler::next` returns null for a plan without AutoDJ, so nothing plays whatever is arranged |

## Surfaces

### Web dashboard (`/dashboard/stations/{slug}/library` and `/playlists`)

AutoDJ is a **group** in the sidebar, not a page: the heading "AutoDJ" (with the ON lamp and the PRO tag) links to Library, and **Library**, **Playlists**, **Jingles** and **Schedule** sit indented under it (`AUTODJ_GROUP` / `AUTODJ_ITEMS` in `client/lib/dashboardNav.ts`). Below 1024px, where the sidebar is a drawer, each of the four pages opens with `AutoDjSections` (a row of links between them), and the phone tab bar's single AutoDJ tab opens Library and stays lit on all four. `/dashboard/library` is only a redirect to the user's station (`getMyStation()`) or `/dashboard`.

Library and Playlists are two routes over one view: both pages call `loadLibrary` (`library/load.ts`: the station, `GET /tracks` (music) and `GET /playlists` in parallel; 404 or 403 becomes `notFound()`, a 401 goes to `/auth/login?expired=1`) and render `LibraryView page="library" | "playlists"`. All state and every edit live in `useLibrary(page, …)` (applied optimistically to both the library list and the per-playlist member cache, refetched on failure); `LibraryView` lays it out and owns which dialog is open; the child views are presentational.

- **Header** (`PageHeader` "Library" with a help link to `upload-your-music`, or "Playlists" with one to `playlists-and-the-rotation`; a PRO tag when locked): **Add tracks** (uploads join the open playlist, else the default). Then a mono, uppercased stats line: Library "N tracks · runtime · X of Y" (storage), Playlists "N playlists · from N tracks"; "plays only on Pro" when locked.
- **No on/off control on the AutoDJ pages** (since 2026-10-05): the old `AutoDjStrip` (a switch labelled AutoDJ that actually stopped the whole station) was removed from all four. What is on air, Start AutoDJ and Add tracks are the status band's; turning the station off is the overview's.
- **Locked (Free) state**: `AutoDjUpsell` (PRO tag, "Keep {station} on air when you're not", Request Pro), then "Preview of your library" / "Preview of the playlist editor": the list stays browsable, no Add tracks button; Jingles in the ⋯ menu still links to the Jingles page, with a PRO tag; New playlist is disabled. A drop on the card still runs `upload()` and gets the "isn't included in your plan" toast.
- **Library page**: the All tracks table card, full width.
- **Playlists page**: the rail (`PlaylistRail`: every playlist with its schedule swatch, the default marked, then "New playlist" via `PlaylistNameDialog`, 60 chars, server 422 duplicate-name error shown inline) beside the open playlist. A column from `md`, a scrolling chip row on a phone. Opens on the default playlist.
- **The table card** (the whole card is the drop target; files dropped anywhere upload into what is open). Toolbar (`LibraryToolbar`): an inset search field ("N found"), one sort (`ds/Select`), and ⋯ (Jingles, a link to the Jingles page; "Fix artist tags" with a count when any track in view has no artist). Below it: the upload progress, a thin storage bar (red at 95 %, violet otherwise), and the "N tracks have no artist. Listeners see 'Unknown artist'." note (Fix tags / Dismiss). Rows (`TrackRow`, one grid for both views): select or drag handle, #, title + artist, playlist chips (library; the amber "Not in a playlist" tag when none) or date added (playlist), that column hidden below `md`, where the library view's chips move under the title instead, length, actions. Hovering or focusing a row turns the # into a preview button (`useTrackPreview`, one `Audio` per list) that plays `GET /tracks/{id}/audio`, an owner-only, range-capable file response (`TrackController::audio`, `Cache-Control: private`). The now-playing row is marked (`now_playing` matched by **title + artist**, only when `source === "autodj"`; duplicate pairs match the first row). `LibraryFooter` shows what is shown and "Show all N" past 50 rows.
- **All tracks** (`AllTracksView`, sorts Recently added / Title / Longest): per-row edit and delete, multi-select with "Add to playlist" (`AddToPlaylistDialog`, one `POST /playlists/{id}/tracks`) and bulk delete (confirm, then optimistic removal, then the server library replaces state and playlists are refetched). A track in no playlist says so and the footer counts them. Clicking a row's body toggles its selection.
- **Playlist view** (`PlaylistView`, sorts Play order / Title / Longest): the playlist's name with "Plays when nothing's scheduled" on the default; members loaded on first open and cached; drag reorder (only in Play order, and not while shuffled: "shuffle ignores manual order — switch it off to reorder"); per-row edit and "Remove from playlist"; ⋯ adds Shuffle (a checkbox item), Add from library (`TrackPicker`, candidates = library minus members), Rename, Make default, Delete playlist.
- **Fix tags** (`FixTagsDialog`): tracks with no artist in the current view; saves one `PATCH /tracks/{id}` per row, sequentially, tolerating partial failure.
- **Jingles page** (`/dashboard/stations/{slug}/jingles`, `jingles/page.tsx` + `JinglesView`; the AutoDJ section between Playlists and Schedule; the Library/Playlists ⋯ menu's "Jingles" item links here): server-fetches the station, `GET /tracks?kind=jingle` and `GET /jingle-lists` in parallel (jingles are `tracks` rows with `kind = 'jingle'` and a `jingle_list_id`). `PageHeader` "Jingles" with **New list**, a stats line (N lists · N jingles · storage) and storage bar, the upsell on Free, then **one card per list** (`JingleListCard`): name, an "Off" tag when switched off, an on/off `Switch` (`PATCH enabled`, optimistic), a ⋯ menu (Edit rule, Rename, Delete list — the confirm says the list's jingles are deleted with it), the rule as one sentence (`jingleRule.ts` `ruleSentence`, e.g. "A random jingle every 4 songs, 07:00–10:00 on weekdays.") with an **Edit rule** button, a "This list has no jingles yet, so nothing plays from it." warning for an empty switched-on list, then the clips (title, file name, header length, "Plays" on the pinned clip of an always-one list; ⋯ with **Move to** another list (`PATCH /tracks/{id}` `jingle_list_id`) and Delete jingle), and a footer with **Add jingles**; the whole card is a drop target that uploads into that list. With no lists, `FirstList` is a drop zone whose uploads create the "Jingles" list server-side (the view refetches to show it), plus "Name a list first". `ListNameDialog` creates or renames (`POST /jingle-lists` / `PATCH name`). `JingleRuleDialog` edits the rule as four questions with the sentence live in the description: **Which jingle** (Random / In order / Always one + a clip select), **How often** (Songs: 1–20; Minutes: 5 min–4 h; Set times: chips, Add time, Every hour, Clear), **Exactly on time** (a `SwitchRow`, set times only: fade the song so the jingle starts on the dot, vs. the first break after the time), and **When** (Any time / Some days or hours: `DayToggle` + "Only between certain hours" with From/To, "To (next day)" past midnight). Rules using times or days need a station timezone: a warning `Notice` links to Settings and Save is disabled. Save sends one `PATCH` ("Rule saved. It applies from the next break.").
- Footnotes: Library/Playlists "Drop MP3, M4A, AAC, FLAC, OGG or WAV files anywhere on the list, up to 300 MB each…" ("On Pro, drop…" when locked), ending with a `HelpLink` to `upload-your-music`; Jingles "Drop … files on a list, up to 300 MB each. Jingles share your storage with your music. Only one jingle plays per break; if two lists are due at once, set times go first and the other waits for the next break."
- `loading.tsx` on each route draws the same layout as skeletons (`LibrarySkeleton` for Library/Playlists; the Jingles one is its own).

### Mobile (`mobile/src/app/station/[slug]/library.tsx`)

The Library tab: storage card, then one collapsible card per playlist (default first, then `position`), fetching members on open via `GET /playlists/{id}/tracks`, 50 rows then "Show N more". **Read and delete only, plus upload**: no playlist create/rename/reorder/shuffle, no tag editing, no add-to-playlist.

- **Upload** ("+ Add from phone", hidden when `useAutoDjLocked()`): `expo-document-picker` (`audio/*`, multiple, copied to cache). Files are moved into a staging directory under their original name (the API titles untagged tracks from the filename), then uploaded **one file per request** as `files[]` via `apiUpload`, no `kind` and no `playlist_id`, so everything lands in the default playlist. Progress is "Uploading i of n"; a body `errors` entry stops the batch ("Added N, then stopped: ..."). There is no client-side format or size filter; the server's rules decide. `expo-fetch` rejects React Native `{uri,name,type}` parts, hence the `File` blob.
- **Delete**: long-press a row to enter select mode, tick more across playlists, confirm sheet, `DELETE /stations/{slug}/tracks {track_ids}`, then reload.
- **Locked (free)**: a Pro note; the list is visible; no upload button. Deleting stays available. With an empty library the tab shows "No music yet" instead of playlist cards; the storage figure turns to the live colour at 95 percent.
- `apiUpload` (`mobile/src/lib/api.ts`) returns 2xx and 207 bodies and throws `ApiError` otherwise using `body.message`.

### Not part of this feature despite the names

- `client/lib/listenerLibrary.ts` is the **listener's** saved-stations and history, in `localStorage` (`gocast:saved-stations:v1` capped at 50, `gocast:history:v1` capped at 8). Used by the homepage `ListenerLibrary` and `PlayerView`. Nothing to do with tracks.
- `client/lib/queueStore.ts` is the **web studio's** local queue: IndexedDB database `gocast` v4 (stores `queue`, `playback` and `order`, all scoped by station slug), keeps `File` objects and the playback offset so a refresh keeps the queue; ordered by the station's `order` record (each track's saved `position` is the fallback for older queues). It is separate from the server library; see [Web studio](broadcasting-web-studio.md).

## Gaps and traps

1. **Web toast for a first-file quota failure is broken.** When no file in a batch lands, the API answers 422 with `errors: [{index, message}]` (an array of objects). Axios throws, and `uploadErrorMessage` (`upload.ts`) does `Object.values(body.errors).flat()[0]`, which returns the `{index, message}` **object**, not a string; the `?? "Upload failed"` fallback never applies. The comment above the function says the quota comes back as a plain message, which is wrong. Not runtime-verified. Partial success (207) is handled correctly.
2. **Mobile never shows jingles.** The tab calls `GET /tracks` with no `kind`, which defaults to music, then builds a "Jingles & IDs" group from `all.filter(t => t.kind === 'jingle')`, which is therefore always empty. The group is dead code. Mobile also cannot upload jingles.
3. **Mobile 422 message.** `apiUpload` throws on 422 and reads `body.message`; the all-failed quota body has no `message`, so the user sees "Upload failed (422)" instead of the storage message.
4. **Playlists are not plan-gated at the API.** A free owner can create playlists and edit membership by calling the API; only the UI locks it. Harmless to the audio (playback is gated) but the comment in `PlaylistController` presents it as deliberate.
5. **Bulk delete accepts jingle ids** (`DestroyTracksRequest` only checks the station), yet always answers with the *music* library. Nothing in the clients sends jingle ids.
6. **A jingle list's delete takes its files with it.** `DELETE /jingle-lists/{id}` runs `destroyMany` over its clips; there is no "move them first" option at the API (the page's confirm states the count). Deleting the last list leaves jingle uploads creating a fresh "Jingles" list.
7. **Extension comes from the client filename, type from content.** `mimes:` sniffs content, but the stored extension is whatever the client named it (default `mp3`), so a WAV named `.mp3` is stored as `.mp3`. The extension is otherwise unrestricted: `mimes:` validates the sniffed type, not the client name, so a real MP3 named `x.php` is stored as `{ulid}.php` in the playlists dir. Liquidsoap normally decodes by content, but this is untested. `mpga` is accepted by the server but is not in the web `AUDIO_EXTENSIONS`, so a `.mpga` file with no `audio/*` type is filtered out client-side.
8. **Analysis timeouts are per job now.** `AnalyzeTrack::$timeout` (scaled with the track, up to 1530 s) overrides the native worker's `queue:work --timeout=60` (`infra/native/systemd/gocast-queue.service`), and `retry_after` was raised to 1800 s so a second worker doesn't pick up a long mix still being decoded. Raise `MAX_TIMEOUT_SECONDS` and `retry_after` together. The unit also passes `--tries=3`, overridden by the job's `$tries = 2`. The repo contains no other worker definition (no API Dockerfile or compose file; `infra/native/` is the only deploy kit).
9. **Analysis borrows the Liquidsoap image via `docker run`** when no local ffmpeg is configured. In the native kit the worker sets `DOCKER_HOST` to the `docker-proxy` (`tecnativa/docker-socket-proxy`, `CONTAINERS`, `NETWORKS`, `IMAGES`, `POST` on, `EXEC` off), and the API runs on the host, so the `-v` path is a real host path. Not runtime-verified: it needs the `docker` CLI on the worker host and the Liquidsoap image present locally. A containerised API would break the `-v` path (no such deploy exists in the repo).
10. **Analysis and backfill are manual/queued only.** `tracks:analyze` is not scheduled. `analyzed_at` is set on failure too, so a failed track is skipped forever unless `--retry-failed`.
11. **Unmeasured tracks are invisible to hard-start planning.** Until analysis (or `tracks:measure-durations`) stamps `duration_measured_at`, `airtime_seconds` is null and the planner will not fit-pick the track or use it as a jingle filler; it is still played, timed by its header length. A file getID3 cannot read and ffmpeg cannot decode keeps `duration_seconds = 0`: no `duration` annotation and "—" in the UI.
12. **Unlink is not transactional in `destroy`.** The file is deleted before the DB row; a failure between them leaves a row pointing at nothing (bulk delete deliberately orders it the other way). Bulk delete can only leave an orphan file if an `unlink` itself fails after commit.
13. **Now-playing highlight and up-next match by title + artist**, so two tracks with identical tags light up the wrong row. No track id travels through `now_playing`.
14. **"Recently added" sorts ascending by `position`**, so the oldest upload is first. Deleting compacts positions so this stays a strict upload order, but the label suggests newest first.
15. **`TrackController::reorder` and `UploadController` `sounds`** have no callers in web or mobile. `reorder` is documented in the controller as "library order only".
16. **Delete-playlist cascades scheduled slots silently at the API.** The web confirm warns; the mobile app has no playlist deletion.
17. **Limits are single-request only.** No resumable upload: a dropped connection loses the batch in flight (earlier batches stay). A 300 MB file at slow uplink depends on the 900 s PHP and nginx timeouts (native config); `api/php/uploads.ini` is only referenced by comments (no FrankenPHP or Docker config for the API exists in the repo), so the native nginx and php-fpm settings are the only ones that apply.
18. **Three copies of the size constants** (`api/php/uploads.ini`, `infra/native/php/99-gocast.ini`, `MAX_BATCH_BYTES` in `upload.ts`) plus the `max:307200` rule and the "up to 300 MB" copy in `LibraryView`. They must be changed together.
19. **Free-plan uploaders are told twice.** The web disables Add tracks, but a drag-drop on the list still toasts; the API 403 exists as the backstop.
20. **The storage cap counts only DB rows** (`SUM(file_size_bytes)`), not bytes on disk: a file left behind by a failed unlink or a crashed request does not count toward it, and nothing sweeps orphan files.
21. **Sequential cursor skips a track after an earlier member is removed.** `playlists.cursor_position` stores a pivot `position`; `PlaylistTracks::removeMember` (used by delete and remove-from-playlist) decrements later positions but never adjusts the cursor, and neither `reorder` nor `replace` does. Removing a member ahead of the cursor makes the next `position > cursor` lookup jump over one track; reordering can repeat or jump. Derived from `AutoDjScheduler::peekSequential`/`consumeSequential` and `PlaylistTracks`, not runtime-verified.

## Tests

`api/tests/Feature/TrackControllerTest.php` (upload, quota, kinds, auth, reorder, bulk delete), `PlaylistControllerTest.php` (playlist CRUD, membership, default rules), `TrackAnalysisTest.php` and `TrackAnalyzerTest.php` (gain maths, cue parsing), `TrackAnnotationTest.php` (annotation rendering), `PlaylistFileWriterTest.php`, `TrackImporterFilenameTest.php` (artist/title split), `StationEventTrackLogTest.php`, `PlaylistBackfillMigrationTest.php`, `NextTrackControllerTest.php` (the audio-side reader), `JingleListControllerTest.php` (list CRUD, upload into a list, moving a jingle), `TrackDurationTest.php` (decoded length, airtime, the backfill command), and `JingleRulesTest.php` / `AutoDjHardStartTest.php` (the playback side). `jingles/jingleRule.test.ts` covers the rule sentence. No tests were run for this doc. No front-end or mobile tests cover the library; `AnalyzeTrack` and the `tracks:analyze` command are only exercised indirectly.

## History

- Library and jingles came first; `kind` was added 2026-08-17 (`add_kind_to_tracks_table`), analysis columns 2026-08-18.
- Playlists, the default playlist and the per-playlist cursor/deck landed 2026-09-20 with AutoDJ scheduling (see [Schedule](schedule.md), [AutoDJ](autodj.md), and `docs/AUTODJ-SCHEDULING-HANDOFF.md`).
- 2026-10-05: jingle lists with per-list rules replaced the single station-wide jingle setting and `jingles.m3u`; analysis now keeps the decoded length (`duration_measured_at`, `airtime_seconds`, `tracks:measure-durations`).
- Bulk delete and multi-select, the upload batching and progress meter, and the mobile Library tab are more recent and uncommitted or lightly documented.
