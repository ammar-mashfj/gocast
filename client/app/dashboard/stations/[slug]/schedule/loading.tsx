import { Skeleton } from "@/components/ui/skeleton"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

/** Sun…Sat, matching WeekStrip's row labels — its week starts on Sunday. */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** The hour ticks over the week strip; fixed, so drawn as text. */
const HOURS = [0, 6, 12, 18, 24]

/**
 * The Schedule page while the station and its playlists are in flight.
 *
 * Copies SchedulePlanner's shape rather than suggesting it: the heading, the
 * week strip (Sunday first), the timezone field, then the two lanes — "When
 * you're live" and "What AutoDJ plays" — each opened by a hairline. Static
 * copy is text; what is pending is the strip's bars and each lane's rows.
 *
 * No "On now" line: it only renders for AutoDJ plans, and a placeholder for
 * it would make every Free station's page jump up on arrival.
 */
export default function ScheduleLoading() {
  return (
    // The Skeleton primitive pulses unconditionally; stopping it here keeps
    // the page still for anyone who asked for reduced motion.
    <div className="sheet max-w-4xl motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <div className="mb-8 flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground max-w-[62ch]">
          Your station&apos;s week: when you go live, and what AutoDJ plays the rest of the time.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">This week</h2>
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
            <span />
            <div className="relative h-4 text-[11px] text-muted-foreground tabular-nums">
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
            {DAYS.map((day) => (
              <div key={day} className="contents">
                <span className="text-xs text-muted-foreground self-center">{day}</span>
                <Skeleton className="h-6 rounded" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <Field className="max-w-md">
          <FieldLabel>Timezone</FieldLabel>
          <Skeleton className="h-9 w-full" />
          <FieldDescription>
            The clock everything on this page is written in. Listeners see your show times in
            their own.
          </FieldDescription>
        </Field>

        {[
          { title: "When you’re live", dot: "bg-live" },
          { title: "What AutoDJ plays", dot: "bg-on-air" },
        ].map((lane) => (
          <div key={lane.title} className="flex flex-col gap-4 border-t border-white/[0.07] pt-6">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <span className={`size-2 rounded-full ${lane.dot}`} aria-hidden="true" />
              {lane.title}
            </h2>
            <Skeleton className="h-4 w-full max-w-[40rem]" />
            <div className="flex flex-col gap-3 border-y border-white/[0.06] py-4">
              <Skeleton className="h-9 w-full" />
              <div className="flex flex-wrap items-center gap-2">
                {DAYS.map((day) => (
                  <Skeleton key={day} className="size-9 rounded-full" />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
