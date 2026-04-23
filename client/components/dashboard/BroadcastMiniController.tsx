"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconBroadcast,
  IconExternalLink,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"

export function BroadcastMiniController() {
  const pathname = usePathname()
  const { state, stationSlug, engine } = useBroadcast()
  useEngineVersion(engine)

  const isBroadcasting = state === "live" || state === "reconnecting"
  const isStudio = stationSlug
    ? pathname?.startsWith(`/dashboard/stations/${stationSlug}/studio`)
    : pathname?.includes("/studio")

  if (!isBroadcasting || isStudio || !stationSlug || !engine) return null

  const track = engine.getCurrentTrack()
  const playing = engine.isPlaying()
  const hasQueue = engine.getQueue().length > 0
  const title = track?.title ?? "Live broadcast"
  const artist = track?.artist ?? (state === "reconnecting" ? "Reconnecting" : "No song selected")
  const studioHref = `/dashboard/stations/${stationSlug}/studio`

  return (
    <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[360px]">
      <div className="flex h-16 items-center gap-2 pe-1 rounded-lg border border-border/80 bg-background/95 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <Link
          href={studioHref}
          title="Open studio"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-1.5 no-underline transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <span className="absolute right-1 top-1 size-2 rounded-full bg-emerald-400" />
            {track ? <IconMusic size={18} /> : <IconBroadcast size={18} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[0.625rem] font-medium uppercase leading-none text-muted-foreground">
              On air
            </span>
            <span className="mt-1 block truncate text-sm font-semibold leading-tight text-foreground">
              {title}
            </span>
            <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
              {artist}
            </span>
          </span>
          <IconExternalLink size={15} className="ml-auto hidden shrink-0 text-muted-foreground sm:block" />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={hasQueue ? "default" : "ghost"}
            size="icon"
            className="size-9"
            onClick={() => engine.togglePlay()}
            disabled={!hasQueue}
            title={playing ? "Pause current song" : "Play current song"}
            aria-label={playing ? "Pause current song" : "Play current song"}
          >
            {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => engine.next()}
            disabled={!hasQueue}
            title="Next song"
            aria-label="Next song"
          >
            <IconPlayerSkipForwardFilled size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
