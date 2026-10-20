---
feature: Schedule (show times + AutoDJ slots)
verified: 2026-10-18 against 73158c8 plus uncommitted work (feat/dashboard-design)
sources:
  - api/app/Models/StationSchedule.php
  - api/app/Models/AutodjSlot.php
  - api/app/Http/Controllers/StationScheduleController.php
  - api/app/Http/Controllers/AutodjSlotController.php
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Requests/ReplaceStationSchedulesRequest.php
  - api/app/Http/Requests/ReplaceAutodjSlotsRequest.php
  - api/app/Http/Requests/UpdateStationRequest.php
  - api/app/Http/Resources/StationScheduleResource.php
  - api/app/Http/Resources/AutodjSlotResource.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Services/AutoDjProgramme.php
  - api/app/Services/AutoDjScheduler.php
  - api/app/Http/Controllers/NextTrackController.php
  - api/app/Http/Controllers/PublicStationController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Observers/StationObserver.php
  - client/app/dashboard/stations/[slug]/schedule/page.tsx
  - client/app/dashboard/stations/[slug]/schedule/SchedulePlanner.tsx
  - client/app/dashboard/stations/[slug]/schedule/weekModel.ts
  - client/app/dashboard/stations/[slug]/schedule/WeekGrid.tsx
  - client/app/dashboard/stations/[slug]/schedule/SlotPanel.tsx
  - client/app/dashboard/stations/[slug]/schedule/DayList.tsx
  - client/app/dashboard/stations/[slug]/schedule/days.ts
  - client/app/dashboard/stations/[slug]/schedule/ScheduleNow.tsx
  - client/app/dashboard/stations/[slug]/schedule/TimezoneDialog.tsx
  - client/app/dashboard/stations/[slug]/schedule/TimezoneCombobox.tsx
  - client/app/dashboard/stations/[slug]/settings/page.tsx
  - client/app/station/[slug]/PlayerView.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/components/dashboard/shell/TopBar.tsx
  - client/contexts/StationContext.tsx
  - client/lib/setupItems.ts
  - client/components/ds/DayToggle.tsx
  - client/app/(marketing)/help/_content/schedule-playlists-by-time.tsx
  - client/app/(marketing)/help/_content/your-player-page.tsx
  - client/app/(marketing)/help/_content/share-your-station.tsx
  - client/app/(marketing)/blog/_content/how-to-schedule-playlists-on-your-radio-station.tsx
  - mobile/src/app/station/[slug]/schedule.tsx
  - mobile/src/components/station/ScheduleEditor.tsx
  - mobile/src/components/station/overview.tsx
  - mobile/src/app/show-times/[slug].tsx
  - mobile/src/app/station/[slug]/index.tsx
fingerprint: 5c2b6d6ef0760898
---

# Schedule

Two unrelated lists share one timezone:

- **Show times** were *advertising*: "when you're usually live". They **do nothing** to the station. As of 2026-10-18 (uncommitted) they are **retired from the web**: no web page edits them, and the player page no longer renders them. The table, the API and the mobile Show times screen are kept, so the phone still edits rows nobody on the web sees.
- **AutoDJ slots** are *programming*. They decide which playlist AutoDJ draws from, hour by hour. They're edited on the **Schedule** page, which is Pro. The station timezone is now edited there too.

Everything confusing about this feature came from the two looking alike: both have days and a start time. Until 2026-09-29 they shared one page, with a "Live show | AutoDJ" picker on mobile, and Pro owners saved show times expecting them to schedule AutoDJ. Going live never needs a slot: it takes over from whatever is playing. In code, **"schedule" always means show times**. The slot side is called **"programme"** (`AutoDjProgramme`), so nobody wires the audio path to the advertising table by accident.

## At a glance

