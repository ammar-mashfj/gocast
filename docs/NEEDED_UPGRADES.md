# Needed upgrades

Written 2026-08-18, after moving the AutoDJ rotation off `playlist()` and onto
`request.dynamic`.

This is a planning document, not a runbook. It records what is missing, why
each item matters, and — where it was measured rather than assumed — the
evidence behind the claim.

**Reconciled against the code on 2026-09-19.** The original text claimed
nothing here was built; that is no longer true, so every section now opens with
a status line. Summary:

| § | Item | Status |
|---|------|--------|
| 0 | `track_plays` history table | **Open** — still the prerequisite |
| 1 | Now-playing push | **Half built** — owner-side only, and the transport went to Pusher, not SSE |
| 2 | Playlists and scheduling | **Open** for playback; an announcement-only schedule table now exists |
| 3 | Embeddable player | **Built** 2026-09-08 |
| 4 | Analytics | **Largely built** 2026-08-30/09-01; only the per-song half is left, and it needs §0 |

Two appendix items (cue points, loudness normalization) also shipped — see the
appendix. Section bodies below are the original analysis and are left intact
where they are still correct; corrections are marked **Update (2026-09-19)**.

---

## Why now

Until this week the AutoDJ rotation was a file. Liquidsoap held the running
order in its own memory and re-read `playlist.m3u` only when Laravel sent
`playlist_m3u.reload` over telnet.

Two things followed from that, and both are now gone:

1. **Reload restarted the rotation at track one.** Measured on the real
   `gocast/liquidsoap:latest` image (2.4.5): after a reload the list resumes at
   index 0. Because Laravel had to send that reload after every track
   add/remove/reorder, uploading a song sent every listener back to the first
   song a few tracks later — the prefetched requests drain first, which is why
   it looked random rather than immediate. Manual reload and
   `reload_mode="watch"` behave identically, and `playlist` exposes no
   cursor-preserving reload.
2. **The running order could not be ours.** A file cannot be asked "what should
   play next, given the time of day, what played recently, and who requested
   what". Every feature below that touches programming was blocked on that
   sentence.

The rotation is now a query in `AutoDjScheduler`, answered one track at a time
over `/api/internal/next-track`. The `.liq` no longer knows what a playlist is —
it just asks. That is the same design AzuraCast and LibreTime use, and it is
what makes the rest of this document possible.

**Consequence worth stating plainly:** Laravel now knows both what is playing
*and what plays next*, before it plays. Nothing in the product exposes that yet.

---

## 0. Prerequisite: a play history table

**Status (2026-09-19): open, and now the only thing blocking per-song
reporting.** No `track_plays` migration, model or reference exists anywhere in
the code. Everything below still stands as written, with one thing sharpened:
the rest of the analytics stack landed without it (see §4), so this table's
remaining job is narrower and more specific than it was in August — per-song
performance, most/least played, never-played. The duplicate-prevention argument
also softened, because the shuffled deck now solves ordinary repeats without a
history; see the Update in the bullet below.

**Build this first, whatever else you pick.** Two of the four items below need
it, and it is the smallest thing on the list.

Today the container pushes every metadata change to `/internal/now-playing`,
and `NowPlayingController` writes it to Redis with a TTL. Nothing is persisted.
The station's own history evaporates.

A `track_plays` table — station_id, track_id, title/artist as played, started_at,
and later a listener count sample — is fed by a hook that already exists and
serves:

- **Duplicate prevention** in the scheduler (no same song within N tracks, no
  same artist back to back), which is most of what makes a rotation sound
  professional rather than mechanical.

  **Update (2026-09-19):** partly solved another way. `AutoDjScheduler` now
  deals from a stored shuffled deck — a random permutation of the whole
  rotation, consumed one card at a time (`AutoDjScheduler::advanceShuffled`
  and `::deal`, `api/app/Services/AutoDjScheduler.php:100`). That guarantees no repeat until the rotation is
  exhausted, which is *stronger* than "no same song within N tracks". What a
  history would still add is artist-level spacing and weighting, and it would
  let the deck-seam hack (`avoidHead`) be replaced by a real lookback. So this
  bullet is a refinement now, not a fix — which is why §0 is no longer urgent
  on rotation-quality grounds alone.
