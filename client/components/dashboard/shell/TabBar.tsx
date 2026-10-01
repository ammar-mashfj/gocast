"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSidebar } from "@/components/ui/sidebar"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { NAV_ITEMS, activeNav, type NavKey } from "@/lib/dashboardNav"
import { cn } from "@/lib/utils"

/** The four places a phone reaches most; everything else is under More. */
const TABS: { key: NavKey; label: string }[] = [
  { key: "overview", label: "Station" },
  { key: "studio", label: "Studio" },
  { key: "autodj", label: "AutoDJ" },
  { key: "schedule", label: "Schedule" },
]

/**
 * The phone's bottom tab bar (the design system's TabBar, as the mobile app
 * has it): below 640px, fixed to the bottom, the chosen tab marked by a bar
 * above its label. "More" opens the sidebar drawer for the rest.
 */
export function TabBar() {
  const pathname = usePathname() ?? ""
  const station = useCurrentStation()
  const { setOpenMobile, openMobile } = useSidebar()
  const { state, stationSlug } = useBroadcast()
  if (!station) return null

  const active = activeNav(pathname)
  const broadcasting = state === "live" || state === "reconnecting"
  const inTabs = TABS.some((t) => t.key === active)

  function hrefFor(key: NavKey): string {
    if (key === "studio" && broadcasting && stationSlug) return `/dashboard/stations/${stationSlug}/studio`
    const item = NAV_ITEMS.find((i) => i.key === key)!
    return item.stationHref ? item.stationHref(station!.slug) : item.href
  }

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-background px-2.5 pt-1.5 pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {TABS.map((t) => (
        <Tab
          key={t.key}
          href={hrefFor(t.key)}
          label={t.label}
          on={t.key === active}
          live={t.key === "studio" && broadcasting}
        />
      ))}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        aria-expanded={openMobile}
        className={tabClass(!inTabs)}
      >
        <TabMark on={!inTabs} />
        More
      </button>
    </nav>
  )
}

function Tab({ href, label, on, live }: { href: string; label: string; on: boolean; live: boolean }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={tabClass(on)}>
      <TabMark on={on} />
      <span className="flex items-center gap-1.5">
        {live && <span aria-label="live" className="size-1.5 rounded-full bg-live" />}
        {label}
      </span>
    </Link>
  )
}

function TabMark({ on }: { on: boolean }) {
  return <span aria-hidden className={cn("h-1 w-8.5 rounded-full", on ? "bg-foreground" : "bg-transparent")} />
}

function tabClass(on: boolean) {
  return cn(
    "flex h-13.5 flex-col items-center justify-center gap-1.5 text-caption font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on ? "text-foreground" : "text-text-faint",
  )
}
