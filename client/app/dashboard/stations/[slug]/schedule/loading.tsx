import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HOURS = Array.from({ length: 13 }, (_, i) => i * 2)

/**
 * The Schedule page while it loads, in SchedulePlanner's geometry: the
 * header and the week (the day strip on a phone, the
 * grid from md). Constants — the title, day names, hour labels — are drawn
 * for real; change one file, change the other.
 */
export default function ScheduleLoading() {
  return (
    <div className="flex flex-col gap-5.5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <Skeleton className="h-12 rounded-control lg:hidden" />
      <PageHeader title="Schedule" description="What AutoDJ plays when you’re not live. Going live always takes over." />

      <Card>
        <CardHeader title="This week" />
        <div className="flex flex-col gap-4 md:hidden">
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((day) => (
              <Skeleton key={day} className="h-17 rounded-button" />
            ))}
          </div>
          <Skeleton className="h-16 rounded-control" />
          <Skeleton className="h-16 rounded-control" />
        </div>
        <div className="hidden grid-cols-[4.375rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 md:grid">
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
      </Card>
    </div>
  )
}
