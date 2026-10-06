---
feature: Library, uploads and playlists
verified: 2026-09-29 against ea570df plus uncommitted work
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
  - client/app/dashboard/stations/[slug]/library/JinglesDialog.tsx
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
fingerprint: 56948f7812a6fdbb
---

# Library, uploads and playlists

A station's **library** is every audio file its owner uploaded: music tracks and jingles, in one directory, under one storage cap. **Playlists** are named, ordered subsets of the *music* tracks. AutoDJ plays a playlist (the default one, or whichever a slot names; see [Schedule](schedule.md) and [AutoDJ](autodj.md)), never the library as such.

The one thing people get wrong: **the library's order does not decide what plays.** `tracks.position` is only the "Recently added" order shown on the All tracks list. What airs is a playlist's `playlist_track.position` (sequential mode) or its shuffle deck (shuffle mode). A music track that is in no playlist never airs at all. The second thing: **uploading is a Pro action; viewing, editing, deleting and even creating playlists are not gated by the API.** The only real enforcement of "free plan gets no AutoDJ" is at the audio path (`AutoDjScheduler::next` returns null for a free owner).

## The upload pipeline

There is **no chunking, no resumable upload, no direct-to-storage upload and no import-from-URL.** One upload is one plain multipart `POST` that PHP buffers in full, and the file is written to the API host's local disk. The `s3` disk in `api/config/filesystems.php` is unused by tracks.

### Client side (web)

`client/app/dashboard/stations/[slug]/library/useTrackUpload.ts` + `upload.ts`:

1. Files are filtered by `isAudioFile`: `file.type` starts with `audio/` **or** the name matches `/\.(mp3|m4a|aac|flac|ogg|wav)$/i`. Everything else is silently dropped. Nothing left means the toast "No audio files in selection."
2. If the plan is locked (`useAutoDjLocked()`, true only when the plan is known and `autodj_enabled` is false), it toasts "AutoDJ isn't included in your plan yet." and sends nothing. An unknown plan counts as unlocked.
3. A second drop while one is in flight is ignored (`busy` ref).
4. `batchFiles` groups files into requests of at most **500 MB total and 30 files** (`MAX_BATCH_BYTES`, `MAX_BATCH_FILES`). One file larger than 500 MB still gets its own batch and is left to the server rule to refuse.
5. Batches go **sequentially**. Each is `POST /stations/{slug}/tracks` with multipart fields `files[]`, plus `kind=jingle` for jingles, or `playlist_id` (music only, and only when a playlist is open; `null` means the default). Axios `onUploadProgress` drives the meter, throttled to 10 Hz.
6. After each batch the returned rows are handed to `onUploaded` (the list fills as it goes). If the response has a non-empty `errors` array the loop stops (a quota trip would repeat), and the first message is toasted. Otherwise "Added N track(s)."
7. The bar shows "Processing N files" once the bytes are up (the server is reading tags and committing).

The same hook serves the rotation ("Add tracks" button, or a drop anywhere on the list panel) and the Jingles dialog (Browse files, or a drop on its zone). Both post to the same endpoint; only `kind` differs.

### Server side

`POST /api/stations/{station:slug}/tracks` (`routes/api.php`; inside `auth:sanctum` + `verified`; middleware `throttle:uploads`, **20 requests per minute per user**, `AppServiceProvider`; the same `uploads` bucket also throttles `POST /upload/{type}`). Each *batch* is one request, so a very large drop can hit 20 batches a minute only on a very fast link.

`TrackController::store`:

