---
feature: Schedule (show times + AutoDJ slots)
verified: 2026-10-04 against e145a37 plus uncommitted work (feat/design-system)
sources:
  - api/app/Models/StationSchedule.php
  - api/app/Models/AutodjSlot.php
  - api/app/Http/Controllers/StationScheduleController.php
  - api/app/Http/Controllers/AutodjSlotController.php
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
  - client/app/dashboard/stations/[slug]/schedule/SchedulePlanner.tsx
  - client/app/dashboard/stations/[slug]/settings/page.tsx
  - client/app/dashboard/stations/[slug]/settings/ShowTimesSection.tsx
  - client/app/dashboard/stations/[slug]/settings/ShowTimesEditor.tsx
  - client/app/dashboard/stations/[slug]/schedule/weekModel.ts
  - client/app/dashboard/stations/[slug]/schedule/WeekGrid.tsx
  - client/app/dashboard/stations/[slug]/schedule/SlotPanel.tsx
  - client/app/dashboard/stations/[slug]/schedule/DayList.tsx
  - client/app/station/[slug]/ScheduleBlock.tsx
  - client/app/station/[slug]/PlayerView.tsx
  - client/components/dashboard/AppSidebar.tsx
  - client/app/(marketing)/help/_content/schedule-playlists-by-time.tsx
  - client/app/(marketing)/help/_content/your-player-page.tsx
  - client/app/(marketing)/help/_content/share-your-station.tsx
  - client/app/(marketing)/blog/_content/how-to-schedule-playlists-on-your-radio-station.tsx
  - mobile/src/app/station/[slug]/schedule.tsx
  - mobile/src/components/station/ScheduleEditor.tsx
  - mobile/src/app/show-times/[slug].tsx
  - mobile/src/app/station/[slug]/index.tsx
  - client/app/dashboard/stations/[slug]/schedule/ScheduleNow.tsx
  - client/app/dashboard/stations/[slug]/schedule/weekDates.ts
  - client/components/dashboard/overview/SetupChecklist.tsx
  - client/components/dashboard/overview/ComingUpCard.tsx
  - client/lib/comingUp.ts
  - client/components/ds/DayToggle.tsx
  - client/app/dashboard/stations/[slug]/settings/TimezoneCombobox.tsx
fingerprint: ee398de6bc77d9cd
---

# Schedule

Two unrelated lists share one timezone:

- **Show times** are *advertising*. They're text on the player page and **do nothing** else. They're edited in **Station settings** on every plan (on mobile: Overview → Your link → Show times).
- **AutoDJ slots** are *programming*. They decide which playlist AutoDJ draws from, hour by hour. They're edited on the **Schedule** page, which is Pro.

Everything confusing about this feature comes from the two looking alike: both have days and a start time. Until 2026-09-29 they also shared one page, with a "Live show | AutoDJ" picker on mobile, and Pro owners saved show times expecting them to schedule AutoDJ. Going live never needs a slot: it takes over from whatever is playing. In code, **"schedule" always means show times**. The slot side is called **"programme"** (`AutoDjProgramme`), so nobody wires the audio path to the advertising table by accident.

## At a glance

| | Show times | AutoDJ slots |
|---|---|---|
| Edited in | Station settings (web), Show times screen (mobile) | Schedule page / tab |
| Table | `station_schedules` | `autodj_slots` |
| Endpoint | `PUT /stations/{slug}/schedules` | `PUT /stations/{slug}/autodj-slots` |
| Plan | Every plan | Pro (enforced at playback, see below) |
| Shape | Days + **start only** (no end) | Days + start + **end** + playlist |
| Overlaps | Allowed | Refused on save (touching is fine) |
| Read by the audio path | **Never** | Every track boundary |
| Visible to listeners | Yes, "Full schedule" on the player page | No |
| Max rows | 20 | 50 |

## Show times: what they actually do

**Effect on the station: none.** Nothing reads `station_schedules` except code that displays it. Checked on 2026-09-29, it does **not**:

