"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconBroadcast,
  IconMicrophone,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { useBroadcastStats } from "@/hooks/useBroadcastStats"
import { cn } from "@/lib/utils"

/**
 * Transport for the show while the broadcaster is elsewhere in the
 * dashboard. It also keeps the show's listener stats ticking — the peak and
 * sparkline live per broadcast, and a peak reached while the host was in the
 * library still belongs to the show.
 */
export function BroadcastMiniController() {
  const pathname = usePathname()
  const { state, stationSlug, engine, micDisabled } = useBroadcast()
  useEngineVersion(engine)

  const isBroadcasting = state === "live" || state === "reconnecting"
  const isStudio = stationSlug
    ? pathname?.startsWith(`/dashboard/stations/${stationSlug}/studio`)
    : pathname?.includes("/studio")
  const stats = useBroadcastStats(stationSlug, isBroadcasting && !isStudio)
  const visible = isBroadcasting && !isStudio && !!stationSlug && !!engine

  // Toasts and this bar share the bottom-right corner, and a toast landing on
  // top of the transport hides the one control that matters mid-show. The
  // Toaster lives in the root layout and knows nothing about this bar, so the
  // bar announces itself on <html> and globals.css lifts the toasts clear of
  // it for exactly as long as it is on screen.
  useEffect(() => {
    if (!visible) return
    document.documentElement.setAttribute("data-mini-controller", "")
    return () => document.documentElement.removeAttribute("data-mini-controller")
  }, [visible])

  if (!visible || !stationSlug || !engine) return null

  const track = engine.getCurrentTrack()
  const playing = engine.isPlaying()
  const hasQueue = engine.getQueue().length > 0
  const micOpen = !micDisabled && engine.isMicActive()
  const title = track?.title ?? "Live broadcast"
  const studioHref = `/dashboard/stations/${stationSlug}/studio`

  return (
    <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px]">
      <div
        className={cn(
          "flex h-16 items-center gap-2 rounded-xl border bg-panel pe-1.5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]",
          micOpen ? "border-mic/50" : "border-white/[0.1]",
        )}
      >
        <Link
          href={studioHref}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-1.5 no-underline transition-colors hover:bg-white/[0.04]"
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md",
              micOpen ? "bg-mic text-[#04121c]" : "bg-live/15 text-live-text",
            )}
          >
            {micOpen ? <IconMicrophone size={18} /> : <IconBroadcast size={18} />}
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block text-[11px] font-bold uppercase leading-none tracking-[0.08em]",
                micOpen ? "text-mic-text" : "text-live-text",
              )}
            >
              {micOpen ? "Mic open" : "Live"}
              <span className="ml-1.5 font-medium normal-case tracking-normal text-muted-foreground">
                · {stats.listeners === null ? "—" : stats.listeners} listening
              </span>
            </span>
            <span className="mt-1 block truncate text-sm font-semibold leading-tight text-foreground">
              {title}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={hasQueue ? "default" : "ghost"}
            size="icon"
            className="size-10"
            onClick={() => engine.togglePlay()}
            disabled={!hasQueue}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => engine.next()}
            disabled={!hasQueue}
            aria-label="Next track"
          >
            <IconPlayerSkipForwardFilled size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