1. `StoreTrackRequest` validates (see the table below).
2. `authorize('create', [Track::class, $station])`: station owner only (`TrackPolicy`).
3. `StationLifecycleService::assertAutoDjEnabled` throws `StationLifecycleException::autoDjUnavailable()` when `User::canUseAutoDj()` (plan `autodj_enabled`) is false. It renders as **403** `{message: "AutoDJ is not included in your plan. …", code: "autodj_not_available"}` (`bootstrap/app.php`). This applies to jingles too.
4. If `playlist_id` is given, it is looked up in this station's playlists (the request already proved it exists for the station).
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
8. For music only, the track is attached (appended) to the target playlist: the one named, else `station->defaultPlaylist`. This is inside the same transaction, so a track cannot commit without its membership. Jingles never join a playlist.
9. Any throwable inside the transaction deletes the file from disk and rethrows.
10. After commit: `AnalyzeTrack::dispatch` if `liquidsoap.analysis_enabled`; then a `track_uploaded` station event (title/artist/bytes copied in). Events are monitoring only.

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

Purpose: level tracks against each other and skip leading and trailing silence, **at playback time**, without modifying the file.

- `AnalyzeTrack` (queued, `tries = 2`, no `$timeout`) loads the track, runs `TrackAnalyzer::analyze` on `{stationDir}/{basename(path)}`, and writes with `saveQuietly` (so no observers, no container restarts): `loudness_lufs`, `true_peak_db`, `cue_in_seconds`, `cue_out_seconds`, `analyzed_at`, `analysis_error`. A missing track or station is a silent return. On failure it sets `analyzed_at` and `analysis_error` (a one-line reason, max 255 chars) and does **not** fail the job. New annotations reach air at the track's next `next-track` answer; nothing is rewritten.
- `TrackAnalyzer` runs one ffmpeg pass with `silencedetect=noise=<db>dB:d=<s>,loudnorm=print_format=json` and `-f null -`; the silence threshold and minimum length are `LIQUIDSOAP_ANALYSIS_SILENCE_DB` (default -50) and `LIQUIDSOAP_ANALYSIS_SILENCE_SECONDS` (default 0.25). Binary: `LIQUIDSOAP_ANALYSIS_FFMPEG` if set, otherwise `docker run --rm --network none --entrypoint ffmpeg -v <file>:/analysis-input:ro <liquidsoap image>`. Process timeout `LIQUIDSOAP_ANALYSIS_TIMEOUT` (default 120 s, floor 5).
- Success is "parsed a finite `input_i`/`input_tp` from loudnorm's JSON", not the exit code. `"-inf"` strings or loudness at or below -70 LUFS count as failure (a silent file). Cue-in is the end of the first closed silence block that starts at or before 0.05 s; cue-out is the start of the last silence block that reaches the end of the decode (never closed, or its end within 0.25 s of the decoded duration). Mid-track silence is never cut.
- What is stored is raw measurement plus filtered cues. `TrackAnalysis::cuePoints` drops a cue-out within 0.05 s of the file end, and drops **both** cues if the remaining playable span would be under `LIQUIDSOAP_CUE_MIN_PLAYABLE` (5 s).
- The gain is **derived when the annotation is built**, not stored: `TrackAnalysis::amplifyDb` = target (`LIQUIDSOAP_LOUDNESS_TARGET`, -14 LUFS) minus loudness, capped so peak stays under `LIQUIDSOAP_LOUDNESS_CEILING` (-1 dBFS), capped at `LIQUIDSOAP_LOUDNESS_MAX_GAIN` (+12 dB, attenuation uncapped), null when under 0.1 dB. Changing the target relevels the library at the next track boundary with no re-analysis.
- `PlaylistFileWriter::annotateTrack` renders `annotate:` URIs: `jingle="true"` (jingles), `liq_cue_in`, `liq_cue_out`, `liq_amplify="X dB"` (skipped when `LIQUIDSOAP_APPLY_AMPLIFY` is false; cues stay), `duration` (3 dp, only when > 0), `title`, `artist` (if non-empty), `playlist` (music from the scheduler). Quotes and backslashes are escaped. The path is `/data/playlists/{basename(path)}` inside the container.
- Kill switches: `LIQUIDSOAP_ANALYSIS_ENABLED=false` stops new jobs but leaves stored measurements applied; `LIQUIDSOAP_APPLY_AMPLIFY=false` stops gain only.
- Backfill: `php artisan tracks:analyze [--station=slug] [--force] [--retry-failed] [--limit=N]` queues jobs in chunks of 200. Default selects `analyzed_at IS NULL`; `--retry-failed` also selects rows with `analysis_error`; `--force` selects everything. It refuses to run when analysis is disabled. **It is not in `routes/console.php`'s schedule**: manual only.
- Duration for the annotation and the UI comes from getID3 at upload (`duration_seconds`), not from ffmpeg. There is no re-measure.

