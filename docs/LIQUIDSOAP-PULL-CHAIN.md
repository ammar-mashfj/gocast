# The station graph, read output first

`no-comments.liq` is the rendered station script with the commentary stripped —
469 lines of pure graph. This document reads that graph in the direction the
audio actually moves: from the two outputs, back up through every operator, to
the broadcaster's socket and the AutoDJ rotation.

Its companion, [LIQUIDSOAP-SCRIPT-ANNOTATED.md](LIQUIDSOAP-SCRIPT-ANNOTATED.md),
reads the same file top to bottom in source order. Use that one to answer "what
does line 244 do". Use this one to answer "how does a sample get from a
microphone to a listener", or "which of these twelve operators is eating my
audio".

Line numbers refer to `no-comments.liq` at the repo root.

---

## Why output-first is not just a preference

Liquidsoap is a **pull** system. Sources do not push audio downstream; outputs
pull it upstream, and nothing happens anywhere in the graph until an output asks
for it.

A source that no output ever pulls from is inert. It is instantiated, it appears
in the log, it consumes memory — and it never decodes a single sample. This is
why the jingle playlist can sit in the graph on a station that never enables
jingles and cost nothing: `fallback` never selects it, so nothing ever pulls it,
so it never opens a file.

So the file's bottom two blocks — `output.icecast` and `output.file.hls` — are
not the end of the story. They are the **engine**. Everything above them is
machinery they drag.

The clock ticks every `0.02` seconds (`settings.frame.duration`, verified as the
default in the 2.4.5 image), so **50 times a second** each output says "give me
a frame" and that request climbs the whole chain below.

---

## The whole chain on one page

```
          ┌────────────────────────┐        ┌────────────────────────┐
  ACTIVE  │ output.icecast  (:427) │        │ output.file.hls (:460) │
          │ %mp3 128k → :8888      │        │ %ffmpeg adts → /data/hls│
          └───────────┬────────────┘        └───────────┬────────────┘
                      │                                 │
                      └───────────────┬─────────────────┘
                                      │  both pull the SAME source
                                      ▼
                        broadcast_out = limit(-1.0 dB)            :318
                                      │
                                      ▼
                        broadcast_source = smooth_add()           :310
                            normal ──┤       ├── special
                                     │       │
                                     │       ▼
                                     │   watermark_arm = source.available(
                                     │       delay(watermark_interval,       :305
                                     │             watermark), watermark_due)
                                     │           │
                                     │           ▼
                                     │   watermark = playlist("/data/system")  :285
                                     ▼
                        listener_source = replay_jingle_metadata()  :283
                                     │   (jingle title → previous title)
                                     ▼
        ╔════════════ output_source = rms(duration=2.0)  ═══════════╗ :266
        ║  THE FORK. Everything below this line is the truth;       ║
        ║  everything above is what a listener is shown.            ║
        ║  Read by /status, /healthz, and the now-playing push.     ║
        ╚═══════════════════════════╤═══════════════════════════════╝
                                    ▼
                        mixed = mksafe(fallback(track_sensitive=false))  :263
                                    │
            ┌───────────────────────┼────────────────────────┐
            │ priority 1            │ priority 2             │ priority 3
            ▼                       ▼                        ▼
    live = live_raw         autodj_mix ≡ autodj_faded    bed = mksafe(blank())
           (:152)              ≡ autodj_leveled  :258/:255        :260
            │                       │
            ▼                       ▼
    live_raw = buffer(2,10) amplify(1., …)  ← liq_amplify hook   :252
           (:150)                   │
            │                       ▼
            ▼              autodj_rotation = fallback(track_sensitive=true) :249
    live_tagged =                   │
      metadata.map()    ┌───────────┴───────────┐
           (:148)       │ priority 1            │ priority 2
            │           ▼                       ▼
            ▼      jingle_arm =           autodj = request.dynamic()   :199
    live_in =        source.available(          │
      input.harbor(    delay(jingles))          ▼
        :8090)           (:244)          autodj_next()  ── HTTP ──▶   :167
           (:85)            │                   GET /api/internal/next-track
            │               ▼
            │        jingles = playlist(
   ◀── WebSocket /      "/data/playlists/       ◀── one URI at a time,
       Icecast source     jingles.m3u")  :213       Laravel owns the order
       protocol
```

---

## Stage by stage, downstream to upstream

### 0. The outputs — the only active nodes in the file

```liquidsoap
icecast_out = output.icecast(%mp3(bitrate=128, samplerate=44100), …, broadcast_out)   # :427
output.file.hls("/data/hls", …, [("aac", %ffmpeg(format="adts", …))], broadcast_out)  # :460
```

Two outputs, **one source**. This matters: `broadcast_out` is not evaluated twice
per tick. Liquidsoap memoizes a source's frame for the current tick, so both
encoders receive the identical buffer. The MP3 and the AAC are two encodings of
the same bytes, not two renders of the graph.