- **Every analytics feature** in section 4.

Two features, one table, no new plumbing.

One nuance to design around: `request.dynamic` prefetches, so Laravel is asked
for a track slightly before it is audible. The cursor is therefore one ahead of
reality. A play row should be written when the track actually starts (the
now-playing push), not when it is handed out — otherwise history and reality
disagree by one track, and on a container restart by one skipped track.

---

## 1. Now-playing push

**Status (2026-09-19): half built, and the transport decision went the other
way.** Broadcasting infrastructure now exists and is wired end to end —
`api/config/broadcasting.php` (Pusher protocol, Reverb-compatible, with a
`log` driver as the kill switch tests run against), `client/lib/echo.ts` and
`client/contexts/RealtimeContext.tsx`. But there is exactly one event,
`StationStateChanged` (`api/app/Events/StationStateChanged.php`), it broadcasts
as `station.state` on `PrivateChannel('user.'.$userId)`, and it carries
on/off lifecycle state — not track metadata. That serves the **owner's
dashboard**, not listeners.

So of the two legs described below:

- **Owner leg: done.** `client/hooks/useStationStatus.ts` subscribes and falls
  back to adaptive polling when the socket is down.
- **Listener leg: still open.** The public player still polls —
  `client/hooks/usePublicStationStats.ts:19`, `POLL_MS = 10_000`. Every
  listener of a station computes its own feed, which is the exact fan-out shape
  this section warned against.
- **"Up next": still not exposed anywhere.** This remains the most valuable
  part of the item and the cheapest now that the transport exists.

**Correction to the recommendation below:** the doc argued for SSE. The project
chose the Pusher protocol instead, and the private per-user channel for the
owner's dashboard is a good reason for that choice (SSE would have needed a
separate auth story). Read the SSE-vs-WebSocket comparison below as history;
the open question is no longer *which transport* but *which channel* the public
now-playing feed rides on — it wants a **public** per-station channel, not the
private per-user one that exists.

**Original status: called a must. The hard half is already done.**

The client currently polls for now-playing. That is the wrong shape and it is
also unnecessary work: the station container already pushes to
`/internal/now-playing` the moment metadata changes, so **Laravel learns the
track instantly**. It simply stores it and waits to be asked.

What is missing is only the Laravel→browser leg. Options, cheapest first:

- **SSE** (`text/event-stream`) — one GET that stays open, no new infrastructure,
  works through Caddy, trivially cacheable per station because every listener of
  a station wants the identical stream. Reconnection is built into the browser's
  `EventSource`. This is almost certainly the right answer.
- **WebSockets** (Reverb/Pusher-compatible) — more moving parts, justified only
  if there will be bidirectional or per-user channels later.

Whichever is chosen, the fan-out shape matters more than the transport: one
event per station, broadcast to every listener of that station, not one stream
per listener computed independently.

**What the push should carry, that polling never could:** the *next* track.
Since `AutoDjScheduler` decides ahead of time, a public player can show "up
next" — which no amount of polling `/status` can produce, because the
information does not exist in the container.

Note the existing constraint in the `.liq`: `output_source` deliberately points
at the **un-watermarked** mix so the free-tier watermark never appears as the
station's now-playing, and jingles carry `jingle="true"` so a station ID is not
reported as a song. Any push channel inherits those rules — they are already
correct upstream, so this is a matter of not undoing them.

---

## 2. Playlists and scheduling

**Status (2026-09-19): still the largest functional gap. Nothing here drives
playback.** One thing changed that this section's "What exists today" no longer
accounts for: a `station_schedules` table now exists
(`api/database/migrations/2026_09_11_100100_create_station_schedules_table.php`)
— `days` (JSON), `start_time`, `label`, `position` — with an editor at
`client/app/dashboard/stations/[slug]/ScheduleEditor.tsx` and a public render
at `client/app/station/[slug]/ScheduleBlock.tsx`.

**It is announcement-only, and deliberately so.** It is the DJ's published
claim about when they are usually on air. Its only consumer in PHP is
`Station::schedules()` (`api/app/Models/Station.php:441`); `AutoDjScheduler`
does not read it and nothing switches audio on it. It is the "cheap version"
from `USER-FLOW-UPGRADES.md` §4, not this section. Do not let its existence
suggest this item is underway — but *do* reuse its table shape if the full
version is built, rather than inventing a second one.

