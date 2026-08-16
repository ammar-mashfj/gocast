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

function intervalFor(status: StationStatus | null): number {
  if (!status) return POLL_STARTING_MS
  if (status.state === "starting") return POLL_STARTING_MS
  if (status.state === "offline") return POLL_OFFLINE_MS
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

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: StationStatus }>(`/stations/${slug}/status`)
      if (!cancelled.current) setStatus(data.data)
      return data.data
    } catch {
      // Network blip or a 403 from a session that just expired — keep the
      // last known status rather than flashing the UI back to "unknown".
      return null
    } finally {
      if (!cancelled.current) setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    if (!enabled) return
    cancelled.current = false

    async function tick() {
      if (cancelled.current) return
      const next = document.hidden ? status : await refresh()
      if (cancelled.current) return
      timer.current = setTimeout(tick, intervalFor(next))
    }

    tick()

    function onVisible() {
      if (!document.hidden) refresh()
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
  }, [slug, enabled, refresh])

  return { status, loading, refresh }
}