Only `icecast_out` is bound to a name, because only it has callbacks worth
attaching: `on_connect` / `on_disconnect` / `on_error` (:444–:458) drive the
`ice_up` ref that `/status` reports. HLS writes to a mounted directory and cannot
fail the same way, so it is left anonymous.

### 1. `limit` — the last thing before the encoders

```liquidsoap
broadcast_out = limit(threshold=-1.0, broadcast_source)   # :318
```

Static gain above −1 dBFS. Overflow protection for the encoder, not loudness
shaping — it has no track logic at all, which is why it is safe on the live path.

It sits **below** the watermark deliberately: the watermark mixes platform audio
on top of a station whose level we do not control, so the sum is the only signal
whose peak is worth guarding.

### 2. `smooth_add` — the free-tier watermark

```liquidsoap
broadcast_source = smooth_add(duration=1.0, p=watermark_duck,
                              normal=listener_source, special=watermark_arm)   # :310
```

The first place in this walk where the chain **branches upward into two sources**.
`normal` is the station; `special` is the platform clip. `p = 0.15` is the
fraction of the station's audio *kept* while the clip plays.

The `special` branch is a complete little graph of its own, and it is gated twice
before it can pull anything:

- `source.available(…, watermark_due)` (:305) — is the plan free, **and** is
  anything actually playing? `watermark_due` (:300) checks
  `live.is_ready() or autodj_mix.is_ready()`, reaching back down into the branches
  we have not walked yet. A watermark over the silence bed would read as a fault.
- `delay(initial=true, watermark_interval, …)` (:306) — has it been 600s?
  `initial=true` means the clock starts at boot, so a station never opens with one.
- `watermark = playlist("/data/system", mode="randomize")` (:285) — a *directory*,
  so several clips rotate, and an empty one just makes this fallible rather than
  fatal.

### 3. `replay_jingle_metadata` — audio passes, metadata is rewritten

```liquidsoap
listener_source = replay_jingle_metadata(output_source)   # :283
```

Zero effect on the samples. It is a `metadata.map` (:280) holding a `last_meta`
ref: when a jingle's metadata comes past, it substitutes the previous real
track's title instead, so a listener's player does not flash "Station ID" for
eight seconds and flip back.

`update=false` replaces wholesale rather than merging, so the jingle's own title
cannot survive underneath.

### 4. `rms` — the fork, and the ground truth

```liquidsoap
output_source = rms(duration=2.0, mixed)   # :266
```

**This is the most important binding in the file.** Audio passes through
untouched; what it adds is a float, refreshed once per 2s window, answering *is
this station actually making sound* — as opposed to *which arm won the fallback*,
which is a different question with a different answer when a rotation of
undecodable files is "playing".

Everything downstream of here (stages 0–3) is the **listener's** view.
Everything upstream is the **truth**, and three readers attach at exactly this
point rather than lower:

| Reader | Line | Why here |
|---|---|---|
| `/status` | :343 | Reports `rms`, `elapsed`, `remaining`, `last_metadata` |
| `/healthz` | :385 | 503 unless `output_source.is_ready()` |
| now-playing push | :424 | Sees the jingle (and declines to push it) |

The watermark is deliberately *not* in that view: a platform ID is not the
station's now-playing.

### 5. `mksafe(fallback(...))` — the brain

```liquidsoap
mixed = mksafe(fallback(track_sensitive=false, [live, autodj_mix, bed]))   # :263
```

Priority order, re-evaluated **continuously** — `track_sensitive=false` is what
makes a broadcaster going live cut in mid-track instead of waiting out a
five-minute song. (Contrast the jingle fallback at :249, which *is*
track-sensitive, because a station ID that chops a song in half is a bug.)

`mksafe` exists for the type checker: outputs refuse fallible sources, and
`fallback` is conservatively typed as fallible even though `bed` provably never
fails.

---

## Branch A — `live`, the broadcaster

Walking up from priority 1:

```liquidsoap
live        = live_raw                                                  # :152
live_raw    = buffer(buffer=2., max=10., live_tagged)                  # :150
live_tagged = metadata.map(insert_missing=true, live_metadata, live_in) # :148
live_in     = input.harbor("test", port=8090, auth=harbor_auth, icy=true) # :85
```

- **`live = live_raw`** — straight through, no dead-air guard. There used to
  be a `blank.strip` here that made `live` unavailable after 15s of silence so
  `fallback` could demote to AutoDJ; it was removed because it made `source`
  change under a connected broadcaster and the dashboard read that as "nobody
  is live". A stalled source is still dropped by harbor's own `timeout`.
- **`buffer`** decouples harbor's arrival timing from the main clock. 2s nominal,
  10s before samples drop.
