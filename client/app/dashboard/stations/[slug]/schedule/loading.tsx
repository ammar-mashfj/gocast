import { Skeleton } from "@/components/ui/skeleton"

/** Monday first, matching WeekGrid's rows. */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** The hour labels over the grid, every two hours as WeekGrid draws them. */
const HOURS = Array.from({ length: 13 }, (_, i) => i * 2)

/**
 * The Schedule page while the station and its playlists are in flight.
 *
 * Copies SchedulePlanner's shape: the heading with the save state beside it,
 * the status banner, then the week grid card. Static copy is text; what is
 * pending is the banner's reading and the grid's slots.
 */
export default function ScheduleLoading() {
  return (
    // The Skeleton primitive pulses unconditionally; stopping it here keeps
    // the page still for anyone who asked for reduced motion.
    <div className="sheet motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Schedule</h1>
            <p className="text-sm text-muted-foreground max-w-[62ch]">
              What plays when you&apos;re not live. Going live always takes over.
            </p>
          </div>
          <Skeleton className="h-4 w-44" />
        </div>

        <Skeleton className="h-[4.5rem] w-full rounded-xl" />

        <div className="flex flex-col gap-4 rounded-xl border border-white/[0.07] bg-panel p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">This week</h2>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-1.5">
            <span />
            <div className="relative mb-1 h-4 font-mono text-[10.5px] text-muted-foreground tabular-nums">
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
                <span className="self-center text-xs text-muted-foreground">{day}</span>
                <Skeleton className="h-12 rounded-md" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </div>
    </div>
  )
}
