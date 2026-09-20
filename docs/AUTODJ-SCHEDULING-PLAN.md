# AutoDJ playlists and scheduling — design and implementation plan

Lets a Pro station play **different sets of tracks at different times of the
week** — chill in the morning, hits in the afternoon, a Friday-night special —
instead of one flat rotation on loop, 24/7.

Status: **all four phases built, 2026-09-20 — uncommitted.** Playlists on
the backend and in the library UI; weekly slots on the backend, resolved in
the scheduler; the Schedule page. Verified end to end against the running
dev station: a slot saved on the Schedule page switched the live container
to the slot's playlist at the next track boundary, and the switch appeared
on the station timeline.
Written after reading the code on `main` at `3c0e37d`; every claim about the
pre-playlist behaviour in §1 carries the file it was read from and describes
that commit, not the working tree.

What shipped, and where it departs from the text below:

- Migrations `2026_09_20_134240` → `134243`: tables, backfill, column drop.
  Run on the dev database; the one existing station's cursor and members
  copied across exactly.
- `Playlist` model, `PlaylistPolicy`, `PlaylistTracks` service (membership,
  compaction, deck splice), `PlaylistController`, `PlaylistTrackController`,
  the four form requests, `PlaylistResource`. Routes as in §4.5.
- `AutoDjScheduler::next()` walks `$station->defaultPlaylist`; the slot
  resolver of §4.3 slots in at that one line. `dealIn()` closes the deferred
  "new upload waits for the next deal" item (§5.5).
- `TrackFactory` attaches music tracks to the default playlist, as uploads
  do, so tests model the real invariant.
- `StationStatusController::upNext()` resolves the playlist through
  `AutoDjProgramme`, as does `StationAudioPolicy` — the Phase 2 note in
  §5.4 said this would be needed once the library and the default diverged.
- **No compatibility shim survived.** §6 of the plan below kept
  `autodj_order` on the station for one release; because the UI landed in
  the same change, the shim was removed again before anything depended on
  it. `autodj_order` is gone from the station resource, request and type.
- UI: `LibraryView` is the shell (rail + panel + one state that keeps the
  library and the member lists agreeing), `PlaylistRail`, `PlaylistView`,
  `AllTracksView`, `TrackRow`, `TrackPicker`. The station page's rotation
  card reads the default playlist and names it. No sidebar change was
  needed: the AutoDJ item already matches the library route.
- The migration test re-adds the dropped columns for one test and cleans
  up its own rows, because DDL commits implicitly on MySQL and breaks the
  per-test transaction (`PlaylistBackfillMigrationTest`).

Phases 3 and 4, as built:

- Migrations `2026_09_20_141102` (`autodj_slots`) and `141103`
  (`stations.autodj_last_playlist_id`, monitoring only). Run on the dev
  database.
- `AutodjSlot` model with `windowsBetween()` (wall-clock windows anchored
  with setTime() after the date arithmetic, so DST nights keep the clock),
  `AutoDjProgramme::resolve()` exactly as §4.3, `ReplaceAutodjSlotsRequest`
  with the canonical-week overlap check, `AutodjSlotController::replace`
  (`PUT /stations/{slug}/autodj-slots`), `AutodjSlotResource`.
- `AutoDjScheduler::next()` now calls the resolver, and records
  `StationEvent::TYPE_PLAYLIST_CHANGED` (admin timeline label added) when
  the boundary lands in a different playlist than the last one.
- `StationResource` carries `autodj_slots` and `programme` whenever the
  slots relation is loaded (owner `show()` and the slot save); nothing
  public loads it. `UpdateStationRequest` refuses to clear the timezone
  while slots exist, as it already did for show times.
- One rule the plan did not anticipate: Laravel's `distinct` on
  `slots.*.days.*` compares across every slot, so two slots on Monday were
  rejected. Dropped; the controller dedupes days within a row. The show-times
  request (`schedules.*.days.*`) carries the same `distinct` and therefore
  the same latent bug — two shows on one weekday cannot be saved — left
  untouched here because it is a separate feature.
- UI: `schedule/page.tsx`, `AutodjSlotsEditor.tsx` (rows like the show-times
  editor, not shared with it; client-side overlap check; on-now line),
  `WeekStrip.tsx`, `AutoDjTabs` on both AutoDJ pages, `lib/programme.ts`
  shared by the editor and the station card, sidebar matchers, and one help
  line under "Show times" on the settings page (renamed from "Schedule" so
  the two are never confused).
- Not built, still deliberately out of scope (§7): hard-start slots,
  per-slot jingles, weighted rotation, public "what's on now", one-off dated
  shows.

Related reading: `station-hardening-plan.md` §5.3 lists "scheduled
programming" as open feature work and proposes doing it inside Liquidsoap with
`switch` + `time.predicate`. **This plan rejects that approach** — see
"Why this is a Laravel feature" below.

