"use client"

import { useSharedStationStatus } from "@/contexts/StationStatusContext"
import { useStationStatusPoll } from "@/hooks/useStationStatusPoll"

/**
 * A station's live status (see useStationStatusPoll for how it is paced).
 *
 * For the dashboard's own station this is the shared poll from
 * StationStatusProvider, so any number of components cost one request. A
 * caller with its own cadence (`intervalMs`, the encoder dialog watching for
 * a DJ to connect) or another station's slug runs a poll of its own.
 *
 * `showEnding` is the shared poll's: true while a show this tab just ended
 * is still handing over. A poll of its own never knows, so it is false there.
 */
export function useStationStatus(slug: string, enabled = true, intervalMs?: number) {
  const shared = useSharedStationStatus(slug)
  const useShared = shared !== null && intervalMs === undefined
  const own = useStationStatusPoll(slug, enabled && !useShared, intervalMs)
  if (useShared && enabled) {
    const { status, loading, refresh, showEnding } = shared
    return { status, loading, refresh, showEnding }
  }
  return { ...own, showEnding: false }
}
