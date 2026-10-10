"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/components/ui/sidebar"
import { useCurrentStation } from "@/contexts/StationContext"
import { useMounted } from "@/hooks/useMounted"
import { pageLabel } from "@/lib/dashboardNav"
import { formatStationClock } from "@/lib/format"
import { Button } from "@/components/ds/Button"
import { SetupMenu } from "./SetupMenu"
import { UpdatesMenu } from "./UpdatesMenu"

/**
 * The dashboard's top bar: sidebar toggle, "Station › Page", the time where
 * the station is, the setup chip while anything is left, and Updates. The
 * status band sits directly under it and scrolls with it (DashboardShell).
 */
export function TopBar() {
  const { toggleSidebar } = useSidebar()
  const pathname = usePathname() ?? ""
  const station = useCurrentStation()
  const page = pageLabel(pathname)

  return (
    <header className="flex h-15 items-center gap-3.5 px-gutter">
      {/* The comp's glyph: two full bars and a short third, left-aligned. */}
      <Button variant="quiet" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar" className="-ml-2 flex-col gap-1">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-muted-foreground" />
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-muted-foreground" />
        <span aria-hidden className="mr-1.5 h-0.5 w-2.5 rounded-full bg-muted-foreground" />
      </Button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-body">
        {station && (
          <Link
            href={`/dashboard/stations/${station.slug}`}
            aria-current={page ? undefined : "page"}
            className={page ? "truncate text-muted-foreground hover:text-foreground" : "truncate text-foreground"}
          >
            {station.name}
          </Link>
        )}
        {page && (
          <>
            {station && <span aria-hidden className="text-text-faint">›</span>}
            <span aria-current="page" className="truncate text-foreground">{page}</span>
          </>
        )}
      </nav>

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