---

## 0. Vocabulary, and one naming trap

| Word | Means in this document |
|---|---|
| **Library** | Every audio file uploaded to a station. Unchanged: `tracks` rows, one storage quota, `kind` = `music` or `jingle`. |
| **Playlist** | A named, ordered subset of the station's music tracks, with its own play order (sequential / shuffle) and its own cursor. **New.** |
| **Default playlist** | The one playlist every station has and cannot delete. It plays whenever no slot is active. For every existing station it *is* today's rotation. |
| **Slot** | "Play playlist P on these weekdays from HH:MM to HH:MM." A row in the schedule. **New.** |
| **Schedule** | The station's set of slots. What the owner edits on the new Schedule page. |
| **Show times** | The *existing* `station_schedules` table and `ScheduleEditor.tsx`. **Not part of this.** |

The trap: `station_schedules` already exists and is exactly *not* this. Its
migration says so in capitals: it is a **claim** ("I'm usually live Fridays at
8") for the player page's "when to come back" block, and *nothing on the audio
path reads it*. It has start times and no end times, on purpose.

Slots need end times and are read by the audio path on every track boundary.
They are a different object with a different lifetime and must not share a
table, a model, a resource key, or a UI component with show times. Everything
new in this plan is namespaced `autodj_*` / `Playlist*` so the two can never be
confused in code, and the two editors live on different pages so they can't be
confused by the owner either.

---

## 1. What exists today (the ground we are changing)

Read this before touching anything; the design leans on all of it.

### 1.1 The rotation is a query, not a file

`api/resources/views/liquidsoap/station.blade.php` ~442–520: the AutoDJ arm
is `request.dynamic`, which calls `GET /api/internal/next-track?slug=…` once
per track boundary. `NextTrackController` → `AutoDjScheduler::next()` answers
with one `annotate:` URI, or `204` for "nothing to play".

This was done because Liquidsoap's `playlist()` restarts at index 0 on every
reload, so uploading a song sent listeners back to song one. The move put the
running order in PHP, and `AutoDjScheduler`'s docblock names dayparting as one
of the things this makes possible. **Scheduling is therefore a change to
`next()`, and only to `next()`, on the audio path.**

### 1.2 One rotation per station, state on the station row

`stations` carries the whole AutoDJ state:

| column | role |
|---|---|
| `autodj_order` | `sequential` or `shuffle` (`Station::AUTODJ_ORDERS`) |
| `autodj_cursor_position` | sequential mode: `position` of the track last handed out |
| `autodj_deck` | shuffle mode: JSON list of track IDs not yet played this cycle |
| `jingles_enabled`, `jingle_mode`, `jingle_interval_seconds`, `jingle_every_tracks` | jingle arm, station-wide |
| `timezone` | IANA zone, nullable; today only the show times use it |

`tracks.position` is 1-based and gap-free **per (station, kind)**
(`TrackImporter::import/destroy/reorder`). The rotation order *is* the
library order.

### 1.3 Things that must keep holding

- **Cursor and deck writes bypass Eloquent.** `AutoDjScheduler` uses
  `DB::table('stations')->update()` so `StationObserver` never fires at a
  track boundary. The observer re-renders the `.liq` and restarts the
  container on `LIQ_RELEVANT_COLUMNS` (`name, slug, description, genre,
  icecast_mount, icecast_password, artwork_url`) — a restart drops every
  listener. Because the update bypasses casts, `autodj_deck` is
  `json_encode`d by hand; `AutoDjShuffleTest` pins this.
- **Entitlement is enforced in `next()`**, nowhere else on the audio path.
  A free owner's container runs the same script and asks the same question;
  the `204` is what keeps the music off air. Plan changes never restart
  containers (`UserObserver` pushes the watermark and jingle switch over
  telnet).
- **`next()` returns before the cursor moves when it returns null**, so a
  free station polling every `autodj_retry_delay` (10 s,
  `config/liquidsoap.php`) doesn't shred the order a re-subscribing owner
  gets back.
- **Jingles are a separate arm** (`jingles.m3u`, `playlist()` in randomize
  mode, `fallback(track_sensitive=true, [jingle_arm, autodj])`). They are
  station-wide, timed by interval or by track count, and toggled over telnet
  as interactive variables. Nothing here changes them.
- **A live broadcaster pre-empts everything** via the outer
  `fallback(track_sensitive=false)`. The schedule only ever decides what
  AutoDJ plays; it never decides whether AutoDJ is on air.
- **Deleted tracks are skipped lazily** by `advanceShuffled()`; the deck is
  not rewritten on delete.
- **Shuffle hides the drag handles** in `LibraryView.tsx` because the deck
  holds IDs and a saved order would never be played.
- **Show times refuse to save without a station timezone**
  (`StationScheduleController::replace`). Slots must apply the same rule.

### 1.4 What the owner sees today

- Sidebar → **AutoDJ** → `/dashboard/stations/{slug}/library`: one list,
  "AutoDJ library", drag-to-reorder, Play order / Shuffle toggle, "Add tracks"
  upload, a **Jingles** button opening `JinglesDialog`.
- Station page (`[slug]/page.tsx`) → `AutoDjRotation` card previewing the
  rotation.
- Settings page → `ScheduleEditor` (show times) and `TimezoneCombobox`.
- Player page → `ScheduleBlock` (show times, public).

---

## 2. Why this is a Laravel feature, not a Liquidsoap one

The hardening plan's sketch (`switch([({time predicate}, playlist_a), …])`)
would work in a vacuum and is wrong here for four reasons:

1. **Every edit would restart the container.** Predicates and sources are
   compiled into the script; changing a slot means re-rendering the `.liq`
   and going through `StationObserver`'s restart path, which drops every
   listener. Jingle settings were made interactive variables specifically to
   avoid this; a schedule is edited far more often than a jingle interval.
2. **The plan gate lives in `next()`.** A Liquidsoap `switch` over several
   `playlist()` sources reintroduces the m3u files and their index-0 reload
   defect, and puts the rotation back where the entitlement check can't reach
   it.
3. **The cursor lives in PHP.** Per-playlist cursors, shuffle decks, "insert
   the new upload into the remaining deck", no-repeat rules, weighted
   rotation — all of it is a query. None of it can be expressed in a file.
4. **The switch already happens at the right granularity.** `request.dynamic`
   asks once per track boundary. "Which playlist is on now" is answered at the
   moment the question is asked; no operator in the graph needs to know a
   schedule exists.

The `.liq` is **not modified by this plan**. No container is restarted when
it ships, and no container is restarted by any playlist or slot edit.

---

## 3. The new flow, from the owner's side

### 3.1 A worked example

Ammar runs "Night Drive FM" on Pro with 300 tracks. He wants:

- calm tracks 06:00–12:00 on weekdays,
- the whole library the rest of the time,
- a "Friday Night Mix" from 22:00 Friday to 02:00 Saturday.

**Today** he can't. He has one rotation and one order.

**After this plan:**

1. He opens **AutoDJ → Playlists**. He sees one playlist, **Main rotation**,
   marked *Default*, containing all 300 tracks in the order he already
   dragged them into. Nothing has changed on air.
2. He clicks **New playlist**, names it *Morning Calm*, and adds 60 tracks
   from the library with the picker (search, tick, Add). He sets it to
   Shuffle.
3. He creates *Friday Night Mix* the same way, 40 tracks, Play order, and
   drags them into the sequence he wants.
4. He opens **AutoDJ → Schedule**. The page says *"Outside the slots below,
   Main rotation plays."* He adds:
   - Mon–Fri · 06:00 → 12:00 · Morning Calm
   - Fri · 22:00 → 02:00 · Friday Night Mix
   The editor shows a seven-day strip with the two slots painted on it and
   the rest labelled Main rotation. It saves.
5. Nothing restarts. At the next track boundary after 06:00 Monday, the
   station is playing *Morning Calm*. At 12:00 it drifts back to *Main
   rotation* within one track. Friday at 22:00 the mix starts, runs past
   midnight, and hands back at 02:00 Saturday.
6. The station page's AutoDJ card now reads *"Now: Morning Calm · until
   12:00 · then Main rotation"*.

If he uploads a new track on Tuesday from inside *Morning Calm*, it joins
that playlist (and, in shuffle mode, is dealt into the remaining deck so it
plays this cycle, not next week). If he uploads from **All tracks**, the file
lands in the library and in the default playlist, so "upload = it plays" stays
true.

### 3.2 Playlists page (`/dashboard/stations/{slug}/library`)

Replaces "AutoDJ library". Layout: a left rail (or tabs on mobile) with

- **All tracks** — the library: every music file, storage meter, search,
  edit title/artist, delete file, upload. Each row shows chips for the
  playlists it belongs to. A track in no playlist gets a muted *"not in any
  playlist — won't play"* badge; this is the only way a file can be silent
  on a Pro station.
- **One entry per playlist**, the default one first and tagged *Default*.
- **New playlist**.

A playlist view has:

- Name (inline rename), track count, total duration.
- **Play order / Shuffle** toggle — per playlist now, not per station.
- The ordered list with drag handles (hidden in shuffle, as today).
- **Add tracks** → a picker over the library (search, multi-select) *and* an
  upload button that both uploads and adds.
- Per row: **Remove from playlist** (the file stays in the library) — distinct
  from delete.
- **Set as default** (moves the tag; the old default becomes a normal
  playlist).
- **Delete playlist** — not offered on the default. If slots use it, the
  confirm says which and those slots are removed with it. Tracks are never
  deleted by deleting a playlist.

The **Jingles** button stays where it is; jingles are not playlists and are
not schedulable in this phase.

Locked state (free plan, `useAutoDjLocked`): identical to today's rule —
uploading is blocked, and additionally creating playlists and slots is
blocked with the same "needs Pro" tooltip. Viewing, reordering, renaming,
removing, deleting stay live so a lapsed Pro owner can still tidy up.

### 3.3 Schedule page (`/dashboard/stations/{slug}/schedule`) — new

Sidebar: under **AutoDJ**, or a second tab on the library page. Recommend a
separate route so the URL is linkable from the station checklist.

Contents, top to bottom:

1. **Timezone.** Shows the station timezone; if unset, the page shows the
   `TimezoneCombobox` inline and refuses to save slots until one is chosen
   (same rule and same copy pattern as show times).
2. **On air now** — *"Morning Calm · until 12:00 · then Main rotation"*, or
   *"Main rotation (default) · next: Morning Calm, Mon 06:00"*. Computed by
   the API (`schedule_status` on the station resource, see §4.6), not the
   browser, so it agrees with what the container is doing.
3. **Slots list**, one row each: day checkboxes (Mon…Sun), start time, end
   time, playlist dropdown, optional label, remove. Same interaction shape as
   `ScheduleEditor.tsx` so it feels familiar. End before or equal to start
   means "runs past midnight" and the row says so (*"→ next day"*).
4. **Week strip**: a read-only 7×24 band with slots painted in per-playlist
   colours and gaps labelled with the default. Overlaps are impossible to
   save, so the strip never has to show a conflict, only the validation
   error under the offending row.
5. **Save** — replaces the whole set, like show times.

Copy that must be on the page: *"Slots change what AutoDJ plays. They don't
turn the station on or off, and a live broadcast always takes over."* This is
the sentence that stops the show-times confusion before it starts.

### 3.4 Everywhere else

- **Station page** `AutoDjRotation` card: shows the *active* playlist's next
  few tracks, headed by the on-air-now line above.
- **Station checklist**: "Add tracks" becomes "Add tracks to a playlist";
  no new checklist item for scheduling (it's optional).
- **Settings page**: show times stay exactly where they are. Add one line of
  help text under them: *"These are the times you tell listeners you're live.
  To change what AutoDJ plays by time of day, use Schedule."*
- **Player page**: unchanged in this plan. A public "what's on now" is a later
  option (§7).

---

## 4. Technical design

### 4.1 Schema

Three new tables. All IDs are ULIDs like `tracks`.

**`playlists`**

| column | type | notes |
|---|---|---|
| `id` | ulid pk | |
| `station_id` | uuid fk → stations, cascade delete | |
| `name` | string(60) | unique per station |
| `is_default` | bool | exactly one true per station (enforced in code + partial unique index where the DB supports it) |
| `order` | string(16) | `sequential` \| `shuffle` — moved from `stations.autodj_order` |
| `cursor_position` | unsigned int, nullable | moved from `stations.autodj_cursor_position`; refers to pivot `position` |
| `deck` | json, nullable | moved from `stations.autodj_deck`; list of track IDs |
| `position` | unsigned int | display order in the rail |
| timestamps | | |

Index `(station_id, position)`.

**`playlist_track`** (pivot)

| column | type | notes |
|---|---|---|
| `playlist_id` | ulid fk → playlists, cascade | |
| `track_id` | ulid fk → tracks, cascade | |
| `position` | unsigned int | 1-based, gap-free per playlist |

Primary key `(playlist_id, track_id)`; index `(playlist_id, position)`.

A track may sit in many playlists — a song being in both *Daytime* and
*Weekend* is ordinary radio programming, and a single `playlist_id` on
`tracks` would force the owner to upload the file twice against their quota.
Only `kind = music` tracks may be attached; jingles are refused at
validation.

`tracks.position` **stays** and keeps meaning "order in the library / default
list view". It is no longer read by the audio path. (Dropping it would touch
`TrackImporter`, `TrackController::reorder`, and the jingle list which still
uses it; not worth it in this change.)

**`autodj_slots`**

| column | type | notes |
|---|---|---|
| `id` | ulid pk | |
| `station_id` | uuid fk → stations, cascade | |
| `playlist_id` | ulid fk → playlists, cascade | deleting a playlist deletes its slots |
| `label` | string(60), nullable | |
| `days` | json | weekdays the slot **starts** on, `0` = Sunday (Carbon's `dayOfWeek`, same as show times) |
| `start_time` | time | wall clock in `stations.timezone` |
| `end_time` | time | wall clock; `end_time <= start_time` means it ends the next day |
| `position` | unsigned int | display order |
| timestamps | | |

Index `(station_id)`.

**`stations`**: `autodj_order`, `autodj_cursor_position`, `autodj_deck` are
dropped in a *second* migration that runs after the data copy (§5), so the
copy migration's `down()` has somewhere to write back to.

### 4.2 Models

- `Playlist` — `belongsTo(Station)`, `belongsToMany(Track)` via
  `playlist_track` with pivot `position`, ordered by it. Constants
  `ORDER_SEQUENTIAL`, `ORDER_SHUFFLE` (moved from `Station`). Casts `deck`
  → array, `is_default` → bool.
- `AutodjSlot` — `belongsTo(Station)`, `belongsTo(Playlist)`. Casts `days`
  → array. Helper `intervalsAround(CarbonImmutable $now): list<[start,end]>`
  (see §4.4).
- `Station` — `playlists()`, `defaultPlaylist()`, `autodjSlots()`. The
  `AUTODJ_ORDER_*` constants and the three columns go. `musicTracks()` stays
  (library view, quota).
- `Track` — `playlists()` belongsToMany.

### 4.3 The resolver: which playlist is on now

New `App\Services\AutoDjProgramme` (name chosen to avoid "schedule"):

```php
/** @return array{playlist: Playlist, slot: ?AutodjSlot, until: ?CarbonImmutable, next: ?AutodjSlot} */
public function resolve(Station $station, ?CarbonImmutable $now = null): array
```

Algorithm:

1. `$now` defaults to `CarbonImmutable::now()`; convert to
   `$station->timezone` (if the station has no timezone it can have no slots,
   so skip straight to the default).
2. Load the station's slots with their playlists (one query, `with`).
3. For each slot, for each of `[$now->subDay(), $now]` as day `d`:
   if `d->dayOfWeek ∈ days`, build the concrete interval
   `[d@start_time, d@end_time]`, adding one day to the end when
   `end_time <= start_time`. Only two days need checking because a slot is at
   most 24 h long.
4. The slot whose interval contains `$now` is active. Overlaps are rejected
   at write time (§4.5) so there is at most one; if two ever match (a race
   with an edit), take the one with the earliest start — deterministic, and
   the next boundary self-corrects.
5. Active slot → its playlist, `until` = interval end. No active slot →
   default playlist, `until` = start of the nearest future interval (scan
   the coming 7 days; `null` when there are no slots).
6. **Empty-playlist fallback:** if the chosen playlist has zero tracks, fall
   through to the default. If the default is also empty, return it anyway and
   let `next()` answer `204`, which the script turns into the silence bed
   exactly as an empty library does today.

DST: Carbon resolves `d@start_time` in the station zone. On the spring-forward
night a 02:30 start is moved to 03:30 by Carbon's own rule; on fall-back the
first occurrence wins. Document, test both with `Carbon::setTestNow`, and
don't build anything special — this is what the show-times migration means by
"20:00 stays 20:00 through a DST change".

### 4.4 `AutoDjScheduler::next()` after the change

```php
public function next(Station $station): ?string
{
    if (! ($station->user?->canUseAutoDj() ?? false)) {
        return null;                       // unchanged: the plan gate
    }

    $playlist = $this->programme->resolve($station)['playlist'];

    $track = $playlist->order === Playlist::ORDER_SHUFFLE
        ? $this->advanceShuffled($playlist)
        : $this->advanceSequential($playlist);

    return $track === null ? null : $this->writer->annotateTrack($track, playlist: $playlist);
}
```

`advanceSequential` / `advanceShuffled` / `deal` / `find` / `persistDeck`
keep their bodies and swap their subject from `Station` to `Playlist`:

- the track query becomes `$playlist->tracks()` (pivot-ordered by
  `playlist_track.position`, scoped to `kind = music`);
- cursor/deck writes go to `DB::table('playlists')` — same reason as before:
  a playlist write must not fire any observer, and there is none on
  `Playlist`, but the bypass also keeps `updated_at` still and avoids the
  cast trap, which is still pinned by the shuffle test;
- "past the end → wrap to the top" now wraps within the playlist.

Cost on the audio path: one extra query (slots + playlists, eager) per track
boundary. The controller already eager-loads `user.plan`; add
`autodjSlots.playlist` and `defaultPlaylist` to that `with()`. Nothing else.

**Switching playlists mid-cycle.** Each playlist keeps its own cursor and
deck, so leaving *Morning Calm* at 12:00 and coming back at 06:00 tomorrow
resumes where it left off. That is the desired behaviour (no daily restart
from track 1) and falls out of the schema for free.

**Boundary accuracy.** `request.dynamic` keeps one request resolved ahead
(prefetch 1, plus the one `cross()` holds — the `.liq` comment about
`flush_and_skip` confirms it). So the answer given at time *T* starts playing
after the current track and the prefetched one finish. A slot boundary is
therefore honoured **within roughly two track lengths**, typically 4–10
minutes late, never early. For dayparting that is correct behaviour (nobody
wants a song cut at 12:00:00). A hard-start option for timed shows is a
follow-up (§7), not part of this.

### 4.5 API

All under the existing authenticated station group in `routes/api.php`;
authorization via `StationPolicy::update` like tracks and show times.

Playlists:

```
GET    /stations/{station:slug}/playlists                  list (with track counts, is_default, order)
POST   /stations/{station:slug}/playlists                  {name, order?}  → 201
PATCH  /playlists/{playlist}                               {name?, order?, is_default?}
DELETE /playlists/{playlist}                               409 if is_default
GET    /playlists/{playlist}/tracks                        ordered
PUT    /playlists/{playlist}/tracks                        {track_ids[]}   replace membership+order (the picker)
POST   /playlists/{playlist}/tracks                        {track_ids[]}   append (upload-into-playlist uses this after /tracks)
DELETE /playlists/{playlist}/tracks/{track}                remove from playlist
PATCH  /playlists/{playlist}/tracks/reorder                {ids[]}         same contract as tracks/reorder
```

Slots — one verb, replace-all, exactly like show times:

```
PUT    /stations/{station:slug}/autodj-slots   {timezone?, slots: [{label?, days[], start_time, end_time, playlist_id}]}
```

Validation (`ReplaceAutodjSlotsRequest`):

- `days`: non-empty, ints 0–6, distinct.
- `start_time`, `end_time`: `H:i`; may be equal only if you want a 24 h slot
  (equal = full day, documented).
- `playlist_id`: belongs to this station.
- Timezone rule copied from `StationScheduleController`: rows present and no
  timezone → 422 on `timezone`.
- **No overlaps**: expand every row into concrete minute intervals over one
  canonical week (Sun 00:00 → next Sun 00:00, with wrap-past-midnight and
  Saturday→Sunday wrap handled), sort, check adjacent pairs. Error names both
  rows: *"Friday Night Mix (Fri 22:00–02:00) overlaps Weekend (Sat 00:00–
  10:00)"*. Touching (one ends 12:00, next starts 12:00) is fine.

Existing track endpoints stay as they are for the library:
`GET/POST /stations/{slug}/tracks`, `PATCH /tracks/{track}`,
`DELETE /tracks/{track}`. `POST …/tracks` gains an optional `playlist_id`;
absent → the upload joins the default playlist (this preserves today's
"upload and it plays"). `PATCH …/tracks/reorder` stays for the library
order and no longer affects playback.

Plan gating on the API: follow the existing precedent for `autodj_order` and
the jingle fields (`UpdateStationRequest`, `gocast-autodj-shuffle` memory):
**not gated at the API**, because the entitlement is enforced where it
matters, in `next()`. Uploading is gated already in `TrackController::store`
via `StationLifecycleService::assertAutoDjEnabled` (with the comment that
listing and deleting stay open so a downgrade never traps someone's files),
and the quota in `TrackImporter::ensureWithinQuota`. Neither changes. The UI
locks the rest.

Internal: `NextTrackController` unchanged in contract (`slug` in, text/plain
URI or 204 out).

### 4.6 Resources

- `PlaylistResource`: `id, name, is_default, order, track_count,
  duration_seconds, position`.
- `AutodjSlotResource`: `id, label, days, start_time, end_time, playlist_id`.
- `StationResource` (owner view) drops `autodj_order` and adds:
  - `autodj_slots` (when loaded), and
  - `programme` (computed by `AutoDjProgramme::resolve`):
    `{playlist: {id, name}, slot_id, until (ISO, station tz), next: {slot_id, playlist_name, starts_at}}`.
    Computed on the owner station page and schedule page only (`when`),
    not on public resources — one resolver call per request is cheap, but it
    is per-station work the player list should not pay.
- `TrackResource` gains `playlist_ids` (when loaded) for the chips.

### 4.7 `PlaylistFileWriter::annotateTrack`

Add `playlist="<name>"` to the annotate metadata. Liquidsoap passes it through
to `on_metadata`, so the now-playing push and `StationEvent` track log can
carry which playlist a track came from with no extra plumbing. Escape through
the existing `escapeAnnotateValue`.

### 4.8 Observers, events, telemetry

- **No `StationObserver` involvement.** Playlist and slot writes never touch
  the `stations` row (`timezone` on the slot save is the one exception, and
  `timezone` is not in `LIQ_RELEVANT_COLUMNS` — verified above). No restart,
  ever, from this feature.
- `StationEvent`: add `TYPE_PLAYLIST_CHANGED` (`properties: {from, to,
  slot_id}`), recorded by `next()` when the resolved playlist differs from the
  previous answer. Cheap, and it makes "why did my station switch at 12:04"
  answerable from the admin timeline. Per the `station-events-not-load-bearing`
  memory: monitoring only, `record()` swallows failures, nothing branches on
  it. Tracking "previous answer" needs one nullable column
  `stations.autodj_last_playlist_id`, written via `DB::table` like the cursor.
  (Alternative: skip the event and infer switches from the track log's
  `playlist` metadata. Recommend the column; the timeline reads better.)
- `MetricsController`: nothing.

### 4.9 Frontend

`client/`:

- `interfaces/Station.ts`: `Playlist`, `AutodjSlot`, `Programme` types;
  remove `autodj_order` from `Station`; add `autodj_slots?`, `programme?`.
- `app/dashboard/stations/[slug]/library/`: `LibraryView.tsx` becomes the
  shell (rail + routed view); extract `PlaylistView.tsx` (ordered list, dnd,
  order toggle — most of today's list code moves here), `AllTracksView.tsx`
  (today's list minus dnd-for-playback, plus chips and the "not in any
  playlist" badge), `TrackPicker.tsx` (modal), `useTrackUpload.ts` gains
  `playlistId`.
- `app/dashboard/stations/[slug]/schedule/page.tsx` + `AutodjSlotsEditor.tsx`
  (modelled on `ScheduleEditor.tsx`, *not* shared with it) + `WeekStrip.tsx`.
- `components/dashboard/AutoDjRotation.tsx`: header line from `programme`,
  tracks from the active playlist.
- `components/dashboard/AppSidebar.tsx`: **AutoDJ** item's `isActive`
  matcher extended to `/schedule`; add a nested "Schedule" entry or a tab —
  designer's call, recommend a tab row on both pages ("Playlists · Schedule")
  so the pair is always visible together.
- `StationChecklist.tsx`: copy tweak only.
- `settings/page.tsx`: one help line under show times (§3.4).

---

## 5. What happens to current stations

This is the part that must be exact. Goal: **a station with no new
configuration behaves identically, byte for byte on the audio path, and no
container restarts during or after the deploy.**

### 5.1 Data migration (one file, `DB::table` only — no models, no observers)

For every station, inside a transaction:

1. Insert one `playlists` row: `name = 'Main rotation'`, `is_default = 1`,
   `order = stations.autodj_order`, `cursor_position =
   stations.autodj_cursor_position`, `deck = stations.autodj_deck` (copied as
   the raw JSON string — it is already encoded), `position = 0`.
2. Insert one `playlist_track` row per `tracks` row with `kind = 'music'`,
   `position = tracks.position`. Positions are already gap-free per
   `(station, kind)`, so they copy straight across.
3. Jingles are not touched.

Stations with zero music tracks still get the default playlist (empty). A
station created after this ships gets its default playlist from a
`static::created` hook in `Station::booted()` — there is no `created()` on
`StationObserver`, and the only creation path is
`StationController::store` (`$user->stations()->create(...)`). Creating it
from the model hook rather than the controller means factories in tests get
one too.

`down()`: copy `order/cursor_position/deck` from each station's default
playlist back to the `stations` columns, then drop the three tables. This
only works while the column-drop migration (below) has also been rolled back,
which is the normal order.

### 5.2 Column drop (second file, runs after 5.1)

Drop `stations.autodj_order`, `autodj_cursor_position`, `autodj_deck`.
`down()` re-adds them nullable. `Station::booted` defaults for
`autodj_order` go with them; the `Playlist` model defaults `order` instead.

### 5.3 Why nothing restarts

- The `.liq` template is untouched, so `LiquidsoapSupervisor::render` produces
  the same script; nothing calls it anyway because no `stations` column in
  `LIQ_RELEVANT_COLUMNS` changes.
- The migration writes with `DB::table`, so `StationObserver` cannot fire.
- `NextTrackController` starts reading the new tables on the first request
  after deploy. The default playlist has the copied cursor/deck, so the next
  answer is the same track the old code would have given.

Deploy order matters only in one way: **migrate before the new code serves
`next-track`**, or the first boundary after deploy 500s (`playlists` table
missing) and the script logs "rotation stalled" and retries in 10 s — one
late track, no crash. `php artisan migrate` in the existing deploy step
before `php-fpm` reload already gives this order.

### 5.4 Equivalence checklist (make these tests)

| today | after, with no slots | pinned by |
|---|---|---|
| sequential plays library top→bottom, wraps | default playlist = library in the same order, wraps | `AutoDjSchedulerTest` |
| cursor survives deploy | copied to `playlists.cursor_position` | migration test |
| shuffle deck survives deploy | copied to `playlists.deck`, still track IDs | migration test + `AutoDjShuffleTest` |
| deleted track skipped lazily | pivot cascade removes it; deck skip still lazy | existing shuffle tests |
| new upload appears in rotation | joins default playlist at tail (sequential) / dealt into remaining deck (shuffle) | `TrackControllerTest` |
| free owner gets 204 | unchanged, checked before resolve | `NextTrackControllerTest` |
| empty library → silence bed | empty default → null → 204 | `NextTrackControllerTest` |
| reorder in library changes playback | **no longer** — reorder the default playlist instead | changed test, and the UI drags inside the playlist |

The last row is the one behavioural difference for an existing owner: the
drag handles they used are now inside *Main rotation* rather than on "All
tracks". Since the library page opens on the default playlist, the handles
are in the same place on screen.

### 5.5 The deferred shuffle item, closed

`gocast-deferred-decisions` / `gocast-autodj-shuffle`: "a new upload waits
for the next deal (~13 h on a 200-track library)". With explicit add-to-
playlist calls, `Playlist::attachTracks()` can splice new IDs into the
remaining deck at random offsets in the same `DB::table` write. Do it in this
change; it's ten lines now and the test harness for decks already exists.

---

## 6. Rollout, in order

Each phase is shippable on its own and leaves the product coherent.

**Phase 1 — Playlists (backend).** Tables, models, data migration, column
drop, `AutoDjScheduler` on `Playlist`, playlist endpoints, upload-into-
playlist, deck splice, `annotateTrack` playlist tag. Tests: migration
equivalence, scheduler on playlists, shuffle test moved to playlists,
playlist CRUD + membership + default rules, quota unchanged. No UI yet;
existing UI keeps working because the default playlist mirrors the library.

**Phase 2 — Playlists (UI).** Library shell, playlist view, all-tracks view,
picker, chips, locked state. `AutoDjRotation` reads the default playlist.
`autodj_order` toggle moves into the playlist view.

**Phase 3 — Slots (backend).** `autodj_slots`, `AutoDjProgramme`, overlap
validation, timezone rule, `programme` on the resource, `PLAYLIST_CHANGED`
event. Tests: resolver (weekday, cross-midnight, Sat→Sun wrap, DST both
directions, empty-playlist fallback, no timezone), overlap validator (touching
allowed, wrap overlaps caught), `next()` picks the slot's playlist and keeps
per-playlist cursors.

**Phase 4 — Slots (UI).** Schedule page, editor, week strip, on-air-now line,
sidebar/tab, settings help text, checklist copy.

Effort, honestly: phases 1+2 are the bulk (a week of focused work including
the UI rework); 3+4 are a few days each because they reuse the show-times
patterns.

---

## 7. Deliberately out of scope (with the reason)

- **Hard-start slots** ("cut the current track at 22:00 sharp"). Possible:
  a minutely artisan command finds boundaries in the last minute and sends
  `<autodj>.flush_and_skip` over telnet, which drops the prefetched track and
  the crossfade buffer. Jarring by default, useful for timed shows. Add as a
  per-slot `starts_on_time` flag later.
- **Scheduled jingles / per-slot jingle settings.** Jingles are station-wide
  interactive variables; making them per-slot means pushing `var.set` at each
  boundary. Fine later, not now.
- **Weighted / category rotation** ("70% current, 30% gold"). Playlists are
  the prerequisite; weights are a `next()` change once they exist.
- **Public "what's on now"** on the player page. Trivial once `programme`
  exists, but it *will* be confused with show times on the same page. Needs a
  design pass, not a backend change.
- **One-off dated shows** (a slot on 2026-12-31 only). Needs a date column
  and a different editor; weekly slots cover the ask.
- **Slot-level "stop AutoDJ / silence"** as a scheduling option. The power
  button and audio-based auto-stop own on/off; letting the schedule turn a
  station off would cross the line the show-times migration drew.

---

## 8. Decisions taken in this document (so nobody re-litigates them)

1. Scheduling lives in `AutoDjScheduler::next()`; the `.liq` is untouched.
2. Playlist membership is a pivot; a track may be in many playlists.
3. Every station has exactly one undeletable default playlist; it is created
   from the current rotation by migration and inherits the cursor and deck.
4. Play order (sequential/shuffle) and cursor/deck are per playlist.
5. Slots are weekly, wall-clock in the station timezone, may cross midnight,
   may not overlap, and require a timezone to save.
6. An empty scheduled playlist falls through to the default; an empty default
   is silence, as an empty library is today.
7. Slot boundaries are honoured at the next track boundary (≈ two tracks
   late at most), never by cutting a track.
8. `autodj_slots` / `AutodjSlot` / `AutoDjProgramme` naming; nothing new is
   called "schedule" in code, to keep it apart from show times.
9. API not plan-gated for playlists/slots, matching `autodj_order` and the
   jingle fields; entitlement stays in `next()`; the UI locks creation.
10. Uploads with no `playlist_id` join the default playlist.
