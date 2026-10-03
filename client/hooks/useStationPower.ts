"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import api from "@/lib/axios"
import { useStationStatus } from "@/hooks/useStationStatus"

/**
 * Starting and stopping a station: the overview hero and the status band
 * both use this, so the two buttons that say "Start AutoDJ" can't behave
 * differently.
 *
 * After a change it re-reads the shared status poll (the badge) and refreshes
 * the server render (desired_state, recent shows, the activity counts).
 *
 * A stop refused because DJ software is on air (`station_is_live_external`)
 * doesn't toast: the owner may have no way to reach that machine — a dead
 * laptop, or a stranger with a leaked stream key — so it sets `cutoff` to the
 * server's sentence, and the caller offers `cutOff()` in a confirm. The
 * studio's own `station_is_live` is not that: its broadcast has an End
 * button, and ends cleanly there.
 */
export function useStationPower(slug: string) {
  const router = useRouter()
  const { refresh } = useStationStatus(slug)
  const [pending, setPending] = useState<"start" | "stop" | null>(null)
  const [cutoff, setCutoff] = useState<string | null>(null)

  async function act(action: "start" | "stop", success: string, body?: Record<string, unknown>): Promise<boolean> {
    if (pending) return false
    setPending(action)
    try {
      await api.post(`/stations/${slug}/${action}`, body)
      setCutoff(null)
      toast.success(success)
      await refresh()
      router.refresh()
      return true
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data
      if (data?.code === "station_is_live_external") {
        setCutoff(data.message ?? "Your DJ software is on air.")
        return false
      }
      // The API writes these for people (plan limits, "end your broadcast
      // first"), so show them rather than a generic failure.
      toast.error(data?.message ?? "Something went wrong — please try again")
      return false
    } finally {
      setPending(null)
    }
  }

  return {
    pending,
    start: () => act("start", "AutoDJ is on"),
    stop: () => act("stop", "Station is off air"),
    /** Why a stop was refused for DJ software on air, or null. */
    cutoff,
    dismissCutoff: () => setCutoff(null),
    cutOff: () => act("stop", "Broadcast cut off — station is off air", { force: true }),
  }
}
