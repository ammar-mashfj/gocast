"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { AutoDjTabs } from "@/components/dashboard/AutoDjTabs"
import { useStationBySlug } from "@/contexts/StationContext"

/** Mon…Sun, matching WeekStrip's row labels. */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/**
 * The Schedule page while the station and its playlists are in flight.
 *
 * Paired with `../library/loading.tsx`: the back link, the tab strip and the
 * heading are identical in both, so switching between the two tabs moves
 * nothing above the fold — only the body swaps. Without this file the tab
 * switch fell back to the station overview's skeleton and the whole page
 * appeared to change into something else and back again.
 *
 * The heading and its description are static copy, so they are rendered for
 * real rather than as grey bars. What is pending is the on-now line, the
 * timezone, the slot rows and the week strip.
 */
export default function ScheduleLoading() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""
  const station = useStationBySlug(slug)

  return (
    <div>
      <Link
        href={`/dashboard/stations/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        {station ? `Back to ${station.name}` : "Back"}
      </Link>

      <AutoDjTabs slug={slug} />

      <div className="flex flex-col gap-2 mb-6">
        <h1 className="text-2xl font-medium">Schedule</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Play different playlists at different times of the week. This is separate from the show
          times on your settings page, which only tell listeners when you&apos;re live.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* On now */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <Skeleton className="size-9 rounded-md shrink-0" />
          <div className="min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        </div>

        {/* Timezone field */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>

        {/* Slot rows */}
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-9 flex-1 min-w-[160px]" />
                <Skeleton className="h-9 w-48" />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-9 w-28 shrink-0" />
                  <span className="text-muted-foreground text-xs">→</span>
                  <Skeleton className="h-9 w-28 shrink-0" />
                </div>
                <Skeleton className="size-9 shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {DAYS.map((day) => (
                  <Skeleton key={day} className="size-8 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add slot · Save schedule */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>

        {/* This week */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            This week
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
              <span />
              <Skeleton className="h-3 w-full" />
              {DAYS.map((day) => (
                <div key={day} className="contents">
                  <span className="text-xs text-muted-foreground self-center">{day}</span>
                  <Skeleton className="h-6 rounded" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
