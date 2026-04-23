"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import api from "@/lib/axios"

const SEGMENT_LABELS: Record<string, string> = {
  stations: "Stations",
  broadcasts: "Broadcasts",
  settings: "Settings",
  live: "Go live",
  studio: "Studio",
}

export function DashboardHeader() {
  const pathname = usePathname()
  const [stationName, setStationName] = useState<string | null>(null)

  // Extract path segments after /dashboard
  const segments = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean)

  // Detect station slug: segments = ["stations", slug, ...rest]
  const stationSlug = segments[0] === "stations" && segments[1] ? segments[1] : null

  useEffect(() => {
    if (!stationSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStationName(null)
      return
    }
    api.get(`/stations/${stationSlug}`).then((res) => {
      setStationName(res.data.data.name)
    }).catch(() => {
      setStationName(stationSlug)
    })
  }, [stationSlug])

  // Build breadcrumb items from segments. Mark the station-name crumb as
  // `pending` so the renderer can show a Skeleton instead of flashing the raw slug.
  function buildCrumbs(): { label: string; href: string; pending?: boolean }[] {
    const crumbs: { label: string; href: string; pending?: boolean }[] = []
    let href = "/dashboard"

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      href += `/${seg}`

      if (segments[0] === "stations" && i === 1) {
        crumbs.push({ label: stationName ?? "", href, pending: !stationName })
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
                const label = crumb.pending
                  ? <Skeleton className="h-4 w-24 inline-block align-middle" />
                  : crumb.label
                return (
                  <Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="text-sm">{label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href} className="text-sm">{label}</Link>
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
