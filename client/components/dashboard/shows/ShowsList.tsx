"use client"

import { useId, useState } from "react"
import api from "@/lib/axios"
import type { StreamSession, StreamSessionSource } from "@/interfaces/StreamSession"
import { formatAirtime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { StatTile } from "@/components/ds/Stat"

/** Where a show came from, in the FROM column. */
const FROM: Record<StreamSessionSource, string> = {
  browser: "Studio",
  electron: "Desktop app",
  external: "Own software",
}

/**
 * Shared by the head row and every show row, so the columns line up. On a
 * phone FROM drops out (it's in the opened row instead).
 */
const COLUMNS = "grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] gap-4 px-5.5 md:grid-cols-[10rem_7rem_minmax(0,1fr)_4rem]"

/** One forgotten all-day tab can't flatten every real show into a sliver. */
const BAR_CAP = 3 * 3600

export interface ShowsPage {
  data: StreamSession[]
  current_page: number
  last_page: number
}

const seconds = (s: StreamSession) => Math.max(0, (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000)

/**
 * Past shows, newest first: when, from where, how long (an off-white bar,
 * because red means live right now and these aren't), and the most people
 * listening at once. Opening a row says when that peak was. "Show more"
 * fetches the next 20.
 *
 * Times are on the station's clock, like the top bar's.
 */
export function ShowsList({ slug, timeZone, initial }: { slug: string; timeZone: string | null; initial: ShowsPage }) {
  const [shows, setShows] = useState(initial.data)
  const [page, setPage] = useState(initial.current_page)
  const [lastPage, setLastPage] = useState(initial.last_page)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const longest = Math.min(BAR_CAP, Math.max(1, ...shows.map(seconds)))
  const tz = timeZone ?? "UTC"

  const more = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const { data } = await api.get<ShowsPage>(`/stations/${slug}/sessions`, { params: { finished: 1, page: page + 1 } })
      // A show that finished since the first page pushes every row down one,
      // so the next page can repeat the last row seen.
      setShows((prev) => [...prev, ...data.data.filter((s) => !prev.some((p) => p.id === s.id))])
      setPage(data.current_page)
      setLastPage(data.last_page)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="none" className="gap-0 overflow-hidden rounded-panel">
        <div className={cn(COLUMNS, "py-3.5 eyebrow-sm text-text-faint")} aria-hidden>
          <span>Started</span>
          <span className="hidden md:block">From</span>
          <span>On air</span>
          <span className="text-right">Peak</span>
        </div>
        <ul>
          {shows.map((s) => (
            <ShowRow
              key={s.id}
              show={s}
              timeZone={tz}
              share={Math.min(100, (seconds(s) / longest) * 100)}
              open={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
            />
          ))}
        </ul>
      </Card>

      {page < lastPage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="subtle" onClick={more} disabled={loading}>
            {loading ? "Loading…" : "Show more"}
          </Button>
          {failed && (
            <span role="alert" className="text-body-sm text-fault-text">
              Couldn’t load more shows. Try again.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ShowRow({
  show,
  timeZone,
  share,
  open,
  onToggle,
}: {
  show: StreamSession
  timeZone: string
  share: number
  open: boolean
  onToggle: () => void
}) {
  const panel = useId()
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" })
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" })
  const started = new Date(show.started_at)

  return (
    <li className={cn("border-t border-line", open && "bg-surface-raised")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panel}
        className={cn(
          COLUMNS,
          "w-full cursor-pointer items-center py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          !open && "hover:bg-surface-raised",
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.75">
          <span className="truncate text-body font-semibold">{day.format(started)}</span>
          <span className="truncate font-mono text-caption text-text-faint tabular-nums">
            {clock.format(started)} – {clock.format(new Date(show.ended_at!))}
          </span>
        </span>
        <span className="hidden truncate text-sm text-muted-foreground md:block">{FROM[show.source_type] ?? show.source_type}</span>
        <span className="flex min-w-0 flex-col gap-1.5 md:flex-row-reverse md:items-center md:gap-3">
          <span className="font-mono text-body-sm text-muted-foreground tabular-nums md:w-16 md:shrink-0">{formatAirtime(Math.round(seconds(show)))}</span>
          <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-control">
            <span className="block h-full rounded-full bg-foreground" style={{ width: `${Math.max(share, 2)}%` }} />
          </span>
        </span>
        <span className="text-right font-mono text-body font-bold tabular-nums">
          {show.peak_listeners}
          <span className="sr-only"> at once at most</span>
        </span>
      </button>

      {open && (
        <div id={panel} className="grid grid-cols-2 gap-2.5 px-5.5 pb-4.5">
          <StatTile
            className="bg-surface-inset"
            label="Peak at"
            value={show.peak_at ? clock.format(new Date(show.peak_at)) : "—"}
            sub={
              show.peak_at
                ? `${show.peak_listeners} listening at once`
                : show.peak_listeners === 0
                  ? "Nobody tuned in"
                  : "Not recorded for older shows"
            }
          />
          <StatTile
            className="bg-surface-inset"
            label="From"
            value={FROM[show.source_type] ?? show.source_type}
            sub={show.source_type === "external" && show.client ? show.client : undefined}
          />
        </div>
      )}
    </li>
  )
}