## Data model

`tracks` (ULID id, `station_id` FK cascade): `kind` (`music` default, `jingle`; 16 chars), `path` (`{ulid}.{ext}`, relative to the station dir), `original_filename`, `title`, `artist` null, `duration_seconds` float default 0, `file_size_bytes`, `position`, the six analysis columns, timestamps. Indexes `(station_id, position)`, `(station_id, kind, position)`, `analyzed_at`. Only `title` and `artist` are mass-assignable; every other write uses `forceFill`.

`playlists` (ULID id, `station_id` FK cascade): `name` (60), `is_default`, `order` (`sequential` | `shuffle`, default sequential), `cursor_position`, `deck` (json; both owned by `AutoDjScheduler`), `position` (display order), timestamps. Unique `(station_id, name)`. `Station::playlists()` orders default first, then `position`, then `created_at`.

`playlist_track` (composite PK `(playlist_id, track_id)`, both FK cascade): `position`, kept 1-based and gap-free per playlist. A track can be in any number of playlists.

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
- Jingle order is meaningless: `JingleClock::pick` chooses at random, never the same one twice running when there are two or more.

## Deletion

- **Single** `DELETE /api/tracks/{track}` (`TrackPolicy::delete`, owner only; not plan-gated): `TrackImporter::destroy` unlinks the file, records the details, `PlaylistTracks::detachEverywhere` (renumbers every playlist it was in), deletes the row, decrements later `tracks.position` **of the same kind**, records `track_deleted`. Returns 204. The file is unlinked *before* the row is deleted and outside a transaction.
- **Bulk** `DELETE /api/stations/{slug}/tracks {track_ids: [...]}` (`DestroyTracksRequest`: 1 to 2000 distinct ULIDs, each must exist **in this station**; **no `kind` restriction**, so jingle ids are accepted): `TrackImporter::destroyMany` does the DB work in one transaction (detach everywhere, delete rows, `resequence` each affected kind), unlinks the files **after** commit, then one `write` + `reload`, then one `track_deleted` event per file. Answers **200 with the fresh music library** (`data`, `meta` incl. `deleted` count), not 204. The reasoning in code: twenty single deletes are twenty jingle-file rewrites and reloads.
- **Remove from playlist** `DELETE /api/playlists/{playlist}/tracks/{track}`: removes only the membership (file and library row stay), compacts positions. A track that exists but is not a member is a **404** (stale client).
- **Delete playlist** `DELETE /api/playlists/{playlist}`: not allowed for the default (409). Members go via the pivot cascade, tracks stay in the library, and `autodj_slots` that reference it cascade-delete (so scheduled slots disappear silently; the web confirm dialog counts them from `station.autodj_slots`).
- **Downgrade safety**: listing, editing, deleting are never plan-gated, so a downgraded owner keeps and can manage their files. Files are also removed when a station is force-deleted (`StationObserver::forceDeleted` wipes the directory; soft-delete keeps them) and when a user is force-deleted (`UserObserver::deleting` force-deletes each station first, trashed ones included).
- Deleting a track that is in a running playlist needs no reload for music: `AutoDjScheduler::next` queries the database at every boundary. In shuffle mode dead ids in the stored deck are popped and skipped (`popShuffled`); a deck emptied by deletions is re-dealt. In sequential mode `cursor_position` is a pivot `position`, and the next track is the first with `position > cursor` (wrapping to the top), so because membership removal renumbers positions, deleting or removing a member **before** the cursor shifts later tracks down and the next boundary skips one track (see Gaps).

## Endpoints

All under `/api`, `auth:sanctum`, `verified`. Authorisation is "you own the station" everywhere (`TrackPolicy`, `PlaylistPolicy`; there is no admin or collaborator path here).