| | Show times | AutoDJ slots |
|---|---|---|
| Edited in | Mobile Show times screen only (web editor removed) | Schedule page / tab |
| Table | `station_schedules` | `autodj_slots` |
| Endpoint | `PUT /stations/{slug}/schedules` | `PUT /stations/{slug}/autodj-slots` |
| Plan | Every plan | Pro (enforced at playback, see below) |
| Shape | Days + **start only** (no end) | Days + start + **end** + playlist |
| Overlaps | Allowed | Refused on save (touching is fine) |
| Read by the audio path | **Never** | Every track boundary |
| Visible to listeners | **No** (the web player page dropped them; the public API still sends them) | No |
| Max rows | 20 | 50 |

## Show times: what's left of them

**Effect on the station: none.** Nothing reads `station_schedules` except code that displays it. Checked on 2026-09-29, it does **not**:

- start, stop or wake a container;
- remind anyone, send a notification or email;
- affect `is_live`, the on-air lamp, auto-stop or the sweeper;
- reach the `.liq`. `timezone` is deliberately not in StationObserver's `LIQ_RELEVANT_COLUMNS`, so saving never restarts a station.

**Who reads it now:**

- `PublicStationController::show` still eager-loads `schedules` and `StationResource` still serialises them with `next_occurrence`, but no web code reads the field: `ScheduleBlock` ("Full schedule" sheet) was deleted from the player page, and `client/` has no reader of `schedules` beyond the type in `interfaces/Station.ts`.
- The owner's `GET /stations/{slug}` still loads them (`StationController::show`), for the mobile app only.
- The web overview's "Coming up" card (`ComingUpCard`, `lib/comingUp.ts`), the Schedule page's grey "YOU" marks and "Your next show" card, Station settings' "When you're usually live" section (`ShowTimesSection`/`ShowTimesEditor`), and the setup item "Set your show times" (`lib/setupItems.ts`) are all gone.
- Mobile still reads and writes them (see Surfaces).

**Data rules:**

- `days` is the weekdays the show **starts** (0 = Sunday), stored deduped and sorted. A Sunday 23:00 show belongs to Sunday.
- `start_time` is a wall clock in the station's timezone and survives DST.
- There's no end time on purpose. "Is it on now?" is answered by the stream (`is_live`), not by a guessed window.
- A save is a full-list replace: delete everything, then recreate in array order (`position` = index). Row IDs aren't stable across saves.
- `next_occurrence`, a UTC instant computed server-side (`StationSchedule::nextOccurrence`), exists only so the player page can restate each row in the listener's own clock. When the station has no timezone it's null.
- Saving rows while the station has no timezone returns 422 ("Set the station timezone before adding show times.").

## AutoDJ slots: what they actually do

**Resolution** is `AutoDjProgramme::resolve`, the only place slots are interpreted:

1. If the station has no timezone or no slots, the **default playlist** plays.
2. Otherwise it expands each slot into concrete windows from yesterday to 8 days ahead (`AutodjSlot::windowsBetween`). The window containing *now* is active.
3. If no window is active, the default playlist plays until the next slot starts.
4. If the active slot's playlist is empty, it falls through to the default playlist, not to silence.
5. An end at or before the start means the slot runs past midnight into the next day, and it's filed under the day it starts.

**Playback** is `AutoDjScheduler::next`, called by the container's `request.dynamic` through `GET /internal/next-track` at every track boundary. The container sends `X-Gocast-Remaining`, the seconds left on its current track, so the answer's start time is known: `now + remaining`, plus the crossfade window when crossfade is on (`AutoDjScheduler::leadSeconds()`, override `LIQUIDSOAP_PLANNING_LEAD_SECONDS`). The programme is resolved **at that start time**, not at now. A container on a script older than the header is served the old way: resolved at now, music only.

- **Plan gate:** if the owner can't use AutoDJ, it returns null, the endpoint answers 204, and nothing plays. This is the only real enforcement point.
- Each playlist keeps its own cursor or shuffle deck, so leaving a playlist and coming back resumes where it left off.
- The first boundary that lands in a different playlist writes a `playlist_changed` station event. That's for monitoring only (`station_events` is admin monitoring only; never branch product logic on it).

