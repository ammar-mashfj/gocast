# The rendered station script, line by line

A complete reading of a rendered `station.liq` — every top-level binding, every
`def`, how they connect, and what breaks if one is moved.

The worked example is `test.liq` at the repo root: the dev-mode render for the
station with slug `test`, 1,199 lines. Every line number in this document refers
to that file. Re-render it with the recipe in [§14](#14-re-rendering-and-verifying).

---

## Table of contents

1. [Where this file comes from](#1-where-this-file-comes-from)
2. [How to read a render: it is one of many](#2-how-to-read-a-render-it-is-one-of-many)
3. [The signal chain at a glance](#3-the-signal-chain-at-a-glance)
4. [The symbol table](#4-the-symbol-table)
5. [Walkthrough: process settings (1–50)](#5-walkthrough-process-settings-150)
6. [Walkthrough: reporting and auth (52–158)](#6-walkthrough-reporting-and-auth-52158)
7. [Walkthrough: the live input (160–392)](#7-walkthrough-the-live-input-160392)
8. [Walkthrough: AutoDJ and jingles (394–609)](#8-walkthrough-autodj-and-jingles-394609)
9. [Walkthrough: level, transition, mix (611–752)](#9-walkthrough-level-transition-mix-611752)
10. [Walkthrough: the display split and watermark (754–890)](#10-walkthrough-the-display-split-and-watermark-754890)
11. [Walkthrough: the control surface (892–1000)](#11-walkthrough-the-control-surface-8921000)
12. [Walkthrough: outputs (1002–1199)](#12-walkthrough-outputs-10021199)
13. [Cross-cutting: state, threads, wire](#13-cross-cutting-state-threads-wire)
14. [Re-rendering and verifying](#14-re-rendering-and-verifying)
15. [What is deliberately absent](#15-what-is-deliberately-absent)

---

## 1. Where this file comes from

Nobody writes this file. It is rendered per station, from a Blade template, by
PHP, onto the host disk, and then bind-mounted into a container as a read-only
file called `/station.liq`.

```
api/resources/views/liquidsoap/station.blade.php     the template (1,378 lines)
        │
        │  LiquidsoapSupervisor::renderLiqFile()      api/app/Services/LiquidsoapSupervisor.php:1126
        │  View::make('liquidsoap.station', [ ~45 variables ])->render()
        ▼
/var/gocast/liq/{slug}.liq                           the render (1,199 lines for `test`)
        │
        │  docker run … -v /var/gocast/liq/{slug}.liq:/station.liq:ro …
        │               -v /var/gocast/playlists/{slug}:/data/playlists:ro
        │               -v /var/gocast/hls/{slug}:/data/hls
        │               -v /var/gocast/system:/data/system:ro
        │               gocast/liquidsoap:latest /station.liq
        ▼
one container per station, Liquidsoap 2.4.5
```

Three consequences worth holding onto while reading:

- **The template is 179 lines longer than the render.** The difference is Blade
  directives and the branches this render did not take. Comments are *not* the
  difference — they survive rendering, which is why the file you are reading is
  two-thirds prose.
- **Nothing in the container is writable except `/data/hls`.** The script, the
  playlists and the watermark clips are all mounted `:ro`. A container cannot
  corrupt its own inputs.
- **Editing the file on the host does nothing until the container restarts.**
  The mount is of the file, and Liquidsoap parses it once at startup. This is
  why the runtime-settable knobs in [§8.4](#84-interactive-variables-515518) exist
  at all: they are the things that must change *without* a restart, because a
  restart drops every listener.

### What triggers a re-render, and what does not

All of them go through `StationObserver::updated()`, which is choosier than it
looks — it re-renders only for the columns the script actually embeds.

| Trigger | What happens | Listener impact |
| --- | --- | --- |
| A column the script embeds changes (`LIQ_RELEVANT_COLUMNS`) | re-render + container restart | brief drop |
| Slug changes | container recreated under the new name | brief drop |
| A jingle column changes, station running | `var.set` over telnet only, **no** re-render | none |
| Plan changes (watermark) | `var.set` over telnet | none |
| Anything changes while the station is **stopped** | nothing now; `up()` renders the current row at start | none |
| Track added / removed / reordered | `jingles_m3u.reload` over telnet, or nothing at all for rotation tracks | none |

The last row is the one that shaped the whole AutoDJ design — see
[§8.1](#81-autodj_next-411441-and-why-there-is-no-playlist).

---

## 2. How to read a render: it is one of many

Six `@if` blocks in the template mean a given render is one of several possible
shapes. **Before reasoning about a rendered file, check which branches it took** —
otherwise you will look for a limiter where this install does not put one.

The render in `test.liq` took these branches:

| Template flag | Config key | This render | What the other branch looks like |
| --- | --- | --- | --- |
| `$gcSpaceOverhead > 0` | `gc_space_overhead` = 80 | **on** — `runtime.gc.set` block at 47 | block omitted entirely; stock OCaml GC |
| `$blankMax > 0` | `blank_max_seconds` = 15 | **on** — `blank.strip` at 360, `blank.detect` at 372 | `live = live_raw`; a muted mic holds the stream forever |
| `$applyAmplify` | `apply_amplify` = true | **on** — `amplify(1., …)` at 642 | `autodj_leveled = autodj_rotation`; `liq_amplify` annotations inert |
| `$crossfadeEnabled` | `crossfade_enabled` = **false** | **off** — `autodj_faded = autodj_leveled` at 690 | ~90 lines: a `cross.smart` port with five level-comparison branches |
| `$limiterIncludeLive` | `limiter_include_live` = true | **bottom** — `limit()` at 884, below the watermark | `limit()` moves up to 717 on the AutoDJ arm; live audio unguarded |
| `$watermarkSupported` | `watermark_enabled` = true | **on** — clips + `smooth_add` at 868 | `broadcast_source = listener_source` |

Two of these deserve a note because the words are confusing:

**`watermarkSupported` vs `watermark_enabled` (the interactive var at 844).** The
first is install-wide and decides whether the machinery is *rendered at all*. The
second is per-station and decides whether it currently *fires* — and it is read
from the owner's **plan**, never from the station row. There is deliberately no
station column for it, so no API request can switch it off. In this render the
machinery is present and the initial state is `false`, i.e. a paid station on an
install that watermarks free ones.

**Crossfade is off by default** (`crossfade_enabled` defaults to `false`), and
the 60-line comment at 645–689 explains why: on Liquidsoap 2.4.0 every form of
`cross()` wedged AutoDJ at a track boundary, emitting one buffered frame forever
with nothing logged. Fixed upstream in 2.4.3 (savonet#4851) and the image is
pinned to 2.4.5, but the flag stayed as the rollback.

---

## 3. The signal chain at a glance

Audio flows down. Dotted arrows are taps that read the signal without carrying it.

```
  ┌─ INPUTS ─────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  live_in          input.harbor("test", port=8090, auth=harbor_auth)  │ 202
  │     │                 ▲                                              │
  │     │                 └── harbor_auth(login) → POST /harbor-auth     │ 119
  │     ▼                                                                │
  │  live_tagged      metadata.map(insert_missing=true, live_metadata)   │ 344
  │     │             └─ supplies title="Live Broadcast" when none sent  │
  │     ▼                                                                │
  │  live_raw         buffer(buffer=2., max=10.)                         │ 346
  │     │                                                                │
  │     ├╌╌╌╌╌╌╌╌►  silence_watch   blank.detect(15s, -40dB)             │ 372
  │     │            │ on_blank → notify("live_silent")                  │
  │     │            │ on_noise → notify("live_audio")      (tap only)   │
  │     ▼                                                                │
  │  live             blank.strip(max_blank=15., threshold=-40.)         │ 360
  │                   └─ goes UNAVAILABLE while silent → fallback demotes│
  │                                                                      │
  │  autodj           request.dynamic(id="playlist_m3u", autodj_next)    │ 443
  │     │                 ▲                                              │
  │     │                 └── autodj_next() → GET /next-track            │ 411
  │     │                                                                │
  │  jingles          playlist(id="jingles_m3u", "/data/playlists/…")    │ 484
  │     │                                                                │
  │  watermark        playlist(id="watermark", "/data/system")           │ 830
  └──────────────────────────────────────────────────────────────────────┘

  jingle_arm      = source.available(delay(initial=true, jingle_delay,      604
                                           jingles), jingle_due)
        │
  autodj_rotation = fallback(track_sensitive=TRUE, [jingle_arm, autodj])    609
        │            └─ TRUE: a due jingle waits for the track to end
        ▼
  autodj_leveled  = amplify(1., autodj_rotation)                            642
        │            └─ per-track liq_amplify; ABOVE cross on purpose
        ▼
  autodj_faded    = autodj_leveled            (cross() here when enabled)   690
        ▼
  autodj_mix      = autodj_faded              (limit() here when !include_live) 717
        │
        │   bed = mksafe(blank())                                           720
        ▼         │
  mixed = mksafe(fallback(track_sensitive=FALSE, [live, autodj_mix, bed]))  731
        │          └─ FALSE: a broadcaster going live interrupts instantly
        ▼
  output_source   = rms(duration=2.0, mixed)          ◄── THE TRUTH         752
        │  ╎╎╎
        │  ╎╎└╌╌► /status           reads .is_ready() .rms() .elapsed()     951
        │  ╎└╌╌╌► /healthz          reads .is_ready()                      1014
        │  └╌╌╌╌► .on_metadata(push_now_playing) → POST /now-playing       1083
        ▼
  listener_source = replay_jingle_metadata(output_source)  ◄── THE DISPLAY  793
        │            └─ replays the last real track's title over a jingle
        ▼
  broadcast_source= smooth_add(p=watermark_duck, normal=listener_source,    868
        │                      special=watermark_arm)
        ▼
  broadcast_out   = limit(threshold=-1.0, broadcast_source)                 884
        │
        ├──► output.icecast(%mp3(128k), mount="/stream/test")              1088
        └──► output.file.hls("/data/hls", 4s segments, [("aac", adts)])    1190
```

### The one structural idea

Everything above `output_source` answers *"what is this station playing?"*.
Everything below it answers *"what should a listener see and hear?"*. They are
not the same sentence, and the file splits at line 752 precisely so they can
disagree:

- A **jingle** is genuinely on air, so `/status` must say so — but the listener's
  player keeps the last real track title (`listener_source`).
- A **watermark** is platform audio, not the station's — so it reaches the
  encoders but never `/status` and never the now-playing push.

Get this backwards and you either lie to your own monitoring or ship
"Powered by GoCast" as a track title to every player on the network.

---

## 4. The symbol table

Every name bound at the top level, in the order the file binds them. `S` = source,
`R` = ref, `F` = function, `I` = interactive variable.

| Line | Name | Kind | Built from | Read by |
| --- | --- | --- | --- | --- |
| 63 | `ice_up` | R bool | — | `/status` 967, `/healthz` 1017, written by 1113/1118/1123 |
| 65 | `post_event` | F | — | `notify`, `notify_live_connected` |
| 78 | `notify` | F | `post_event` | 101, 102, 317, 377, 378, 1115, 1120, 1126 |
| 92 | `notify_live_connected` | F | `post_event` | 307 only |
| 119 | `harbor_auth` | F | — | `input.harbor(auth=…)` 205 |
| 202 | `live_in` | S fallible | harbor :8090 | `live_tagged`, `broadcaster_attached` |
| 237 | `live_connected` | R bool | — | `broadcaster_attached` 322 |
| 271 | `live_header` | F | — | `live_via`, on_connect 311 |
| 281 | `live_clip` | F | — | on_connect 311 |
| 289 | `live_via` | F | `live_header` | on_connect 312 |
| 321 | `broadcaster_attached` | F | `live_connected`, `live_in` | `/status` 971 |
| 336 | `live_metadata` | F | — | `metadata.map` 344 |
| 344 | `live_tagged` | S fallible | `live_in` | `live_raw` |
| 346 | `live_raw` | S fallible | `live_tagged` | `live`, `silence_watch` |
| 360 | `live` | S fallible | `live_raw` | `mixed` 731, `current_source` 925, `watermark_due` 854 |
| 372 | `silence_watch` | S fallible | `live_raw` | nothing — exists for its callbacks |
| 411 | `autodj_next` | F | — | `request.dynamic` 445 |
| 443 | `autodj` | S fallible | `autodj_next` | `autodj_rotation`, `.on_track` 536 |
| 484 | `jingles` | S fallible | `jingles.m3u` | `jingle_arm`, `.on_track` 537 |
| 515–518 | `jingles_enabled` `jingle_by_tracks` `jingle_interval` `jingle_every_tracks` | I | telnet | `jingle_due`, `jingle_delay` |
| 535 | `tracks_since_jingle` | R int | — | `jingle_due` 601 |
| 595 | `jingle_delay` | F | `jingle_by_tracks`, `jingle_interval` | `delay()` 605 |
| 599 | `jingle_due` | F | 3 interactive vars + counter | `source.available` 606 |
| 604 | `jingle_arm` | S fallible | `jingles` | `autodj_rotation` |
| 609 | `autodj_rotation` | S fallible | `jingle_arm`, `autodj` | `autodj_leveled` |
| 642 | `autodj_leveled` | S fallible | `autodj_rotation` | `autodj_faded` |
| 690 | `autodj_faded` | S fallible | `autodj_leveled` | `autodj_mix` |
| 717 | `autodj_mix` | S fallible | `autodj_faded` | `mixed` 731, `current_source` 927, `watermark_due` 854 |
| 720 | `bed` | S **infallible** | `blank()` | `mixed` 731 |
| 731 | `mixed` | S **infallible** | `live`, `autodj_mix`, `bed` | `output_source` |
| 752 | `output_source` | S infallible | `mixed` | `/status`, `/healthz`, `on_metadata`, `listener_source` |
| 778 | `replay_jingle_metadata` | F | — | 793 |
| 793 | `listener_source` | S infallible | `output_source` | `broadcast_source` |
| 830 | `watermark` | S fallible | `/data/system` | `watermark_arm` |
| 844–846 | `watermark_enabled` `watermark_interval` `watermark_duck` | I | telnet | `watermark_due`, `delay`, `smooth_add` |
| 853 | `watermark_due` | F | `live`, `autodj_mix` | `source.available` 862 |
| 860 | `watermark_arm` | S fallible | `watermark` | `smooth_add` 872 |
| 868 | `broadcast_source` | S infallible | `listener_source` + `watermark_arm` | `broadcast_out` |
| 884 | `broadcast_out` | S infallible | `broadcast_source` | both outputs |
| 910 | `internal_key_of` | F | — | `authorized` |
| 917 | `authorized` | F | `internal_key_of` | `/status` 952 |
| 924 | `current_source` | F | `live`, `autodj_mix` | `/status` 968, `/healthz` 1017 |
| 947 | `finite` | F | — | `/status` 978, 987 |
| 1051–1052 | `last_pushed_title` `last_pushed_artist` | R string | — | `push_now_playing` |
| 1054 | `push_now_playing` | F | the two refs | `on_metadata` 1083 |
| 1088 | `icecast_out` | output | `broadcast_out` | its own three callbacks |

**Reading the fallibility column.** Liquidsoap's type checker distinguishes
sources that may have nothing to play (*fallible*) from those that always do
(*infallible*), and output operators refuse fallible sources. Only two things in
this file create infallibility: `bed = mksafe(blank())` at 720, and the
`mksafe(…)` wrapper at 731. Everything upstream of 731 is fallible and is allowed
to be — that is how "nobody is broadcasting and the library is empty" is
expressed. The `mksafe` at 731 is needed even though `bed` is provably always
available, because `fallback()` is conservatively typed.

---

## 5. Walkthrough: process settings (1–50)

### 5.1 Logging (5–9)

```liquidsoap
settings.log.stdout.set(true)
settings.log.level.set(2)
```

`stdout` because the only log reader is `docker logs` — there is no log file in
the container and no volume to put one in. Level 2 is *warning*. Level 3 (*info*)
prints a line per RTSP retry, which on an idle station is one line every two
seconds for as long as it lives.

This single number is why several `log.severe(...)` calls appear in later
sections where `log.important` would read more naturally: **important is level 3
and would be invisible.** Every failure path in this file that an operator needs
to see is logged at severe for that reason — see 140, 148, 430, 434.

### 5.2 Telnet (14–16)

```liquidsoap
settings.server.telnet.set(true)
settings.server.telnet.bind_addr.set("0.0.0.0")
settings.server.telnet.port.set(1234)
```

The inbound control channel. `0.0.0.0` is safe only because of how the container
is networked — the port is published to `gocast-network`, not to the host — and
that is the *entire* access control on it. Anything that can reach this port can
skip tracks and set variables.

Laravel connects with `LiquidsoapSupervisor::telnet()` (`:576`), which opens a
plain TCP socket rather than using `docker exec`, because the API's Docker socket
access is read-mostly and `EXEC` is denied. The commands it sends are in
[§13.4](#134-inbound-telnet).

### 5.3 The garbage collector (18–50)

```liquidsoap
runtime.gc.set(runtime.gc.get().{
  space_overhead = 80,
  allocation_policy = 2
})
```

Rendered only when `LIQUIDSOAP_GC_SPACE_OVERHEAD > 0`; `=0` omits the block and
restores the stock collector, which is the rollback if a station starts burning
CPU.

- `space_overhead = 80` — the percentage of live heap the collector tolerates
  before working harder. OCaml's default is 120, i.e. a process may hold roughly
  twice its live data. 80 collects more often and holds less: **less memory, more
  CPU**, which is the right side of the trade when you are packing one container
  per station. AzuraCast ships the same knob as three presets (20 / 80 / 140);
  80 is their balanced one.
- `allocation_policy = 2` — best-fit. Fragments the major heap less under the
  steady churn of decoding one track after another. Fragmentation, not leaking,
  is what makes RSS drift upward on a long-lived station.

The comment records the incident that produced these numbers: the container
memory cap was `256m` and **SIGKILLed every station at boot** — exit 137, empty
`docker logs`, restart loop. It is now `512m` against a ~85 MB steady state.
`.{ … }` is record-update syntax: take the record `runtime.gc.get()` returns and
override two fields.

Note what is *not* here: `settings.init.compact_before_start`. The image already
defaults it to `true` (verified with `--list-settings` on 2.4.5), so setting it
again would only be a claim that we chose it.

---

## 6. Walkthrough: reporting and auth (52–158)

### 6.1 Why the container reports at all (52–63)

`docker run` returns when the container is **created**, not when audio flows. From
outside, a station that died parsing its script and one that is still building its
audio graph look identical for as long as anyone cares to poll. These events close
that gap.

They are explicitly a **fast path, not a source of truth**: a script that fails to
parse dies before any event can fire. Laravel therefore also verifies the
container after start and polls `/status`. The rule this encodes —
*losing an event must never strand a station* — is what `stations:reconcile` and
`stations:sweep` exist to enforce.

```liquidsoap
ice_up = ref(false)
```

A mutable box, initialised false. It is the container's own record of whether the
Icecast mount is connected, and it is the only piece of state in this file that
describes something *downstream* of the audio graph.

### 6.2 `post_event` / `notify` / `notify_live_connected` (65–99)

```liquidsoap
def post_event(body) =
  ignore(http.post(".../api/internal/station-event", data=body,
    headers=[…, ("X-Internal-Key", "dev-internal-key")], timeout=5.))
end
```

`ignore(...)` discards the response record — Liquidsoap warns on an unused value,
and there is nothing to do with the answer. The 5s timeout bounds the damage when
Laravel is slow; every callback that reaches this function is registered
`synchronous=false` so that timeout is paid on a task, not on the audio thread.

`notify(event)` wraps it for the nine events that carry nothing but their own name.
`notify_live_connected(~client, ~via)` exists **as a separate function rather than
as optional arguments** because Liquidsoap records are statically typed: one
function cannot sometimes emit `client`/`via` and sometimes not. The alternative —
empty strings on every boot and Icecast reconnect — would put two meaningless
fields in every payload for the sake of one event.

`~client` / `~via` are *labelled* arguments, called as `notify_live_connected(client=…, via=…)`.

```liquidsoap
on_start(fun () -> notify("boot"))
on_shutdown(fun () -> notify("shutdown"))
```

The bookends. `shutdown` is best-effort by nature: `docker stop` sends SIGTERM and
waits `stop_timeout_seconds` (5), so a wedged process never sends it.

The complete event vocabulary is in [§13.3](#133-outbound-http).

### 6.3 `harbor_auth` (104–158)

Called by harbor **once per connection attempt**, before the connection is
accepted. The `login` record carries `.user`, `.password` and `.address`.

```liquidsoap
def harbor_auth(login) =
  try
    response = http.post(".../api/internal/harbor-auth", data=json.stringify({…}))
    if response.status_code == 200 then true
    else log.severe("harbor: refused …") ; false end
  catch _ do
    log.severe("harbor: cannot reach the auth API …")
    false
  end
end
```

Three properties, each deliberate:

**It fails closed, twice.** Non-200 is a refusal, and so is an exception. A
network blip must not become an open door. The cost is that "Laravel is
unreachable" and "wrong password" are indistinguishable *from the broadcaster's
side* — which is exactly why both paths log, and log at severe.

**It blocks.** Harbor calls this on the connection thread, and one HTTP request
per connection attempt is cheap. There is no async variant that would be correct
here: the answer gates the connection.

**The password is not a password.** It is the short-lived, station-scoped token
Laravel minted for the studio (or the station's stream key, for an encoder).
Laravel verifies its MAC, expiry and station binding — this function only relays.

The dev-render URL `http://host.docker.internal:8000` is worth noting: in hybrid
mode Laravel runs natively on the host, and this is how a container reaches it.
Get that wrong and every connection attempt is refused with
*"the stream server closed the connection"* in the studio — see the
`artisan serve --host=0.0.0.0` trap.

---

## 7. Walkthrough: the live input (160–392)

### 7.1 `live_in` (202–210)

```liquidsoap
live_in = input.harbor("test", port=8090, auth=harbor_auth, timeout=10.0,
                       icy=true, icy_metadata_charset="UTF-8",
                       metadata_charset="UTF-8")
```

One operator, and every argument has a story.

`"test"` is the **mount name**, so the ingest URL a broadcaster uses ends in
`/test`. `port=8090` is inside the container; the router in front maps a
station-addressable port to it for external encoders.

**`timeout=10.0`, deliberately below Liquidsoap's default of 30.** A broadcaster
whose connection dies without a clean close — a sleeping laptop, a wifi handover —
is still holding this mount as far as harbor is concerned, and *every reconnect
attempt is refused until it expires*. That window is the single thing standing
between a dropped broadcast and a recovered one, which is why it is config
(`LIQUIDSOAP_HARBOR_INPUT_TIMEOUT`) and not a literal.

**`icy=true`** accepts the in-band metadata BUTT and Mixxx already push on every
song change. Without it those frames were parsed and thrown away, so a DJ running
a playlist showed listeners whatever AutoDJ track happened to be up when they
connected — forever. Both charset spellings are set because harbor uses
`icy_metadata_charset` for the Icecast source protocol and `metadata_charset` for
the webcast path, and source clients disagree about encoding; the wrong guess
turns every non-Latin title into mojibake.

This is **untrusted text on its way to listeners and to the database**, and it is
not sanitised here. `NowPlayingController` caps title and artist at 500 characters
and trims them. A station container is the wrong place to be the last line of
defence.

**What this replaced.** An `input.ffmpeg` RTSP pull from MediaMTX. WebRTC needed
ICE, and ICE needs UDP that a broadcaster's network may simply refuse — a VPN with
leak protection, a firewall blocking UDP, or symmetric NAT each produced a session
that negotiated successfully and then never carried a byte. A WebSocket reaches
anyone who can load the studio page.

### 7.2 `live_connected`, and why it is not just `is_ready()` (237)

```liquidsoap
live_connected = ref(false)
```

`live` (line 360) is wrapped in `blank.strip`, so a broadcaster who mutes their
mic is *demoted* — `current_source()` starts answering `"autodj"` while their
socket is wide open. Anything deciding whether to **stop** a station must be able
to tell *"nobody is here"* from *"here but quiet"*, because stopping the second is
yanking a live show off air.

So connection is tracked twice, and the reader ORs the two:

```liquidsoap
def broadcaster_attached() =          # 321
  live_connected() or live_in.is_ready()
end
```

The ref is driven by in-process callbacks that cannot be lost the way an HTTP
`notify()` can; `is_ready()` catches anything the ref missed. **The answer fails
safe: any evidence of a broadcaster reads as connected.** `/status` reports it as
`broadcaster`, and `StationStatusService::normalize()` maps a missing field to
`null` — *unknown, do not act* — rather than to `false`.

### 7.3 Reading headers without leaking a credential (243–303)

Both ways into harbor arrive with their request headers (harbor.ml:704 for the
Icecast source protocol, :836 for the webcast WebSocket). They are **the only way
to tell the browser studio from an external encoder**, because an encoder makes no
API call of its own — without this, every BUTT and Mixxx session is filed under
"Studio" on the station overview.

```
  Studio                            Encoder
  upgrade: websocket                user-agent: libshout/2.4.6
  sec-websocket-protocol: webcast   content-type: audio/mpeg
  a browser user-agent              ice-name, ice-public
```

That same list contains `authorization: Basic <base64 of source:streamkey>` — a
live, long-lived credential. Forwarding the header list wholesale would write it
into Laravel's request log and ship it to Sentry on the next validation error.
**Three labels are read by name, in the container, before anything crosses the
boundary. Never the list.**

```liquidsoap
def live_header(headers, label) =                                        # 271
  normalized = list.map(fun (h) -> (string.case(lower=true, fst(h)), snd(h)), headers)
  string.trim(list.assoc(default="", label, normalized))
end
```

**The case folding is required, not defensive.** Liquidsoap's `on_connect`
documentation says "all labels are lowercase". They are not — verified against the
2.4.5 image on 2026-09-15, where an Icecast source client's headers arrive spelled
exactly as sent (`Authorization=…`, `User-Agent=libshout/2.4.6`,
`Content-Type=audio/mpeg`, `ice-name=Raw Test`). So `list.assoc("user-agent", …)`
matches nothing and every encoder session reports an empty client. The webcast
path uses its own spelling. Normalising here is the only lookup that works on both.

`fst`/`snd` are pair accessors; `list.assoc(default=…, key, list)` is the lookup.

```liquidsoap
def live_clip(value) =                                                   # 281
  if string.length(value) > 255 then string.sub(value, start=0, length=255)
  else value end
end
```

The length check *is* the point: `string.sub()` returns `""` when the requested
substring does not exist, so asking for 255 characters of a 20-character
user-agent would throw the user-agent away.

```liquidsoap
def live_via(headers) =                                                  # 289
  upgrade = string.case(lower=true, live_header(headers, "upgrade"))
  ws_protocol = live_header(headers, "sec-websocket-protocol")
  if string.contains(substring="websocket", upgrade) or ws_protocol != ""
  then "browser" else "external" end
end
```

A WebSocket handshake always carries `Upgrade`; an Icecast source client never
does. So **anything without it is an encoder, including a client that sends no
headers at all** — the right default, since the studio always sends them. The
variable is named `ws_protocol` and not `protocol` because the latter shadows a
standard-library binding and Liquidsoap warns about it on every boot.

### 7.4 The connect/disconnect callbacks (305–319)

```liquidsoap
live_in.on_connect(synchronous=false, fun (headers) -> begin
  live_connected := true
  notify_live_connected(client=live_clip(live_header(headers, "user-agent")),
                        via=live_via(headers))
end)
live_in.on_disconnect(synchronous=false, fun () -> begin
  live_connected := false
  notify("live_disconnected")
end)
```

These are what open and close the `StreamSession` that makes a station read as
live — the replacement for MediaMTX's `runOnReady`/`runOnNotReady` hooks.

Two mechanical points. They are registered as **methods on the source**, not as
arguments to `input.harbor`: the argument form still works in 2.4 but logs a
deprecation on every boot and is slated for removal. And `synchronous=false` is
not optional — `notify()` makes an HTTP POST with a 5s timeout, and a synchronous
callback runs on the streaming thread, so a hanging API would stall the audio for
every listener.

`live_disconnected` is also, in practice, **the AutoDJ switch**: it is the event
that marks the moment listeners stopped hearing a human.

### 7.5 Supplying a title nobody sent (332–344)

```liquidsoap
def live_metadata(m) =
  if m == [] then [("title", "Live Broadcast")] else m end
end

live_tagged = metadata.map(insert_missing=true, live_metadata, live_in)
```

A broadcaster who sends no metadata — the studio page, and every source client
with its title field blank — used to leave the last AutoDJ track sitting in every
listener's player for the whole show. That is not cosmetic: it is the stream
actively asserting something false.

**`insert_missing=true` is what makes this fire.** `metadata.map` only runs on
metadata *events*, and a broadcaster who sends none never produces one; the flag
makes Liquidsoap synthesise the call at the start of a track that arrived without
any. A client that *does* send a title takes the `else` branch untouched, and a
title arriving later simply replaces this one.

### 7.6 `buffer` (346)

```liquidsoap
live_raw = buffer(buffer=2., max=10., live_tagged)
```

Decouples harbor's arrival timing from Liquidsoap's main clock, so a momentary
hiccup on the broadcaster's side does not underrun the output. 2s nominal, 10s
before samples are dropped.

### 7.7 The dead-air pair (348–378)

Two operators reading the same signal for two different purposes.

```liquidsoap
live = blank.strip(max_blank=15.0, threshold=-40.0, live_raw)             # 360
```

**`blank.strip` makes the source unavailable** after 15s below −40 dB, which is
exactly the signal `fallback` needs to demote to AutoDJ on its own. It re-promotes
as soon as audio returns. Without it, the fallback stays locked on `live` and every
listener hears nothing while AutoDJ sits idle behind it. The threshold is
deliberately forgiving — a dramatic pause or a quiet intro must never knock a real
broadcaster off air.

```liquidsoap
silence_watch = blank.detect(max_blank=15.0, threshold=-40.0, live_raw)   # 372
silence_watch.on_blank(synchronous=false, fun () -> notify("live_silent"))
silence_watch.on_noise(synchronous=false, fun () -> notify("live_audio"))
```

`blank.strip` demotes **silently** — the broadcaster whose mic is muted hears
AutoDJ take over with no idea why. `blank.detect` watches the same signal without
touching the audio, purely so we can tell them. It is the one source in this file
that nothing downstream consumes; it exists for its callbacks. In 2.4 these are
methods, not constructor arguments — the form the published docs show does not
compile.

---

## 8. Walkthrough: AutoDJ and jingles (394–609)

### 8.1 `autodj_next` (411–441), and why there is no playlist

This is the most consequential design decision in the file, and the comment above
it (380–410) is the argument.

The obvious shape is `playlist("playlist.m3u")`, and it *was*, until the reload it
requires was measured on 2.4.5: **after `playlist_m3u.reload` the list restarts at
index 0.** Laravel must send that reload after every track add/remove/reorder — so
uploading a song sent every listener back to song one, a few tracks later (the
prefetched requests drain first, which is why it looked random). Manual reload and
`reload_mode="watch"` behave identically. There is no cursor-preserving reload.

So the running order moved out of Liquidsoap:

```liquidsoap
def autodj_next() =
  try
    r = http.get(".../api/internal/next-track?slug=test",
                 headers=[("Accept", "text/plain"), ("X-Internal-Key", …)], timeout=5.)
    if r.status_code == 200 then
      uri = string.trim(string_of(r))
      if uri == "" then null else request.create(uri) end
    elsif r.status_code == 204 then
      null                                  # no rotation — expected, silent
    else
      log.severe("autodj: next-track answered HTTP #{r.status_code} — rotation stalled")
      null
    end
  catch _ do
    log.severe("autodj: cannot reach the next-track API … Is the API reachable?")
    null
  end
end
```

What this buys, beyond fixing the reset: **there is no list in here to reload.** A
track added mid-rotation is simply returned when the rotation reaches its position,
and the audio is never touched. It also makes the ordering a *query*, which is the
only form in which rotation rules, dayparting or ad breaks can ever be expressed.
AzuraCast and LibreTime both work this way.

**`null` is a normal answer, not an error.** It means "nothing to play" — the
common case for a live-only broadcaster with an empty library. It makes this source
unavailable and the fallback demotes to the silence bed, exactly as an empty m3u
used to. An unreachable API produces the *same audio outcome*, so the two are
distinguished in the log rather than in the graph: silence because there is nothing
to play is not a fault; silence because Laravel cannot be reached is.

**204 is silent on purpose.** Logging it would print a line every `retry_delay`
seconds for the life of every live-only station.

**Blocking HTTP is fine here** and would not be in a metadata handler:
`request.dynamic` resolves requests on its own asynchronous queue (the default,
`synchronous=false`), not on the streaming thread.

The returned string is a Liquidsoap `annotate:` URI built by
`PlaylistFileWriter::annotateTrack()` — see [§13.5](#135-the-annotation-contract).

### 8.2 `autodj` and the skip command (443–459)

```liquidsoap
autodj = request.dynamic(id = "playlist_m3u", retry_delay = { 10.0 }, autodj_next)
```

**`id = "playlist_m3u"` is a historical name kept on purpose.** It is
`PlaylistFileWriter::LIQ_SOURCE`, and it is what telnet commands are addressed to.
Renaming it would break `playlist_m3u.skip` — which is why the PHP constant is
passed into the template rather than the string being typed in both places.

`retry_delay = { 10.0 }` is a **getter** (the braces), re-read per retry, and it is
rendered rather than left at Liquidsoap's 0.1s default — which would mean ten
requests per second, forever, for every empty station.

```liquidsoap
autodj.register_command(description = "Skip the current AutoDJ track", "skip",
  fun (_) -> begin autodj.skip() ; "Done" end)
```

`playlist` registered a `.skip` telnet command for free; `request.dynamic` does
not — it offers `.flush_and_skip`, which also throws away the track already fetched
for the crossfade. `StationPowerController` sends `playlist_m3u.skip`, so the name
is registered here and pointed at the source's own `skip()`. Verified over telnet:
without this the command answers *"unknown command"* and skip-track silently does
nothing.

### 8.3 `jingles` (461–490)

```liquidsoap
jingles = playlist(id = "jingles_m3u", "/data/playlists/jingles.m3u",
  mode = "randomize", reload_mode = "never",
  on_fail = fun () -> begin
    log(level=2, "jingles: no playable jingle — rotation continues uninterrupted")
    ([] : [string])
  end)
```

The one m3u left in the graph. A jingle stays a list rather than joining the
rotation query because **it is not a rotation entry**: it must not take its turn in
order, must not be reordered by the user's drag handles, and must not be
crossfaded.

The reload defect that drove the rotation off a playlist file does not bite here.
`jingles_m3u.reload` also restarts at index 0, but the list is shuffled per read
and a jingle is a few seconds long — there is no cursor worth preserving.

`mode = "randomize"` shuffles within the list so a station with three IDs does not
cycle them in a fixed order. `reload_mode = "never"` leaves reloading to Laravel,
which fires `jingles_m3u.reload` over telnet after any change
(`PlaylistFileWriter::reload()`, and only when `jingles_enabled`).

`([] : [string])` is a type annotation — an empty list of strings — needed because
an empty literal is otherwise ambiguous.

**This block is rendered for every station, including the majority that never turn
jingles on.** Measured on 2.4.5: a station whose `jingles.m3u` is empty logs three
lines at boot and nothing ever again. `on_fail` does not fire, because nothing
pulls from a source the fallback never selects.

### 8.4 Interactive variables (515–518)

```liquidsoap
jingles_enabled    = interactive.bool("jingles_enabled", false)
jingle_by_tracks   = interactive.bool("jingle_by_tracks", false)
jingle_interval    = interactive.float("jingle_interval", 1800.0)
jingle_every_tracks= interactive.int("jingle_every_tracks", 5)
```

**Not literals, and that is the whole point.** Baked in as constants, changing
either setting would mean re-rendering the script and restarting the container,
which drops every listener mid-track. Nobody should lose their audience to change
how often a station ID plays.

As interactive variables they are settable over the same telnet socket that drives
playlist reloads:

```
var.set jingles_enabled = true
var.set jingle_interval = 900.0
```

`LiquidsoapSupervisor::applyJingleSettings()` (`:640`) sends exactly those four.
**The values rendered here are the initial state, read from the station row**, so a
container that boots or reboots is already correct without anyone pushing
anything — telnet is the fast path, the row is the source of truth.

Note that these are *getters*: `jingles_enabled()` with parentheses reads the
current value. Floats must carry a decimal point; `var.set` is typed, which is why
the PHP side formats them explicitly.

Verified on 2.4.5: a station booted with jingles off and a 600s interval, switched
on at 5s over telnet, played its next jingle at the following track boundary with
no restart and no gap.

### 8.5 The counter (522–537)

```liquidsoap
tracks_since_jingle = ref(0)
autodj.on_track(synchronous=true, fun (_) -> tracks_since_jingle := tracks_since_jingle() + 1)
jingles.on_track(synchronous=true, fun (_) -> tracks_since_jingle := 0)
```

Counted **always**, consulted only in track mode — so switching modes
mid-broadcast does not start from a stale number.

Registered on the **leaf** sources, not on anything downstream: a track mark on the
fallback would already have been through `cross()`, and we would be counting
transitions rather than tracks.

**`synchronous=true`, against the convention everywhere else in this file.** The
rule that makes the other callbacks asynchronous is that they do I/O. These two do
a single integer assignment, and they must be *ordered* with respect to the track
mark that triggered them: the fallback re-evaluates availability at that same
boundary, and a counter updated on a separate task can arrive after the decision it
was supposed to inform.

### 8.6 Jingle scheduling: one graph, two gates (539–609)

This is the subtlest mechanism in the file. There are two ways to space jingles and
the owner picks one per station:

| Mode | Means | Why someone wants it |
| --- | --- | --- |
| interval | "every 30 minutes" | predictable wall-clock spacing — what legal IDs and sponsor reads are specified in, independent of track length |
| track | "every 5 tracks" | even musical density — what the owner actually hears, at the cost of real-world spacing that swings with track length |

Rather than two graphs, there is **one graph with two gates, and the mode
neutralises whichever gate it is not using.** That is what keeps the mode itself
switchable at runtime; a graph that changed shape per mode could only change by
restarting the container.

```liquidsoap
def jingle_delay() =                                                      # 595
  if jingle_by_tracks() then 0.0 else jingle_interval() end
end

def jingle_due() =                                                        # 599
  jingles_enabled()
  and (not jingle_by_tracks() or tracks_since_jingle() >= jingle_every_tracks())
end

jingle_arm = source.available(                                            # 604
  delay(initial=true, jingle_delay, jingles),
  jingle_due
)
```

- **`delay()` is the TIME gate.** It holds a source unavailable for N seconds after
  each of its own end-of-tracks, reading N as a *getter per evaluation* — which is
  why lowering the interval takes effect on the wait already in progress rather
  than the one after it. In track mode N is `0.0`, so it never blocks.
- **`jingle_due()` is the COUNT gate, and also the on/off switch.** In interval
  mode the count half is vacuously true (`not jingle_by_tracks()` short-circuits),
  so `delay()` alone decides.
- **`initial=true`** so a station does not open with a jingle: the delay counts
  from boot, not from the first end-of-track. Track mode gets the same protection
  for free, since the counter starts at zero.

#### The `track_sensitive` bug worth knowing about

`source.available` here is deliberately **not** `track_sensitive`. That flag was
here once and it was a bug:

> `track_sensitive=true` defers evaluation of the **predicate** to an end-of-track
> of the source it wraps — which is the *jingle*, and the jingle is not playing
> while music runs. So the count was only re-read when a jingle ended, latching a
> stale `true` and firing a jingle after every single track, sometimes two back to
> back. Observed on a real station, with `jingle_due()` true at counter=1 against a
> threshold of 3.

The "only switch at a track boundary" guarantee comes from the fallback below,
which is where it belongs:

```liquidsoap
autodj_rotation = fallback(track_sensitive = true, [jingle_arm, autodj])  # 609
```

**That flag defers the SWITCH; the other one deferred the QUESTION.** A jingle
becoming ready mid-song changes nothing here; the switch happens when the song ends.
That is the difference between "a station ID every half hour" and "a station ID that
chops a song in half every half hour".

The only thing lost by evaluating the predicate continuously is that switching
jingles off *mid-jingle* now cuts it short rather than letting it finish — a fair
reading of "off".

Contrast [`mixed` at 731](#93-the-audio-brain-718731), which is deliberately
`track_sensitive=false`: a human going live **should** interrupt instantly rather
than wait out a five-minute track. The two flags are opposite because the two
questions are opposite.

Both arms are fallible, which is correct — an empty jingle list or an empty
rotation just falls through to the silence bed.

---

## 9. Walkthrough: level, transition, mix (611–752)

### 9.1 `amplify` (611–642)

```liquidsoap
autodj_leveled = amplify(1., autodj_rotation)
```

A station's library is other people's files: a mastered single sits at 0 dBFS, a
podcast export twenty decibels below it, and played back to back that is a listener
reaching for the volume knob between every track. Laravel measures each upload once
(EBU R128 integrated loudness and true peak) and annotates the gain that moves it
to the install's target. **This operator is what makes that annotation mean
anything.**

`amplify(1., s)` looks like a no-op and is one, until a track arrives carrying
`liq_amplify`. The `1.0` is the factor for everything else; the metadata key
overrides it per track. Three traps:

- **The annotation name is not ours to choose.** `settings.amplify.override` binds
  it; renaming the annotation silently stops it applying.
- **Values take a `dB` suffix.** Without it Liquidsoap reads a bare float as a
  *linear multiplier*, so `"-6"` would mean inverted phase at six times the volume
  rather than 6 dB down.
- **It is not a compressor and not `normalize()`.** One static gain per track,
  chosen before the track starts and unchanged while it plays, so nothing here can
  breathe or pump.

**Position matters twice.** It is *above* the crossfade because `cross()` decides
whether to overlap by comparing the `db_level` of outgoing and incoming tracks, so
it must see the levels a listener will actually hear — leveling afterwards would
have it reasoning about raw files and hard-cutting pairs that are, once corrected,
perfectly safe to fade. (This is also why an unlevelled library made that decision
so pessimistic.) And it wraps **both** arms, so jingles are levelled too: a station
ID recorded on a phone should not be the loudest thing on the station.

`LIQUIDSOAP_APPLY_AMPLIFY=false` removes the operator and the whole library plays at
its original levels, with any `liq_amplify` annotation inert.

### 9.2 `autodj_faded` and `autodj_mix`: two flag seams (644–717)

In this render both lines are pass-throughs:

```liquidsoap
autodj_faded = autodj_leveled     # 690  crossfade disabled
autodj_mix   = autodj_faded       # 717  limiter is at the bottom instead
```

**With `crossfade_enabled=true`**, line 690 becomes a ~90-line `cross.smart` port
from AzuraCast. The point of it is that it does *not* always overlap: it compares
the loudness of outgoing and incoming tracks and only fades when the result will
not turn to mush.

```liquidsoap
autodj_cross_duration = 5.0   # the cross WINDOW — audio buffered either side
autodj_cross_fade     = 3.0   # the envelopes drawn inside it; must be strictly shorter
autodj_cross_high     = -15.0
autodj_cross_medium   = -32.0
autodj_cross_margin   = 4.0

def autodj_cross(a, b) =
  if a.metadata["jingle"] == "true" or b.metadata["jingle"] == "true" then
    sequence([a.source, b.source])                          # never fade a jingle
  elsif  both quiet and close together        then  fade both ways
  elsif  incoming much louder                 then  fade the outgoing out under it
  elsif  outgoing much louder                 then  fade the incoming in under it
  elsif  outgoing already near silence        then  overlap without fading
  else   sequence([a.source, b.source])                     # hard cut — the honest answer
  end
end

autodj_faded = cross(duration=autodj_cross_duration, autodj_cross, autodj_leveled)
```

Details that are easy to get wrong there: `duration` must be strictly longer than
`fade` or the envelopes never complete and you hear abrupt volume changes (Book
§6.4) — Laravel clamps `crossfadeFade` below the window before rendering, which is
the `min(…)` at `LiquidsoapSupervisor:1214`. `add()` relays metadata from the
**first available** source only, so the incoming track is listed first, otherwise
`/status` announces the track that just finished for the whole overlap.
`normalize=false`, because `add()`'s own normalization divides by source count and
would duck every transition by 6 dB. And reading `a.metadata` is not just the
jingle check — `cross()` only exposes that field when the script references it, and
the type checker needs to see that happen.

**With `limiter_include_live=false`**, line 717 becomes
`autodj_mix = limit(threshold=-1.0, autodj_faded)` and the limiter at 884
disappears. That is the *previous* behaviour, kept as a rollback: it left live audio
reaching the encoders unguarded, which was a hole exactly the size of the problem
the limiter was there to solve.

### 9.3 The audio brain (718–731)

```liquidsoap
bed = mksafe(blank())                                                     # 720
mixed = mksafe(fallback(track_sensitive=false, [live, autodj_mix, bed]))   # 731
```

Priority is positional: **live > autodj > bed**. `track_sensitive=false` means a
broadcaster connecting mid-AutoDJ-track interrupts immediately rather than waiting
for the track to end — the opposite of the jingle fallback, for the reason given in
[§8.6](#the-track_sensitive-bug-worth-knowing-about).

The outer `mksafe` promises the type checker this chain is infallible, which
downstream output operators require. It is needed even though `bed` is provably
always available, because `fallback()` is conservatively typed as fallible.

**Nothing further processes the mix**, and source switches are hard cuts by design.
Fading between live and AutoDJ would mean fading live audio, which is the source
leak described in [§9.2](#92-autodj_faded-and-autodj_mix-two-flag-seams-644717). A
broadcaster dropping off air should cut to AutoDJ.

### 9.4 `rms` (733–752)

```liquidsoap
output_source = rms(duration=2.0, mixed)
```

This is what makes `/status` able to report whether the station is **actually
producing sound**, as opposed to which arm won the fallback. Those are different
questions: a rotation of undecodable files reports `source = "autodj"` and emits
nothing, and before this there was no way to tell from outside.

Two rules:

- **Inserted once, here, as a permanent operator.** `/status` then just reads the
  float it maintains. It must never be applied per request — that is exactly the
  mistake `playlist_length`/`up_next` made (see [§11.3](#113-status-9511012)).
- **`duration` is both the averaging window and the update interval.** Verified
  against the image rather than assumed: `rms()` reports `0.0` until the first
  window completes, then refreshes once per window. Keep it short enough that any
  reachable container has a real reading, and let the sweep's multi-minute silence
  timer — not this window — absorb inter-track gaps.

---

## 10. Walkthrough: the display split and watermark (754–890)

### 10.1 `replay_jingle_metadata` (754–793)

From here down the graph splits in two, and the split is the point. `output_source`
stays **the truth**; `listener_source` carries **what a player should display**.

```liquidsoap
def replay_jingle_metadata(s) =
  last_meta = ref(([] : [(string * string)]))

  def rewrite(m) =
    if m["jingle"] == "true" then last_meta()
    else last_meta := m ; m end
  end

  metadata.map(update=false, strip=true, rewrite, s)
end

listener_source = replay_jingle_metadata(output_source)
```

A closure: `last_meta` is created per call to `replay_jingle_metadata` and captured
by `rewrite`, so it is private state of this one operator rather than another
top-level ref.

The case that separates truth from display is the jingle. A station ID is genuinely
on air, so `/status` must say so — but swapping every listener's `StreamTitle` to
"GoCast FM Jingle" for eight seconds and back is worse than leaving the last real
track up. The now-playing push already declined to report jingles; **this closes the
other half, which the push could never reach**, because `output.icecast` derives its
in-stream ICY title from the source's own metadata rather than from anything we send
Laravel.

- `update=false` replaces metadata wholesale rather than merging, so the jingle's
  own title cannot survive underneath.
- `strip=true` handles the one case with nothing to replay — a jingle before any
  music has played, which `delay(initial=true)` already makes unreachable — by
  emitting no metadata rather than an empty title.

Verified on 2.4.5 with two annotated playlists and a listener on each stream:
through two jingles, the truth stream reported "Station ID" and the listener stream
held "Real Song" without a flicker.

### 10.2 The watermark clips (795–846)

```liquidsoap
watermark = playlist(id = "watermark", "/data/system", mode = "randomize",
  reload_mode = "never",
  on_fail = fun () -> begin
    log(level=2, "watermark: no clip in /data/system — station plays unmarked")
    ([] : [string])
  end)
```

**A directory, not a filename.** Liquidsoap plays whatever is in it, so several
variants rotate at random, and an *empty* directory simply makes this source
fallible. That last property is the important one: **a station must never fail to
start because the operator has not dropped a clip in yet.**

`/data/system` is the one mount that is not per-station — one directory, one copy on
disk, shared read-only by every container on the box. It is mounted
*unconditionally*, even when watermarking is off, so turning it back on is a
re-render rather than a container recreate. `ReloadWatermarkClips` sends
`watermark.reload` over telnet when an admin changes the library.

```liquidsoap
watermark_enabled  = interactive.bool("watermark_enabled", false)          # 844
watermark_interval = interactive.float("watermark_interval", 600.0)
watermark_duck     = interactive.float("watermark_duck", 0.150)
```

Interactive for the same reason the jingle settings are, plus a commercial one:
**an upgrade must silence this within seconds**, without restarting the container and
dropping the listeners the owner just paid to keep.
`LiquidsoapSupervisor::applyWatermarkSettings()` (`:707`) sends all three.

### 10.3 `watermark_due` and the arm (848–866)

```liquidsoap
def watermark_due() =
  watermark_enabled() and (live.is_ready() or autodj_mix.is_ready())
end

watermark_arm = source.available(
  delay(initial=true, watermark_interval, watermark),
  watermark_due
)
```

The readiness test skips the watermark when the station is on air but nobody is
broadcasting and there is no rotation — i.e. the silence bed. *"Powered by GoCast"*
alone into an otherwise silent stream reads as a fault rather than as branding. It
is deliberately **the same readiness test `current_source()` uses**, so the two
cannot disagree about whether anything is playing.

Not `track_sensitive`, for the jingle reason plus one of its own: a watermark rides
*on top* rather than replacing a track, so it has no boundary to wait for — and on a
live stream there are none anyway.

### 10.4 `smooth_add` (848–876), and why an operator is allowed on the live path

```liquidsoap
broadcast_source = smooth_add(duration = 1.0, p = watermark_duck,
                              normal = listener_source, special = watermark_arm)
```

`p` is **the portion of the station's own audio KEPT** during the watermark, not the
amount removed — `0.15` leaves the host at 15%. Liquidsoap's 0.2 default is tuned
for ducking music; speech under speech needs to go further down.

**Why it sits here, below the fallback, and not up with the jingles.** Free plans
have `autodj_enabled = false`, so a free station has no track library — its AutoDJ
arm is silence and everything a listener hears is a live broadcast. Applied to the
AutoDJ arm this would be inaudible, and applied anywhere above the live/AutoDJ
fallback it would be **evaded by the one action a free station can take: going
live.** So it sits after the fallback, where it catches everything.

That means putting an operator on the live path, which this file otherwise treats as
forbidden. The distinction is precise and worth internalising:

> **The rule is not "no operators on live". It is "no TRACK-BOUNDARY operators on
> live".** A live broadcast is one endless track. `cross()` re-triggered forever and
> stacked hundreds of gain ramps (*"clock.cross: there are currently 551 sources,
> possible source leak"*). `smooth_add` has no track logic at all — it reads a gain
> getter and sums. Same argument for `limit()` below.

Verified rather than argued: 42 seconds of an endless, mark-free carrier with the
watermark firing repeatedly produced no source leak, no latency catch-up, and a
carrier level of exactly −25.5 dB against a predicted 0.15 × −9.03 dB.

`output_source` is deliberately left pointing at the **un-watermarked** mix. `/status`
and the now-playing push both read it and should keep reporting what the *station* is
playing — a platform ID is not the station's now-playing, and routing it through here
would also risk the clip's own metadata overwriting a real track title.

### 10.5 `limit` (878–884)

```liquidsoap
broadcast_out = limit(threshold=-1.0, broadcast_source)
```

Overflow protection, not loudness shaping. Masters brick-walled to 0.0 dBFS leave
the MP3 encoder no headroom even without an overlap. The gain is static above
threshold, so unlike `normalize()` it cannot breathe.

Last thing before the encoders, and **deliberately below the watermark**: the clip is
platform audio mixed on top of a station whose level we do not control, so the sum is
the only signal whose peak is worth guarding. Below `listener_source` too, which
costs nothing — metadata passes through untouched — and keeps the ordering *"decide
what is playing, then decide how loud it may be"*.

---

## 11. Walkthrough: the control surface (892–1000)

### 11.1 Why serve instead of push (892–908)

Liquidsoap knows things Laravel can only infer: what is playing right now, how far
into it we are, which source won the fallback, and whether the graph is actually
producing sound. **Pushing all of that out and hoping the receiver was up is how
state desyncs; serving it lets Laravel pull the truth whenever it needs it** — and
"container unreachable" becomes an honest offline signal instead of a separate flag
to keep in sync.

Both endpoints are on harbor's HTTP server, port 8080 inside the container, reachable
only over `gocast-network` — the same exposure as telnet.

### 11.2 Auth helpers and `current_source` (910–949)

```liquidsoap
def internal_key_of(req) =                                                # 910
  lower = req.headers["x-internal-key"]
  if lower != "" then lower else req.headers["X-Internal-Key"] end
end

def authorized(req) = internal_key_of(req) == "dev-internal-key" end      # 917
```

Harbor lowercases incoming header names, but — as §7.3 established the hard way —
don't bet an auth check on that. `req` rather than `request` because Liquidsoap's
standard library already binds `request` at the top level and shadowing it warns on
every boot.

```liquidsoap
def current_source() =                                                    # 924
  if live.is_ready() then "live"
  elsif autodj_mix.is_ready() then "autodj"
  else "silence" end
end
```

Derived from readiness **in the same priority order `fallback()` itself uses**, so it
cannot drift from what listeners hear. Note it reads `live` (post-`blank.strip`), so a
muted broadcaster reports `"autodj"` — which is correct for "what is audible" and
wrong for "is anyone connected". That second question is `broadcaster_attached()`.

```liquidsoap
def finite(x) =                                                           # 947
  if float.is_nan(x) or float.is_infinite(x) then -1. else x end
end
```

**This one is load-bearing.** `response.json` raises on NaN and infinity — JSON can
represent neither — and a raised handler answers nothing at all, closing the socket.
That turns the most load-bearing endpoint we have into a dead one: Laravel reads the
failure as "container unreachable" and reports the station as `starting` forever while
the container is perfectly healthy.

And it is not a corner case: `remaining()` is infinite whenever the source has no
end — **every station playing the silence bed**, i.e. any station with an empty
playlist and an offline broadcaster.

`-1` rather than `null` because `StationStatusService::normalize()` already maps
negative durations to null, so this stays one convention for "unknown".

### 11.3 `/status` (951–1012)

```liquidsoap
harbor.http.register(port=8080, method="GET", "/status", fun (req, response) ->
  if not authorized(req) then
    response.status_code(403) ; response.data("forbidden")
  else
    m = output_source.last_metadata()
    meta = null.defined(m) ? null.get(m) : ([] : [(string * string)])
    response.json({ slug, ready, icecast, source, broadcaster, rms,
                    title, artist, elapsed, remaining })
  end)
```

`null.defined(m) ? … : …` is Liquidsoap's ternary on an optional value —
`last_metadata()` returns `null` before anything has played.

| Field | Source | The question it answers |
| --- | --- | --- |
| `ready` | `output_source.is_ready()` | is the audio graph producing frames? |
| `icecast` | `ice_up()` | can anyone actually hear it? |
| `source` | `current_source()` | which arm won — live / autodj / silence |
| `broadcaster` | `broadcaster_attached()` | is a client attached, **muted or not**? |
| `rms` | `output_source.rms()` | is sound *actually* leaving? ground truth |
| `title`/`artist` | `output_source.last_metadata()` | what is playing (jingles included) |
| `elapsed`/`remaining` | `finite(...)` | position in track; `-1` = unknown |

Three of these exist because they are *not* the same question as their neighbour:

- **`ready` vs `icecast`.** If Icecast rejects the source (bad password, Icecast
  down) the graph is perfectly ready and the mount does not exist. Reporting both is
  what lets Laravel tell *"on air"* from *"playing to nobody"*.
- **`broadcaster` vs `source == "live"`.** The latter goes false the moment
  `blank.strip` demotes a muted mic.
- **`rms` vs `source`.** `0.0` with no broadcaster and no rotation means the silence
  bed; `0.0` *with* a rotation means the rotation is broken.

#### The two fields that were removed

`playlist_length` and `up_next` deliberately do not appear. They used to call
`autodj.length()` / `remaining_files()` — methods on the very source `cross()` is
fast-forwarding. Book §6.4: that fast-forward *"is only possible when only one
operator is using the source, otherwise we will run into synchronization issues."*
This endpoint is polled every couple of seconds, so **it was a second operator on a
crossfaded source on every single poll.** Laravel serves both fields from its own
`tracks` table instead, where they are exact.

This is also why `autodj_faded` is bound to a *new* name rather than rebinding
`autodj`: `cross()` returns a plain source, dropping the playlist's methods, and the
status handler must not be able to reach them.

#### How Laravel turns this into a state

`StationStatusService::state()` (`:197`) reads it in this order — the order matters:

```
container not running                     → offline
no answer at all, container up            → starting
no answer at all, container down          → offline
ready == false                            → starting
icecast === false                         → degraded
source == "live"                          → live
otherwise                                 → on-air (AutoDJ)
```

`icecast` is checked *after* readiness, not instead of it, because the audio graph
really is fine — what failed is the hop to the listener, and saying "starting" would
send an operator looking in the wrong place. Containers predating the field report
`null`, which is read as "trust the old behaviour" rather than marking the whole
fleet degraded mid-rollout.

### 11.4 `/healthz` (1014–1020)

```liquidsoap
harbor.http.register(port=8080, method="GET", "/healthz", fun (_, response) ->
  begin
    if not output_source.is_ready() then response.status_code(503) end
    response.json({ ready = …, icecast = ice_up(), source = current_source() })
  end)
```

**Its status code is the contract, not its body**: 200 when the container is doing
its job, 503 when it is not. Docker's probe greps the status line — the image has no
curl, wget or nc, so it uses bash's `/dev/tcp` — and `stations:reconcile` treats an
unhealthy container as drift and recreates it.

It answers exactly one question: **is this container's audio graph working** —
because recreating the container is the only remedy on offer, and that is the only
failure a recreate can fix.

**The Icecast connection is deliberately not part of the verdict**, even though a
station that cannot reach Icecast is inaudible. If it were, an Icecast outage would
mark every station on the box unhealthy at once and the reconciler would recreate the
entire fleet — repeatedly, and to no effect, since restarting a station does not fix
Icecast. Liquidsoap already retries the connection itself, and the disconnection
surfaces through `/status` as `degraded` instead.

> **Health drives automation; degraded drives attention.**

Unauthenticated on purpose: it carries no station data, and a healthcheck that needs
a secret is a healthcheck that breaks when the secret rotates.

---

## 12. Walkthrough: outputs (1002–1199)

### 12.1 The now-playing push (1002–1083)

```liquidsoap
last_pushed_title  = ref("")
last_pushed_artist = ref("")

def push_now_playing(m) =
  if m["jingle"] == "true" then ()
  elsif m["title"] == last_pushed_title() and m["artist"] == last_pushed_artist() then ()
  else
    last_pushed_title := m["title"] ; last_pushed_artist := m["artist"]
    ignore(http.post(".../api/internal/now-playing", data=payload, timeout=5.))
  end
end

output_source.on_metadata(synchronous=false, push_now_playing)
```

Fires whenever metadata at the top of the chain changes — track advance, broadcaster
connecting or disconnecting. Laravel caches the payload in Redis and the listener API
surfaces it, so the player shows "now playing" without waiting for the in-stream ICY
frame. `()` is the unit value: do nothing.

**Two filters, for two different reasons.**

*Jingles are skipped.* A station ID is not "now playing" in the sense the player UI
means. Laravel caches the last payload, so no push means no change — which leaves the
last real track up. Note this callback reads `output_source`, **upstream** of
`listener_source`'s rewrite, so it still *sees* the jingle and still declines to
report it. The two mechanisms cover different halves: this one the API, the rewrite
the in-stream ICY title.

*Repeats are dropped.* Metadata events are not one per track — harbor re-sends a
broadcaster's title, and a source switch re-announces whatever is playing, so the
same title can arrive several times in a row. Laravel would write the identical Redis
value each time. Cheap to check, and it keeps the API's request log an honest record
of when the track actually changed.

`synchronous=false` for the usual reason: this does HTTP.

### 12.2 Icecast (1085–1129)

```liquidsoap
icecast_out = output.icecast(
  %mp3(bitrate=128, samplerate=44100),
  host = "host.docker.internal", port = 8888, password = "docker-dev",
  mount = "/stream/test", name = "test", description = "test", genre = "test",
  encoding = "UTF-8",
  broadcast_out)
```

**`encoding = "UTF-8"` is not cosmetic.** Without it Liquidsoap defaults to
ISO-8859-1 and silently rewrites every non-Latin character — Arabic, CJK, some
accented forms — to `*` before the metadata even leaves the server.

```liquidsoap
icecast_out.on_connect(synchronous=false, fun () -> begin
  ice_up := true ; notify("icecast_connected") end)
icecast_out.on_disconnect(synchronous=false, fun () -> begin
  ice_up := false ; notify("icecast_disconnected") end)
icecast_out.on_error(synchronous=false, fun (~restart_in, _) -> begin
  ice_up := false ; restart_in(5.) ; notify("icecast_error") end)
```

These three are **the only place that knows whether listeners can actually hear this
station.** `ice_up` feeds `/status` (so Laravel can distinguish ready from audible)
and `/healthz`.

**`on_error` must call `restart_in` or the output gives up permanently.** 5s is long
enough not to hammer a restarting Icecast, short enough that a blip costs listeners
seconds rather than minutes. That retry is also the reason `/healthz` can afford to
ignore Icecast entirely.

### 12.3 HLS (1131–1199)

```liquidsoap
output.file.hls("/data/hls",
  segment_duration = 4., segments = 5, segments_overhead = 5,
  persist_at = "/data/hls/state.json",
  playlist = "playlist.m3u8",
  [("aac", %ffmpeg(format="adts", %audio(codec="aac", b="128k")))],
  broadcast_out)
```

#### The published URL is `aac.m3u8`, not `playlist.m3u8`

Liquidsoap writes both, and the difference matters:

| File | Kind | Contents |
| --- | --- | --- |
| `playlist.m3u8` | master | `#EXT-X-STREAM-INF…` → `aac.m3u8` |
| `aac.m3u8` | media | the actual segment list |

A player handed the master fetches it once, resolves the variant URI relative to it,
and **drops any query string on the way** — so a master URL can never carry a
per-listener token through to the requests that follow. With exactly one rendition the
master buys nothing and costs that, so the published URL points straight at the media
playlist. The encoder label `"aac"` here and the filename in `StationResource` are
**the same config value** (`hls_variant`) for this reason; hard-coding either lets
them drift. Add a second rendition and the master becomes useful again — at which
point it must be generated with tokens already in its variant URIs.

#### `format="adts"` — a measured bandwidth decision

Raw AAC elementary segments, not mpegts. The AAC payload is 128k in every case, but
the container is not free. Measured in this image (44.1k stereo, 4s segments, bytes
actually written to disk):

| Container | Wire rate | Per listener-hour | |
| --- | --- | --- | --- |
| mpegts | 216 kbit/s | 92.6 MB | ← what this used to be |
| fMP4 | 169 kbit/s | 72.5 MB | |
| **adts** | **130 kbit/s** | **55.9 MB** | ← now |

mpegts pads everything into 188-byte packets and repeats PAT/PMT, costing 66% on top
of the audio at these bitrates. fMP4 looks like the modern answer, but Liquidsoap
flushes one fragment per AAC frame — 168 `moof` boxes in a 4s segment, ~21 KB of pure
box headers — and neither `frag_duration` nor dropping `+frag_custom` changes that;
all three variants measured byte-identical. adts has no container at all, so the wire
cost *is* the bitrate. The HLS spec has allowed elementary AAC for audio-only since
v3, and Liquidsoap still prepends the ID3 tag each segment needs, so in-band
now-playing metadata survives the change.

The cost: no CMAF, so low-latency HLS would need fMP4. Not a trade today — anyone who
needs low latency gets the Icecast mount.

#### The other three parameters

- **`segment_duration = 4.`** rather than 2s halves the request rate (a listener polls
  the manifest and pulls a segment per boundary), which matters once a CDN is in front
  and we are billed per request as well as per byte. Costs a few seconds of startup
  latency, which HLS listeners already accept.
- **`persist_at`** lets a restart resume the existing stream instead of starting a
  fresh one. Station edits re-render and restart the container, and without this every
  restart resets the media sequence — an HLS client mid-stream sees a discontinuity
  and usually stalls or reloads. Liquidsoap writes segment state here on shutdown and
  reads it on boot. **It is also the only file in the container the script writes**,
  which is why `/data/hls` is the only read-write mount.
- **`segments_overhead = 5`** keeps segments past the playlist window so a client that
  fell behind finds what it asks for instead of a 404.

nginx serves `/var/gocast/hls/{slug}/` (mounted here at `/data/hls`) from the stream
vhost — `infra/native/nginx/gocast-stream.conf`, which splits manifests (no-cache)
from segments (immutable) because they want opposite caching.

---

## 13. Cross-cutting: state, threads, wire

### 13.1 All mutable state

Five boxes. That is the entire mutable state of a station container, and it is worth
knowing them all, because every "why does it report X" question ends at one of them.

| Ref | Line | Written by | Read by | Survives restart? |
| --- | --- | --- | --- | --- |
| `ice_up` | 63 | Icecast `on_connect` / `on_disconnect` / `on_error` (1113, 1118, 1123) | `/status`, `/healthz` | no — starts `false` |
| `live_connected` | 237 | harbor `on_connect` / `on_disconnect` (306, 316) | `broadcaster_attached()` | no |
| `tracks_since_jingle` | 535 | `autodj.on_track` (+1), `jingles.on_track` (=0) | `jingle_due()` | no — starts at 0, which is also the "no jingle yet" protection |
| `last_meta` | 779 | `rewrite` inside `replay_jingle_metadata` | itself, on the next jingle | no (closure) |
| `last_pushed_title` / `last_pushed_artist` | 1051–1052 | `push_now_playing` | itself, to dedupe | no — so the first metadata after a restart always pushes |

Plus seven **interactive variables** (515–518, 844–846), which are also mutable but
are written from *outside* over telnet rather than by the script.

Nothing here is persisted. A container restart resets all of it, which is exactly why
the rendered file carries initial values read from the station row, and why
`stations:reconcile` re-pushes settings and closes stranded sessions.

### 13.2 The threading rule

| Callback | Line | `synchronous` | Why |
| --- | --- | --- | --- |
| `harbor_auth` | 205 | n/a — blocking by contract | the answer gates the connection; one request per attempt is cheap |
| `live_in.on_connect` / `on_disconnect` | 305, 315 | **false** | does HTTP |
| `silence_watch.on_blank` / `on_noise` | 377, 378 | **false** | does HTTP |
| `autodj.on_track` / `jingles.on_track` | 536, 537 | **true** | one integer assignment, and must be *ordered* before the fallback re-evaluates at that same boundary |
| `output_source.on_metadata` | 1083 | **false** | does HTTP |
| `icecast_out.on_connect` / `on_disconnect` / `on_error` | 1113–1123 | **false** | does HTTP |
| `autodj_next` | 443 | resolved on `request.dynamic`'s own queue | blocking HTTP is safe there, unlike in a metadata handler |
| `harbor.http` handlers | 951, 1014 | harbor thread | must not call methods on a crossfaded source — see §11.3 |

> **The rule: if it does I/O, it runs on a task (`synchronous=false`). If it must be
> ordered against a track boundary, it runs synchronously and must do no I/O.** The
> two `on_track` handlers are the only things in this file that take the second branch,
> and they are three tokens long each for exactly that reason.

### 13.3 Outbound HTTP

Four endpoints, one shared secret (`X-Internal-Key`, matched against
`INTERNAL_API_KEY`), one timeout (5s), all behind the `internal` middleware and
`throttle:internal` in `api/routes/api.php:252`.

| Endpoint | Method | Called from | When | On failure |
| --- | --- | --- | --- | --- |
| `/api/internal/harbor-auth` | POST | `harbor_auth` 119 | every connection attempt | **fail closed** + `log.severe` |
| `/api/internal/next-track?slug=` | GET | `autodj_next` 411 | whenever the rotation needs a track | `null` → source unavailable → silence bed; `log.severe` unless 204 |
| `/api/internal/now-playing` | POST | `push_now_playing` 1054 | distinct, non-jingle metadata change | ignored — Laravel keeps the stale Redis value |
| `/api/internal/station-event` | POST | `post_event` 65 | the nine events below | ignored — reconcile/sweep are the backstop |

The nine events:

| Event | Line | Meaning |
| --- | --- | --- |
| `boot` | 101 | script parsed and started — the only positive proof of a working render |
| `shutdown` | 102 | clean SIGTERM; absent on a wedge or SIGKILL |
| `live_connected` | 307 | broadcaster accepted — **carries `client` and `via`** |
| `live_disconnected` | 317 | socket closed; in practice *this is the AutoDJ switch* |
| `live_silent` | 377 | 15s under −40 dB — the broadcaster is demoted but still attached |
| `live_audio` | 378 | audio returned |
| `icecast_connected` | 1115 | listeners can hear this station |
| `icecast_disconnected` | 1120 | mount lost — `/status` will report `degraded` |
| `icecast_error` | 1126 | connection failed; retrying in 5s |

These land in `station_events` via `StationEventController`. **They are admin
monitoring only** — never branch product logic on them, and note that `record()`
swallows its own failures.

### 13.4 Inbound: telnet

Port 1234, reached by `LiquidsoapSupervisor::telnet()` over a plain TCP socket.

| Command | Sent by | Effect |
| --- | --- | --- |
| `playlist_m3u.skip` | `StationPowerController:94` | skip the current AutoDJ track (registered by hand at 455) |
| `jingles_m3u.reload` | `PlaylistFileWriter:210`, only when `jingles_enabled` | re-read `jingles.m3u` |
| `watermark.reload` | `ReloadWatermarkClips:49` | re-read `/data/system` |
| `var.set jingles_enabled = …`<br>`var.set jingle_by_tracks = …`<br>`var.set jingle_interval = …`<br>`var.set jingle_every_tracks = …` | `applyJingleSettings():640` | change jingle behaviour with no restart |
| `var.set watermark_enabled = …`<br>`var.set watermark_interval = …`<br>`var.set watermark_duck = …` | `applyWatermarkSettings():707` | plan change takes effect in seconds |

Every source `id` and variable name in that table is a **PHP constant passed into the
template** (`PlaylistFileWriter::LIQ_SOURCE`, `::JINGLES_LIQ_SOURCE`,
`LiquidsoapSupervisor::VAR_*`), precisely so the command and the thing it addresses
cannot drift apart. If you rename one, rename the constant.

`var.set` is typed: floats must carry a decimal point, which is why the PHP side
formats them with `number_format(...)` rather than interpolating a raw value.

### 13.5 The annotation contract

The rotation and the jingle list both arrive as Liquidsoap `annotate:` URIs, built by
`PlaylistFileWriter::annotateUri()`:

```
annotate:jingle="true",liq_amplify="-3.2dB",liq_cue_in="0.4",duration="184.740",title="КАМИН",artist="EMIN":/data/playlists/abc.mp3
```

| Key | Read by | Notes |
| --- | --- | --- |
| `jingle` | **this script** — `jingle_due` bookkeeping, `replay_jingle_metadata` 782, `push_now_playing` 1055, and the crossfade's first branch | ours; the one annotation with no display meaning |
| `liq_amplify` | **Liquidsoap** — `amplify()` 642 via `settings.amplify.override` | must carry a `dB` suffix |
| `liq_cue_in` / `liq_cue_out` | **Liquidsoap** — the cue-point machinery | trims measured silence off the head and tail |
| `duration` | Liquidsoap | lets `remaining()` be right before the decoder knows |
| `title` / `artist` | display, and `/status` | escaped by `escapeAnnotateValue()` |

The three `liq_*` keys are **not ours** — they are Liquidsoap's own, and renaming them
makes them silently inert. That is the same trap as the `liq_amplify` note in §9.1, and
it is worth stating twice because nothing errors when you get it wrong.

### 13.6 Failure matrix

| What breaks | Container | `/status` | Laravel state | Listener hears |
| --- | --- | --- | --- | --- |
| Script fails to parse | exits immediately, restart loop | unreachable | `offline` (container down) | nothing; mount gone |
| Laravel unreachable | healthy | reachable, `rms` may be 0 | `on-air` — **looks fine** | silence bed; no broadcaster can connect |
| Library empty, nobody live | healthy | `source: "silence"`, `rms: 0.0` | `on-air` | silence bed |
| Rotation files undecodable | healthy | `source: "autodj"`, `rms: 0.0` | `on-air` | silence — **`rms` is the only tell** |
| Broadcaster mutes mic | healthy | `source: "autodj"`, `broadcaster: true` | `on-air` | AutoDJ; `live_silent` event fires |
| Broadcaster's laptop sleeps | healthy | `broadcaster: true` for up to 10s | `live` then `on-air` | AutoDJ after the harbor timeout |
| Icecast down | healthy, **`/healthz` still 200** | `icecast: false` | `degraded` | Icecast listeners silent; HLS unaffected |
| Audio graph not ready | `/healthz` 503 | `ready: false` | `starting` | nothing |
| Container SIGKILLed (memory) | exit 137, **empty logs** | unreachable | `offline` | nothing |
| `cross()` wedge (pre-2.4.3) | healthy, **nothing logged** | `elapsed` climbs past duration | `on-air` | a static buzz |

The two rows worth committing to memory are the ones where **everything looks healthy
and the station is silent**: an unreachable API, and a rotation of undecodable files.
`rms` exists for the second. For the first, check the API URL baked into the render
against where Laravel is actually listening.

---

## 14. Re-rendering and verifying

### Render a fresh copy of any station's script

```bash
cd api
php artisan tinker --execute='
config(["liquidsoap.liq_dir" => "/tmp/liq-out"]);
$sup = new App\Services\LiquidsoapSupervisor();
$s = App\Models\Station::where("slug","test")->firstOrFail();
$m = new ReflectionMethod($sup, "renderLiqFile"); $m->setAccessible(true);
$m->invoke($sup, $s);
'
```

Overriding `liquidsoap.liq_dir` first is what keeps this out of the live directory;
without it you overwrite the running station's script (harmless until the next restart,
but not what you want while experimenting).

### Diff two configurations

```bash
LIQUIDSOAP_CROSSFADE_ENABLED=true php artisan tinker --execute='…'   # render to /tmp/a
diff /tmp/a/test.liq test.liq
```

That is the quickest way to see exactly what a flag from [§2](#2-how-to-read-a-render-it-is-one-of-many) changes.

### Verify a live container

```bash
docker ps --filter name=gocast-station                     # is it up
docker logs --tail 50 gocast-station-test                  # boot errors, log.severe lines
docker exec gocast-station-test cat /station.liq | head     # what is ACTUALLY mounted

# the control surface, from a container on gocast-network
curl -s -H "X-Internal-Key: $INTERNAL_API_KEY" http://gocast-station-test:8080/status | jq
curl -s -o /dev/null -w '%{http_code}\n' http://gocast-station-test:8080/healthz

# telnet, by hand
printf 'var.list\nquit\n' | nc gocast-station-test 1234
printf 'playlist_m3u.skip\nquit\n' | nc gocast-station-test 1234
```

`var.list` is the fastest way to confirm whether a `var.set` actually landed — if the
interactive variables still hold their rendered initial values, the telnet push failed
silently (which it is designed to do; the row remains the source of truth).

### The detection tricks recorded in the file

- **A `cross()` wedge logs nothing.** `End_of_file` should appear once per track, and
  `elapsed + remaining` from `/status` should equal the track duration. If EOF goes
  quiet while `elapsed` keeps climbing, it is wedged. Do **not** use `request.all`
  returning two rids as the tell — the playlist legitimately prefetches, so two rids is
  normal on a healthy station.
- **A source leak announces itself**: *"clock.cross: there are currently 551 sources,
  possible source leak"*, usually followed by *"Latency is too high: we must catchup
  1.22 seconds"*.
- **An empty `docker logs` plus exit 137** is the memory cap, not a script problem.

---

## 15. What is deliberately absent

Reading this file, the things that are *not* in it carry as much information as the
things that are. Each of these was tried, or considered and rejected, with a reason
recorded in the comments.

| Absent | Why |
| --- | --- |
| `normalize()` | a dynamic AGC that pumps quiet audio up and crushes loud audio down — the classic breathing artifact, worst on voice with natural pauses. If cross-track leveling is ever needed, a tasteful LUFS limiter replaces it, not the raw operator. |
| `playlist()` for the rotation | `reload` restarts the list at index 0, so every track upload sent listeners back to song one. See §8.1. |
| `playlist_length` / `up_next` in `/status` | they were a second operator on a crossfaded source, on every poll. Laravel serves them from its own table. See §11.3. |
| `cross()` anywhere near the live path | a live broadcast is one endless track; `cross()` re-triggered forever and stacked hundreds of gain ramps. §10.4 states the precise rule. |
| `track_sensitive=true` on the jingle predicate | it deferred the *question*, not the switch, latching a stale `true` and firing a jingle after every track. §8.6. |
| Icecast health in `/healthz` | an Icecast outage would have the reconciler recreate the entire fleet, repeatedly, to no effect. §11.4. |
| The header list in `live_connected` events | it contains `authorization: Basic …`. Three labels are read by name instead. §7.3. |
| Metadata sanitisation | Laravel does it. A station container is the wrong place to be the last line of defence. §7.1. |
| `settings.init.compact_before_start` | the image already defaults it true; setting it again would only be a claim that we chose it. §5.3. |
| A master `playlist.m3u8` in the published URL | players drop the query string when resolving the variant, so a token cannot survive the hop. §12.3. |
| `%ffmpeg` mpegts / fMP4 | measured: 92.6 and 72.5 MB per listener-hour against adts's 55.9. §12.3. |

---

## Appendix: related reading

| Topic | Where |
| --- | --- |
| The template itself | `api/resources/views/liquidsoap/station.blade.php` |
| Render call and its ~45 variables | `api/app/Services/LiquidsoapSupervisor.php:1126` |
| Every knob, with its own commentary | `api/config/liquidsoap.php` |
| `annotate:` URI construction | `api/app/Services/PlaylistFileWriter.php:248` |
| `/status` → four-state model | `api/app/Services/StationStatusService.php:197` |
| One track per request | `api/app/Http/Controllers/NextTrackController.php` |
| Broadcaster auth | `api/app/Http/Controllers/HarborAuthController.php` |
| Event ingestion | `api/app/Http/Controllers/StationEventController.php` |
| Drift repair | `api/app/Console/Commands/ReconcileStations.php`, `SweepStations.php` |
| HLS vhost, cache split | `infra/native/nginx/gocast-stream.conf` |
| Encoder ingest routing | `docs/ENCODER-INGEST-PLAN.md` |