- start, stop or wake a container;
- remind anyone, send a notification or email;
- affect `is_live`, the on-air lamp, auto-stop or the sweeper;
- reach the `.liq`. `timezone` is deliberately not in StationObserver's `LIQ_RELEVANT_COLUMNS`, so saving never restarts a station.

**Who reads it:**

- `PublicStationController::show` eager-loads `schedules`, and the player page renders them in the "Weekly schedule" sheet, reached from the "Full schedule" button. That button only appears when there's at least one row.
- The owner's `GET /stations/{slug}` loads them for Station settings (the editor), the Schedule page (read-only marks) and the mobile app.
- The overview's setup checklist ticks "Set your show times" when there's at least one row (`components/dashboard/overview/SetupChecklist.tsx`), and "Coming up" lists each show time's next occurrence (`lib/comingUp.ts`).

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

**Playback** is `AutoDjScheduler::next`, called by the container's `request.dynamic` through `GET /internal/next-track` at every track boundary:

- **Plan gate:** if the owner can't use AutoDJ, it returns null, the endpoint answers 204, and nothing plays. This is the only real enforcement point.
- Each playlist keeps its own cursor or shuffle deck, so leaving a playlist and coming back resumes where it left off.
- The first boundary that lands in a different playlist writes a `playlist_changed` station event. That's for monitoring only (`station_events` is admin monitoring only; never branch product logic on it).

**Timing consequences:**

- A slot starts at the **next track boundary**, not on the minute. A long track delays it by the rest of that track.
- Going live overrides any slot instantly. When the broadcaster disconnects, the next boundary resolves *at that moment*, so AutoDJ comes back with whatever should be on then, not what was playing before.

**Where the resolved programme appears:**

