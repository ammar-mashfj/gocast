"use client"

import { useCallback, useEffect, useRef } from "react"
import type { StationStatus } from "@/interfaces/StationStatus"

/**
 * How far the interpolated position may drift from what the container says
 * before we snap back to the container's number.
 *
 * It has to absorb the ordinary staleness of a poll — StationStatusService
 * caches a pulled status for ~2s, and the response then spends a moment on
 * the wire — otherwise every read would "correct" the bar by a second or so
 * and it would visibly stutter. Anything larger than this is not staleness:
 * it is a skip, a crossfade, a restart, or the same track playing round
 * again, and the honest thing to do is jump.
 */
const DRIFT_TOLERANCE_S = 2.5

interface Anchor {
  /** Position the container reported, in seconds. */
  elapsed: number
  /** Track length in seconds. */
  duration: number
  /** `performance.now()` when this anchor was taken. */
  takenAt: number
  /** Which track it describes, so a change forces a re-anchor. */
  track: string
}

export interface TrackProgress {
  /** Interpolated position in seconds, never past `duration`. */
  elapsed: number
  /** Track length in seconds. */
  duration: number
}

/**
 * Turns the container's `elapsed`/`remaining` into a position that moves.
 *
 * These two fields are polled, not pushed, and there is no producer that
 * could push them — they are a continuously changing number, not an event.
 * Polling them fast enough to render directly would mean asking a Liquidsoap
 * container what it is playing several times a second, for a progress bar.
 *
 * So they are not rendered directly. One poll anchors a local clock and the
 * position is counted forward from there in the browser; the next poll only
 * corrects it if it has drifted further than {@link DRIFT_TOLERANCE_S}. That
 * is also what makes it safe to slow the status poll down while push carries
 * the state changes — this number stopped depending on the poll's cadence.
 *
 * Returns an imperative reader rather than state on purpose: the caller ticks
 * it from requestAnimationFrame and writes straight to the DOM, so a bar that
 * moves every frame never re-renders the page around it. rAF also stops on
 * its own in a background tab, which is the pause behaviour we would
 * otherwise have to write.
 */
export function useTrackProgress(status: StationStatus | null): () => TrackProgress | null {
  const anchor = useRef<Anchor | null>(null)

  const elapsed = status?.elapsed ?? null
  const remaining = status?.remaining ?? null
  const title = status?.now_playing?.title ?? null
  const artist = status?.now_playing?.artist ?? null

  // In an effect, not in the render body: `performance.now()` is impure, and
  // a hook that reads it while rendering produces a different anchor every
  // time React happens to re-run the component. Keyed on the scalars rather
  // than on `status`, which is a fresh object per poll.
  useEffect(() => {
    // Both numbers, and remaining non-negative. A live broadcast has no
    // length, and the silence bed is `blank()` — one endless track, where
    // `elapsed` counts how long the station has been silent rather than a
    // position in anything. Neither has a progress bar to draw.
    if (elapsed === null || remaining === null || remaining < 0) {
      anchor.current = null
      return
    }

    // Identity, not display: JSON so a title of "a" with artist "b" cannot
    // collide with a title of "a b", and no separator character is off limits.
    const track = JSON.stringify([title, artist])
    const current = anchor.current
    const predicted = current ? current.elapsed + (performance.now() - current.takenAt) / 1000 : null

    // Re-anchor on a different track, on the first reading, or when the
    // container disagrees with us by more than ordinary staleness. Holding the
    // anchor through small disagreements is the whole reason the bar does not
    // stutter once per poll.
    //
    // A rotation of one track loops back to the same identity, so the drift
    // check is what catches it: the position jumps backwards by most of the
    // track, which is far outside tolerance.
    if (
      current === null ||
      current.track !== track ||
      predicted === null ||
      Math.abs(predicted - elapsed) > DRIFT_TOLERANCE_S
    ) {
      anchor.current = {
        elapsed,
        duration: elapsed + remaining,
        takenAt: performance.now(),
        track,
      }
    }
  }, [elapsed, remaining, title, artist])

  return useCallback((): TrackProgress | null => {
    const current = anchor.current
    if (current === null || current.duration <= 0) return null

    const position = current.elapsed + (performance.now() - current.takenAt) / 1000

    // Clamped, never wrapped. Running past the end means the track changed and
    // no poll has landed yet; a bar that sits full for a moment reads as
    // "about to change", while one that restarts at zero asserts a new track
    // we have no evidence for.
    return {
      elapsed: Math.min(Math.max(0, position), current.duration),
      duration: current.duration,
    }
  }, [])
}
