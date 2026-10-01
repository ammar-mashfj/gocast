"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconArrowRight } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { LAMP_LABEL } from "@/components/studio/signal"
import { formatClock } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The bar above every other dashboard page while a show is running from this
 * tab: the uptime, and one click back to the studio.
 *
 * The mobile app's LiveStrip (mobile/src/components/LiveStrip.tsx), matched
 * on purpose: a solid red bar saying LIVE, amber saying RECONNECTING while
 * the socket is down, and nothing else. The studio's band is where the show
 * is read in detail — silence, dropped audio, an open mic — so this bar only
 * has to say "you're still on, and here's the way back".
 *
 * Not rendered in the studio, which draws the full band itself.
 */
export function LiveBanner() {
  const pathname = usePathname()
  const { state, stationSlug, liveSince } = useBroadcast()
  const isLive = state === "live" || state === "reconnecting"
  const onStudio = !!stationSlug && (pathname?.startsWith(`/dashboard/stations/${stationSlug}/studio`) ?? false)
  const shown = isLive && !!stationSlug && !onStudio
  const now = useNow(shown)

  if (!shown) return null

  const reconnecting = state === "reconnecting"
  const uptime = liveSince ? Math.max(0, (now - liveSince) / 1000) : 0

  return (
    <Link
      href={`/dashboard/stations/${stationSlug}/studio`}
      aria-label={`${reconnecting ? "Reconnecting" : "Live"}. Back to studio`}
      className={cn(
        "mx-3.5 mt-2 flex h-10 items-center gap-2.5 rounded-[14px] px-3.5 no-underline transition-opacity hover:opacity-90",
        reconnecting ? "bg-pro text-pro-ink" : "bg-live text-live-ink",
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
      <span className={cn("text-xs", LAMP_LABEL)}>{reconnecting ? "Reconnecting" : "Live"}</span>
      <span className="flex-1 font-mono text-[13px] font-semibold tabular-nums">{formatClock(uptime)}</span>
      <span className="text-[13px] font-bold">Back to studio</span>
      <IconArrowRight size={15} stroke={2.5} aria-hidden />
    </Link>
  )
}

/** Wall-clock time, ticking once a second while `enabled`. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    // The first tick lands within a second; until then the clock reads 0:00
    // at worst (the uptime is clamped), never a stale negative.
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}