**Timing consequences:**

- Each slot has a `start_mode` (`autodj_slots.start_mode`, default `soft`; `AutodjSlotResource` returns it, and the PUT accepts it as `sometimes`, so a row sent without it saves as `soft`). The web slot dialog shows it as a "Start exactly on time" switch: off reads "Starts after the song playing at 06:00 ends.", on reads "Starts at 06:00 on the dot. AutoDJ picks a song that ends in time, or fades out the one playing." The phone has no switch; it sends each slot's mode back as it was (new slots `soft`).
- **Soft:** the slot starts with the first track that *starts* after its start time. The song playing at the start time finishes first.
- **Hard (on time):** before the start time, AutoDJ hands out only songs that end before it. In a shuffled playlist it takes the first card further down the deck that fits, and the cards it skipped stay in the deck. An in-order playlist never skips ahead. When nothing fits, the next song is cut to end on the start time with a 2s fade (`liq_cue_out` + `liq_fade_out`). When less than `LIQUIDSOAP_HARD_START_EARLY_SECONDS` (20) is left, the slot starts that much early instead. A song of unknown length counts as fitting while the boundary is 30+ minutes away. A hard slot whose playlist is empty is ignored.
- Accuracy, measured on Liquidsoap 2.4.5: within about 1.5s after a song, a few seconds early after a short jingle.
- If Liquidsoap asks twice within 2s (it sometimes re-asks while the first answer is still loading), the second answer is planned after the first (`stations.autodj_queued_*`).
- Going live overrides any slot instantly. When the broadcaster disconnects, the next boundary resolves *at that moment*, so AutoDJ comes back with whatever should be on then, not what was playing before.

**Where the resolved programme appears:**

- `StationResource.programme`, only when `autodjSlots` is loaded: the owner's show endpoint, the slot save, and now `PATCH /stations/{slug}` (`StationController::update` loads `autodjSlots.playlist` + `defaultPlaylist`, so a timezone save answers with the programme resolved in the new zone). It carries the playlist, `slot_id`, `until`, and `next`.
- The web Schedule page's **Right now** card (`ScheduleNow`).
- `StationStatusController` (dashboard polling): resolves the playlist for the up-next queue, and now also returns `playlist: {id, name, scheduled}` (`scheduled` = a slot put it there) so a silent station can name the empty playlist.
- Mobile Schedule: the NOW badge on the active slot row.

**Validation** (`ReplaceAutodjSlotsRequest`): the playlist must belong to this station, there must be at least one day, and `start_mode`, when sent, is `soft` or `hard`. Overlaps are checked over one canonical week in minutes, wrapping past Saturday midnight, and the error names both slots. Deleting a playlist cascade-deletes the slots that point at it.

## Timezone (shared)

