# AutoDJ crossfade: why it froze, and what makes it safe

Investigation and test results from 2026-10-10. No code was changed. This is
the evidence for the decision on whether to turn `LIQUIDSOAP_CROSSFADE_ENABLED`
back on.

## Summary

Crossfade was switched off in 96143b9 because AutoDJ froze: one buffered frame
played on a loop (heard as a buzz), `elapsed()` climbed past the track length,
`remaining()` stopped moving, and nothing was logged.

The cause is in **our station script**, not in crossfade itself. `/status`,
`/healthz` and `current_source()` call `remaining()` and `is_ready()` on
sources at or after the `cross()` operator. Those calls come in on the
harbor HTTP thread while audio is produced on the clock thread, and on 2.4.x
that race freezes `cross()`.

On Liquidsoap **2.4.6**, with those values cached on the clock thread, crossfade
ran through every scenario below with **no crash and no freeze**.

## Recommendation

1. **Upgrade the image from 2.4.5 to 2.4.6.** On 2.4.5 the title goes blank for
   most of every crossfaded song. 2.4.6 fixes that (savonet #5360, #5379). Our
   script runs on 2.4.6 unchanged.
2. **Cache source state in the station script.** Copy `is_ready`, `remaining`,
   `elapsed` and live/AutoDJ readiness on the clock thread, and have `/status`,
   `/healthz` and `current_source()` read the copies:

   ```liquidsoap
   # after: output_source = rms(duration=2.0, mixed)
   st_ready = ref(false)
   st_live = ref(false)
   st_autodj = ref(false)
   st_elapsed = ref(0.)
   st_remaining = ref(-1.)
   output_source.on_frame(synchronous=true, before=false, fun () -> begin
     st_ready := output_source.is_ready()
     st_live := live.is_ready()
     st_autodj := autodj_mix.is_ready()
     st_elapsed := output_source.elapsed()
     st_remaining := output_source.remaining()
   end)
   ```

   It's a callback on the existing audio thread, about 25 times a second, not a
   new thread. Measured cost: about 0.1% CPU and no measurable RAM.
3. **Set `LIQUIDSOAP_CROSSFADE_ENABLED=true`** and recreate the station
   containers.
4. **Correct the "fixed in 2.4.3" comments** in `station.blade.php`,
   `infra/liquidsoap/Dockerfile`, `station-hardening-plan.md` and
   `docs/features/liquidsoap-station-script.md`. savonet #4851 was not our bug.
   96143b9 itself says the 2.4.5 upgrade did not fix the freeze.

Rule to keep afterwards: nothing outside the clock thread (harbor handlers,
`thread.run`, telnet commands) may call methods on a source at or after
`cross()`.

**Before production:** run one real dev station (real Laravel, real uploads)
for a day with crossfade on, and watch `/status` and the Liquidsoap logs.
Upstream reports describe freezes "a few times an hour", and none of the tests
below ran longer than 60 minutes.

## How the cause was found

### Ruled out

- **Liquidsoap version alone.** 2.4.6 (released 2026-10-09) still froze with the
  current script.
- **Harbor HTTP traffic in general.** A minimal script (`request.dynamic` →
  `amplify` → `cross()` → output) with HTTP polled every 2s never froze. An
  early run where a constant-response `/status` "froze" was the harness's own
  fault: its logger called `current_source()` from a thread.
- **Deep seeks.** An early harness started songs 140s in (`liq_cue_in`). Whole
  25s clips with no seek froze the same way.
- **Autocue** (`enable_autocue_metadata()` or Moonbase59's external version).
  It only calculates cue and fade points, which `TrackAnalyzer` already does.
  It doesn't touch `cross()`.

### Isolated

On the minimal script, one call added at a time, from another thread:

| Called from another thread | Froze |
|---|---|
| nothing (HTTP polling only) | 0 of 9 |
| `elapsed()` on the crossfaded source | 0 of 3 |
| `remaining()` on `request.dynamic` (before `cross()`) | 0 of 3 |
| **`remaining()` on the crossfaded source** | **4 of 4** |
| **`is_ready()` on the crossfaded source**, every 0.25s | **3 of 3** |

Our script makes both freezing calls: `/status` (`output_source.remaining()`,
`is_ready()`), `/healthz` (`is_ready()`) and `current_source()`
(`autodj_mix.is_ready()`). The dashboard polls `/status` every ~2s and the
Docker healthcheck hits `/healthz` every 15s.

### Why AzuraCast doesn't freeze

AzuraCast ships the same 2.4.5 (`util/docker/stations/setup/liquidsoap.sh`),
has crossfade on by default (2s fade, 3s window), uses the same `cross.smart`
our transition was ported from, and serves an HTTP API from harbor. It never
calls `remaining()` on its crossfaded output. Its only `is_ready()` calls are
on the source before the crossfade (during startup) and on the live input.

### Related upstream reports

- savonet/liquidsoap #5227, "2.4.4 hangs under certain conditions when
  crossfade is used" (open). Reporters say 2.5/main doesn't hang, possibly via
  PR #5267 (child clock refactor), which won't be backported to 2.4.
- Discussion #5252: the same symptoms on 2.4.5 with `request.dynamic` +
  `cross()`. Unanswered.
- These may be the same race triggered by other callers. We don't need 2.5:
  avoiding the off-thread calls is enough.

## Titles after a crossfade

| Transition | 2.4.5 | 2.4.6 |
|---|---|---|
| Crossfaded song (fade or overlap) | correct for a few seconds, then blank for the rest of the song | correct throughout |
| Hard cut or jingle | ~5s blank (old song's tail), then the new title | same ~5s blank |

- `initial_metadata=` on the fades (AzuraCast's approach) was tested on every
  branch and changes nothing on either version.
- On 2.4.6 with real-length songs, `/status` showed a blank title in 1.3% of
  AutoDJ samples. Now-playing pushes to Laravel were never blank in any run.
- If the 5s blank matters, hide it by not reporting blank titles in `/status`
  and now-playing. Untested.

## Final test matrix (2.4.6 + cache, crossfade on)

The full rendered script for a local station, with real outputs: MP3 to a
throwaway Icecast server and HLS (AAC) to disk. Fake next-track API, real
library audio. `/status` was polled every 2s and `/healthz` every 1–2s in every
run. A checker judged each run:

- **Crash:** Liquidsoap exited before the planned stop, a non-zero exit code, or
  a fatal or uncaught exception, assertion or `Source.Unavailable`.
- **Freeze:** `/status` `remaining` stuck while `elapsed` climbs, or no next
  track fetched while AutoDJ is on air.

| Scenario | Length | Result |
|---|---|---|
| Soak: 25s clips + jingle every 5th track | 60 min | ✅ 154 transitions |
| Soak: clips, no jingles, `/healthz` every 1s | 60 min | ✅ 168 transitions |
| Soak: full-length songs with real cue points | 60 min | ✅ 37 songs, to the end |
| Live broadcaster: 8 sessions, 3s to 2 min | 20 min | ✅ AutoDJ resumed every time |
| 41 telnet skips: back-to-back, bursts of 5, during a live set | 20 min | ✅ |
| On-time cuts (`liq_cue_out` + `liq_fade_out`), clips | 20 min | ✅ 33 cuts |
| On-time cuts, full-length songs | 30 min | ✅ |
| 2s tracks (shorter than the 5s window) + back-to-back jingles | 20 min | ✅ |
| API returning 500 (4 outages) + empty library (2 windows) | 20 min | ✅ resumed within 1s each time |
| Boot with an empty library, then music, then a live set | 10 min | ✅ |
| Everything combined | 30 min | ✅ |
| **Control: 2.4.6 without the cache** | 10 min | ❌ froze at 92s + `Source.Unavailable` |

About 860 transitions in total, through every branch of `autodj_cross`
(overlap, fade-out, fade-in, both-quiet, hard cut, jingle, on-time cut). Every
run exited with code 0, HLS segments still being written, and the Icecast mount
live. The checker flagged three runs, and each was traced by hand: two were its
60s fetch-gap limit on full-length songs, and one was the simulated outage.

### CPU and RAM

Four copies side by side, 3 minutes, encoders stripped (so totals are low;
compare the differences):

| Variant | CPU | RAM |
|---|---|---|
| Crossfade off, no cache (today) | 2.5% | 83.5 MiB |
| Crossfade off + cache | 2.6% | 77.9 MiB |
| Crossfade on + cache | 2.6% | 92.0 MiB |
| Crossfade on, no cache | froze | – |

### Other behaviour seen with crossfade on

- The smart transition hard-cuts when both songs are loud (both above about
  -15 dB at the boundary). That's by design, to avoid clipping. Raise
  `LIQUIDSOAP_CROSSFADE_HIGH_DB` for more overlaps.
- Crossfade fetches one track ahead (the queue is two deep).

## Reproducing

The harness lived in the session scratchpad and isn't in the repo. To rebuild:

1. Render a station's script with crossfade forced on, in memory only. Use
   `ReflectionMethod` on `LiquidsoapSupervisor::renderLiqFile` with
   `config(['liquidsoap.crossfade_enabled' => true, 'liquidsoap.liq_dir' => $tmp])`,
   then rewrite the API URLs to `127.0.0.1:9000`. This is the same approach as
   `docs/station-log-wiring-harness/render.php` on `feat/station-log`.
2. Append a tail that serves `/api/internal/next-track` on harbor port 9000,
   polls `/status` every 2s, and logs `rms` and `current_source()` every second.
3. Run it in `gocast/liquidsoap` or `savonet/liquidsoap:v2.4.6`. The savonet
   images have no `ffmpeg` binary, so add it like `infra/liquidsoap/Dockerfile`
   does.
4. Freeze signature: `/status` `remaining` constant while `elapsed` climbs, and
   no further `next-track` requests.

Don't log `current_source()` or any source method from a harness thread unless
it reads the cache. On the unfixed script, that alone causes the freeze.
