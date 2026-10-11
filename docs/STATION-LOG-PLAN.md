# Station log: hard starts, jingle rules, and a day-ahead playout log

**Status:** DISCUSSION, nothing built. Written 2026-10-01 at the end of a design conversation, to pick up the next day.
Nothing in the repo was changed. The Liquidsoap probe ran in throwaway `--rm` containers. The AzuraCast and LibreTime clones live in a session scratchpad and may be gone; re-clone them to re-check any citation below.

Where we ended up: **build a day-ahead station log in Laravel, keep Liquidsoap pulling one track at a time from it.** Two decisions are still open (section 9) and need answers before any design work. Section 11 is an AI idea for later.

---

## 1. Where this came from: a customer (mjescandar@gmail.com)

### Email 1: "About schelude"

> When a scheduled block reaches its end time, the AutoDJ currently waits for the song that is playing to finish before starting the next scheduled block. It would be very useful to have an option that allows the scheduler to interrupt the current track exactly when the next scheduled block is supposed to start [...] we have some very long tracks, sometimes around two hours long [...] "Start scheduled block exactly on time" or "Interrupt current track when the next block starts."

They describe the current behaviour correctly. See `docs/features/schedule.md:109`: "A slot starts at the **next track boundary**, not on the minute. A long track delays it by the rest of that track."

### Reply sent (or drafted) to email 1

> Thanks for the detailed note, and welcome aboard. You're right: a scheduled block currently starts when the track that's playing finishes, so a very long track can hold the next block back.
>
> We're adding an option to each schedule block, "Start exactly on time", that cuts the current track at the block's start time and switches straight to the new block. It will be off by default, so other stations keep the current behaviour, and you can turn it on for the blocks that need a fixed start.
>
> I'll email you as soon as it's live. Until then, splitting very long tracks into shorter parts will keep your blocks close to their start times.

(This commits us to building it. It names no date on purpose.)

### Email 2: their follow-up

> A dedicated section, perhaps similar to a playlist, specifically for jingles, station IDs, sweepers, and separators [...] schedule them independently from the main programming [...] set a specific time for a jingle or separator to play, with the AutoDJ temporarily interrupting the current programming, playing the jingle, and then continuing exactly where it left off.
> - Play a specific jingle from the list at a specific time.
> - Play one jingle from the list after a certain amount of time.
> - Play jingles sequentially, one after another, at a defined interval.
> - Play a random jingle from the list (shuffle) at defined intervals.
> - Schedule a specific jingle or a random one within certain time periods rather than at an exact time.

### Reply drafted to email 2 (asks them to clarify, not yet sent as far as I know)

> Thanks, this is really useful. Could you tell me which of these you mean by "continuing where it left off": (a) the song pauses, the jingle plays, and the song resumes from the same point; (b) the jingle plays over the music while it's turned down; or (c) the jingle plays at the next song change?

**Ammar's decision:** leave out (a) pause-and-resume and (b) overlay for now. Everything else in the emails makes sense to build. Either can be added later as an option on the priority queue (section 7), so nothing we build now blocks them.

---

## 2. What exists today (checked in docs/features, 2026-10-01)

- **Rotation:** `request.dynamic(id="playlist_m3u", autodj_next)` calls `GET /api/internal/next-track?slug=` at each track boundary. `AutoDjScheduler::next()` resolves the programme with `AutoDjProgramme::resolve($station)` **at fetch time (`now()`)** and advances that playlist's cursor or shuffle deck. See `docs/features/autodj.md`, `docs/features/schedule.md` and `docs/features/liquidsoap-station-script.md`.
- **Slots:** `autodj_slots` (days, start, end, playlist), resolved per boundary. There's no hard start.
- **Skip:** `playlist_m3u.skip` over telnet, registered in the `.liq` because `request.dynamic` only has `.flush_and_skip`.
- **Jingles:** one flat list, `tracks.kind = jingle`, written to `jingles.m3u` and played with `playlist(mode="randomize")`. The jingle arm is `fallback(track_sensitive=true, [jingle_arm, autodj])` (only between songs, never mid-song). Settings are station-wide: `jingles_enabled`, `jingle_mode` interval or tracks (the dialog offers 5/10/15/30/60/120 min or every 2–20 tracks), pushed live with `var.set`. **Jingle order can't be controlled.** There are no categories, no exact times and no windows. Mobile never shows jingles (`library-and-playlists.md` known issue 2). Jingles are Pro-only (`assertAutoDjEnabled`).
- **Crossfade:** `LIQUIDSOAP_CROSSFADE_ENABLED` defaults to **false**, so transitions are hard cuts. The `.liq` has no `fade.in` or `fade.out`.
- **Up next** in the dashboard matches by title and artist strings (`autodj.md` known issue 7). That's a workaround the log would remove.
- `station_events` is monitoring only. Never branch product logic on it.