| Method and path | Controller | Notes |
|---|---|---|
| `GET /stations/{slug}/tracks?kind=music\|jingle` | `TrackController::index` | Default `kind=music`. Returns `data` plus `meta {kind, storage_used_bytes, storage_cap_bytes}`. Usage is the whole station's sum, not per kind. Music rows carry `playlist_ids` (one extra query); jingles do not. Whole list, no pagination. |
| `POST /stations/{slug}/tracks` | `store` | Multipart, see above. Throttled, Pro. |
| `PATCH /tracks/{track}` | `update` | `title`, `artist` only. Reaches air at the next `next-track` ask. Not plan-gated. |
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
| `POST /upload/{type}` (`images` or `sounds`) | `UploadController` | **Not the library.** Stores to the `public` disk under `uploads/{type}`, returns `{data:{url}}`, 201, throttled. Images jpg/jpeg/png/webp/gif up to 5 MB; `sounds` mp3/wav/ogg/flac/aac up to 50 MB. Only `images` has a caller (station artwork in `StationFormDialog.tsx`); `sounds` is unused. |

Every playlist-write endpoint answers with the playlist's full ordered member list so clients replace state rather than patch it. `PlaylistTracks` validates against the station's **music** tracks only (`PlaylistTracksRequest` requires `kind = music` and same station), takes a row lock on the playlist, and in shuffle mode `attach`/`replace` deal newly added ids into the remaining deck via `AutoDjScheduler::dealIn` so an upload airs this cycle.

`TrackResource` fields: `id`, `station_id`, `kind`, `title`, `artist`, `duration_seconds`, `file_size_bytes`, `position` (pivot position when loaded through a playlist, else library position), `playlist_ids` (only when the relation is loaded), `original_filename`, `created_at`. Analysis columns and `path` are **not** exposed. `PlaylistResource`: `id`, `station_id`, `name`, `is_default`, `order`, `position`, `track_count`, `duration_seconds` (only when the aggregates were loaded), timestamps. The cursor and deck are not exposed.

## Plan gating, precisely

| Action | Gated by plan? |
|---|---|
| Upload music or a jingle | Yes: API 403 `autodj_not_available`; web/mobile disable it |
| Turn jingles on (`PATCH /stations/{slug}` `jingles_enabled: true`) | Yes (in `StationController::update`, on-direction only; see [Station management](station-management-dashboard.md)) |
| Create / rename / reorder / delete playlists, add and remove members, shuffle | **No** at the API. The web UI disables New playlist, the shuffle switch and the multi-select Add to playlist when locked ("Add from library" inside a playlist, rename, make default and drag reorder stay enabled); a free client can still call every endpoint. |
| List, edit tags, delete tracks | No |
| Playback | Yes: `AutoDjScheduler::next` returns null for a plan without AutoDJ, so nothing plays whatever is arranged |

## Surfaces

### Web dashboard (`/dashboard/stations/{slug}/library`)

Sidebar "AutoDJ" links to `/dashboard/library`, which is only a redirect to the user's station (`getMyStation()`) or `/dashboard`. The page (`library/page.tsx`, title "AutoDJ") server-fetches the station, `GET /tracks` (music) and `GET /playlists` in parallel; 404 or 403 becomes `notFound()`. `LibraryView` holds all state and applies every edit to both the library list and the per-playlist member cache; the child views are presentational.

