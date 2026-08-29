"use client"

import { useEffect, useState } from "react"
import { env } from "@/lib/env"

/** Matches the studio's poll — fast enough to feel live, cheap enough to leave open. */
const POLL_MS = 8000

/**
 * Current concurrent listeners for a station.
 *
 * Reads the PUBLIC endpoint (`/public/stations/{slug}/listeners`) rather than
 * the owner's status endpoint, because the count lives there and nowhere else:
 * `GET /stations/{slug}/status` reports the audio graph, not the audience. The
 * number itself is written by the `stations:sync-listeners` scheduled command
 * once a minute from Icecast's admin stats, so it moves in minute-sized steps
 * however often we ask.
 *
 * `null` means "not known yet" and should render as nothing, not as 0 — an
 * off-air station genuinely has no audience, but a page that has not answered
 * yet should not claim one either way.
 */
export function useListenerCount(slug: string, enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`${env.apiUrl}/public/stations/${slug}/listeners`, {
          headers: { Accept: "application/json" },
        })
        if (cancelled || !res.ok) return
        const body = await res.json()
        setCount(body?.data?.count ?? 0)
      } catch {
        // Non-critical: keep the last known count and try again next tick.
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [slug, enabled])

  // Derived rather than cleared in the effect: a station that has just gone
  // off air must stop reporting an audience immediately, and resetting state
  // from inside the effect would cost an extra render to say so.
  return enabled ? count : null
}