| Their request | Today |
|---|---|
| A dedicated jingles section | Partly: a flat Jingles dialog, no types; mobile shows none |
| A specific jingle at an exact time | No |
| One jingle after a set amount of time | Yes (interval mode, between songs) |
| Jingles in order, one per interval | No (always random) |
| A random jingle every interval | Yes (current behaviour); every N tracks also exists |
| A specific or random jingle within a time window | No |
| Interrupt, then resume | No (out of scope for now) |

---

## 3. Verified in Liquidsoap 2.4.5 (`gocast/liquidsoap:latest`, image `be5392d5ca9e`)

### Methods

`liquidsoap -h request.dynamic` lists `set_queue([request])`, `queue()`, `skip()`, `fetch()`, `add()`, `current()`, `remaining()`, `elapsed()`. `settings.request.prefetch := 1` by default. `set_queue` doc: "Requests are resolved before being added. You are responsible for destroying the requests currently in the queue."

### A bug the probe found: slots start one track late

`request.dynamic` fetches the **following** track as soon as the current one **starts**. Setup: a 12-second track, then 3-second tracks, with the programme switching from "old" to "new" at t=5.

```
t=0.33   FETCH #2 resolved as old     <- fetched while the long track starts
t=12.44  TRACK START pl=old n=2       <- long track ends; still the OLD playlist
t=15.35  TRACK START pl=new n=3       <- new block finally starts
```

So a slot really starts **one full track after** the long track ends, not at the next boundary as `schedule.md:109` says. For the customer, that's the rest of a 2-hour track plus one more old-block song. **`docs/features/schedule.md` is wrong on this point and should be corrected whatever we build.**

### Hard cut: `set_queue` 3s early, then `skip()` on time

```
t=2.02  SET_QUEUE replaced 1 stale request(s)
t=5.00  SKIP issued
t=5.08  TRACK START pl=new-precut      <- 80 ms after the cut
t=8.10  TRACK START pl=new n=3         <- every later fetch is from the new block
```

80 ms is about 2 frames. The fallback never dropped to the silence bed, so there was no gap.

### Not tested yet (test before promising anything)

