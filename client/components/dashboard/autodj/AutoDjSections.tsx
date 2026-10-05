"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AUTODJ_ITEMS, activeNav } from "@/lib/dashboardNav"
import { cn } from "@/lib/utils"

/**
 * Library · Playlists · Schedule, as a row of links at the top of each
 * AutoDJ page. Below 1024px only: there the sidebar is a drawer, and the
 * phone's tab bar has one AutoDJ tab for all four, so this is how you move
 * between them. Wide screens have the sidebar's group for it.
 *
 * Links, not the Segmented radio group: each section is its own page.
 */
export function AutoDjSections({ slug, className }: { slug: string; className?: string }) {
  const active = activeNav(usePathname() ?? "")
  return (
    <nav
      aria-label="AutoDJ"
      className={cn("grid auto-cols-fr grid-flow-col gap-0.75 rounded-control bg-surface-inset p-1 lg:hidden", className)}
    >
      {AUTODJ_ITEMS.map((item) => {
        const on = item.key === active
        return (
          <Link
            key={item.key}
            href={item.stationHref!(slug)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center rounded-item px-3 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
