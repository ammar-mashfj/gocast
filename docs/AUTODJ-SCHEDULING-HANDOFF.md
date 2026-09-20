# AutoDJ playlists + scheduling — handoff (2026-09-20)

Read this first when resuming. It records the state of the working tree at
the end of the session that built the feature, so a fresh session can pick
up without the conversation. The design itself is in
`AUTODJ-SCHEDULING-PLAN.md` (same folder); this file is about *state*.

## Where things stand

- **Everything in the plan is built: phases 1–4.** Playlists (backend +
  library UI) and weekly slots (backend resolver + Schedule page).
- **Nothing is committed.** 67 files changed or new on `main` (list at the
  bottom). Ammar asked for no commits; committing is his call.
- **The dev MySQL database (`gocast`) has all six new migrations applied.**
  The one existing station ("test") had its rotation copied into a default
  playlist named "Main rotation" with cursor and members intact; the three
  old `stations.autodj_*` columns are gone. Rollback if ever needed:
  `php artisan migrate:rollback --step=6` (the backfill's `down()` copies
  the state back onto the station columns).
- **The Liquidsoap template is untouched.** No container was restarted by
  any of this, and none of the new writes can reach `StationObserver`.
- Demo data created during browser testing (playlist "Morning Calm", slot
  "Sunday chill") was deleted again; the station plays as before.
- The dev servers started for testing were stopped.

## Verified

- API: 412 tests pass across every file touching stations, tracks,
  playlists, slots, events, and admin. The FULL suite was not run (it takes
  minutes; run it before committing if you want the extra assurance):
  `cd api && php artisan test --compact`.
- Client: `npx tsc --noEmit` clean; `npm run lint` clean apart from two
  pre-existing warnings in `app/auth/login/page.tsx`.
- Browser (Claude in Chrome against the hybrid dev stack): library rail,
  new playlist, add-from-library picker, per-playlist shuffle, All-tracks
  chips, Schedule page with on-now line and week strip, station card, and
  the settings copy. End to end: a saved slot switched the *running* dev
  station's rotation at the next track boundary and logged
  `playlist_changed` on the timeline.

## How to resume the dev stack

```
docker compose up -d icecast mediamtx           # only if audio is needed
cd api && php artisan serve --host=0.0.0.0      # NOT loopback, see memory
cd client && npm run dev
```
Station slug on dev: `test`. Pages: `/dashboard/stations/test/library`,
`/dashboard/stations/test/schedule`.

## Targeted test files (fast)

```
cd api && php artisan test --compact \
  tests/Feature/AutoDjShuffleTest.php tests/Feature/NextTrackControllerTest.php \
  tests/Feature/PlaylistControllerTest.php tests/Feature/PlaylistBackfillMigrationTest.php \
  tests/Feature/AutoDjProgrammeTest.php tests/Feature/AutodjSlotTest.php \
  tests/Feature/TrackControllerTest.php tests/Feature/PlaylistFileWriterTest.php \
  tests/Feature/StationScheduleTest.php tests/Feature/StationStatusTest.php
```

## Decisions taken while building (not all visible in the diff)

1. **No compatibility shim survived.** The plan kept `autodj_order` on the
   station for one release; since the UI landed in the same change it was
   removed again. `autodj_order` is gone from the station resource, request
   and TypeScript type. Play order is `playlists.order`.
2. **`TrackFactory` attaches music tracks to the station's default playlist**
   through `PlaylistTracks::attach`, the same path an upload takes. Tests
   never attach by hand; a test that creates a second default by hand breaks
   the one-default invariant.
3. **`Station::created` creates the default playlist** (`Station::booted`),
   so factories, seeders and the admin panel all get one.
4. **Library reorder no longer changes what plays.** `PATCH
   /stations/{slug}/tracks/reorder` still exists and orders the library
   view only; playback order is `PATCH /playlists/{id}/tracks/reorder`.
5. **`StationStatusController::upNext()` resolves through the programme**
   (since the 2026-09-21 review): it answers from the playlist on air now,
   and for a shuffled playlist from the head of its deck. So does
   `StationAudioPolicy::hasPlayableRotation()`, which used to read the
   library and would have called a full library with an empty playlist a
   permanent sweep fault.
6. **`stations.autodj_last_playlist_id`** exists only so the scheduler can
   log `playlist_changed`; nothing reads it. No FK on purpose.
7. **Slot boundaries land at the next track boundary**, roughly two tracks
   late (prefetch + crossfade). Hard-start is out of scope (§7 of the plan).
8. Naming: nothing new is called "schedule" in code. `station_schedules`,
   `StationSchedule`, `ScheduleEditor` are the SHOW TIMES (display claim).
   New things are `autodj_slots`, `AutodjSlot`, `AutoDjProgramme`,
   `AutodjSlotsEditor`, `AutoDjTabs`. The settings card was renamed from
   "Schedule" to "Show times" with a link to the real schedule.

## Traps met (already in memory too)

- `DB::table()->whereKey()` does not exist: the base builder parses it as a
  dynamic `where key = …` and silently matches nothing. Use `where('id', …)`.
- `wherePivot()` inside `->when(cond, fn ($q) => …)` receives the Eloquent
  builder, not the relation, and becomes `where pivot = position`. Apply
  pivot constraints on the relation object directly.
