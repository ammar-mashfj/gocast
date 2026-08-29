import { Card, CardContent } from "@/components/ui/card"
import { StreamSession } from "@/interfaces/StreamSession"
import { Station } from "@/interfaces/Station"
import { formatAirtime, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Two weeks: long enough to show a rhythm, short enough to fit without scrolling. */
const DAYS = 14

interface StationActivityProps {
  sessions: StreamSession[]
  stats: Station["stats"]
  /**
   * True when `/sessions` handed back a full page. The endpoint paginates at
   * 20 with no date filter, so a busy station's 14-day window can be cut off
   * mid-way — in which case the period-over-period comparison is arithmetic
   * on incomplete data and is suppressed rather than shown as fact.
   */
  truncated: boolean
}

/** Local-midnight key, so buckets survive DST without an hour of drift. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * Broadcast activity: four numbers and a two-week bar chart.
 *
 * Everything here is derived from StreamSession rows, and those exist ONLY for
 * human broadcasts — see the note on the interface. So this measures *live*
 * airtime, not the station's total time on air, and the card says so out loud
 * instead of letting an always-on AutoDJ station read as dead.
 *
 * Sessions are attributed to the day they STARTED. A broadcast running past
 * midnight therefore lands wholly in the earlier day, which is both what a
 * broadcaster means by "last night's show" and far less surprising than one
 * show appearing as two.
 */
export function StationActivity({ sessions, stats, truncated }: StationActivityProps) {
  const closed = sessions.filter((s) => s.ended_at)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const buckets = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() - (DAYS - 1 - i))
    return { date, seconds: 0 }
  })
  const index = new Map(buckets.map((b, i) => [dayKey(b.date), i]))

  const windowStart = buckets[0].date.getTime()
  const priorStart = new Date(buckets[0].date)
  priorStart.setDate(priorStart.getDate() - DAYS)

  let windowSeconds = 0
  let windowCount = 0
  let priorSeconds = 0

  for (const session of closed) {
    const started = new Date(session.started_at)
    const seconds = Math.max(
      0,
      Math.floor((new Date(session.ended_at!).getTime() - started.getTime()) / 1000),
    )

    const slot = index.get(dayKey(started))
    if (slot !== undefined) {
      buckets[slot].seconds += seconds
      windowSeconds += seconds
      windowCount += 1
    } else if (started.getTime() >= priorStart.getTime() && started.getTime() < windowStart) {
      priorSeconds += seconds
    }
  }

  const peak = Math.max(...buckets.map((b) => b.seconds), 1)
  const delta = windowSeconds - priorSeconds
  const averageSession = windowCount > 0 ? Math.round(windowSeconds / windowCount) : 0

  const metrics: Array<{ label: string; value: string; hint: string; hintClass?: string }> = [
    {
      label: "Live airtime",
      value: formatAirtime(windowSeconds),
      hint: truncated
        ? "last 14 days"
        : delta === 0
          ? "same as the prior 14 days"
          : `${delta > 0 ? "+" : "−"}${formatAirtime(Math.abs(delta))} vs prior 14d`,
      hintClass: truncated || delta === 0 ? undefined : delta > 0 ? "text-emerald-400" : "text-muted-foreground",
    },
    {
      label: "Broadcasts",
      value: String(windowCount),
      hint: windowCount > 0 ? `avg ${formatDuration(averageSession)} each` : "none in the last 14 days",
    },
    {
      label: "Peak listeners",
      value: String(stats?.peak_listeners ?? 0),
      hint: (stats?.peak_listeners ?? 0) > 0 ? "concurrent, all time" : "share your link to grow",
    },
    {
      label: "Total airtime",
      value: formatAirtime(stats?.total_airtime_seconds ?? 0),
      hint: `${stats?.sessions ?? 0} broadcast${(stats?.sessions ?? 0) === 1 ? "" : "s"}, all time`,
    },
  ]

  const axis = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  return (
    <Card>
      <CardContent className="pt-1">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-base font-medium">Broadcast activity</h2>
          <span className="text-xs text-muted-foreground">Last 14 days</span>
        </div>

        <div className="grid grid-cols-2 gap-5 md:grid-cols-4 mb-6">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">{m.label}</div>
              <div className="text-2xl font-medium tracking-tight">{m.value}</div>
              <div className={cn("text-xs text-muted-foreground", m.hintClass)}>{m.hint}</div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-1.5 h-20" aria-hidden="true">
          {buckets.map((b) => (
            <div
              key={b.date.toISOString()}
              title={`${axis(b.date)} — ${b.seconds > 0 ? formatAirtime(b.seconds) : "no live airtime"}`}
              className={cn(
                "flex-1 rounded-sm",
                b.seconds > 0 ? "bg-gradient-to-b from-primary to-primary/50" : "bg-muted",
              )}
              style={{ height: `${Math.max(4, Math.round((b.seconds / peak) * 80))}px` }}
            />
          ))}
        </div>

        <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
          <span>{axis(buckets[0].date)}</span>
          <span>{axis(buckets[Math.floor(DAYS / 2)].date)}</span>
          <span>Today</span>
        </div>

        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          Live broadcasts only — time on air with the AutoDJ rotation isn&apos;t recorded
          as a session, so it doesn&apos;t appear here.
        </p>
      </CardContent>
    </Card>
  )
}
