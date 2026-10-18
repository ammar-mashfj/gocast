"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { ProTag } from "@/components/ds/Tag"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { AutoDjUpsell } from "../library/AutoDjUpsell"
import { Card, CardHeader } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HOURS = Array.from({ length: 13 }, (_, i) => i * 2)

/**
 * The Schedule page while it loads, in SchedulePlanner's geometry: the
 * header, the two "now" cards, and the week (the day strip on a phone, the
 * grid from md). Constants — the title, day names, hour labels — are drawn
 * for real; change one file, change the other. A free account also gets the
 * real Pro card, as the planner draws it, so nothing drops when it lands.
 */
export default function ScheduleLoading() {
  const locked = useAutoDjLocked()
  const station = useCurrentStation()

  return (
    <div className="flex flex-col gap-5.5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <Skeleton className="h-12 rounded-control lg:hidden" />
      <PageHeader
        title="Schedule"
        aside={locked ? <ProTag /> : undefined}
        description="What AutoDJ plays when you’re not live. Going live always takes over."
      />

      {locked && station && <AutoDjUpsell stationName={station.name} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18.75rem),1fr))] gap-5">
        <Skeleton className="h-28 rounded-panel" />
        <Skeleton className="h-28 rounded-panel" />
      </div>

      <Card>
        <CardHeader title="Every week" />
        <div className="flex flex-col gap-4 md:hidden">
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((day) => (
              <Skeleton key={day} className="h-17 rounded-button" />
            ))}
          </div>
          <Skeleton className="h-16 rounded-control" />
          <Skeleton className="h-16 rounded-control" />
        </div>
        {/* WeekGrid's min width + sideways scroll: without it the hour
            labels crowd into each other at tablet widths. */}
        <div className="-mx-1 hidden overflow-x-auto px-1 pb-1 md:block">
        <div className="grid min-w-[44rem] grid-cols-[4.375rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5">
          <span />
          <div className="relative mb-1 h-4 font-mono text-micro text-text-faint tabular-nums">
            {HOURS.map((h) => (
              <span
                key={h}
                className={h === 0 ? "absolute" : h === 24 ? "absolute -translate-x-full" : "absolute -translate-x-1/2"}
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {String(h % 24).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {DAYS.map((day) => (
            <div key={day} className="contents">
              <span className="self-center font-mono text-caption font-semibold tracking-widest text-muted-foreground uppercase">{day}</span>
              <Skeleton className="h-14.5 rounded-control" />
            </div>
          ))}
        </div>
        </div>
      </Card>
    </div>
  )
}
