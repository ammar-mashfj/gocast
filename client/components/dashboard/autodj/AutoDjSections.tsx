"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AUTODJ_ITEMS, activeNav, inAutoDj } from "@/lib/dashboardNav"
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
/**
 * The strip as the station layout renders it: only on the four AutoDJ pages,
 * and outside them, so it stays put while the next one loads. Inside each
 * page it was swapped for that page's loading skeleton on every tap.
 */
export function AutoDjTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? ""
  if (!inAutoDj(activeNav(pathname))) return null
  return <AutoDjSections slug={slug} className="mb-5.5" />
}

export function AutoDjSections({ slug, className }: { slug: string; className?: string }) {
  const pathname = usePathname() ?? ""
  const active = activeNav(pathname)
  // The tapped tab lights up at once, not when the next page has loaded:
  // on a slow connection the old one stayed lit and the tap looked ignored.
  // Cleared when the path changes (render-time reset, no effect needed).
  const [pending, setPending] = useState<{ key: string; from: string } | null>(null)
  if (pending && pending.from !== pathname) setPending(null)
  const lit = pending?.key ?? active
  return (
    <nav
      aria-label="AutoDJ"
      className={cn("grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-0.75 rounded-control bg-surface-inset p-1 lg:hidden", className)}
    >
      {AUTODJ_ITEMS.map((item) => {
        const on = item.key === lit
        return (
          <Link
            key={item.key}
            href={item.stationHref!(slug)}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => item.key !== active && setPending({ key: item.key, from: pathname })}
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
