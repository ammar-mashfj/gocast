"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import api from "@/lib/axios"
import { StationStatus } from "@/interfaces/StationStatus"

/** While a station is coming up, the answer changes every few seconds. */
const POLL_STARTING_MS = 2000
/** On air and steady: slow enough to be cheap, quick enough for a progress bar. */
const POLL_STEADY_MS = 10000
/** Off air, nothing to watch — just enough to notice someone else starting it. */
const POLL_OFFLINE_MS = 30000
/**
 * Floor for the track-aware poll below. Without it, a rotation of very short
 * files would have the dashboard polling the container several times a second.
 */
const POLL_FLOOR_MS = 3000
/** Grace after a track is due to end, so the next one has announced itself. */
const TRACK_END_GRACE_MS = 750
/**
 * Back-off ceiling for a status endpoint that keeps failing.
 *
 * A failed read used to return null, which `intervalFor` read as "still
 * booting" and paced at POLL_STARTING_MS — so the one case where the server
 * is struggling was the case we polled it hardest. Consecutive failures now
 * double the wait up to this cap, and any success resets it.
 */
const POLL_MAX_BACKOFF_MS = 30000

/** Sentinel for "the request itself failed", distinct from a null status. */
const FAILED = Symbol("failed")

function backoffFor(failures: number): number {
  return Math.min(POLL_MAX_BACKOFF_MS, POLL_STARTING_MS * 2 ** (failures - 1))
}

function intervalFor(status: StationStatus | null): number {
  if (!status) return POLL_STARTING_MS
  if (status.state === "starting") return POLL_STARTING_MS
  if (status.state === "offline") return POLL_OFFLINE_MS

  // Poll when there is something new to see, rather than on a fixed tick.
  //
  // The container tells us how much of the current track is left, so the next
  // interesting moment is knowable instead of guessable. On a normal track
  // `remaining` is minutes and this changes nothing; near a boundary it pulls
  // the next read in, so the headline updates a second after the track does
  // instead of up to ten seconds later. Costs one extra request per track.
  const remaining = status.remaining
  if (typeof remaining === "number" && remaining >= 0) {
    return Math.min(POLL_STEADY_MS, Math.max(POLL_FLOOR_MS, remaining * 1000 + TRACK_END_GRACE_MS))
  }

  return POLL_STEADY_MS
}

/**
 * Polls a station's live status, pacing itself by what it finds: fast while
 * the container is booting, slow once the answer has settled.
 *
 * Polling stops while the tab is hidden — a dashboard left open in a
 * background tab shouldn't keep asking a container what it is playing — and
 * resumes with an immediate read so the UI is never stale on return.
 */
export function useStationStatus(slug: string, enabled = true) {
  const [status, setStatus] = useState<StationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)
  /** Consecutive failed reads, for the back-off in tick(). Reset by any success. */
  const failures = useRef(0)

  /**
   * Internal read. Returns FAILED on error so tick() can back off; the
   * exported refresh() below flattens that back to null, keeping the sentinel
   * out of consumers' hands.
   */
  const read = useCallback(async (): Promise<StationStatus | null | typeof FAILED> => {
    try {
      const { data } = await api.get<{ data: StationStatus }>(`/stations/${slug}/status`)
      if (!cancelled.current) setStatus(data.data)
      failures.current = 0
      return data.data
    } catch {
      // Network blip or a 403 from a session that just expired — keep the
      // last known status rather than flashing the UI back to "unknown".
      //
      // Reported as FAILED rather than null so the caller can tell a failed
      // read from a station with no status, and back off instead of
      // retrying at the fastest cadence.
      failures.current += 1
      return FAILED
    } finally {
      if (!cancelled.current) setLoading(false)
    }
  }, [slug])

  const refresh = useCallback(async (): Promise<StationStatus | null> => {
    const result = await read()

    return result === FAILED ? null : result
  }, [read])

  useEffect(() => {
    if (!enabled) return
    cancelled.current = false

    async function tick() {
      if (cancelled.current) return
      const next = document.hidden ? status : await read()
      if (cancelled.current) return
      timer.current = setTimeout(
        tick,
        next === FAILED ? backoffFor(failures.current) : intervalFor(next),
      )
    }

    tick()

    function onVisible() {
      if (document.hidden) return

      // Restart the loop rather than firing a bare read alongside it. The old
      // version left the pending timer running, so returning to the tab put a
      // second request in flight against the one already scheduled — the
      // exact overlap this hook's await-then-schedule shape exists to avoid.
      if (timer.current) clearTimeout(timer.current)
      tick()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled.current = true
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // `status` is read inside tick() only to keep the pace while hidden;
    // including it would restart the loop on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, enabled, read])

  return { status, loading, refresh }
}
