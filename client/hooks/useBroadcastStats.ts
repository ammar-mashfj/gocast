"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { fireOnce, LISTENER_MILESTONES } from "@/lib/milestones"
import { usePublicStationFeed } from "./usePublicStationStats"
import { useBroadcast } from "@/contexts/BroadcastContext"

/** How many poll samples the listener sparkline keeps. 24 × 10s = 4 minutes. */
const HISTORY_LENGTH = 24

/**
 * Samples closer together than this are the same read seen twice. Half the
 * feed's 10s cadence: the feed replays its held value to every new
 * subscriber, and a studio↔dashboard handoff resubscribes (or re-polls at
 * once), so each trip used to add a stale duplicate point and shrink the
 * sparkline's four minutes.
 */
const MIN_SAMPLE_GAP_MS = 5_000

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
 * Session-scoped numbers that must outlive the studio's mount. Keyed by the
 * broadcast (slug + liveSince), so a trip to the library and back resumes
 * the same peak and sparkline instead of starting a second, emptier show.
 * Module scope is the right lifetime: one tab, one broadcast.
 */
interface SessionStats {
  peak: number
  history: number[]
  /** When the last history sample was taken; 0 before the first. */
  sampledAt: number
  /** The read behind that sample — the feed replays the same object. */
  sampledFrom: object | null
}
const sessions = new Map<string, SessionStats>()
const EMPTY_SESSION: SessionStats = { peak: 0, history: [], sampledAt: 0, sampledFrom: null }

function sessionKey(slug: string | null, liveSince: number | null): string | null {
  return slug && liveSince ? `${slug}:${liveSince}` : null
}

/**
 * Peak listeners for the broadcast in progress, read outside React — the
 * end-of-show summary is written from a click handler, after which the
 * studio unmounts.
 */
export function getSessionPeak(slug: string | null, liveSince: number | null): number {
  const key = sessionKey(slug, liveSince)
  return (key && sessions.get(key)?.peak) || 0
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
  const { liveSince } = useBroadcast()
  const key = sessionKey(slug, liveSince)
  const [now, setNow] = useState(() => Date.now())
  const [listeners, setListeners] = useState<number | null>(null)
  const [session, setSession] = useState<SessionStats>(
    () => (key && sessions.get(key)) || EMPTY_SESSION,
  )

  // The shared map, not this hook's state, is the record of the show. The
  // mini controller mounts once for the life of the tab — before any show,
  // with no key — and hands off to the studio's copy and back. Re-read on
  // every change of key or of which copy is polling, or a stale copy writes
  // its old peak and history over the show's.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the module-scope store
    setSession((key && sessions.get(key)) || EMPTY_SESSION)
  }, [key, isLive])

  // A clock, not a counter: uptime is derived from liveSince on every tick,
  // so a remount or a background tab can never make it drift or restart.
  useEffect(() => {
    if (!isLive) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isLive])

  const elapsed = liveSince ? Math.max(0, Math.floor((now - liveSince) / 1000)) : 0

  usePublicStationFeed(
    slug,
    (stats) => {
      const count = stats.count ?? 0

      setListeners(count)
      const prev = (key && sessions.get(key)) || EMPTY_SESSION
      const prevPeak = prev.peak
      // Fire crossings — once per session per threshold, so a count that
      // jitters around a boundary doesn't spam the broadcaster mid-show.
      for (const m of LISTENER_MILESTONES) {
        if (count >= m && prevPeak < m) {
          fireOnce(`live:${slug}:${liveSince}:${m}`, () => {
            if (m === 1) toast.success("First listener tuned in")
            else toast.success(`${m} listening — your biggest crowd this show`)
          })
        }
      }

      // One sample per READ, not per change: the sparkline is a series at a
      // fixed cadence, and a station holding steady at five listeners has to
      // draw a flat line rather than contribute a single point.
      const now = Date.now()
      const fresh = stats !== prev.sampledFrom && now - prev.sampledAt >= MIN_SAMPLE_GAP_MS
      const next: SessionStats = {
        peak: Math.max(prevPeak, count),
        history: fresh ? [...prev.history, count].slice(-HISTORY_LENGTH) : prev.history,
        sampledAt: fresh ? now : prev.sampledAt,
        sampledFrom: fresh ? stats : prev.sampledFrom,
      }
      if (key) sessions.set(key, next)
      setSession(next)
    },
    // pauseWhenHidden: false is the one exception in the app. A broadcaster
    // alt-tabs to their music library mid-show; coming back to a sparkline
    // full of holes and a peak that missed its own high point would misreport
    // the broadcast they are in the middle of. Affordable because it is one
    // broadcaster per station — the public player, which is one per LISTENER,
    // takes the default and pauses.
    { enabled: isLive, pauseWhenHidden: false },
  )

  return { elapsed, listeners, peak: session.peak, history: session.history, startedAt: liveSince }
}
