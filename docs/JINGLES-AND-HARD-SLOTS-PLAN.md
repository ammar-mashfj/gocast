# Hard slots and jingles — plan

**Status (2026-10-05): ALL FOUR STEPS BUILT on `feat/design-system`, uncommitted, tested.**
See [What was built](#what-was-built-2026-10-05) for where the build differs from the plan
below, and [Rollout](#rollout) before deploying.

## Where it came from

A customer email asked for:

1. A separate list for jingles, station IDs, sweepers and separators,
   scheduled independently of the music.
2. Rules: a specific jingle at a specific time; one after a certain time;
   in order at an interval; random at an interval; within a time window
   instead of an exact time.
3. "Interrupt the current programming, play the jingle, and continue exactly
   where it left off."

Every rule in (2) is the same sentence with different blanks:

> Play **[which jingle]** from **[this list]** **[when]**, optionally only
> **[during these hours]**.

## Decisions already made

- **No clocks, hour templates, grid cells or day-ahead station log.** Too
  complicated for GoCast (the `feat/station-log` branch stays reference only).
- **No pause-and-resume mid-song.** It sounds broken on air. We read the
  customer's "continue where it left off" as *the playlist continues with the
  next song*, which this design does for free.
- **Live always wins and is the DJ's choice.** When a live show (browser
  studio, encoder, or mobile — all the same `input.harbor`) runs over a hard
  slot or an exact-time jingle, AutoDJ resumes afterwards with whatever it had
  queued, even if late. No special handling.
- **Skip-track is disabled** (2026-10-05): route, `StationPowerController::skip`,
  and the `.liq` telnet command are commented out with a note. Nothing called
  it any more. If it ever comes back it must reset the clock below.
- **Jingles move out of the `.liq` into Laravel.** Liquidsoap only plays what
  `next-track` hands it.

## How jingles work today (what we are replacing)

- `tracks.kind` is `music` or `jingle`; every jingle goes into one
  station-wide `jingles.m3u`.
- **Liquidsoap decides** when one plays (`station.blade.php`, "=== Jingles ==="
  block): one rule per station — every N minutes *or* every N tracks — always
  random, settings pushed over telnet (`applyJingleSettings`).
- Can't do: several lists, in-order or specific picks, time windows, exact
  times — and Laravel can't see the jingles it would have to plan hard starts
  around.

## The idea

**Laravel decides everything; Liquidsoap just plays.** On each `next-track`
call Laravel works out when that track will start and answers with a song or
a jingle. If the track would run past a fixed time, it's served trimmed
(`liq_cue_out` + `liq_fade_out`) so it ends exactly on that time.

### The shared piece: Laravel's clock

- Store `stations.autodj_expected_end_at` (when the last served track ends).
- On each `next-track`: **start = max(now, expected end)**;
  **expected end = start + effective length** (cue in/out from analysis).
- After live or idle time, now > expected end, so it re-anchors by itself.
- Reset on **power on** (and on skip, if skip ever returns).
- A track with no measured duration can't be planned around: treat it as a
  soft boundary.

## Step 1 — Hard / soft AutoDJ slots

**User sees:** each slot on the Schedule page offers
*Start after the current song* (today, default) or
*Start exactly on time* (fades out whatever is playing).

```
Hard slot "Morning Show" at 08:00
07:56:30  Song X starts (4:10, would end 08:00:40)
08:00:00  Song X fades out over 2s → Morning Show's first song
```

**Build:**
1. `autodj_slots.start_mode`: `soft` | `hard`.
2. `AutoDjScheduler::next()` / `AutoDjProgramme::resolve()` resolve the slot at
   the track's **expected start**, not now — also fixes the slot-starts-one-song-late bug.
3. Hard boundary inside the track → serve with `liq_cue_out` ending on the
   boundary + `liq_fade_out`.
4. One `.liq` line so the fade is applied:
   `autodj_rotation = fade.out(track_sensitive=true, duration=0.1, …)`
   (never `duration=0.`, it mutes later tracks). Containers must be recreated
   once (existing relaunch command).
5. Toggle in the slot editor, web + mobile.
6. Write the clock (above).

**DECIDED (2026-10-05) — fit picking + a fallback ladder.** Instead of
picking blindly and trimming whatever crosses the boundary, Laravel back-times
like real radio automation.

On each `next-track` call before a hard boundary:
`gap = boundary − expected start`.

- **Gap ≥ the longest song:** pick normally.
- **Gap smaller:** take the next track in the shuffle deck whose effective
  length (cue in/out) ends before the boundary. Tracks skipped over stay in the
  deck (not consumed) so shuffle stays fair. Tracks with no measured duration
  are never chosen as fillers.

```
Hard slot at 08:00
07:51:20  gap 8:40 → deck says Song A (4:10), fits → play
07:55:30  gap 4:30 → deck says Song B (5:02), doesn't fit
                     → next that fits: Song D (3:55) → play
07:59:25  gap 0:35 → no song ≤ 35s → fallback ladder
```

**Fallback ladder** when nothing fits (the leftover is always shorter than
the shortest song):

| Leftover | Action | On air |
|---|---|---|
| < 20s | Start the slot early | Slot at 07:59:40; nobody notices |
| ≥ 20s, jingles available (step 2+) | Fill with jingle(s) that fit | Station ID, slot on time |
| otherwise | Next song, faded at the boundary (`liq_cue_out` + `liq_fade_out`) | The "fade to the news" sound; deliberate, not broken |

Step 1 ships rows 1 and 3; row 2 arrives with step 2. The 20s limit is a
constant to tune after listening.

**Not doing (yet): best combination.** Greedy one-at-a-time can corner
itself (gap 4:30, songs 3:30 / 1:40 / 2:45: greedy takes 3:30, the best plan
is 1:40 + 2:45). Solving it means storing a planned sequence between calls —
the station-log complexity we rejected. Add one-step lookahead later only if
fades turn out to be common.

**Planner tests:** fits, deck skip keeps the skipped track, nothing fits
< 20s (early start), nothing fits ≥ 20s (fade), missing duration excluded,
boundary at midnight, station timezone.

## Step 2 — Move jingles into Laravel, behaviour unchanged

Ships the risky move alone; listeners hear no difference.

1. `playlists.kind`: `music` | `jingles`.
2. Migration: each station gets one "Jingles" playlist with its jingle tracks
   and its current rule copied over (enabled, interval or every-N-tracks, random).
3. `next()` first asks "is a jingle due at this start time?" — if so, serves one
   annotated `jingle="true"`. The crossfade no-fade branch and now-playing
   already key on that tag (verified, see below).
4. Remove from the `.liq`: jingles `playlist`, the four interactive vars,
   `tracks_since_jingle`, `jingle_arm` fallback. Remove `applyJingleSettings`,
   jingles.m3u writing (`PlaylistFileWriter`), `StationObserver::JINGLE_COLUMNS`,
   later the four `stations.jingle_*` columns.

**Rollout trap:** a container still on the old script plays jingles twice (its
m3u + Laravel). Record a script version on the station when its `.liq` is
rendered; Laravel only serves jingles to the new version.

## Step 3 — Several jingle lists + rules

**User sees:** in the Library, any number of jingle lists (Station IDs,
Sweepers, Promos…), each with one rule shown as a sentence:

> Play a **random** jingle from **Sweepers** **every 4 songs**,
> **07:00–10:00 on weekdays**.

| Field | Options |
|---|---|
| Pick | random (no repeats until all played) · in order · always this one |
| How often | every N minutes · every N songs · at set times (e.g. :00, :30) |
| When | all day, or days + from/to |
| On/off | switch |

**Collisions:** one jingle per break (never jingle-jingle-song); a set-time
list beats an interval list; otherwise the longest-waiting list goes; the
loser waits for the next break.

In this step "at set times" = **first break after that time** (≈08:00).
Jingle lists apply over whatever music playlist is playing; time windows cover
dayparting, so no per-slot jingle sets.

## Step 4 — Exact-time jingles

"At set times" gets the slot toggle: *exactly on time (fade the song)*. The
jingle's time becomes a hard boundary and reuses step 1's trimming:

```
07:57  Song 12 fades at 08:00:00 → Station ID → Song 13 (playlist continues)
```

Hard slot and exact jingle at the same time → jingle first, then the slot's music.

## Out of scope

Pause/resume mid-song · clocks/templates/grids · per-slot jingle sets ·
ad proof-of-play reporting · special after-live handling · Skip.

## Verified on the real image (2026-10-05)

Liquidsoap 2.4.5, the real rendered station script, a fake Laravel serving
`next-track`. Harness: `docs/jingles-harness/` (`make-base.sh <rendered .liq>`
then `./run2.sh seq|hard|hard_fade|hard_live|seq_cross`; test tracks were 6s
songs, a 20s long song, 2s jingles).

| Assumption | Result |
|---|---|
| Jingles served via `next-track`, no jingle logic in the .liq | ✅ planned order, full length, `jingle=true` reaches on_track |
| How far ahead Laravel decides | ✅ fetch of N+1 happens when N starts (two ahead with crossfade on) |
| Laravel predicts start times | ✅ within 0.3–0.5s, no drift; cue in/out honoured |
| Exact time via `liq_cue_out` | ✅ planned 15.00, aired 15.40 |
| Jingles never crossfaded | ✅ existing no-fade branch fires |
| Live over a planned time | jingle plays late after the show — **accepted** (DJ's choice) |

Side notes: without the step-1 fade line the trim is an abrupt cut (fade was
checked by ear on `feat/station-log`, not re-checked here). With crossfade on
(off in prod), the song right after a jingle didn't announce its title.
**Not tested:** real HTTP latency to Laravel, full-length mp3s.

## What was built (2026-10-05)

All four steps plus the measured-length groundwork, on `feat/design-system`
(to be merged into `main` after testing). Nothing committed.

**Groundwork — real track lengths.** Analysis already decoded every file; it
now keeps the decoded length in `tracks.duration_seconds` and stamps
`tracks.duration_measured_at`. `tracks:measure-durations` re-measures old
tracks with a plain decode (no loudness meter, far faster than
`tracks:analyze --force`). `Track::airtimeSeconds()` = cue-in → cue-out,
null until measured.

**Where the build differs from the plan, and why:**

- **The clock is `start = now + airtime of the track handed out last`**, not
  `max(now, expected end)`. Liquidsoap asks for N+1 the moment N starts and N
  is always the last track served, so this is exact, and it re-anchors on now
  at every ask. With `max()`, a track queued before a live show would be
  planned as starting at the show's end when it really starts one track
  later. Nothing queued (first ask after boot, or after a "nothing to play"):
  start = now. Columns `stations.autodj_queued_starts_at / _seconds /
  _is_jingle`.
- **Script version is a header, not a station column.** The new `.liq` sends
  `X-Gocast-Script: 2` on every ask (and `X-Gocast-Fresh: 1` on its first
  after boot). Laravel only serves jingles and trims to a script at
  `AutoDjScheduler::PLANNING_SCRIPT`; an old container gets music only. No
  render-time bookkeeping to drift.
- **Jingle lists are their own table (`jingle_lists`), not `playlists.kind`.**
  A list carries a rule a playlist never has, and playlists are read in
  places (schedule picker, library, default) where a jingle list must never
  appear. Each jingle belongs to one list (`tracks.jingle_list_id`).
- **Fit picking only on shuffled playlists.** An in-order playlist is the
  owner's order (chapters, a running show); its song fades instead.
- **Jingle filler (ladder row 2) only before a hard *slot***, never before an
  exact-time jingle — that would be two jingles back to back.
- **Steps 2–4 shipped together**, not step 2 alone: once Laravel serves
  jingles, lists and rules are the same code path. The rollout trap is
  handled by the header instead.
- The four `stations.jingle_*` columns are **kept, unused**; drop them in a
  follow-up once the rollout is verified (the copy migration needs them, and
  a rollback would too).

**Code map.** `AutoDjScheduler::next()` (clock, ladder, peek/consume rotation),
`AutoDjProgramme::hardStartsBetween()`, `JingleRotation` (due / filler /
played / songPlayed), `JingleList` model (isOpenAt, setTimesBetween,
isDueAt, dueSetTime), `JingleListController` + `JingleListRequest`,
`PlaylistFileWriter::annotateTrack(playFor, fadeOut)`, station template
(`fade.out` line, headers; jingle block removed), config
`hard_start_early_seconds` (20) / `hard_start_fade_seconds` (2). Web:
Jingles page (`JinglesView`, `JingleRuleDialog`, `jingleRule.ts`), slot
dialog "Start exactly on time". Mobile: slot editor switch, and slots now
round-trip `start_mode` (the old save would have reset hard slots to soft).

**Verified.**
- API: new `AutoDjHardStartTest` (15), `JingleRulesTest` (15),
  `JingleListControllerTest` (20), `TrackDurationTest` (10); full suite
  1177 passed, 1 failed (`ArchitectureTest` on `RawEmailDraft`, pre-existing).
- Real image (2.4.5), the real rendered script, a fake planner: headers
  arrive (`fresh=1` first, `script=2`), the trimmed song ends and the jingle
  airs at 14.89s against 15.00s planned, the fade measures −24 → −39 dB over
  the last 2s, later tracks play at full level (the 0.1s default mutes
  nothing). Harness: `docs/jingles-harness/run3.sh`.
- Real `next-track` over HTTP on the dev API: a v2 ask gets
  `jingle="true"` then music; an ask without headers gets music only.
- Browser (headless, throwaway account, deleted after): Jingles page, rule
  dialog, clip menu, new-list dialog and the slot dialog at 390 / 820 / 1440,
  no sideways scroll, no page errors; a rule edit survives a reload.
- Not tested: a live show over a planned time on a real station, real
  full-length mp3s through the whole stack, mobile on a device (typechecks
  and lints only).

## Rollout

1. Deploy, `php artisan migrate` (adds the columns/table and copies each
   station's jingle setting into a "Jingles" list).
2. `php artisan tracks:measure-durations` (queued; needs a worker). Until a
   track is measured it is never used to fit a gap; hard starts still work
   (a crossing song is faded).
3. **Recreate every station container** with the existing relaunch command.
   Until then an old container keeps playing its own `jingles.m3u` with its
   last settings and gets no jingles or trims from Laravel.
4. Later: drop `stations.jingles_enabled / jingle_mode /
   jingle_interval_seconds / jingle_every_tracks`.

## Where to pick up

1. ~~Short-leftover decision~~ — decided: fit picking + ladder.
2. ~~Steps 1–4~~ — built 2026-10-05, see above. Ammar to test, then merge
   `feat/design-system` into `main`.
3. Follow-ups: drop the old jingle columns after rollout; consider one-step
   lookahead if fades turn out to be common; help screenshots for the new
   Jingles page (`npm run test:help-shots` has none for it yet).