- `StationResource.programme`, only when `autodjSlots` is loaded (the owner's show endpoint and the slot save): the playlist, `slot_id`, `until`, and `next`.
- Web Schedule page: "AutoDJ's playlist right now: X · detail".
- `StationStatusController` (dashboard polling): resolves the playlist for the up-next queue.
- Mobile Schedule: the NOW badge on the active slot row.

**Validation** (`ReplaceAutodjSlotsRequest`): the playlist must belong to this station, and there must be at least one day. Overlaps are checked over one canonical week in minutes, wrapping past Saturday midnight, and the error names both slots. Deleting a playlist cascade-deletes the slots that point at it.

## Timezone (shared)

- `stations.timezone` is an IANA name, nullable, and never defaults to UTC.
- Changing it re-times *both* show times and slots.
- Clearing it is refused while either lane has rows. That's enforced in three places: both replace requests and `UpdateStationRequest`.
- **It's edited in exactly one place: Station settings → When you're usually live** (`ShowTimesSection`, the only user of `settings/TimezoneCombobox`). It saves through the show-times PUT, so a Pro owner with no show times sets it by pressing Save with an empty list. A null zone is displayed as the browser's zone, not flagged as a change, and persisted by the first save.
- **The Schedule page and the slot PUT never send it.** Web and mobile both omit `timezone` from `PUT /autodj-slots`, and the API keeps the station's. The page shows it read-only in the header ("EUROPE/LONDON · Change", linking to settings). With no timezone, the slot editor refuses to save ("Not saved: no timezone") and a "No timezone" notice points to settings.
- **Mobile:** there's no picker. The Show times screen sends `station.timezone ?? <phone's zone>`, so the first save from a phone silently stamps the phone's zone.
- The API still *accepts* `timezone` on both PUTs. The single-place rule is enforced by the clients, not the server.

## Surfaces

| Surface | Show times | AutoDJ slots |
|---|---|---|
| Web Station settings `/dashboard/stations/{slug}/settings#show-times` ("When you're usually live") | **Editor** plus the timezone picker, every plan. Day chips are neutral off-white (`DayToggle tone="neutral"`), Monday first | — |
| Web Schedule `/dashboard/stations/{slug}/schedule` | Grey dashed "YOU" marks on the grid (not red: red means live right now), linking to settings; the "Your next show" card names the next one | **Editable week grid** (see below). Free sees the grid without slots, a PRO tag by the title, "Off air unless you're live" and "Request Pro"; the sidebar item carries the Pro lock |
| Web overview | Setup checklist "Set your show times" links to settings `#show-times`; "Coming up" lists the next ones | "Coming up" lists AutoDJ's next slot change (`programme.next`) |
| Player page `/station/{slug}` | "Full schedule" sheet, converted to the listener's clock with the station's clock in brackets | Never shown |
| Mobile Overview → "Your link" card → **Show times** screen | **Editor**, every plan. No timezone picker | — |
| Mobile Station → Schedule tab | Read-only coral rows ("Show time · on your player page"); tapping opens the Show times screen | **Editor**, Pro only; "+ Add" always creates a slot. Free sees a Pro note and no Add |
| Help | `your-player-page`, `share-your-station`, `schedule-playlists-by-time` | `schedule-playlists-by-time`; blog `how-to-schedule-playlists-on-your-radio-station` |

## The web week grid

The Schedule page is a full-width week timeline that is also the editor (`WeekGrid`, `SlotPanel`, `weekModel`). It has one row per day, Monday first, running midnight to midnight left to right in 15-minute steps, so the whole week fits on screen without scrolling. A Google-Calendar layout (days as columns) was tried on 2026-09-29 and switched back: radio programming is mostly long blocks, and rows draw them wide.

- **Blocks, not rows.** Each API slot row is split into one block per day on load. On save, identical blocks (same playlist, name, start and end) are merged back into multi-day rows. The API and the data model are unchanged.
- **Drag along an empty stretch** to draw a block, clamped to the free space around it (`freeBounds`). A plain click makes one hour from the quarter hour clicked (`freeSpanAt`). New blocks use the first non-default playlist. The "Add slot" button adds an hour at the next free hour.
- **Dragging a left or right edge changes that one day only.** It snaps to 15 minutes, stops at the neighbouring block (the server refuses overlaps), and a block stays between 15 minutes and 24 hours long. A drag can carry a block past midnight.
- **Clicking a slot (or drawing a new one) opens it in a dialog** (`SlotPanel` inside the planner's `Dialog`). Edge drags deliberately don't open it, so the modal never covers the grid mid-drag. **The dialog edits every ticked day at once.** Ticking a day copies the block onto it, unticking removes that copy, and Delete removes all of them. Start and end are `TimeStepper`s: a time input between − and + buttons that move it 15 minutes; on phones the buttons are narrower (`w-9`, `w-11.5` from `sm`) and the time is `text-base`, so both fit the sheet.
- **On a phone (below the `md` breakpoint, 768px) the grid is replaced by the Android app's layout** (`DayList`): a strip of the seven days with this week's dates, then the picked day's rows top to bottom, in the app's order (show times with a grey dashed edge, linking to settings, then AutoDJ slots by playlist swatch, or the default playlist "All day" when none falls on that day). A slot that runs past midnight shows on the next day as "→ 02:00". Tapping a row opens the same `SlotPanel` dialog; "Add slot on Tuesday" puts an hour on the day being looked at, at the first free hour from now (today) or from 06:00. Both layouts are in the markup and CSS picks one, so the blocks and the selection survive a resize. Drawing and edge drags exist only on the grid. A sticky bar with the save state and Save appears at the bottom on phones once there are unsaved changes, because the header's Save has scrolled away by then. "NOW" on a row means the station's clock is inside it, not that it is playing; the banner says what plays.
- **Explicit Save** (autosave was tried and dropped on 2026-09-29): the Save button in the page header sends the same full-list `PUT /autodj-slots` without `timezone`. It's disabled when nothing changed, while blocks overlap, or while the station has no timezone. A lamp beside it says "All saved" (green), "Unsaved changes", "Not saved: slots overlap", "Not saved: no timezone" or "Not saved" (amber); a failed save also shows the server's error in a `Notice`. Leaving with unsaved changes triggers the browser's warning.
- **Two cards above the week** (`ScheduleNow`): **Right now** is the plan, labelled as a plan: the playlist AutoDJ has lined up from `programme` (`describeProgramme`: "until 10:00 · then Main rotation", or "All day, until another slot starts."), plus "AutoDJ is off right now." when the station is off; on Free, "Off air unless you're live". **Your next show** is the next show time (`comingUp`), "You start it from the studio", or "None planned" with a link to add show times. What the station is actually doing is the status band's, above every page; the station clock is in the top bar. The planned playlist is refetched when `programme.until` passes.
- **The legend** under the grid names the default playlist ("… fills the gaps"), each playlist in use with its swatch, and "Your show times · edit". Each day row shows its date ("30 SEPT", on the station's calendar, `weekDates.ts`, shared with the phone strip). With no playlists at all the grid is read-only and points to AutoDJ.
- **The now line** and "today" use the station's timezone, not the browser's.
- Below ~44rem the grid scrolls sideways; there's no single-day view yet.
- The UI never says "repeat" or "every week". Slots are weekly by nature, and the Days chips are the only way to express it.

## Gaps and traps

These are real as of the verified commit. Fix them or delete them from this list; don't let them rot.

1. **The mobile timezone is implicit.** There's no picker, the phone's zone is stamped on the first show-time save, and the "Times are in X" footer only appears once one is set. Changing it means using the web.
2. **The mobile day strip uses the phone's calendar.** The selected day, the dates and "today" come from `new Date()` on the phone, but the rows are station-timezone weekdays. If the phone and station are in different zones, the NOW badge and "today" can be a day off near midnight.
3. **The mobile day view isn't the real day.** A slot crossing midnight isn't shown on the day it spills into. The "All day" default row only appears when *no* slot starts that day, so the gaps around a partial-day slot aren't shown.
4. **Mobile saves are read-modify-write from the last loaded station.** A full-list PUT built from a stale copy overwrites edits made on the web in between. The web page has the same exposure if two tabs are open.
5. **The slot API has no plan check.** A Free owner can PUT slots via the API. It's harmless because `next()` gates playback, but the rows exist.
6. **Some prod show times were probably meant as AutoDJ slots.** On 2026-09-29, 4 Pro stations had show times with zero live sessions since, and each had only one playlist ("News lakay" daily 04:00, "timeless music", "Serenade musicale", "Livesendung"). They still advertise live times on those player pages. The move didn't touch them.
7. **Blog screenshots show an older Schedule page.** The help article's shots were retaken on 2026-10-01 (Right now / Your next show cards, the Edit slot dialog, the week grid); the blog post `how-to-schedule-playlists-on-your-radio-station` still shows the deleted list editor.
8. **The grid can't move a whole block by dragging its middle**, only its edges. Moving one means changing its times in the panel.
9. **On narrow screens the web grid is a sideways scroll**, not a single-day view.
10. **Naming:** don't call anything slot-related "schedule". `station_schedules`/`schedules()` is the advertising table.

## Tests

`api/tests/Feature/StationScheduleTest.php`, `AutodjSlotTest.php`, `AutoDjProgrammeTest.php`, `NextTrackControllerTest.php`. The first three passed on 2026-09-29 (49 tests). They cover DST, cross-midnight, overlap wrap, the timezone guards, and empty-playlist fall-through. There are no client or mobile tests for this feature.

## History

- Why the two lists are separate, and the original design: `docs/AUTODJ-SCHEDULING-PLAN.md` §0 and `docs/AUTODJ-SCHEDULING-HANDOFF.md` (commit 768d32d).
- Show times started in Station settings, moved to a "When you're live" lane on the shared Schedule page during the dashboard plain-language pass (2026-09-26), and moved back to Station settings on 2026-09-29. The Schedule page is AutoDJ only again, and the timezone has one editor. Prod data needed no migration: no tables or endpoints changed, and every station with rows already had a timezone.
