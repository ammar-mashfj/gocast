"use client"

import type { StreamSession } from "@/interfaces/StreamSession"
import { useMounted } from "@/hooks/useMounted"
import { formatAirtime } from "@/lib/format"
import { liveShows } from "@/lib/liveShows"
import { cn } from "@/lib/utils"
import { Card, CardHeader } from "@/components/ds/Card"
import { Stat } from "@/components/ds/Stat"

const axis = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", day: "numeric" }).toUpperCase()

/**
 * The last 14 days of live shows: time on air (and how it compares with the
 * 14 before), how many shows and how long they ran, the peak and when, and a
 * bar per day. Only live time counts — AutoDJ hours are in Audience, and the
 * card says so.
 */
export function LiveShowsCard({ sessions, truncated }: { sessions: StreamSession[]; truncated: boolean }) {
  const mounted = useMounted()
  if (!mounted) return <Card className="min-h-80" aria-busy />

  const r = liveShows(sessions, new Date(), truncated)
  const most = Math.max(1, ...r.days.map((d) => d.seconds))

  return (
    <Card className="gap-4.5">
      <CardHeader title="Your live shows" aside="Last 14 days" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
        <Stat
          label="On air"
          value={formatAirtime(r.seconds)}
          sub={
            r.delta === null
              ? "last 14 days"
              : r.delta === 0
                ? "same as the 14 days before"
                : `${r.delta > 0 ? "+" : "−"}${formatAirtime(Math.abs(r.delta))} vs the 14 days before`
          }
          trend={r.delta !== null && r.delta > 0 ? "up" : "flat"}
        />
        <Stat label="Shows" value={r.count} sub={r.count > 0 ? `about ${formatAirtime(r.average)} each` : "none in these 14 days"} />
        <Stat
          label="Peak"
          value={r.peak?.listeners ?? 0}
          sub={r.peak ? `listening at once, ${r.peak.at.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}` : "nobody tuned in yet"}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-27.5 items-end gap-1.25" role="img" aria-label={`Live time per day over the last 14 days, ${formatAirtime(r.seconds)} in all`}>
          {r.days.map((d, i) => (
            <div
              key={d.date.toISOString()}
              title={`${axis(d.date)} — ${d.seconds > 0 ? `${formatAirtime(d.seconds)} live` : "no show"}`}
              className={cn(
                "flex-1 rounded-swatch",
                d.seconds === 0 ? "bg-surface-control" : i === r.latest ? "bg-foreground" : "bg-muted-foreground",
              )}
              style={{ height: d.seconds === 0 ? 3 : `${Math.max(6, (d.seconds / most) * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between font-mono text-micro tracking-wider text-text-faint">
          <span>{axis(r.days[0].date)}</span>
          <span>{axis(r.days[7].date)}</span>
          <span>TODAY</span>
        </div>
      </div>

      <p className="text-body-sm text-text-faint">Only time you were live counts here. AutoDJ hours show up in Audience.</p>
    </Card>
  )
}