- `stations.timezone` is an IANA name, nullable, and never defaults to UTC.
- Changing it re-times *both* show times and slots.
- Clearing it is refused while either lane has rows. That's enforced in three places: both replace requests and `UpdateStationRequest`.
- **Web: it's edited on the Schedule page**, in `TimezoneDialog` (the only user of `schedule/TimezoneCombobox`, moved there from settings). The page header shows the zone in caps with "Change", or "No timezone" with "Set timezone"; Free (locked) sees the zone with no button. The dialog opens on the station's zone, or the browser's when null, and saves with `PATCH /stations/{slug}` `{timezone}`; Save is disabled while the pick equals the current zone. The reply's `timezone` and `programme` update the page. It never sends null, so the web cannot clear a zone. With the combobox's list open, the first Esc closes the list, not the dialog.
- **The slot PUT never sends it.** Web and mobile both omit `timezone` from `PUT /autodj-slots`, and the API keeps the station's. With slots and no timezone, Save is blocked ("Not saved: no timezone") and a "No timezone" notice offers "Set it now", which opens the dialog.
- **Mobile:** there's no picker. The Show times screen sends `station.timezone ?? <phone's zone>`, so the first save from a phone silently stamps the phone's zone.
- The API still *accepts* `timezone` on both PUTs. The single-editor rule is enforced by the clients, not the server.
- Other readers: the top bar's station clock (`TopBar`, from `StationContext`) and the overview's shows chart only display it; `TimezoneDialog`'s own note says jingle clock times fall back to UTC without one.

## Surfaces

| Surface | Show times | AutoDJ slots |
|---|---|---|
| Web Station settings | **Nothing** (section removed; the page is profile, stream, links, encoder, delete) | — |
| Web Schedule `/dashboard/stations/{slug}/schedule` | Nothing (the "YOU" marks and "Your next show" card are gone) | **Editable week grid** (see below) plus the timezone. Free sees the grid without slots, a PRO tag by the title, `AutoDjUpsell`, and "Off air unless you're live"; the sidebar item carries the Pro lock |
| Web overview and top-bar setup menu | Nothing ("Coming up" and "Set your show times" removed) | — |
| Player page `/station/{slug}` | **Not shown** (`ScheduleBlock` deleted) | Never shown |
| Mobile Overview → "Your link" card → **Show times** screen | **Editor**, every plan, no timezone picker. Copy still says they "appear on your player page" and the footer says to change the zone "in Station settings on the web" (both now wrong) | — |
| Mobile Station → Schedule tab | Read-only coral rows ("Show time · on your player page"); tapping opens the Show times screen | **Editor**, Pro only; "+ Add" always creates a slot. Free sees a Pro note and no Add. No on-time switch: the editor's note says a slot "starts after the song playing at its start time, unless it’s set on the web to start exactly on time" |
| Help | `your-player-page` and `share-your-station` no longer mention show times | `schedule-playlists-by-time` (its Timezone section points at "Change" on the Schedule page); blog `how-to-schedule-playlists-on-your-radio-station` (same) |

## The web week grid

The Schedule page is a full-width week timeline that is also the editor (`WeekGrid`, `SlotPanel`, `weekModel`). It has one row per day, Monday first, running midnight to midnight left to right in 15-minute steps, so the whole week fits on screen without scrolling. A Google-Calendar layout (days as columns) was tried on 2026-09-29 and switched back: radio programming is mostly long blocks, and rows draw them wide.

- **Blocks, not rows.** Each API slot row is split into one block per day on load (`explode`). On save, identical blocks (same playlist, name, start, end and start mode, `signature`) are merged back into multi-day rows (`merge`). The API and the data model are unchanged.
- **Drag along an empty stretch** to draw a block, clamped to the free space around it (`freeBounds`). A plain click makes one hour from the quarter hour clicked (`freeSpanAt`). New blocks use the first non-default playlist. The "Add slot" button adds an hour at the next free hour.
- **Dragging a left or right edge changes that one day only.** It snaps to 15 minutes, stops at the neighbouring block (the server refuses overlaps), and a block stays between 15 minutes and 24 hours long. A drag can carry a block past midnight.
- **Clicking a slot (or drawing a new one) opens it in a dialog** (`SlotPanel` inside the planner's `Dialog`). Edge drags deliberately don't open it, so the modal never covers the grid mid-drag. **The dialog edits every ticked day at once.** Ticking a day copies the block onto it, unticking removes that copy (the last day can only go through Delete), and Delete removes all of them ("Delete on all 5 days" / "Delete slot"). Below the times sits the "Start exactly on time" switch (`start_mode`). Start and end are `TimeStepper`s: a time input between − and + buttons that move it 15 minutes, captioned by a `<label htmlFor>` the input (a wrapping label made a caption click press "15 minutes earlier"); on phones the buttons are narrower (`w-9`, `w-11.5` from `sm`) and the time is `text-base`, so both fit the sheet.
- **On a phone (below the `md` breakpoint, 768px) the grid is replaced by the Android app's layout** (`DayList`): a strip of the seven days, then the picked day's rows top to bottom, in the app's order (AutoDJ slots by playlist swatch, "· on time" after a hard slot's times, or "Nothing on Tuesday yet. <default> plays all day." when none falls on that day). The day chips show the weekday and a "Today" mark, no dates (slots repeat every week) and no slot dots (removed 2026-10-20: with no legend on a phone they meant nothing). A slot that runs past midnight shows on the next day as "→ 02:00". Tapping a row opens the same `SlotPanel` dialog; "Add slot on Tuesday" puts an hour on the day being looked at, at the first free hour from now (today) or from 06:00. Both layouts are in the markup and CSS picks one, so the blocks and the selection survive a resize. Drawing and edge drags exist only on the grid. From `md` up the save state and Save sit in the "Every week" card header beside **Expand** (the grid view over the whole window, `fixed inset-0 z-40`, rows stretched; Escape or Exit leaves, an open dialog takes Escape first), and the page fits the window: `WeekGrid` `fitWindow` measures the chrome above and below and sizes the day rows 40–58px. "Right now" is one line under the page header (`ScheduleNow`), not a card. On phones a sticky bottom bar carries Save once there are unsaved changes (the header's copies stand in otherwise). With no timezone, an amber row "Your station has no timezone" with a Set timezone button sits under the header whenever the station has none. A **new** slot's dialog (Add slot, a click or drag on the grid, "Add slot on Tuesday") ends in **Cancel** / **Add slot**; Cancel, ×, Escape or a tap outside restore the blocks from before it (`adding.before` in `SchedulePlanner`), so backing out leaves nothing unsaved. An existing slot's dialog keeps **Delete** / **Done**, its edits applying as they are made. "NOW" on a row means the station's clock is inside it, not that it is playing; the banner says what plays.
- **Explicit Save** (autosave was tried and dropped on 2026-09-29): the Save button in the page header sends the same full-list `PUT /autodj-slots` without `timezone`. It's disabled when nothing changed, while blocks overlap, or while the station has no timezone. A lamp beside it says "All saved" (green), "Unsaved changes", "Not saved: slots overlap", "Not saved: no timezone" or "Not saved" (amber); a failed save also shows the server's error in a `Notice`. Leaving with unsaved changes triggers the browser's warning.
- **One card above the week** (`ScheduleNow`), **Right now**, labelled as a plan: the playlist AutoDJ has lined up from `programme` (`describeProgramme`: "until 10:00 · then Main rotation", or "All day, until another slot starts."), plus "AutoDJ is off right now." when the station is off; with no programme, the default playlist's name and "Plays whenever nothing else is scheduled."; on Free, "Off air unless you’re live". The "Your next show" card went with show times. What the station is actually doing is the status band's, above every page; the station clock is in the top bar. The planned playlist is refetched 5s after `programme.until` passes.
- **The legend** under the grid (grid only, from `md`) names the default playlist ("… fills the gaps") and each playlist in use with its swatch: the playlist's own hex colour when the owner set one (Playlists → Name & colour), else a violet shade by position. Day rows show the short weekday and, on today's row only, "Today"; dates were removed (`weekDates.ts` deleted) because "20 OCT" read as a one-off. With no playlists at all the grid is read-only and a line points to Playlists.
- **The now line** and "today" use the station's timezone, not the browser's.
- The grid has a 44rem minimum width and scrolls sideways when its column is narrower than that (a laptop window just above `md` with the sidebar open); the single-day view only takes over below `md`.
- The UI never says "repeat" or "every week". Slots are weekly by nature, and the Days chips are the only way to express it.

## Gaps and traps

These are real as of the verified commit. Fix them or delete them from this list; don't let them rot.

1. **Mobile still sells show times as player-page text.** The Show times screen ("They appear on your player page"), the overview's "N on your player page" (`mobile/src/components/station/overview.tsx`) and the Schedule tab's "Show time · on your player page" rows describe a display the web player no longer has. Its footer also says to change the zone "in Station settings on the web", which moved to the Schedule page.
2. **Show-time rows are now invisible on the web but still enforced.** Clearing the timezone is refused while any show time exists (`UpdateStationRequest`, `ReplaceAutodjSlotsRequest`), with an error that tells a web user to remove show times they have no way to see. The web never sends null, so this only bites API and mobile callers today.
3. **The public API still ships `schedules` with `next_occurrence`** (`PublicStationController::show` eager-loads them) though nothing on the web reads them: wasted queries and a public field for a retired feature.
4. **The top-bar clock keeps the old zone after a timezone change.** `TopBar` reads `StationContext`, set once by the dashboard layout; `TimezoneDialog.onSaved` only updates the planner's state and doesn't refresh the router, so the clock is stale until a reload (inferred from the code, not reproduced).
5. **The mobile timezone is implicit.** There's no picker, the phone's zone is stamped on the first show-time save, and the "Times are in X" footer only appears once one is set. Changing it means using the web.
6. **The mobile day strip uses the phone's calendar.** The selected day and "today" come from `new Date()` on the phone, but the rows are station-timezone weekdays. If the phone and station are in different zones, the NOW badge and "today" can be a day off near midnight.
7. **The mobile day view isn't the real day.** A slot crossing midnight isn't shown on the day it spills into. The "All day" default row only appears when *no* slot starts that day, so the gaps around a partial-day slot aren't shown.
8. **Mobile saves are read-modify-write from the last loaded station.** A full-list PUT built from a stale copy overwrites edits made on the web in between. The web page has the same exposure if two tabs are open.
9. **The slot API has no plan check.** A Free owner can PUT slots via the API. It's harmless because `next()` gates playback, but the rows exist.
10. **Some prod show times were probably meant as AutoDJ slots.** On 2026-09-29, 4 Pro stations had show times with zero live sessions since, and each had only one playlist. Those rows no longer show anywhere on the web, so this now only matters if show times come back.
11. **The grid can't move a whole block by dragging its middle**, only its edges. Moving one means changing its times in the dialog.
12. **Between `md` (768px) and the grid's 44rem minimum the web grid is a sideways scroll.** The phone day list only replaces it below `md`.
13. **Naming:** don't call anything slot-related "schedule". `station_schedules`/`schedules()` is the advertising table.

## Tests

`api/tests/Feature/StationScheduleTest.php`, `AutodjSlotTest.php` (now also: a station PATCH answers with `programme` in the new timezone, uncommitted), `AutoDjProgrammeTest.php`, `NextTrackControllerTest.php`, and `AutoDjPlanningTest.php` for the on-time starts (soft versus hard, fit and cut, early start, landing on time over a run of asks, empty on-time playlist). The first three passed on 2026-09-29 (49 tests). They cover DST, cross-midnight, overlap wrap, the timezone guards, and empty-playlist fall-through. There are no client or mobile tests for this feature (`ShowTimesEditor.test.tsx` was deleted with the editor).

## History

- Why the two lists are separate, and the original design: `docs/AUTODJ-SCHEDULING-PLAN.md` §0 and `docs/AUTODJ-SCHEDULING-HANDOFF.md` (commit 768d32d).
- Show times started in Station settings, moved to a "When you're live" lane on the shared Schedule page during the dashboard plain-language pass (2026-09-26), and moved back to Station settings on 2026-09-29. The Schedule page is AutoDJ only again, and the timezone has one editor. Prod data needed no migration: no tables or endpoints changed, and every station with rows already had a timezone.
- 2026-10-18 (uncommitted): show times retired from the web UI (settings section, player-page sheet, overview "Coming up", Schedule marks, setup item); the timezone editor moved to the Schedule page as `TimezoneDialog` saving via `PATCH /stations/{slug}`. DB, API and mobile kept.
