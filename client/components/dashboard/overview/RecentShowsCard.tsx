"use client"

import type { StreamSession } from "@/interfaces/StreamSession"
import { formatAirtime } from "@/lib/format"
import { Card, CardHeader, CardLink } from "@/components/ds/Card"
import { List } from "@/components/ds/List"

const SHOWN = 5

/** Where a show came from, as a broadcaster would say it. */
export function showSource(s: Pick<StreamSession, "source_type" | "client">): string {
  if (s.source_type === "external") return s.client ? `From ${s.client}` : "From your DJ software"
  if (s.source_type === "electron") return "From the desktop app"
  return "From the studio"
}

/**
 * The last few shows: when, from where, how long, and the most listening at
 * once. A show still running is listed — it's the row most likely to be
 * looked for — as "On air now". Times are on the station's clock, like Your
 * shows and the top bar, so the same show reads the same everywhere.
 */
export function RecentShowsCard({ sessions, timeZone }: { sessions: StreamSession[]; timeZone: string | null }) {
  const shown = sessions.slice(0, SHOWN)
  const tz = timeZone ?? "UTC"
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })

  return (
    <Card className="gap-1.5">
      <CardHeader title="Recent shows" aside={<CardLink href="/dashboard/broadcasts">All shows →</CardLink>} className="mb-2" />
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shows yet. Your first one will be listed here.</p>
      ) : (
        <List>
          {shown.map((s) => {
            const started = new Date(s.started_at)
            return (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 py-3">
                <span className="flex min-w-0 flex-col gap-0.75">
                  <span className="truncate text-sm font-semibold">
                    {day.format(started)} · {clock.format(started)}
                  </span>
                  <span className="truncate text-caption text-text-faint">{showSource(s)}</span>
                </span>
                <span className="font-mono text-body-sm text-muted-foreground tabular-nums">
                  {s.ended_at ? formatAirtime(Math.round((new Date(s.ended_at).getTime() - started.getTime()) / 1000)) : <span className="text-live-text">On air now</span>}
                </span>
                <span className="text-right font-mono text-sm font-semibold tabular-nums" title="Most listening at once">
                  {s.peak_listeners}
                </span>
              </li>
            )
          })}
        </List>
      )}
    </Card>
  )
}