- `skip()` / cut behaviour with `cross()` on (expected: a fade instead of a hard cut).
- `skip()` while a broadcaster is live (AutoDJ isn't the source on air).
- Whether `fade.out` respects a trimmed `liq_cue_out` in 2.4.5 with our cue setup (needed for section 6, idea A).
- Pause-and-resume (whether a source that isn't on air keeps its position under a `track_sensitive=false` fallback). Only matters if (a) comes back.

### Probe harness (re-run any time)

Save as a file and mount the **file**, not its directory: the container is UID 100 and can't traverse a scratchpad directory owned by the host user. In 2.4.5: `string.float(decimal_places=...)`, `environment.get`, and `x()` instead of the deprecated `!x`.

```liquidsoap
settings.log.stdout := true
settings.log.level := 2
t0 = time()
def ts() = string.float(decimal_places=2, time() - t0) end
mode = environment.get("MODE")
cut_at = 5.
n = ref(0)
def next() =
  n := n() + 1
  pl = if time() - t0 < cut_at then "old" else "new" end
  f = if n() == 1 then "/tmp/long.wav" else "/tmp/short.wav" end
  log(level=2, "t=#{ts()} FETCH ##{n()} resolved as #{pl}")
  request.create("annotate:pl=\"#{pl}\",n=\"#{n()}\":#{f}")
end
autodj = request.dynamic(id="autodj", next)
autodj.on_track(synchronous=true, fun (m) -> log(level=2, "t=#{ts()} TRACK START pl=#{m['pl']} n=#{m['n']}"))
bed = blank()
mixed = fallback(track_sensitive=false, [autodj, bed])
last_src = ref("")
def watch() =
  s = if autodj.is_ready() then "autodj" else "bed" end
  if s != last_src() then log(level=2, "t=#{ts()} SOURCE -> #{s}") last_src := s end
end
thread.run(every=0.02, watch)
if mode == "hard" then
  thread.run(delay=cut_at - 3., fun () -> begin
    r = request.create("annotate:pl=\"new-precut\",n=\"cut\":/tmp/short.wav")
    old = autodj.queue()
    autodj.set_queue([r])
    list.iter(request.destroy, old)
    log(level=2, "t=#{ts()} SET_QUEUE replaced #{list.length(old)} stale request(s)")
  end)
  thread.run(delay=cut_at, fun () -> begin
    log(level=2, "t=#{ts()} SKIP issued")
    autodj.skip()
  end)
end
output.dummy(mksafe(mixed))
thread.run(delay=16., shutdown)
```

```bash
docker run --rm -e MODE=hard --entrypoint sh -v "$PWD/probe.liq:/p.liq:ro" gocast/liquidsoap:latest -c \
  'ffmpeg -loglevel error -f lavfi -i sine=f=440:d=12 /tmp/long.wav &&
   ffmpeg -loglevel error -f lavfi -i sine=f=880:d=3 /tmp/short.wav &&
   liquidsoap /p.liq' 2>&1 | grep "t=[0-9]"
```

---

## 4. How AzuraCast does it (read from source, `github.com/AzuraCast/AzuraCast` main)

- **Same pull base as ours.** `util/docker/stations/liquidsoap/azuracast.liq:436`: `request.dynamic(id="next_song", ..., retry_delay=10., azuracast.autodj_next_song)`. Our base is not wrong.
- **A queue of upcoming tracks with expected play times** (`backend/src/Radio/AutoDJ/Queue.php` `buildQueue`): the `station_queue` table. The first row's expected play time is the current song's start plus its duration; each later row adds the previous duration. Queue length is `max(autodj_queue_length, 2)`. Every decision is checked **at the expected play time**: `Scheduler::shouldPlaylistPlayNow($playlist, $expectedPlayTime)`. Rows not yet sent to Liquidsoap are checked again (`isQueueRowStillValid`). If the schedule changed, the row is dropped and **the track goes back into its playlist** (`restorePlaylistQueueSlot`). We decide at `now()`, which causes the bug in section 3.
- **Jingles are just playlists with a rule type.** `Entity/Enums/PlaylistTypes.php`: `Standard`, `OncePerXSongs`, `OncePerXMinutes`, `OncePerHour` (at minute M), `Advanced`. Each playlist has an order (`PlaylistOrders`: random, shuffle, sequential), an `is_jingle` flag (hides metadata from listeners), `weight`, and `backend_options` including "interrupt other songs", "merge" and "play single track".
- **Interrupting** is handled two ways:
  1. Playlists with "interrupt" are compiled into the `.liq` as `switch(id="schedule_switch", track_sensitive=false, [(predicate.at_most(1, {time}), playlist), ...])` (`Radio/Backend/Liquidsoap/ConfigWriter.php:445`). This uses Liquidsoap's own clock.
  2. `interrupting_queue = request.queue(...)` sits above everything: `fallback(id="interrupting_fallback", track_sensitive=false, [interrupting_queue, radio])` (`ConfigWriter.php:479`). A cron task that runs **every minute** (`Sync/Task/QueueInterruptingTracks.php`) fills it.
- **Weaknesses not to copy:**
  - Schedules are compiled into the `.liq`, so every edit means regenerating the config and reloading Liquidsoap.
  - The interrupt queue is only accurate to the minute.
  - "Once per hour at minute M" really means "within 15 minutes after M" (`Scheduler::shouldPlaylistPlayNowPerHour`, `$playlistDiff > 15`).

---

## 5. How LibreTime does it (read from source, `github.com/libretime/libretime` main)

- **A timeline built in advance.** `cc_schedule` rows each have an exact `starts_at`, `ends_at`, `cue_in`, `cue_out`, `fade_in` and `fade_out`. The playout process loads the next 24 hours (`playout/libretime_playout/player/schedule.py` `get_schedule`, `ends_before = now + 1 day`).
- **Time-pushed playback.** `player/queue.py` waits until each item's start (`queue.get(timeout=time_until_next_play)`), then pushes it over telnet. Liquidsoap is passive: four `request.queue`s mixed with `add()`, so items can overlap for a crossfade, plus per-item `fade.in`/`fade.out` and `cue_cut` (`liquidsoap/2.1/ls_script.liq:18-52`).
- **Hard show end = trimmed cue-out, not a skip.** `api/libretime_api/schedule/models/schedule.py` `Schedule.get_cue_out()`: the item crossing the show's end gets its cue-out cut to the show end (`PositionStatus.BOUNDARY`). Items starting after the end are `OUTSIDE` ("overbooked"), never play, and a periodic task deletes them (`clean_overbooked_schedule`). The fade-out annotation makes the last track fade on time by itself.
- **Reconciliation loop.** `player/liquidsoap.py:212` `verify_correct_present_media` compares what should be playing now with what Liquidsoap has. Wrong items are stopped. A missing item is pushed **now** with `cue_in` moved forward by how late it is (`modify_cue_point`), so it joins mid-track.
- **Loading early.** Relays start buffering 5s before their start time (`WEB_STREAM_BUFFER_START`). That's the same idea as our `set_queue` 3s early.
- **Why we don't copy all of it:** it's built for shows someone fills in advance, rotation-style AutoDJ doesn't fit it well, and it needs a separate always-running playout process with its own timers.

---

## 6. How the design evolved (so we don't re-argue it)

1. **First idea:** a per-slot `hard_start`. Laravel computes `next_cut` and sends it to the container (telnet `var.set`, plus an `X-Next-Cut` header on `next-track` to reconcile). A `.liq` watcher (`thread.run(every=0.25)`) runs `set_queue` about 5s early and `skip()` on time. It's verified to work (section 3). Ammar's concern was that it felt like a workaround.
2. **After AzuraCast:** the missing concept is **deciding at expected play time**, so add a short forward queue. Jingles become playlists with rule types. Timed events go through one priority `request.queue` with `track_sensitive=false`. Our pushed-timestamp watcher is better than AzuraCast's compiled-in predicates and minute cron.
3. **After LibreTime:**
   - **(A)** Hard boundary = trimmed `liq_cue_out` + `liq_fade_out`, with overbooked rows dropped, instead of skip.
   - **(B)** The watcher becomes a **reconciler** (what should be on air vs. what is), not a one-shot trigger.
   - **(C)** Loading early is legitimate.
   - **(D)** Per-station fade settings.
4. **Ammar's proposal, which we agreed on:** build the log **24 hours ahead**, keep the data layer as rich as we like, and show it to users. I had objected to LibreTime's *time-pushed playback*, not to building ahead; the two are separable. **Build ahead + keep pulling** gives both.

---

## 7. Agreed direction: day-ahead station log, still pulled

**What it gives us:**
- Users can see the log: view, download, print, and later edit or pin items. This is how pro automation works (Rivendell, Zetta, RCS).
- Rules can be as complex as we like (artist separation, no repeat within N hours, weights, windows). They run in a job, not on the hot path.
- Timing is decided when the log is built: each row has `starts_at`, and hard boundaries become trimmed cue-out plus a dropped overbook. This fixes the extra-track delay.
- Deterministic tests: generate the log for a station and a date, then assert.
- Playlist position comes from the log ("last row from this playlist"). This replaces the cursor and shuffle-deck columns and fixes the problem of a queued track being lost from its shuffle round.
- A restart picks up from the log, given the rule in decision 1.
- **Phase 1 needs no `.liq` change.** `next-track` keeps its contract and just reads the log, so there's no container recreate and rollback is easy.

**Shape:**
1. **Build:** a `station_log` table (track, source playlist, rule that picked it, `starts_at`, `cue_in`, `cue_out`, `fade_out`, `hard_boundary`, status planned/sent/played/skipped/missed). A generator job keeps about 24 hours built and rebuilds the unlocked future on any change.
2. **Rolling horizon + locked head:** only the next 1–2 rows (sent or about to be) are locked. Everything after them can be discarded and rebuilt. Rebuilds are queued, debounced per station, and idempotent. Roughly 360 rows per station per day.
3. **Play:** keep the pull. `next-track` returns the next unplayed row whose window is still valid. Rows passed during a live show or downtime become `missed` (or are shifted, see decision 1). If no valid row exists, build one on the spot; never wait for a rebuild. The plan gate stays in `next-track`: Free gets 204 even with a stale log.
4. **Absorb drift:**
   - The trimmed cue-out and fade from the log handle the normal case.
   - The container **reconciler** handles drift, missed pushes and restarts.
   - Exact-time items go through one **priority `request.queue`** (`track_sensitive=false`) above the rotation.
5. **Jingles = playlists with rules:** role (music / liner) × order (sequential / shuffle / random) × trigger (rotation, every N songs, every N minutes, at exact times, within a window) × hide metadata. Liner types (station ID, sweeper, separator, jingle) are collections. Covers all five of the customer's asks.
6. **Slots** stay and gain `hard_start`. Soft starts need nothing extra: the log already puts them at the right song change.
7. **Final `.liq`:** live, then priority queue, then `request.dynamic` (+ `fade.in`/`fade.out`), then silence. **Removed:** `jingles.m3u`, the four jingle `var.set` variables, `tracks_since_jingle`, and the `delay()` jingle arm. That's one container-recreate release; after it, scheduling features are Laravel-only.

### Change table, from both emails (sized against the log design)

| Change | Notes | Size |
|---|---|---|
| Fix the slot one-track-late bug | Comes for free with the log. Without the log, `set_queue` at the change time fixes it on its own. | S–M |
| "Start exactly on time" per slot | `hard_start` + trimmed cue-out/fade + reconciler backstop. Edge cases: crossfade, live at the cut, restart near the cut, DST, back-to-back slots with the same playlist. | M |
| Jingle types/collections | CRUD + migrating the flat list + mobile library. The cost is moving jingle playback onto the log/rules. | M |
| Jingles in order at an interval | Free once collections and the log exist | S |
| Random jingle every interval / after a set time | Exists today; becomes per-collection | S |
| A specific jingle at an exact time | Timed log row + priority queue + reconciler | M–L (cheaper after hard start) |
| A specific or random jingle within a window | Prefer a song change inside the window; interrupt at the window's end if none comes | M after the above |
| Pause-and-resume / overlay | Out of scope for now | (M / M–L, unverified) |

---

## 8. Issues and risks (don't lose these)

1. **Durations must be reliable.** Every timestamp is a sum of durations. `tracks.duration_seconds` defaults to 0 and analysis can fail (`analysis_error`). Effective duration = cue-out − cue-in − crossfade overlap (when on). Probe every track's duration at upload and flag or refuse tracks without one. **This is the first thing to build.**
2. **Planned log vs. as-run log.** Users will print the plan and compare it with reality; show the difference ("planned 14:03, played 14:05"). The as-run log is also what royalty reporting needs (PRS, SoundExchange, GEMA), which is a Pro feature.
3. **The generator fails in its own ways.**
   - Underfill (a 2h slot, a 40-min playlist, a no-repeat rule): loosen the rule, fall back to the default playlist, or leave silence? Needs a defined order (decision 2).
   - Overfill: handled by trim and drop.
   - An empty station: no log, and `next-track` answers 204 as today.
4. **Rebuilds racing `next-track`.** Never touch the locked head; `next-track` never waits for a rebuild. Debounce, so 50 uploads don't mean 50 rebuilds.
5. **Only build for stations that use it.** Most are Free or live-only. Build on start or when a schedule is saved, keep 24 hours ahead only while running, expire old planned rows, keep as-run rows longer.
6. **What changes the log:**
   - Unscheduled live (GoCast's main use case)
   - Skip
   - A track running longer or shorter than expected
   - Edits to slots, playlists or rules
   - Upload or delete (dead rows skipped lazily, as we do with dead IDs today)
   - Downgrade (`next-track` still gates)
   - A station off for days (rebuild on start)
   - Timezone or DST change (rebuild)
7. **Free resilience.** Today an API outage means silence. With a log, Laravel can also write the next hour or so as a fallback m3u in the station directory, used only when `next-track` fails.
8. **Migration.** Cursors and shuffle decks become derived from the log. Current jingle settings become a jingle playlist with an every-N-tracks or every-N-minutes rule. One-time conversions, with tests.
9. **Exact-time still needs the container clock.** Trimming the cue-out only works if the track started when the log expected. The reconciler and priority queue stay in the `.liq` (small, written once).
10. **Queued track lost from its shuffle round.** With the short-queue or `set_queue` approach, a thrown-away prefetched track loses its turn. AzuraCast fixes this with `restorePlaylistQueueSlot`; the log fixes it by deriving position from rows.
11. **Docs:** `docs/features/schedule.md:109` understates the delay (section 3). Any change here must update `docs/features/` (run `scripts/docs-check.sh`).
12. **`.liq` changes have no automated tests.** `station.blade.php` is about 1,400 lines. Test each change in a throwaway container like section 3, and bundle the changes into one release (only recreated containers pick it up).
13. **Never name anything "schedule"** in code for AutoDJ concepts. That word is show times (see the AutoDJ scheduling memory). "Station log", "log rows" and "as-run" are fine.

---

## 9. Open decisions (answer these first)

1. **After a live show or a restart:** jump to the row due *now* (radio convention; passed rows become `missed`), or resume where it stopped and shift everything later? On restart mid-row: play that row from the start, join it mid-track (LibreTime-style `cue_in` shift), or skip to the next row? My suggestion for music: the row due now, from the start.
2. **Underfill:** when a slot's playlist can't fill its time under the rules, what's the fallback order?
3. Is `hard_start` per slot (my suggestion; "hard vs soft start" is the industry term) or per station?
4. Should fades (default fade in and out) be a station setting from day one?
5. Should the customer get the clarification email (section 1) now, even though pause/overlay are parked?

## 10. Suggested build order

1. Reliable durations (probe at upload, backfill, flag the missing ones).
2. Generator + planned `station_log` behind the existing `next-track` (Laravel only, no container change). This fixes the one-track-late bug.
3. "Today" log view: preview, download, print (web; mobile later).
4. As-run log (and reporting later).
5. Playlists with rules; jingles become liner playlists; migrate the old jingle list.
6. `hard_start` on slots via trimmed cue-out and fade (Laravel only, if `fade.out` + cue-out passes the probe).
7. The one `.liq` release: `fade.in`/`fade.out`, the priority queue, the reconciler, the fallback m3u, removal of the jingle arm. Test in a throwaway container first.
8. Exact-time and window jingles on top of 6 and 7.

---

## 11. Later idea (Ammar): AI help

Because the log is data built from rules, AI can plug in at the rule level, not the audio level:
- Generate a week of rules or slots from a description ("morning chill 6–10, ID every 15 minutes, news-style separators on the hour").
- Suggest or auto-tag which uploads are liners vs. music, and their type (ID, sweeper, separator).
- Explain or fix a log ("why does 14:00 repeat this artist?"), and highlight underfill before it airs.
- Fill gaps under the rules (the underfill fallback in decision 2).

Not discussed further. To be picked up after the core log design.
