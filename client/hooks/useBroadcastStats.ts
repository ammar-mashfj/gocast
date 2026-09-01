"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { env } from "@/lib/env"
import { fireOnce, LISTENER_MILESTONES } from "@/lib/milestones"

/** How many poll samples the listener sparkline keeps. 24 × 8s ≈ 3 minutes. */
const HISTORY_LENGTH = 24
const POLL_MS = 8000

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

  useEffect(() => {
    if (!isLive || !slug) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(
          `${env.apiUrl}/public/stations/${slug}/listeners`,
          { headers: { Accept: "application/json" } },
        )
        if (cancelled) return
        const data = await res.json()
        const count: number = data?.data?.count ?? 0

        setListeners(count)
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
      } catch {
        // Non-critical. The next interval retries; a broadcaster should never
        // see an error because a stats poll timed out.
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [isLive, slug])

  return { elapsed, listeners, peak, history, startedAt }
}