**The largest functional gap, and the one the refactor was for.**

### What exists today

One flat list per station: `tracks` ordered by `position`, with `kind` = music
or jingle. AutoDJ plays the music top to bottom and loops. Jingles interleave
every N minutes or every N tracks, controlled by `jingle_mode`,
`jingle_interval_seconds` and `jingle_every_tracks` on the station row.

Every track is equally eligible, always. It is a folder with shuffle off.

### What a playlist is

A station has **many** playlists. Each is a named set of tracks **plus a rule
for when and how often it plays**. The second half is the entire idea: a
playlist is not a folder, it is a folder with a scheduling policy attached.

Types (AzuraCast's taxonomy, which is worth copying):

| Type | Rule | Used for |
|---|---|---|
| **General rotation** | always eligible, has a **weight** | the main music pool |
| **Scheduled** | start/end time, days of week, optional date range | dayparted shows |
| **Once per X songs** | one item every N songs | station IDs, sweepers |
| **Once per X minutes** | one item every N minutes | sponsor reads, legal IDs |
| **Once per hour at :MM** | fires at a fixed minute each hour | news, top-of-hour ID |

Weight is how radio programmers actually work: an A-list on weight 5, a B-list
on 2, deep cuts on 1 — the hits come round every hour and album tracks appear
occasionally, with nobody hand-ordering anything.

Each playlist also carries its own **ordering**: sequential, shuffled (a full
pass in random order before repeating), or random (re-picked every time).

Note that **the last three types are the current jingle system, generalised**.
`jingle_mode` interval/tracks are two hardcoded instances of one mechanism.

### What the scheduler becomes

`AutoDjScheduler::next()` stops being "the row after the cursor":

1. Which playlists are **eligible now**? Scheduled ones whose window contains
   `now()`; periodic ones whose counter is due; general rotations always.
2. **Priority**: a due "once per hour at :30" or "once per 4 songs" beats
   general rotation — that is what makes a station ID land on time.
3. Among eligible general rotations, pick one **weighted-randomly**.
4. Take the next track from that playlist, by that playlist's own ordering.
5. Reject it if it breaks the repeat rules (§0) and try again.

### Example of one station's configuration

```
Morning Drive     scheduled          06:00–10:00 Mon–Fri   shuffled
A-List            rotation           weight 5              shuffled
B-List            rotation           weight 2              shuffled
Deep Cuts         rotation           weight 1              shuffled
Station IDs       once per 4 songs                         random
Top of Hour News  once per hour at :00                     sequential
Overnight         scheduled          00:00–06:00 daily     shuffled
```

At 07:15 on a Tuesday the pool is Morning Drive, IDs fire every fourth song and
news lands at :00. At 02:00 it is Overnight. Nobody touched anything. That is a
station rather than a loop.

### Schema sketch

- `playlists` — station_id, name, type, weight, ordering, enabled, the type's
  own fields (window times, days mask, interval / every_tracks), and its own
  cursor.
- `playlist_track` pivot with a position, so one track can sit in several
  playlists.
- `tracks` keeps the files. **`kind` goes away**: "jingle" stops being a
  property of a track and becomes a property of the playlist it belongs to.

Migration is mechanical and invisible to users: per station, create a "Rotation"
playlist from the music tracks and a "Jingles" playlist (type: once per X,
carrying the station's existing jingle settings) from the jingle tracks.

**The `.liq` does not change at all.** It still just asks what is next. That is
the payoff from the `request.dynamic` work.

### Product note

This is the natural thing to gate by plan. "One rotation" on free, "scheduled
playlists and dayparting" on paid, is a distinction customers immediately
understand — unlike storage caps, which they have to be taught to care about.

---

## 3. Embeddable player

**Status (2026-09-19): BUILT, 2026-09-08.** `client/app/embed/[slug]/page.tsx`
and `EmbedPlayer.tsx`, gated on an `embed_enabled` plan column (Pro only; a
free station's `/embed` URL 404s). The requirements list below was met except
for one item, which is still outstanding:

- **Now-playing over the channel from §1** — not done. The embed shares the
  polling path with the main player, so the multiplication warned about below
  is real. It is the strongest remaining argument for finishing §1's listener
  leg.

Kept in this document rather than deleted because the free-tier branding
reasoning in the last paragraph is still the live rationale for that gate.

**Original status: agreed.**

An iframe or script snippet a station drops onto their own website. Public
station pages exist at `/station/[slug]`; the embed is the thing that travels —
it turns every customer's own site into a distribution point.

Requirements are modest and mostly already met:

- A minimal standalone route with no dashboard chrome and no auth.
- Its own tiny bundle. The dashboard's component library must not ride along;
  this loads on other people's sites and its weight is our reputation.
- Now-playing over the channel from §1 rather than polling, since an embed on a
  busy site multiplies whatever the client does.
- Theming from `stations.theme_config`, which already exists and is unused here.
- Correct framing headers, deliberately permissive — this is meant to be
  embedded cross-origin, which is the opposite of the usual default.

Free-tier consideration: the embed is the obvious place for platform branding,
and it is more defensible there than in the audio (see the watermark, which
rides over live speech).

---

## 4. Analytics

**Status (2026-09-19): largely BUILT, 2026-08-30 to 2026-09-01.** The listener
side shipped on its own data model rather than on `track_plays`:
`listener_sessions`, `listener_stats_hourly` and `listener_geo_daily`
(migrations 2026_08_30_1200*), rolled up by `RollupListenerStats` /
`SyncListenerCounts` / `SweepListenerSessions`, served by `AudienceController`,
and gated for display by the `analytics_days` plan column.

Against the list below:

- **Listeners over time** — built.
- **Peak concurrent listeners** — built.
- **Client and geographic breakdown** — table exists; geo still needs
  Cloudflare headers to be populated.
- **Per-song performance** — **open**, needs §0.
- **Most/least played, never-played** — **open**, needs §0.

So this section is now *only* the two per-song items, and §0 is the whole of
what stands between here and them. The sales-surface note in the last paragraph
has also moved on: listener-hour metering was dropped from the pricing model,
so peak concurrent listeners is the number that matters there, not
listener-hours.

**Original status: agreed. Mostly queries over data we nearly have.**

`StreamSession` already records broadcast sessions for billing, and listener
counts are synced. What is missing is history and reporting. With `track_plays`
(§0) in place, in rough order of value:

- **Listeners over time** — per station, per day/hour. The chart every customer
  expects to see first.
- **Per-song performance** — listener gain and loss across each song. This is
  AzuraCast's most distinctive report and the most genuinely useful one: it tells
  a programmer what makes people tune out, which is the whole job.
- **Most/least played**, and never-played tracks sitting in the library.
- **Peak concurrent listeners**, which is also the number that justifies an
  upgrade prompt.
- Client and geographic breakdown, if the listener data supports it.

Two of these double as sales surface: peak listeners and listener-hours are the
metering story from the pricing work, shown back to the customer as a feature
rather than as a bill.

---

## Appendix: the rest of the gap

Surveyed against AzuraCast for completeness. **Not committed to** — most of it
is a decade-old self-hosted kitchen sink, and GoCast should not want all of it.
Recorded so the decisions are deliberate rather than accidental.

**Content handling**

- ~~Per-track **cue points and fades**~~ — **BUILT, 2026-08-18** (the same day
  this document was written). `TrackAnalyzer` populates `cue_in_seconds` /
  `cue_out_seconds` on `tracks`
  (`api/database/migrations/2026_08_18_234430_add_analysis_to_tracks_table.php`)
  and `PlaylistFileWriter` emits them as `liq_cue_in` / `liq_cue_out`
  (`api/app/Services/PlaylistFileWriter.php:318`). `liq_fade_in` /
  `liq_fade_out` are still unpopulated.
- ~~**Loudness normalization**~~ — **BUILT, 2026-08-18.** `loudness_lufs` and
  `true_peak_db` are analyzed per track and turned into a `liq_amplify`
  annotation against a target
  (`api/app/Services/PlaylistFileWriter.php:338`), which is exactly the
  "correct version of that idea" this bullet asked for — the template still
  refuses `normalize()`. An un-analyzed file carries no annotation and plays as
  before.
- Album art extraction, duplicate detection, folder-based media browsing.

**Listener requests** — a public request endpoint with per-song and per-requester
cooldowns, feeding the scheduler. Cheap once §2 exists, popular with small
stations, and an obvious paid-tier gate.

**Multi-person stations** — per-DJ credentials, scheduled DJ slots with
automatic switching, and recording a DJ's broadcast to disk. Today a station has
one owner and a broadcast token. This is the gap if we ever sell to a station
with a roster of presenters.

**Streaming** — multiple mount points per station at different
bitrates/formats, relays to other servers, and a fallback file for total
failure.

**Integrations** — webhooks on song change and live connect (Discord, Telegram,
Mastodon, generic POST). Disproportionately popular: a station's Discord
announcing every track is free marketing for them and for us. Days of work.

**Podcasts** — full hosting with shows, episodes and generated RSS. A second
product inside AzuraCast, not a feature. Decide deliberately.

**Ops** — scheduled backups, and remote storage backends (S3/SFTP) so media is
not stranded on the box. Relevant given the storage caps were sized against a
160 GB disk. **Update (2026-09-19):** scheduled backups are
addressed in substance — `backup.sh` at the repo root dumps MySQL and the
uploads to S3/R2/B2 nightly, and `deploy-native.sh` takes a local gzipped
`mysqldump` before any migration and refuses to migrate without one. The gap
left is installation, not code: nothing in the repo schedules `backup.sh` (no
timer unit, no mention in `setup-native.sh`), so its cron line lives only in
its own header comment. Remote storage for *media* is still open — that is a
separate question from backups, and the storage caps are still sized against
the box's disk.

---

## Suggested order

**Superseded — rewritten 2026-09-19.** Three of the five steps below are done
or partly done. The original is kept underneath for the record.

1. **Finish §1's listener leg** — a public per-station channel carrying the
   current and next track. The transport, the client wiring and the
   metadata hook all exist; this is the largest visible win for the least new
   code, and it is the one outstanding requirement of the shipped embed.
2. **`track_plays`** (§0) — half a day. Not urgent on rotation-quality grounds
   any more (the shuffled deck covers that), and its analytics payoff scales
   with how much is actually going to air. The argument for doing it sooner
   rather than later is only that history cannot be backfilled, so the trigger
   is real broadcast volume, not a date.
3. **Per-song reporting** (§4, remainder) — follows §0 directly and is the
   only part of analytics still missing.
4. **Playlists** (§2) — unchanged: the largest piece of work and the largest
   gap. Reuse `station_schedules` rather than adding a second schedule table.

### Original order, as written 2026-08-18

1. **`track_plays`** (§0) — unblocks two of the four, smallest item on the list.
2. **Now-playing push** (§1) — the hard half is already built; this is the
   cheapest visible win and it makes §3 worth doing.
3. **Embeddable player** (§3) — small, and it is distribution.
4. **Playlists** (§2) — the largest piece of work and the largest gap. Needs
   §0 for repeat rules and a real UI, but the `.liq` is already ready for it.
5. **Analytics** (§4) — grows naturally once §0 has been collecting for a while,
   which is another argument for landing §0 early.

---

## Provenance

**Reconciliation pass, 2026-09-19.** Every status line added above was read out
of the code, not inferred: migrations listed in full, `AutoDjScheduler` and
`StationStateChanged` read end to end, and the absence of `track_plays`
confirmed by grepping the whole tree rather than by listing migrations alone.
The original provenance for the August analysis follows.

Claims about Liquidsoap behaviour in "Why now" were measured against the real
`gocast/liquidsoap:latest` image on 2026-08-18, not taken from documentation:
the reload cursor reset, the fact that the current track is *not* interrupted by
a reload, `request.dynamic` exposing `flush_and_skip` rather than `skip`, and
Liquidsoap resolving `\/` back to `/` in emitted strings.

Claims about AzuraCast's feature set are from general knowledge of the project
and were **not** verified against their current documentation. The major items
(playlist types, weighting, dayparting, request system, per-song performance
reporting) are long-standing and stable; specifics such as weight ranges or
exact scheduling options should be checked before anything is designed around
them.
