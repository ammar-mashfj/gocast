"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCalendarTime, IconPlaylist } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * Music · Schedule, on both pages, so the pair is always visible together.
 * The sidebar's single AutoDJ item lights up for either.
 *
 * "Music" rather than "Playlists" because the page behind it holds both the
 * file library and the playlists built from it, and the rail inside labels
 * those two sections. Calling the whole tab Playlists hid the library and
 * left the page headed AutoDJ under a tab headed something else. The pair
 * now reads as what plays and when it plays.
 */
export function AutoDjTabs({ slug }: { slug: string }) {
  const pathname = usePathname()

  const tabs = [
    { href: `/dashboard/stations/${slug}/library`, label: "Music", icon: IconPlaylist },
    { href: `/dashboard/stations/${slug}/schedule`, label: "Schedule", icon: IconCalendarTime },
  ]

  return (
    <nav aria-label="AutoDJ sections" className="flex items-center gap-1 border-b border-border mb-5">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm -mb-px border-b-2 no-underline transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon size={15} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
