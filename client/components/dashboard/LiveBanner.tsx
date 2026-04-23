"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconBroadcast, IconArrowRight } from "@tabler/icons-react"
import { useBroadcast, readBroadcastRecovery } from "@/contexts/BroadcastContext"

/**
 * Sticky banner shown across the dashboard while a broadcast is active so the
 * user can jump back to the studio from anywhere — settings, broadcasts list,
 * a different station's detail page, etc.
 *
 * Hidden on the studio page itself (would be redundant).
 */
export function LiveBanner() {
  const pathname = usePathname()
  const { state } = useBroadcast()
  const [recoverySlug, setRecoverySlug] = useState<string | null>(null)

  // The recovery record has the slug we need to link back; the broadcast
  // context exposes state but not the slug directly.
  useEffect(() => {
    // Sync derived UI state from sessionStorage when broadcast state changes.
    // Reading session storage from render isn't safe (SSR hydration mismatch),
    // so we accept the cascade.
    if (state === "live" || state === "reconnecting") {
      const rec = readBroadcastRecovery()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecoverySlug(rec?.stationSlug ?? null)
    } else {
      setRecoverySlug(null)
    }
  }, [state])

  const isLive = state === "live" || state === "reconnecting"
  if (!isLive || !recoverySlug) return null

  // Hide on the studio page for the active station — banner would be redundant
  // (the entire screen is already the studio).
  if (pathname?.startsWith(`/dashboard/stations/${recoverySlug}/studio`)) return null

  const isReconnecting = state === "reconnecting"

  return (
    <Link
      href={`/dashboard/stations/${recoverySlug}/studio`}
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm no-underline transition-colors ${
        isReconnecting
          ? "bg-amber-500/10 border-b border-amber-500/30 text-amber-100 hover:bg-amber-500/15"
          : "bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/15"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`size-2 rounded-full shrink-0 ${isReconnecting ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
        <IconBroadcast size={16} className="shrink-0" />
        <span className="truncate font-medium">
          {isReconnecting ? "Reconnecting your broadcast…" : "You're broadcasting right now, don't close this page!"}
        </span>
      </div>
      <span className="flex items-center gap-1 text-xs shrink-0 opacity-90">
        Open studio
        <IconArrowRight size={14} />
      </span>
    </Link>
  )
}
