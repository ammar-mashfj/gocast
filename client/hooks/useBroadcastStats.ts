"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { fireOnce, LISTENER_MILESTONES } from "@/lib/milestones"
import { usePublicStationFeed } from "./usePublicStationStats"

/** How many poll samples the listener sparkline keeps. 24 × 10s = 4 minutes. */
const HISTORY_LENGTH = 24

export interface BroadcastStats {
  /** Seconds since this broadcast went live. */
  elapsed: number
  /** Null until the first poll lands — render "—", never "0". */
  listeners: number | null
  peak: number
  /** Oldest-first listener samples, capped at {@link HISTORY_LENGTH}. */
  history: number[]
  startedAt: number | null
}

/**
 * Uptime, live listener count, peak, and the rolling history behind the
 * sparkline — owned in one place because the deck and the side rail both
 * show the same numbers and must agree.
 *
 * Previously the count was polled inside StreamPanel. Two components wanting
 * it would have meant two polls of the same endpoint eight seconds apart,
 * showing different numbers on the same screen.
 *
 * The history is deliberately session-scoped rather than fetched: the panel
 * it feeds is labelled "this broadcast", and the API has no per-interval
 * listener series to ask for.
 */
export function useBroadcastStats(
  slug: string | null,
  isLive: boolean,
): BroadcastStats {
  const [elapsed, setElapsed] = useState(0)
  const [listeners, setListeners] = useState<number | null>(null)
  const [peak, setPeak] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const startTimeRef = useRef(0)
  const peakRef = useRef(0)

  // Both values are published from inside the interval rather than the effect
  // body: setting state directly in an effect is what `react-hooks` forbids,
  // and re-setting `startedAt` to the same number every second is a no-op
  // after the first tick. The cost is that "Started" reads "—" for one second.
  useEffect(() => {
    if (!isLive) {
      return
    }
    const start = Date.now()
    startTimeRef.current = start
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
      setStartedAt(start)
    }, 1000)
    return () => clearInterval(timer)
  }, [isLive])

  // The count itself comes from the shared feed — one timer and one request
  // per station across the whole tab, whoever else is asking. Only the things
  // that are SESSION-scoped live here: the sparkline samples, the peak, and
  // the milestone toasts, none of which the endpoint knows anything about.
  //
  // pauseWhenHidden: false is the one exception in the app. A broadcaster
  // alt-tabs to their music library mid-show; coming back to a sparkline full
  // of holes and a peak that missed its own high point would misreport the
  // broadcast they are in the middle of. Affordable because it is one
  // broadcaster per station — the public player, which is one per LISTENER,
  // takes the default and pauses.
  usePublicStationFeed(
    slug,
    (stats) => {
      const count = stats.count ?? 0

      setListeners(count)
      // One sample per READ, not per change: the sparkline is a series at a
      // fixed cadence, and a station holding steady at five listeners has to
      // draw a flat line rather than contribute a single point.
      setHistory((prev) => [...prev, count].slice(-HISTORY_LENGTH))

      // Fire crossings — once per session per threshold, so a count that
      // jitters around a boundary doesn't spam the broadcaster mid-show.
      for (const m of LISTENER_MILESTONES) {
        if (count >= m && peakRef.current < m) {
          fireOnce(`live:${slug}:${startTimeRef.current}:${m}`, () => {
            if (m === 1) toast.success("🎉 First listener tuned in!")
            else toast.success(`🔥 ${m} listening — your biggest crowd this session`)
          })
        }
      }

      if (count > peakRef.current) {
        peakRef.current = count
        setPeak(count)
      }
    },
    // pauseWhenHidden: false is the one exception in the app. A broadcaster
    // alt-tabs to their music library mid-show; coming back to a sparkline
    // full of holes and a peak that missed its own high point would misreport
    // the broadcast they are in the middle of. Affordable because it is one
    // broadcaster per station — the public player, which is one per LISTENER,
    // takes the default and pauses.
    { enabled: isLive, pauseWhenHidden: false },
  )

  return { elapsed, listeners, peak, history, startedAt }
}
