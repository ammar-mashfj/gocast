# User-flow upgrades

Written 2026-09-10, after walking both flows end to end against the code:
broadcaster (signup → station → preflight → studio → stop → share) and
listener (link → play → save → notify).

This is a planning document, not a runbook. Nothing here is built. It is
deliberately **not** a quality review — the code it describes is well
reasoned and heavily commented. Every item below is a gap in the *flow*: a
place where the product stops the user rather than carries them.

Companion to [`NEEDED_UPGRADES.md`](NEEDED_UPGRADES.md), which covers the
platform capabilities (play history, scheduling, now-playing push). Where the
two overlap it is noted, because several items here are the user-facing half
of something already specced there.

Line references are to the code as of `main` @ `4e8e4d9`.

---

## Contents

1. [The shared link is a dead end most of the time](#1-the-shared-link-is-a-dead-end-most-of-the-time)
2. [Nothing survives a broadcast](#2-nothing-survives-a-broadcast)
3. [External encoders are advertised but unreachable](#3-external-encoders-are-advertised-but-unreachable)
4. [No schedule — neither side can express recurrence](#4-no-schedule--neither-side-can-express-recurrence)
5. [Listeners have no identity, so there is no repeat loop](#5-listeners-have-no-identity-so-there-is-no-repeat-loop)
6. [The studio is a monologue](#6-the-studio-is-a-monologue)
7. [Verification gates the fun part](#7-verification-gates-the-fun-part)
8. [Smaller notes](#smaller-notes)
9. [Suggested order](#suggested-order)

---

## 1. The shared link is a dead end most of the time

**Evidence.** `client/app/station/[slug]/PlayerView.tsx:789` — an off-air
station renders the words "Off air" and an email capture form, and nothing
else. `RelatedStations` is imported and commented out at line 808.

**Why it matters more than it looks.** Free plans have
`autodj_enabled = false` (`api/database/migrations/2026_08_15_115900_add_feature_columns_to_plans_table.php:36`),
so a free station is off air whenever its owner is not physically
broadcasting — which is very nearly always. The link the broadcaster shares
is therefore, most of the time, a page with nothing to hear and one thing to
do: type an email address to be told about something that has not happened
yet.

This is the largest leak in the acquisition funnel, and it is downstream of
every other growth effort. There is no point improving how a station gets
shared while the destination is empty.

**What to build.** The off-air player must always offer something:

- The last broadcast, playable (needs §2).
- What was played recently — the last few tracks, with times.
- When the station is usually live (needs §4).
- A one-tap follow that is not a form (needs §5).
- Related stations — the component already exists, uncomment and finish it
  once there is enough station volume for it to be honest.

**Order of arrival matters.** Even before §2 lands, "recently played" plus a
usual-schedule line is a page rather than a dead end. Do not wait for the
whole set.

---

## 2. Nothing survives a broadcast

**Status: scope decided 2026-09-11. Live sessions only, capped. The cap value
and the free/Pro split are open — see "Open decisions" at the end.**

**Evidence.** The rendered station template
(`api/resources/views/liquidsoap/station.blade.php`) has exactly two outputs:
`output.icecast` at line 1172 and `output.file.hls` at line 1274. There is no
recording. There is no `track_plays` table either — `NEEDED_UPGRADES.md` §0
calls it prerequisite zero and it is still not in
`api/database/migrations/`.

**The consequence.** When a show ends it leaves zero artifacts. No replay for
the listener who was asleep, in the wrong timezone, or who found the link an
hour late. No "what did I play last night" for the DJ. No clip to post. The
audience of a live-only station is permanently capped at the set of people
who happened to be awake and already knew.

---

### Scope: live sessions only

**Decided.** Recording captures a human broadcasting. It does not capture
AutoDJ, and there is no continuous archive.

The reason is not cost alone — it is that a continuous archive already exists
in a cheaper form. HLS segments are encoded audio already sitting on disk at
`/var/gocast/hls/{slug}`, rotated by `segments = 5` + `segments_overhead = 5`
(template line 1274). **If a 24/7 archive is ever wanted, stop deleting those
segments rather than adding a third encoder.** That is a retention change, not
a feature.

So the AutoDJ case is deliberately not built, and the door it leaves open is
a config change rather than a rewrite.

---

### What it costs

CBR 128 kbps is exactly 16 kB/s, so this is arithmetic rather than estimation:

| Window | Per station |
|---|---|
| 1 hour | **57.6 MB** |
| 24 hours | 1.38 GB |
| 30 days continuous | 41.5 GB |

`storage = stations × hours/day × 57.6 MB × retention_days`

The 24-hour and 30-day rows are recorded only to show what was avoided. Under
the live-only scope the number that applies is the first row. A DJ doing two
hours a day is **115 MB/day**; a hundred of those is 11.5 GB/day, settling at
roughly **1 TB** under 90-day retention — about **$15–20/month** on R2 or B2,
with no egress charge on replays if R2 is the choice.

Storage cost is therefore not the constraint. **The 160 GB local disk is.**
Local storage has to be a staging buffer that a job drains to object storage,
not the archive itself. See the Ops note in `NEEDED_UPGRADES.md` — the caps
were sized against that disk, and it also holds MySQL, AutoDJ uploads, HLS
segments and the OS.

---

### What it costs the container: nearly nothing

Measured against the real config, not assumed:

- **RAM.** The container already runs two encoders — lame for Icecast
  (line 1172) and ffmpeg AAC for HLS (line 1274). A third output adds one more
  lame instance plus an output buffer: single-digit MB, against ~85 MB steady
  state and a 512m cap (`config/liquidsoap.php:743`). Not the constraint.
- **CPU.** LAME at 128k CBR runs 100–200× realtime. A third encode is roughly
  +0.5–1% of one core, or 1–2% of the container's `0.5` cap.
- **Disk I/O.** 16 kB/s sequential per station — fewer IOPS than HLS already
  generates churning through small segment files.

**One non-obvious risk.** Under cgroup v2, page cache is charged to the
container's memory cgroup, so a continuously appended file makes
`memory.current` climb in a way that reads as a leak in monitoring. The kernel
reclaims clean pages before OOM-killing, and HLS already writes to the same
bind mount all day, so this is incremental behaviour rather than new
behaviour. **Re-measure anyway before rollout** — the 256m default that
SIGKILLed every station at boot with an empty `docker logs`
(`config/liquidsoap.php:733-742`) is the precedent, and the failure mode in
this area has a track record of being silent.

---

### Where to tap

The tap point decides what the recording actually contains. Three options,
and the scope decision above removes the expensive one:

1. **`broadcast_out` continuously** — the true archive, post-fallback,
   post-levelling, jingles and watermark included. Rejected: the silence
   fallback means the source never fails, so this records 24/7 whether anyone
   broadcast or not. This is the case HLS retention covers if it is ever
   wanted.
2. **The live arm, `fallible = true`** — the output starts when the DJ
   connects and stops when they drop, giving one file per session with no
   scheduling logic. But it misses jingles and levelling, so it captures the
   same thing a browser recording would while costing server storage.
3. **`broadcast_out`, gated on live-connected** — what actually aired, only
   while a human was on. **This is the one to build.** It is the version where
   server-side recording is strictly better than the browser alternative
   rather than merely different.

The exact Liquidsoap operator for (3) must be **verified against the real
2.4.5 image before committing to it**. `station-hardening-plan.md` documents
two places where the published docs disagreed with the image; assume this is a
third until measured.

**Two mechanics that fall out of this:**

- **Keep `reopen_when` hourly**, as `infra/liquidsoap/reference-station.liq:75`
  sketches. Bounded file sizes, each chunk uploadable to object storage the
  moment it closes, and a crash costs at most an hour.
- **MP3 truncates gracefully.** A SIGKILLed container leaves a file that plays
  right up to the cut, because MP3 is a frame stream with no trailing index.
  Given teardown's history here, that is a real advantage over any container
  format.

---

### The browser alternative

Worth recording because it is nearly free and it is a genuine option for the
free tier.

The studio already produces exactly the bytes a recording needs. `lib/audioEngine.ts:255-257`
runs lamejs in a Worker fed by a PCM worklet; `encoderInfo()` at line 290
confirms CBR 128k / 44.1k / stereo `libmp3lame`. Concatenated CBR frames are a
valid MP3 file. So a browser recording costs **zero extra CPU** — the encode
already happened — and zero server storage. `MediaRecorder` is the wrong tool
here for exactly that reason: it would pay for a second Opus/WebM encode during
the minutes the machine can least afford it.

Mechanics, if it is built:

- **Tee inside `public/encoder-worker.js`**, not at `lib/broadcast.ts:250`.
  The frames are already in that worker, OPFS sync access handles are
  worker-only anyway, and it makes "record every frame the encoder produced"
  structural rather than a convention.
- That tap is deliberately **before** the `readyState === OPEN` check at
  `broadcast.ts:250`, so a socket dropout leaves the recording complete even
  though listeners heard AutoDJ or silence. Recording length will therefore
  not equal broadcast length, and the UI must not imply otherwise.
- **Write to OPFS incrementally, never hold it in RAM** — two hours is ~115 MB.
  Chrome 86+, Firefox 111+, Safari 15.2+.
- **OPFS survives a tab crash**, which pairs with the recovery machinery
  already in `BroadcastContext` (`readBroadcastRecovery`, and the 60-second
  `RECOVERY_WINDOW_MS` in the live page). "We found an unfinished recording
  from your last broadcast" is a small feature that will matter enormously
  exactly once.
- Call `navigator.storage.estimate()` in preflight and `persist()` at start;
  OPFS is evictable under disk pressure.

**What a browser recording is not.** It is the live arm only — no jingles
(`jingle_mode` / `jingle_settings`), no levelling (template line 606), no
watermark (`watermark_enabled`), nothing AutoDJ played during a dropout. Name
it *"your show recording"*, not *"broadcast archive"*.

Note the free-tier wrinkle: a browser recording is **watermark-free** while the
stream the listeners heard was not. Probably fine — the watermark brands the
public stream, it is not there to hold the DJ's own work hostage — but it is a
deliberate choice, not an oversight.

**And the thing it cannot do:** a file on someone's laptop cannot be a URL, so
a browser recording can never be the replay that §1 needs.

---

### Open decisions

Recorded here so they are decided once, deliberately, rather than discovered
during implementation.

1. **What is the cap?** Recording is capped — nobody streams 24 hours on a
   free plan, and an uncapped feature is an unbounded bill. Open: whether the
   cap is per-session duration (e.g. 3h), per-month total airtime, a count of
   retained recordings, or a retention window. These behave very differently
   when a DJ hits them mid-show, which is the case to design for: a recording
   that stops silently at the cap is worse than one that warns at 90%.
2. **Does Free get server-side recording at all, or only the browser version?**
   The browser route costs nothing and gives free users a real artifact plus a
   natural upgrade line — *"your show is on your laptop; Pro puts it online
   with a link."* The counter-argument is §1: without a hosted recording, free
   stations keep the dead-end off-air page, and free stations sharing links is
   currently the entire distribution story. A bounded middle ground exists —
   one replay slot per free station, always the most recent show — at a
   predictable cost of roughly one file per station.
3. **Retention window per plan**, which follows from (1) and sets the object
   storage bill.
4. **Opt-in or always-on?** `PreflightView` in
   `client/app/dashboard/stations/[slug]/live/page.tsx` already exists as the
   calm pre-flight checklist and already asks about the mic — a "record this
   show" line belongs there. Always-on is friendlier, but for the browser
   variant it writes ~115 MB to someone's phone without asking.

---

### Build order within this item

1. **Capture.** Option (3) above, verified against the image, gated on
   live-connected, hourly reopen.
2. **Drain.** A job that uploads closed chunks to object storage and deletes
   the local copy. This is what keeps the 160 GB disk from being the ceiling,
   and it is not optional.
3. **Surface.** A row per recording under Broadcasts
   (`client/app/dashboard/broadcasts/`), with a download. Worth shipping on its
   own — a DJ who can keep their show will do another one.
4. **Replay.** That recording becomes what the off-air player page plays in
   §1. This is the join between the two items and the reason they are one
   project.
5. **History.** `track_plays`, fed by the existing `/internal/now-playing`
   push, written when the track actually starts rather than when
   `request.dynamic` prefetches it (see `NEEDED_UPGRADES.md` §0 for the
   off-by-one this avoids). Feeds duplicate-prevention in `AutoDjScheduler`
   and the audience page.

---

## 3. External encoders are advertised but unreachable

**Evidence.** `README.md` claims the ingest supports "the classic Icecast
source protocol for BUTT/Mixxx". `api/app/Http/Controllers/HarborAuthController.php`
accepts exactly one credential: the token minted by `BroadcastTokenService`,
which is station-scoped, MAC-signed and **60 seconds long**
(`BroadcastTokenService::TTL_SECONDS = 60`).

No long-lived stream key exists anywhere. `stations.icecast_password`
(`2026_04_03_193133_create_stations_table.php:25`) is the Liquidsoap→Icecast
leg, not the source leg. And no screen exposes connection details in any case
— `client/app/dashboard/stations/[slug]/settings/page.tsx:50` lists player
URL, Icecast mount and format, and stops there.

So a DJ who already owns gear — which is most DJs who would pay — hits a wall
the marketing copy told them was not there. This is also the "stream keys"
gap already recorded against the station page.

**What to build.**

- A rotatable per-station stream key. Long-lived, revocable, shown once and
  re-generatable.
- `HarborAuthController` accepts it *alongside* the ephemeral browser token.
  Keep both: the browser must keep using the 60-second token, for the reasons
  the class docblock spells out (a leaked publish URL grants nothing lasting).
  Verify the key against the DB, the token against the MAC, and do not let the
  two paths blur.
- A "Connect your encoder" card in station settings: host, port, mount,
  username, password, each with a copy button, and the two or three lines of
  BUTT/Mixxx-specific wording that turn it from data into instructions.

**Bounded and cheap.** No new infrastructure — harbor is already listening and
already calls out for auth. This is the smallest item on the list that unlocks
a whole user segment.

---

## 4. No schedule — neither side can express recurrence

**Evidence.** No schedule table, no schedule UI, nothing on the station model.
The only forward-looking signal in the product is
`SendStationLiveNotifications`, which fires once, after the fact, to whoever
left an email address.

A DJ cannot say "I'm on Thursdays at 8". A listener cannot find out. Every
broadcast therefore starts its audience from zero.

**What to build, in two very different sizes.**

- **Cheap version, do it first.** A free-text or lightly structured "usually
  live" field on the station, rendered on the player page, with an "Add to
  calendar" ICS link. No scheduler, no automation, no correctness burden —
  it is the DJ's own claim about their own habits. It converts a one-time
  listener into a returning one, and it gives §1 something to say.
- **Full version.** Scheduled playlists and automatic switching —
  `NEEDED_UPGRADES.md` §2. Large, and the `.liq` is already shaped for it,
  but do not block the cheap version on it.

---

## 5. Listeners have no identity, so there is no repeat loop

**Evidence.** The saved-station library is `localStorage`
(`PlayerView.tsx:87-95`). Follows are anonymous rows in
`station_notify_subscriptions`. Re-engagement is email, once, via
`SendStationLiveNotifications`.

Nothing carries a listener from one broadcast to the next except an inbox.

**What to build.** Web Push on "we're live". It needs no accounts — a
permission prompt and a subscription record keyed the same way the notify
subscriptions already are — and it will outperform email by a wide margin for
a signal whose entire value is that it is timely. A listener who taps Follow
once should be pinged every time, on the device they actually listened on.

`SendStationLiveNotifications` already has the delayed-guard logic (it
re-checks that the stream session is still open before sending, so a mic test
does not spam anyone). Push should reuse that job rather than grow a parallel
one.

---

## 6. The studio is a monologue

**Status: NOT CONVINCED (2026-09-11). The design below is recorded so it does
not have to be re-derived, not because it is approved. Read "The case against"
first — it is the stronger half of this section.**

**Evidence.** `client/components/studio/OnAirDeck.tsx` receives `elapsed` and
`listeners`. That integer is the entire audience signal a broadcaster gets.

The *broadcasting* side of the studio is genuinely good — push-to-talk with
ducking (`client/lib/audioEngine.ts:315-336`), encoder health read off the send
path rather than the mixer, a drag-and-drop queue, transport shortcuts. The
*feedback* side is a number that goes up and down.

---

### The case against

Written first and at length because it is currently winning.

**It only works with an audience, and the audience is the thing we do not have
yet.** Three listeners tapping a clap button is worse than no feature: it makes
the room feel empty rather than merely quiet. The value scales with concurrent
listeners, and every other item in this document — §1, §2, §3, §4, §5 — is
about getting people into the room. This one decorates the room.

**A vanity metric can demoralise.** "4 listeners" reads as neutral. "0 claps"
reads as a verdict. The retention problem this product actually has is
broadcasters not doing a second show, and this builds a mechanism capable of
making a slow night feel like a failure. That is a real risk, not a
hypothetical one, and it points the wrong way on the metric that matters most.

**It spends the transport decision on the wrong feature.** Reactions and
now-playing push (`NEEDED_UPGRADES.md` §1) want the same Laravel→browser leg.
If Reverb is going to be stood up, it should be justified by the thing that
improves every listener's experience, not the thing that improves one
broadcaster's mood. (The v1 below avoids this by not needing a transport at
all — but the pull toward "while we're here, let's do it properly" is real.)

**The maintenance surface is not tiny.** A new write path taking anonymous
public traffic, a new Redis key family, two columns, a flush path in a
scheduled command, an animation layer, and per-plan display logic — for a
nice-to-have.

**And it is hard to know whether it worked.** At current volumes there is no
way to A/B this. It will be judged on vibes.

---

### The case for

**It is the only two-way thing in an otherwise entirely one-way product.**
Everything else GoCast does points from broadcaster to listener.

**No moderation burden**, which is the argument for reactions over chat and the
reason chat is not proposed here at all. Emoji counters have nothing to delete,
no slurs, no report flow, nobody to ban, and no user-generated text to store.
Chat needs all of that plus somebody on call for it.

**It produces an artifact that pairs with §2.** "Your Tuesday show: 47 minutes,
12 listeners, 340 claps" is a thing a DJ screenshots. A recording plus a number
is a souvenir; a recording alone is a file.

---

### The cheap probe, if this is ever picked up

**Do not build the section below first.** Build the smallest thing that tests
whether anyone taps the button at all:

One clap button on the player, one counter, no real-time path, no animation
layer, no polling changes — just a number shown to the owner after the show.
Roughly half a day. If listeners do not tap it, that is the whole answer and
nothing below ever needs building. If they do, the design below is what it
grows into.

---

### Design, if it is built

Recorded at implementation depth because the storage half is the part that is
easy to get wrong, and it was gotten wrong once already in this conversation.

#### Ingestion: reuse the listener session token

The anonymous listener token already exists — `POST /public/stations/{slug}/listen`
returns one, and `/listen/{token}/beat` and `/listen/{token}/end` already use
it (`api/routes/api.php:175-182`). Reactions become a fourth verb on it:

```
POST /public/listen/{token}/react   { type: "clap", count: 3 }
```

Four things come free: only real listeners can react (a token requires an open
session), per-token throttling with the `listener-beat` limiter shape already
defined, a natural tie into the analytics already collected, and no new
identity concept — which matters because §5 says listeners do not have one.

It also inherits the failure philosophy already written into
`ListenerSessionController`: nothing here is in the audio path, so if it
returns 500 for an hour every station keeps playing and the only thing lost is
an hour of claps.

Client batches locally — five taps in two seconds is one POST with `count: 5`
— and animates optimistically on every tap without waiting for the server. Cap
`count` server-side around 10 and let the throttle do the rest. A bot must open
a throttled listen session before it can react at all, and the blast radius of
getting past that is a wrong number on one DJ's screen; do not spend more than
the rate limit defending it.

#### Counting: station+hour is primary, session is secondary

**This is the part that was wrong the first time.** A session-scoped counter
has nowhere to live when nobody is broadcasting — and a Pro station on AutoDJ
has listeners, has reactions, and has no `stream_session` row for most of its
existence.

Two `INCRBY`s on the same request:

```
rx:{station_id}:{type}:{YYYYMMDDHH}   ← always.  TTL 3h.  The record.
rx:{session_id}:{type}                ← only while a live session is open.
```

The hour bucket is the source of truth and does not care whether anyone is
live. The session counter exists so "your Tuesday show got 340 claps" is exact
rather than approximated by summing hours that do not align with the session's
edges.

#### Storage: two columns on `listener_stats_hourly`

Not a new table. That one is already hourly, already per-station, already
UTC-truncated, already `unique(['station_id','hour'])`, and its own docblock
says why it is the right home — it is the half of listener analytics that is
never pruned.

```php
$table->unsignedInteger('claps')->default(0);
$table->unsignedInteger('hearts')->default(0);
```

**Flush from `listeners:sweep`** (`SweepListenerSessions`), which already runs
every minute and already upserts into this table — not from `listeners:rollup`,
which only runs once the hour has closed. A live station's current hour should
appear on the audience page now, not forty minutes later, and a per-minute
drain gives each bucket ~180 chances to land before its 3h TTL.

**Assign with `GREATEST(claps, :value)`, never increment.** This is the same
monotonic-max pattern `peak_listeners` already uses in that table, and for the
same reason: it makes the flush idempotent, so a sweep that runs twice or one
that missed a minute both self-correct. An incrementing flush double-counts on
retry; a plain assignment zeroes the column if the Redis key ever vanishes
mid-hour.

Per-session totals flush to `stream_sessions.clap_count` / `heart_count` when
the session closes — `StationEventController` already handles
`live_disconnected`, so the hook exists.

Never a row per clap.

#### Delivery: no push transport in v1

Both ends already poll the same endpoint — `useBroadcastStats` every 8s for the
studio, `PlayerView.tsx:305` every 10s for the player, both hitting
`/public/stations/{slug}/listeners`. Add the counter to that response and there
are zero new endpoints on the read side. Listeners see each other's reactions
for free, which is the difference between a button and a crowd.

**Smear the animation.** Receive "23 claps in the last 8 seconds", animate them
stochastically across the next 8. The DJ cannot tell this from real-time,
because the payload is *"people are reacting right now"* and not "this clap
landed at t=4.2s". This is not a compromise — even with a real-time transport
you would want it, or 23 claps arrive as one ugly simultaneous burst.

Clients read the absolute counter and animate the delta. Two edge cases,
both three lines:

- **A listener joining mid-show** reads 340 on their first poll and must not
  animate 340 hearts. Initialise `lastSeen` from the first read; animate only
  subsequent deltas.
- **The hour boundary** resets the bucket, so `current < lastSeen` means
  rollover and the delta is `current`.

State the guarantee difference explicitly, because it is deliberate: **the
animation is allowed to be lossy** — a couple of claps landing in a closing
hour between polls may never be drawn — **the record is not**, because the DB
value comes from the buckets, never from what a client observed.

Phase 2, if it ever earns it: Laravel Reverb (first-party, Laravel 13, Redis
already installed, one more systemd unit beside the queue worker / scheduler /
Next units), decided jointly with `NEEDED_UPGRADES.md` §1. Hosted Pusher/Ably
is the wrong economics — reactions are precisely the high-volume,
low-value-per-message traffic those bill for, and 100 concurrent connections is
the free ceiling.

#### What each surface shows

| Surface | Source | Gated by |
|---|---|---|
| Studio, live | hour-bucket delta, smeared | — |
| Player page | same poll, same delta | — |
| "This show got 340 claps" | `stream_sessions.clap_count` | — |
| Hourly chart on the audience page | `listener_stats_hourly` | `analytics_days` |

**No new gating is needed.** `analytics_days` is already 0 for Free and 90 for
Pro and the audience page already honours it, so Free collects reactions and
sees the live number and the per-show total while Pro gets the history. Same
rule as listener analytics, no new concept.

---

### Two things to get right if it is built

**The heart is already taken.** `client/app/station/[slug]/PlayerView.tsx:114`
uses a heart toggle for "Save station" / "Remove from saved". Two hearts on one
page meaning different things is a bug, not a detail. Use 👏 and 🔥, or make
the reaction unmistakably distinct from the library toggle.

**Reactions arrive ~10 seconds after the moment that caused them.** Listeners
sit several seconds behind the live edge — `PlayerView` documents this where it
explains why in-band ID3 beats the poll for captioning — and human reaction
time is on top of that.

Leave it alone. Do not buffer, do not timestamp-align, do not try to correct
it: a clap that lands ten seconds late still reads correctly as "they liked
that bit". But it does mean **never attribute a reaction to a track** in the
live case, because that attribution will frequently be wrong.

**The low-listener problem** is the case-against in miniature, and the only
mitigation that works is showing a cumulative total that only goes up, plus
hooking the first clap of a show into the celebration vocabulary that already
exists — `useBroadcastStats` already fires `fireOnce` toasts at listener
milestones ("🎉 First listener tuned in!"). It mitigates; it does not solve.

---

### The one thing that would change the verdict

Per-track attribution for AutoDJ stations. "Which tracks does my audience love"
is the most actionable analytic a radio station can have, and it is one join
away once `track_plays` lands (`NEEDED_UPGRADES.md` §0): attribute each
reaction to whatever was playing at `now − buffer_estimate`, surface it only
ever as a ranking and never as a per-play fact, and let aggregation over dozens
of plays wash out the boundary noise.

That closes a loop worth having — listeners react, the scheduler learns which
tracks earn reactions, rotation improves — feeding the same `AutoDjScheduler`
that §0 was already going to feed with duplicate-prevention.

It is also the version that survives the case against, because it does not need
a crowd to be useful: ten reactions a day across a week still ranks a rotation.
If this section ever gets built, **this is probably the reason**, and the live
studio animation is the by-product rather than the point.
---

## 7. Verification gates the fun part

**Evidence.** `api/routes/api.php` — `apiResource('stations')` sits inside the
`middleware('verified')` group. A fresh signup cannot name their station until
they have gone to their inbox and come back.

**What to change.** Let them create the station, pick artwork and write the
description while unverified. Gate only the things that put audio in front of
the public: `/stations/{slug}/start` and `/auth/broadcast-token`.

The checklist in `client/components/dashboard/StationChecklist.tsx` already
knows how to name the next concrete thing to do; "verify your email to go on
air" belongs there, at the moment it actually blocks something, rather than as
a wall in front of the empty dashboard.

---

## Smaller notes

**Discover is off.** `client/app/(marketing)/discover/page.tsx:8` is an
unconditional `redirect("/")`, backed by a matching entry in `next.config.ts:132`.
There is therefore no platform-side distribution at all — every listener
arrives because a broadcaster personally sent them a link. The reasoning
(a thin discover page is worse than none) is sound, but the current shape is
all-or-nothing. Re-enable it behind a live-station threshold rather than a
hard redirect, and note that §1 and §2 both feed it: a discover page listing
stations with replays is useful at a much lower station count than one listing
only who is live this second.

**`GO-LIVE.md` is stale.** It describes a relay service that no longer exists
(the WebSocket-to-Icecast bridge was replaced by Liquidsoap's `input.harbor`)
and lists as blockers several things that shipped. It will mislead whoever
reads it next. Either date-stamp it as a historical record or rewrite it
against the current architecture.

---

## Suggested order

1. **§2 capture + §1 off-air page.** One project, not two. Recording is what
   makes the off-air page alive, and the off-air page is what makes every
   shared link work. Biggest change in what the product is. Scope is settled
   (live sessions only, capped); the cap value, the free/Pro split and the
   retention window are the four open decisions listed at the end of §2 and
   should be answered before the first line is written.
2. **§3 stream keys.** Cheapest high-value unlock, no new infrastructure, and
   it closes a gap the README has already promised.
3. **§4 cheap schedule.** Days of work, feeds §1.
4. **§5 web push.** Needs §4 and §1 to be worth pushing *about*.
5. **§7 verification gate.** Small, independent, moves activation.
6. **§6 reactions — not convinced, and last for a reason.** Everything above
   puts people in the room; this one decorates it. If it is ever picked up,
   start with the half-day probe described in that section rather than the
   full design, and note that the argument most likely to change the verdict
   (per-track attribution for AutoDJ) depends on `NEEDED_UPGRADES.md` §0
   rather than on any of this document.

---

## Provenance

Every claim above was read out of the code on 2026-09-10, not inferred from
the docs — including the two places where the docs and the code disagree
(the README's BUTT/Mixxx claim in §3, and `GO-LIVE.md`'s relay service). Where
a file and line are cited, that is where the behaviour lives; where a table is
said not to exist, `api/database/migrations/` was listed in full to check.

**§2 was costed on 2026-09-11, and the numbers there are of three different
kinds — do not treat them alike:**

- **Exact.** The storage table. CBR 128 kbps is 16 kB/s by definition, so
  57.6 MB/hour is arithmetic, not a measurement.
- **Read from config.** The 512m cap, the `0.5` CPU cap and the ~85 MB steady
  state are quoted from `config/liquidsoap.php:733-744`, where they were
  recorded by whoever measured them on 2026-08-14.
- **Estimated, and not yet measured.** The added RAM of a third output, the
  added CPU of a third lame encode, and the cgroup v2 page-cache behaviour.
  These are reasoned from what the container already runs, not observed. The
  house rule in `station-hardening-plan.md` is that the image wins over the
  docs; nothing in this bullet has been put to the image yet.

Object storage pricing (~$15–20/month at roughly 1 TB) is from public R2/B2
list prices at time of writing and should be re-checked before it appears in
any plan costing.