- **Header stats**: "N tracks · runtime of music · N playlists · [plays only on Pro] · X of Y used". A 3 px storage bar (goes foreground-coloured at 90 percent).
- **Locked (free) state**: a Pro badge, the `AutoDjUpsell` panel (Request Pro), "Preview of the playlist editor", no "Add tracks" button. The list stays browsable; Jingles menu item is disabled; New playlist and shuffle are disabled. A drop on the panel still runs `upload()` and gets the "isn't included in your plan" toast.
- **Rail** (`PlaylistRail`): "All tracks" (the library) and the playlists, default marked with a star; "New playlist". A phone gets a horizontal chip row. Initial selection is the default playlist.
- **All tracks** (`AllTracksView`): search (title or artist), sort, 50 rows then "Show all N", per-row edit and delete, multi-select with "Add to playlist" (`AddToPlaylistDialog`, one `POST /playlists/{id}/tracks`) and bulk delete (confirm, then optimistic removal, then the server library replaces state and playlists are refetched). Rows show playlist chips; a track in no playlist shows "not in any playlist" and the footer counts them. Clicking a row's body toggles its selection (clicks on the row's own buttons do not). Hovering or focusing a row turns the # column into a preview button (`useTrackPreview`, one `Audio` element per list, stopped on unmount) that plays `GET /tracks/{id}/audio`, an owner-only, range-capable file response (`TrackController::audio`, `Cache-Control: private`); the same preview control exists on playlist rows.
- **Playlist view** (`PlaylistView`): members loaded on first open and cached; drag reorder; per-row edit and "Remove from playlist"; menu: Shuffle, Add from library (`TrackPicker`, candidates = library minus members), Rename, Make default, Delete playlist, plus shared Jingles and Fix artist tags.
- **Playlist naming** (`PlaylistNameDialog` inside `LibraryView`): 60 chars; server 422 duplicate-name error shown inline.
- **Fix tags** (`FixTagsDialog`): tracks with no artist in the current view; saves one `PATCH /tracks/{id}` per row, sequentially, tolerating partial failure. Banner "N tracks have no artist tag. Listeners see 'Unknown artist'." is dismissable, the menu item stays.
- **Now playing highlight**: `useStationStatus` polling; matches `now_playing` to a track by **title + artist** (not id), only when `source === "autodj"`. Duplicate title/artist pairs match the first row.
- **Jingles dialog** (`JinglesDialog`): fetches `GET /tracks?kind=jingle` on open; list with delete (no edit, no reorder); settings (`jingles_enabled`, `jingle_mode` interval or tracks, interval 5/10/15/30/60/120 min, every 2/3/5/8/10/15/20 tracks) saved via `PATCH /stations/{slug}`. The dialog's picklists are narrower than the API (60 s to 4 h, 1 to 100 per its own comment; the station-side validation lives in [Station management](station-management-dashboard.md)).
- Help links: `playlists-and-the-rotation` (header) and `upload-your-music` (beside Add tracks).
- `loading.tsx` is the page skeleton (its own comment says it must be kept in step with the footer text in `LibraryView`); not read for this doc.

### Mobile (`mobile/src/app/station/[slug]/library.tsx`)

The Library tab: storage card, then one collapsible card per playlist (default first, then `position`), fetching members on open via `GET /playlists/{id}/tracks`, 50 rows then "Show N more". **Read and delete only, plus upload**: no playlist create/rename/reorder/shuffle, no tag editing, no add-to-playlist.

- **Upload** ("+ Add from phone", hidden when `useAutoDjLocked()`): `expo-document-picker` (`audio/*`, multiple, copied to cache). Files are moved into a staging directory under their original name (the API titles untagged tracks from the filename), then uploaded **one file per request** as `files[]` via `apiUpload`, no `kind` and no `playlist_id`, so everything lands in the default playlist. Progress is "Uploading i of n"; a body `errors` entry stops the batch ("Added N, then stopped: ..."). There is no client-side format or size filter; the server's rules decide. `expo-fetch` rejects React Native `{uri,name,type}` parts, hence the `File` blob.
- **Delete**: long-press a row to enter select mode, tick more across playlists, confirm sheet, `DELETE /stations/{slug}/tracks {track_ids}`, then reload.
- **Locked (free)**: a Pro note; the list is visible; no upload button. Deleting stays available. With an empty library the tab shows "No music yet" instead of playlist cards; the storage figure turns to the live colour at 95 percent.
- `apiUpload` (`mobile/src/lib/api.ts`) returns 2xx and 207 bodies and throws `ApiError` otherwise using `body.message`.

### Not part of this feature despite the names

