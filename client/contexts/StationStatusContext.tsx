"use client"

import { createContext, useContext } from "react"
import { useCurrentStation } from "@/contexts/StationContext"
import { useStationStatusPoll } from "@/hooks/useStationStatusPoll"

type StationStatusValue = ReturnType<typeof useStationStatusPoll> & { slug: string }

const StationStatusContext = createContext<StationStatusValue | null>(null)

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
  const value = station ? { ...poll, slug: station.slug } : null
  return <StationStatusContext.Provider value={value}>{children}</StationStatusContext.Provider>
}

/** The shared poll, when it is for `slug`; otherwise null. */
export function useSharedStationStatus(slug: string): StationStatusValue | null {
  const shared = useContext(StationStatusContext)
  return shared && shared.slug === slug ? shared : null
}
