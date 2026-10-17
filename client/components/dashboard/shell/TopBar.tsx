"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/components/ui/sidebar"
import { useCurrentStation } from "@/contexts/StationContext"
import { useMounted } from "@/hooks/useMounted"
import { activeNav, pageLabel } from "@/lib/dashboardNav"
import { formatStationClock } from "@/lib/format"
import { Button } from "@/components/ds/Button"
import { SetupMenu } from "./SetupMenu"
import { UpdatesMenu } from "./UpdatesMenu"

/**
 * The dashboard's top bar: sidebar toggle, the page's name, the time where
 * the station is, the setup chip while anything is left, and Updates. The
 * status band sits directly under it and scrolls with it (DashboardShell).
 */
export function TopBar() {
  const { toggleSidebar } = useSidebar()
  const pathname = usePathname() ?? ""
  const station = useCurrentStation()
  // The overview has no label of its own in the nav (it was the station's
  // name here); name it, but only on the overview, not on unlisted routes.
  const label = pageLabel(pathname) ?? (station && activeNav(pathname) === "overview" ? "Overview" : null)

  return (
    <header data-slot="top-bar" className="flex h-15 items-center gap-3.5 px-gutter">
      {/* The comp's glyph: two full bars and a short third, left-aligned. */}
      <Button variant="quiet" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar" className="-ml-2 flex-col gap-1">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-muted-foreground" />
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-muted-foreground" />
        <span aria-hidden className="mr-1.5 h-0.5 w-2.5 rounded-full bg-muted-foreground" />
      </Button>

      {/* The page only. The station's name used to lead it ("Station ›
          Page"), but an account has one station, its name is on the sidebar
          card and the overview, and a long one truncated the page name — the
          part that says where you are. */}
      {label && <span aria-current="page" className="min-w-0 truncate text-body text-foreground">{label}</span>}

      <div className="ml-auto flex items-center gap-3.5">
        {station?.timezone && <StationClock timeZone={station.timezone} />}
        <SetupMenu />
        <UpdatesMenu />
      </div>
    </header>
  )
}

/** Rendered after hydration only: the server's clock is not the browser's. */
function StationClock({ timeZone }: { timeZone: string }) {
  const mounted = useMounted()
  const now = useMinute()
  if (!mounted) return null
  return (
    <time className="hidden font-mono text-caption tracking-widest text-text-faint sm:inline">
      {formatStationClock(new Date(now), timeZone)}
    </time>
  )
}

/** Epoch ms, re-read at the top of every minute. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, 60_000 - (Date.now() % 60_000) + 50)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}