- `client/lib/listenerLibrary.ts` is the **listener's** saved-stations and history, in `localStorage` (`gocast:saved-stations:v1` capped at 50, `gocast:history:v1` capped at 8). Used by the homepage `ListenerLibrary` and `PlayerView`. Nothing to do with tracks.
- `client/lib/queueStore.ts` is the **web studio's** local queue: IndexedDB database `gocast` v3 (stores `queue` and `playback`, both scoped by station slug), keeps `File` objects and the playback offset so a refresh keeps the queue; ordered by a saved `position`. It is separate from the server library; see [Web studio](broadcasting-web-studio.md).

## Gaps and traps

1. **Web toast for a first-file quota failure is broken.** When no file in a batch lands, the API answers 422 with `errors: [{index, message}]` (an array of objects). Axios throws, and `uploadErrorMessage` (`upload.ts`) does `Object.values(body.errors).flat()[0]`, which returns the `{index, message}` **object**, not a string; the `?? "Upload failed"` fallback never applies. The comment above the function says the quota comes back as a plain message, which is wrong. Not runtime-verified. Partial success (207) is handled correctly.
2. **Mobile never shows jingles.** The tab calls `GET /tracks` with no `kind`, which defaults to music, then builds a "Jingles & IDs" group from `all.filter(t => t.kind === 'jingle')`, which is therefore always empty. The group is dead code. Mobile also cannot upload jingles.
3. **Mobile 422 message.** `apiUpload` throws on 422 and reads `body.message`; the all-failed quota body has no `message`, so the user sees "Upload failed (422)" instead of the storage message.
4. **Playlists are not plan-gated at the API.** A free owner can create playlists and edit membership by calling the API; only the UI locks it. Harmless to the audio (playback is gated) but the comment in `PlaylistController` presents it as deliberate.
5. **Bulk delete accepts jingle ids** (`DestroyTracksRequest` only checks the station), yet always answers with the *music* library. Nothing in the clients sends jingle ids.
6. **`PATCH /tracks/{id}` rewrites and reloads the jingle playlist on every edit**, even for music. Fix Tags on 50 tracks means 50 file rewrites and, when jingles are enabled, 50 telnet reloads. A reload restarts the jingle list at index 0 (per the `AnalyzeTrack` comment).
7. **Extension comes from the client filename, type from content.** `mimes:` sniffs content, but the stored extension is whatever the client named it (default `mp3`), so a WAV named `.mp3` is stored as `.mp3`. The extension is otherwise unrestricted: `mimes:` validates the sniffed type, not the client name, so a real MP3 named `x.php` is stored as `{ulid}.php` in the playlists dir. Liquidsoap normally decodes by content, but this is untested. `mpga` is accepted by the server but is not in the web `AUDIO_EXTENSIONS`, so a `.mpga` file with no `audio/*` type is filtered out client-side.
8. **Analysis worker timeout mismatch (native deploy).** `TrackAnalyzer` allows 120 s (`LIQUIDSOAP_ANALYSIS_TIMEOUT`) but `infra/native/systemd/gocast-queue.service` runs `queue:work --timeout=60`. A file that takes over 60 s to decode is killed by the worker, the job's `failed()` only logs, and `analyzed_at` stays null so it is re-queued by the next `tracks:analyze`. The unit also passes `--tries=3`, overridden by the job's `$tries = 2`. The repo contains no other worker definition (no API Dockerfile or compose file; `infra/native/` is the only deploy kit).
9. **Analysis borrows the Liquidsoap image via `docker run`** when no local ffmpeg is configured. In the native kit the worker sets `DOCKER_HOST` to the `docker-proxy` (`tecnativa/docker-socket-proxy`, `CONTAINERS`, `NETWORKS`, `IMAGES`, `POST` on, `EXEC` off), and the API runs on the host, so the `-v` path is a real host path. Not runtime-verified: it needs the `docker` CLI on the worker host and the Liquidsoap image present locally. A containerised API would break the `-v` path (no such deploy exists in the repo).
10. **Analysis and backfill are manual/queued only.** `tracks:analyze` is not scheduled. `analyzed_at` is set on failure too, so a failed track is skipped forever unless `--retry-failed`. A jingle analysed after upload gets fresh annotations the next time it is handed out.
11. **Duration is whatever getID3 said.** A file getID3 cannot read gets `duration_seconds = 0`: no `duration` annotation (the crossfade wants it), the cue-out cannot be sanity-checked against the file length, and "—" in the UI. There is no re-measure.
12. **Unlink is not transactional in `destroy`.** The file is deleted before the DB row; a failure between them leaves a row pointing at nothing (bulk delete deliberately orders it the other way). Bulk delete can only leave an orphan file if an `unlink` itself fails after commit.
13. **Now-playing highlight and up-next match by title + artist**, so two tracks with identical tags light up the wrong row. No track id travels through `now_playing`.
14. **"Recently added" sorts ascending by `position`**, so the oldest upload is first. Deleting compacts positions so this stays a strict upload order, but the label suggests newest first.
15. **`TrackController::reorder` and `UploadController` `sounds`** have no callers in web or mobile. `reorder` is documented in the controller as "library order only".
16. **Delete-playlist cascades scheduled slots silently at the API.** The web confirm warns; the mobile app has no playlist deletion.
17. **Limits are single-request only.** No resumable upload: a dropped connection loses the batch in flight (earlier batches stay). A 300 MB file at slow uplink depends on the 900 s PHP and nginx timeouts (native config); `api/php/uploads.ini` is only referenced by comments (no FrankenPHP or Docker config for the API exists in the repo), so the native nginx and php-fpm settings are the only ones that apply.
18. **Three copies of the size constants** (`api/php/uploads.ini`, `infra/native/php/99-gocast.ini`, `MAX_BATCH_BYTES` in `upload.ts`) plus the `max:307200` rule and the "up to 300 MB" copy in `LibraryView`. They must be changed together.
19. **Free-plan uploaders are told twice.** The web disables Add tracks, but a drag-drop on the list still toasts; the API 403 exists as the backstop.
20. **The storage cap counts only DB rows** (`SUM(file_size_bytes)`), not bytes on disk: a file left behind by a failed unlink or a crashed request does not count toward it, and nothing sweeps orphan files.
21. **Sequential cursor skips a track after an earlier member is removed.** `playlists.cursor_position` stores a pivot `position`; `PlaylistTracks::removeMember` (used by delete and remove-from-playlist) decrements later positions but never adjusts the cursor, and neither `reorder` nor `replace` does. Removing a member ahead of the cursor makes the next `position > cursor` lookup jump over one track; reordering can repeat or jump. Derived from `AutoDjScheduler::advanceSequential` and `PlaylistTracks`, not runtime-verified.

