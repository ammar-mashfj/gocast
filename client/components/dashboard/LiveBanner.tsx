"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconBroadcast, IconArrowRight } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"

/**
 * Strip shown across the top of every dashboard page while a broadcast is
 * active. Its job is the warning, not the navigation (BroadcastMiniController
 * already links back to the studio): the broadcast runs in this tab — mic,
 * mixer and encoder all live in the page — so closing it ends the show, and
 * nothing else on a settings or library page says so.
 *
 * It also says how far behind listeners are. New broadcasters open their own
 * player link, talk, still hear AutoDJ, and conclude the station is broken:
 * the harbor buffer plus HLS put listeners 15–20s behind.
 *
 * The studio renders its own copy (`inStudio`) instead of this one: it sizes
 * itself to the viewport minus the header, so a strip above `main` would push
 * its bottom edge off screen. Inside the studio's column it takes its height
 * from the layout, and there is no "Open studio" link to offer.
 */
export function LiveBanner({ inStudio = false }: { inStudio?: boolean }) {
  const pathname = usePathname()
  const { state, stationSlug } = useBroadcast()

  const isLive = state === "live" || state === "reconnecting"
  if (!isLive || !stationSlug) return null

  const onStudio = pathname?.startsWith(`/dashboard/stations/${stationSlug}/studio`) ?? false
  if (onStudio !== inStudio) return null

  const isReconnecting = state === "reconnecting"

  if (inStudio) {
    return (
      <div className={`lg:col-span-2 flex items-center gap-2 px-4 py-2.5 text-sm font-medium leading-snug ${
        isReconnecting
          ? "bg-amber-500/10 border-b border-amber-500/30 text-amber-100"
          : "bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-100"
      }`}>
        <span className={`size-2 rounded-full shrink-0 animate-pulse ${isReconnecting ? "bg-amber-400" : "bg-emerald-400"}`} />
        <IconBroadcast size={16} className="shrink-0" />
        {isReconnecting
          ? "Reconnecting your broadcast… keep this tab open."
          : "You're live. Keep this tab open — closing it ends your broadcast. Listeners hear you about 15–20 seconds after you speak."}
      </div>
    )
  }

  return (
    <Link
      href={`/dashboard/stations/${stationSlug}/studio`}
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm no-underline transition-colors ${
        isReconnecting
          ? "bg-amber-500/10 border-b border-amber-500/30 text-amber-100 hover:bg-amber-500/15"
          : "bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/15"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`size-2 rounded-full shrink-0 ${isReconnecting ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
        <IconBroadcast size={16} className="shrink-0" />
        <span className="font-medium leading-snug">
          {isReconnecting
            ? "Reconnecting your broadcast… keep this tab open."
            : "You're live. Keep this tab open — closing it ends your broadcast. Listeners hear you about 15–20 seconds after you speak."}
        </span>
      </div>
      <span className="flex items-center gap-1 text-xs shrink-0 opacity-90">
        Open studio
        <IconArrowRight size={14} />
      </span>
    </Link>
  )
}