- **`metadata.map(insert_missing=true)`** stamps `"Live Broadcast"` on a
  broadcaster who sends no title. `insert_missing` is what makes it fire at all —
  without it, a client that sends nothing produces no metadata event to map.
- **`input.harbor`** accepts both the studio's webcast WebSocket and the Icecast
  source protocol (BUTT, Mixxx) on the same mount, with `auth=harbor_auth` (:50)
  calling Laravel per connection attempt and **failing closed** on anything that
  is not a clean 200.

---

## Branch B — `autodj_mix`, the rotation

Priority 2, and the first three hops are aliases:

```liquidsoap
autodj_mix     = autodj_faded      # :258
autodj_faded   = autodj_leveled    # :255
autodj_leveled = amplify(1., autodj_rotation)   # :252
```

**`autodj_faded` and `autodj_mix` are plain renames in this render.** The
crossfade operator and the live-path limiter were both compiled out
(`LIQUIDSOAP_CROSSFADE_ENABLED=false`, `LIQUIDSOAP_LIMITER_INCLUDE_LIVE=false`).
The names survive so the graph below does not have to change shape when they come
back — but if you are tracing a level problem, note that two of these three lines
do nothing at all.

`amplify(1., …)` is a real no-op too, *until* a track arrives carrying a
`liq_amplify` annotation, at which point the per-track loudness correction
Laravel measured on upload takes over. It wraps both arms, so jingles get
levelled too.

```liquidsoap
autodj_rotation = fallback(track_sensitive=true, [jingle_arm, autodj])   # :249
```

### B1 — `jingle_arm`, priority 1 within the rotation

```liquidsoap
jingle_arm = source.available(delay(initial=true, jingle_delay, jingles), jingle_due)  # :244
```

Two gates, one graph, and the mode neutralises whichever gate it is not using —
that is what lets the mode itself be switched at runtime:

- `jingle_delay()` (:235) is the **time** gate — returns `0.0` in track mode, so
  it never blocks.
- `jingle_due()` (:239) is the **count** gate *and* the on/off switch — vacuously
  true in interval mode.

The counter behind it is maintained by two `synchronous=true` handlers on the
**leaf** sources (:232–:233), not on anything downstream, so it counts tracks
rather than fallback transitions.

All four knobs are `interactive.*` (:225–:228), settable over telnet, so changing
a jingle interval never restarts the container or drops a listener.

### B2 — `autodj`, priority 2 within the rotation

```liquidsoap
autodj = request.dynamic(id="playlist_m3u", retry_delay={10.0}, autodj_next)   # :199
```

The end of the line, and the one place the graph reaches out for content
on demand. `autodj_next` (:167) makes a blocking `http.get` to
`/api/internal/next-track` and returns **one** request — Laravel owns the running
order, because `playlist.reload` resets the cursor to index 0 and uploading a song
must not send every listener back to track one.

Blocking is fine here: `request.dynamic` resolves on its own asynchronous queue,
not on the streaming thread.

`null` is a normal answer (a live-only station has no library) and makes this
source unavailable — which is exactly what the fallback needs. Note the id is
still `playlist_m3u` so the telnet commands Laravel sends keep working; `skip` is
re-registered by hand at :206 because `request.dynamic` does not provide it.

---

## Branch C — `bed`

```liquidsoap
bed = mksafe(blank())   # :260
```

Infallible silence. It is what "the station is on but nothing is playing" sounds
like, and its readiness is what `current_source()` (:329) reports as `"silence"`.

---

## Things attached to the chain that never pull it

These read state; they are not in the audio path, and removing one changes no
samples:

| What | Line | Reads |
|---|---|---|
| `/status` | :343 | `output_source` + `ice_up` + `live` / `autodj_mix` readiness |
| `/healthz` | :385 | `output_source.is_ready()`, `ice_up` |
| now-playing push | :424 | `output_source.on_metadata` |
| connect events | :123 | `live_in.on_connect` / `on_disconnect` |
| Icecast events | :444 | `icecast_out` callbacks → `ice_up` |
| telnet | :7 | `jingles_m3u.reload`, `playlist_m3u.skip`, `var.set` |

`current_source()` (:329) deserves a note: it derives the answer from readiness
**in the same priority order `fallback` itself uses**, rather than asking the
fallback. That is deliberate — it cannot drift from what listeners hear, because
it is evaluating the same predicates.

---

## Why the file cannot actually be written in this order

Liquidsoap is lexically scoped and strictly ordered: a binding must exist before
it is referenced. `broadcast_out` cannot be written above `broadcast_source`, and
`output.icecast` cannot come first. The source file is bottom-up because the
*language* requires it, not because that is the clearest way to understand it.

You could contort around this by wrapping every stage in a `def` and composing at
the end — but the leaf sources and the refs (`ice_up`, `live_connected`,
`tracks_since_jingle`) still have to be ordered, and functions returning sources
risk instantiating them more than once. Not worth it. Read in this direction,
write in the other.