## Tests

`api/tests/Feature/TrackControllerTest.php` (upload, quota, kinds, auth, reorder, bulk delete), `PlaylistControllerTest.php` (playlist CRUD, membership, default rules), `TrackAnalysisTest.php` and `TrackAnalyzerTest.php` (gain maths, cue parsing), `TrackAnnotationTest.php` (annotation rendering), `PlaylistFileWriterTest.php`, `TrackImporterFilenameTest.php` (artist/title split), `StationEventTrackLogTest.php`, `PlaylistBackfillMigrationTest.php`, and `NextTrackControllerTest.php` (the audio-side reader). No tests were run for this doc. No front-end or mobile tests cover the library; `AnalyzeTrack` and the `tracks:analyze` command are only exercised indirectly.

## History

- Library and jingles came first; `kind` was added 2026-08-17 (`add_kind_to_tracks_table`), analysis columns 2026-08-18.
- Playlists, the default playlist and the per-playlist cursor/deck landed 2026-09-20 with AutoDJ scheduling (see [Schedule](schedule.md), [AutoDJ](autodj.md), and `docs/AUTODJ-SCHEDULING-HANDOFF.md`).
- Bulk delete and multi-select, the upload batching and progress meter, and the mobile Library tab are more recent and uncommitted or lightly documented.
