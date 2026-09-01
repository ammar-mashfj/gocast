"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useStationBySlug } from "@/contexts/StationContext"

// No entry for "stations": it is a path segment, not a destination. There is
// one station per user and no list to go back to, so the crumb is dropped and
// the station's own name becomes the root — see buildCrumbs.
const SEGMENT_LABELS: Record<string, string> = {
  broadcasts: "Broadcasts",
  settings: "Settings",
  library: "AutoDJ",
  live: "Go live",
  studio: "Studio",
}

export function DashboardHeader() {
  const pathname = usePathname()

  // Extract path segments after /dashboard
  const segments = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean)

  // Detect station slug: segments = ["stations", slug, ...rest]
  const stationSlug = segments[0] === "stations" && segments[1] ? segments[1] : null

  // Read, don't fetch. This used to `GET /stations/{slug}` from the browser on
  // mount and render a Skeleton until it answered — so the one piece of text
  // the user is looking for was the last thing to appear, on every fresh load
  // and after every hard refresh, and it flashed again whenever the request
  // was slow. The layout already resolves the station server-side, so the name
  // is in the first HTML the browser receives and there is nothing to wait for.
  const station = useStationBySlug(stationSlug)

  // Build breadcrumb items from segments.
  function buildCrumbs(): { label: string; href: string }[] {
    const crumbs: { label: string; href: string }[] = []
    let href = "/dashboard"

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      href += `/${seg}`

      // Skipped, not labelled: /dashboard/stations exists only as a redirect
      // now, so a crumb pointing at it would bounce the user to the page they
      // are already on.
      if (segments[0] === "stations" && i === 0) {
        continue
      }

      if (segments[0] === "stations" && i === 1) {
        // Falls back to the slug rather than to a placeholder. This only
        // happens when the layout's lookup failed or the URL names a station
        // that is not the one this account resolves to, and in both cases the
        // slug is the truthful thing to show — it is what the user typed, and
        // it is readable. An empty crumb would just look broken.
        crumbs.push({ label: station?.name ?? seg, href })
        continue
      }

      crumbs.push({ label: SEGMENT_LABELS[seg] ?? seg, href })
    }

    return crumbs
  }

  const crumbs = buildCrumbs()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />

      {crumbs.length > 0 && (
        <>
          <Separator orientation="vertical" className="mx-1 !h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1
                return (
                  <Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="text-sm">{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href} className="text-sm">{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}
    </header>
  )
}