- Laravel's `distinct` on a wildcard path (`slots.*.days.*`) compares values
  across EVERY row. Dropped for slots; the controller dedupes within a row.
  **Latent bug left in place:** `ReplaceStationSchedulesRequest` has the
  same rule on `schedules.*.days.*`, so two show times on one weekday cannot
  be saved. Separate feature, not fixed here.
- The backfill migration test re-adds the dropped columns for one test and
  cleans up its own rows, because DDL commits implicitly on MySQL and breaks
  the per-test transaction.
- Claude in Chrome against the Next dev server: `captureScreenshot` times
  out right after state-changing clicks, and clicks by element ref land on a
  duplicated accessibility node. Coordinate clicks and `get_page_text` work.

## Open follow-ups (small, optional)

- (Closed 2026-09-21: the active-playlist `upNext()`, the sweeper's
  library read, the show-times `distinct` bug, and both timezone-clearing
  holes between the slots and show-times PUTs. See AUTODJ-KNOWN-GAPS.md.)
- Everything in §7 of the plan: hard-start slots, per-slot jingles, weighted
  rotation, public "what's on now", one-off dated shows.
- `docs/AUTODJ-SCHEDULING-PLAN.md` §1 describes the code at commit
  `3c0e37d`, i.e. before this work; the status block at its top says what
  changed. Fine as a record; rewrite if it ever confuses.

## Files changed or added (git status at handoff)

```
M api/app/Http/Controllers/NextTrackController.php
 M api/app/Http/Controllers/StationController.php
 M api/app/Http/Controllers/StationStatusController.php
 M api/app/Http/Controllers/TrackController.php
 M api/app/Http/Requests/StoreTrackRequest.php
 M api/app/Http/Requests/UpdateStationRequest.php
 M api/app/Http/Resources/StationResource.php
 M api/app/Http/Resources/TrackResource.php
 M api/app/Models/Station.php
 M api/app/Models/StationEvent.php
 M api/app/Models/Track.php
 M api/app/Services/AutoDjScheduler.php
 M api/app/Services/PlaylistFileWriter.php
 M api/app/Services/TrackImporter.php
 M api/database/factories/TrackFactory.php
 M api/resources/views/admin/station.blade.php
 M api/routes/api.php
 M api/tests/Feature/AutoDjShuffleTest.php
 M api/tests/Feature/NextTrackControllerTest.php
 M api/tests/Feature/PlaylistFileWriterTest.php
 M client/app/dashboard/stations/[slug]/library/LibraryView.tsx
 M client/app/dashboard/stations/[slug]/library/page.tsx
 M client/app/dashboard/stations/[slug]/library/useTrackUpload.ts
 M client/app/dashboard/stations/[slug]/page.tsx
 M client/app/dashboard/stations/[slug]/settings/page.tsx
 M client/components/dashboard/AppSidebar.tsx
 M client/components/dashboard/AutoDjRotation.tsx
 M client/components/dashboard/StationChecklist.tsx
 M client/interfaces/Station.ts
 M client/interfaces/Track.ts
?? api/app/Http/Controllers/AutodjSlotController.php
?? api/app/Http/Controllers/PlaylistController.php
?? api/app/Http/Controllers/PlaylistTrackController.php
?? api/app/Http/Requests/PlaylistTracksRequest.php
?? api/app/Http/Requests/ReorderPlaylistTracksRequest.php
?? api/app/Http/Requests/ReplaceAutodjSlotsRequest.php
?? api/app/Http/Requests/StorePlaylistRequest.php
?? api/app/Http/Requests/UpdatePlaylistRequest.php
?? api/app/Http/Resources/AutodjSlotResource.php
?? api/app/Http/Resources/PlaylistResource.php
?? api/app/Models/AutodjSlot.php
?? api/app/Models/Playlist.php
?? api/app/Policies/PlaylistPolicy.php
?? api/app/Services/AutoDjProgramme.php
?? api/app/Services/PlaylistTracks.php
?? api/database/factories/AutodjSlotFactory.php
?? api/database/factories/PlaylistFactory.php
?? api/database/migrations/2026_09_20_134240_create_playlists_table.php
?? api/database/migrations/2026_09_20_134241_create_playlist_track_table.php
?? api/database/migrations/2026_09_20_134242_backfill_default_playlists.php
?? api/database/migrations/2026_09_20_134243_drop_autodj_columns_from_stations_table.php
?? api/database/migrations/2026_09_20_141102_create_autodj_slots_table.php
?? api/database/migrations/2026_09_20_141103_add_autodj_last_playlist_id_to_stations_table.php
?? api/tests/Feature/AutoDjProgrammeTest.php
?? api/tests/Feature/AutodjSlotTest.php
?? api/tests/Feature/PlaylistBackfillMigrationTest.php
?? api/tests/Feature/PlaylistControllerTest.php
?? client/app/dashboard/stations/[slug]/library/AllTracksView.tsx
?? client/app/dashboard/stations/[slug]/library/PlaylistRail.tsx
?? client/app/dashboard/stations/[slug]/library/PlaylistView.tsx
?? client/app/dashboard/stations/[slug]/library/TrackPicker.tsx
?? client/app/dashboard/stations/[slug]/library/TrackRow.tsx
?? client/app/dashboard/stations/[slug]/schedule/
?? client/components/dashboard/AutoDjTabs.tsx
?? client/interfaces/Playlist.ts
?? client/lib/programme.ts
?? docs/AUTODJ-SCHEDULING-PLAN.md
```
