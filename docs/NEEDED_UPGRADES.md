# Needed upgrades

Written 2026-08-18, after moving the AutoDJ rotation off `playlist()` and onto
`request.dynamic`.

This is a planning document, not a runbook. Nothing here is built. It records
what is missing, why each item matters, and — where it was measured rather than
assumed — the evidence behind the claim.

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
- **Every analytics feature** in section 4.

Two features, one table, no new plumbing.

One nuance to design around: `request.dynamic` prefetches, so Laravel is asked
for a track slightly before it is audible. The cursor is therefore one ahead of
reality. A play row should be written when the track actually starts (the
now-playing push), not when it is handed out — otherwise history and reality
disagree by one track, and on a container restart by one skipped track.

---

## 1. Now-playing push

**Status: called a must. The hard half is already done.**

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

**Status: agreed.**

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

**Status: agreed. Mostly queries over data we nearly have.**

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

- Per-track **cue points and fades** (`liq_cue_in` / `liq_cue_out` /
  `liq_fade_in` / `liq_fade_out`) — trim dead air off a file without
  re-encoding. The `.liq` already enables `cue_in_metadata`; nothing populates
  it.
- **Loudness normalization** — per-track LUFS analysis and amplification to a
  target, so tracks do not jump in volume. The template deliberately refuses
  `normalize()` because it is an AGC that makes the volume breathe; this is the
  correct version of that idea, and the image supports autocue for it.
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
160 GB disk.

---

## Suggested order

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
