"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AUTODJ_ITEMS, activeNav } from "@/lib/dashboardNav"
import { cn } from "@/lib/utils"

/**
 * Library · Playlists · Jingles · Schedule, as a row of links at the top of each
 * AutoDJ page. Below 1024px only: there the sidebar is a drawer, and the
 * phone's tab bar has one AutoDJ tab for all four, so this is how you move
 * between them. Wide screens have the sidebar's group for it.
 *
 * Links, not the Segmented radio group: each section is its own page.
 *
 * Columns of minmax(0,1fr), not plain 1fr: 1fr can't go narrower than its
 * text, and four labels at 3 padding pushed a 390px phone's page wider than
 * the screen, so every fixed sheet and scroll lock went off to the right.
 */
export function AutoDjSections({ slug, className }: { slug: string; className?: string }) {
  const active = activeNav(usePathname() ?? "")
  return (
    <nav
      aria-label="AutoDJ"
      className={cn("grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-0.75 rounded-control bg-surface-inset p-1 lg:hidden", className)}
    >
      {AUTODJ_ITEMS.map((item) => {
        const on = item.key === active
        return (
          <Link
            key={item.key}
            href={item.stationHref!(slug)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 min-w-0 items-center justify-center truncate rounded-item px-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
