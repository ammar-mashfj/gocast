"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { useStationStatusPoll } from "@/hooks/useStationStatusPoll"
import type { StationStatus } from "@/interfaces/StationStatus"

type StationStatusValue = ReturnType<typeof useStationStatusPoll> & {
  slug: string
  /** This tab's show just ended and the station hasn't settled yet. See useRereadWhenShowEnds. */
  showEnding: boolean
}

const StationStatusContext = createContext<StationStatusValue | null>(null)

/**
 * After a show ends from this tab, the status is read this often until the
 * station has settled, and for no longer than AFTER_SHOW_SETTLE_MAX_MS. The
 * API caches a status for about 2s, and harbor drains its buffer (about 5s)
 * before AutoDJ takes the air back.
 */
const AFTER_SHOW_REREAD_MS = 1500
const AFTER_SHOW_SETTLE_MAX_MS = 15_000

/**
 * One status poll for the account's station, shared by everything in the
 * dashboard: the status band, the sidebar lamp, the overview, the library.
 * Each of those used to run its own, so an overview page asked the same
 * question three times on three timers and could show three answers.
 *
 * Inside StationProvider; renders a plain passthrough when there is no
 * station (the onboarding page).
 */
export function StationStatusProvider({ children }: { children: React.ReactNode }) {
  const station = useCurrentStation()
  const poll = useStationStatusPoll(station?.slug ?? "", !!station)
  const settling = useRereadWhenShowEnds(station?.slug ?? null, poll.refresh)
  // Until the re-read lands, a browser broadcaster in the status is this
  // tab's own show, already over.
  const status =
    settling && poll.status?.live_source?.type === "browser"
      ? { ...poll.status, broadcaster: false, live_source: null }
      : poll.status
  const value = station ? { ...poll, status, slug: station.slug, showEnding: settling } : null
  return <StationStatusContext.Provider value={value}>{children}</StationStatusContext.Provider>
}

/** The shared poll, when it is for `slug`; otherwise null. */
export function useSharedStationStatus(slug: string): StationStatusValue | null {
  const shared = useContext(StationStatusContext)
  return shared && shared.slug === slug ? shared : null
}

/**
 * The moment this tab stops broadcasting, the last status read still says a
 * broadcaster is connected, and with this tab no longer live, the band and
 * the overview took that for someone else: "You're live from another
 * browser", until the next poll (up to 30s away). The station then takes a
 * few more seconds to hand the air back to AutoDJ (or to go off).
 *
 * So: read at once, then keep reading until a status shows that handover
 * done. Returns true until then, for the band to say the show has ended
 * rather than guess from a status that is about to change.
 */
function useRereadWhenShowEnds(
  slug: string | null,
  refresh: () => Promise<StationStatus | null>,
): boolean {
  const { state, stationSlug } = useBroadcast()
  const live = slug !== null && stationSlug === slug && (state === "live" || state === "reconnecting")
  const [wasLive, setWasLive] = useState(live)
  const [settling, setSettling] = useState(false)
  if (wasLive !== live) {
    setWasLive(live)
    setSettling(!live)
  }

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    if (!settling) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const giveUpAt = Date.now() + AFTER_SHOW_SETTLE_MAX_MS

    async function check() {
      const status = await refreshRef.current()
      if (cancelled) return
      // Settled: nobody is connected and the live source is no longer the
      // one on air. A failed read (null) counts as not yet.
      const settled = status !== null && status.broadcaster !== true && status.source !== "live"
      if (settled || Date.now() >= giveUpAt) {
        setSettling(false)
        return
      }
      timer = setTimeout(check, AFTER_SHOW_REREAD_MS)
    }
    void check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [settling])

  return settling
}
