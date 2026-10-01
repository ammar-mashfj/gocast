import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { apiFetch } from "@/lib/api-server"
import { getMyStation } from "@/lib/station-server"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Card, CardContent } from "@/components/ui/card"
import { SOURCE_LABEL } from "@/components/dashboard/RecentBroadcasts"
import { Button } from "@/components/ui/button"
import { StationActions } from "../stations/[slug]/StationActions"
import { formatAirtime, formatDateRange, formatDateTime } from "@/lib/format"

/**
 * Shared by the head row and every body row (and by loading.tsx's copy), so
 * the columns line up. On a phone the source column drops out and the
 * duration cell stacks its figure over its bar.
 */
const ROW =
  "grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] md:grid-cols-[11rem_6rem_minmax(0,1fr)_7rem] gap-3 px-3"

/**
 * The latest finished broadcasts on the user's station (one API page), newest first.
 *
 * This used to fan out across all of the user's stations and tag each row
 * with the station it belonged to. With one station per user both the
 * fan-out and the column are noise — every row would carry the same name.
 */
// Its own tab title: every dashboard tab used to read the marketing title,
// so history and open tabs were indistinguishable.
export const metadata: Metadata = { title: "Broadcasts" }

export default async function BroadcastsPage() {
  let station: Station | null
  let sessions: StreamSession[]
  // The endpoint pages at 20, so the list is the latest shows, not all of
  // them. `total` is what lets the summary say so instead of passing a page
  // off as the station's history (it read "19 shows" beside "88 all time").
  let total = 0

  try {
    station = await getMyStation()
    const res = station
      ? await apiFetch<{ data: StreamSession[]; total?: number }>(`/stations/${station.slug}/sessions`)
      : { data: [] as StreamSession[], total: 0 }
    sessions = res.data
    total = res.total ?? res.data.length
  } catch {
    notFound()
  }

  const finished = sessions
    .filter((s) => s.ended_at)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  // No stock empty state: a left-aligned page in the dashboard's own shape,
  // like the create-your-station page, with the one action that fills it.
  if (finished.length === 0) {
    return (
      <div className="flex max-w-2xl flex-col items-start gap-5">
        <div>
          <h1 className="font-display text-[34px] font-extrabold leading-9 tracking-[-0.04em]">Broadcasts</h1>
          <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Nothing on the log yet. Every time you go live, the show lands here with
            how long you were on and the most people listening at once.
          </p>
        </div>
        {station ? (
          <StationActions station={station} mode="live" />
        ) : (
          <Button asChild>
            <Link href="/dashboard">Create your station</Link>
          </Button>
        )}
      </div>
    )
  }

  // Every row is a person on the mic — a session is only written for a human
  // broadcaster (see StreamSession) — so each duration is drawn as an
  // live-red bar, the same live bar as Broadcast activity on the overview,
  // scaled to the longest show on the list — but never to more than three
  // hours, so one forgotten all-day tab can't flatten every real show into a
  // sliver. Anything longer simply fills the track.
  const seconds = (s: StreamSession) =>
    Math.max(0, (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000)
  const longest = Math.min(3 * 3600, Math.max(1, ...finished.map(seconds)))
  const totalLive = finished.reduce((sum, s) => sum + seconds(s), 0)
  const last = finished[0]

  return (
    // Cards on the page, like the rest of the dashboard (no `.sheet`).
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[34px] font-extrabold leading-9 tracking-[-0.04em]">Broadcasts</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {total > sessions.length ? (
            <>
              Your latest {finished.length} shows · {formatAirtime(Math.floor(totalLive))} live across them
            </>
          ) : (
            <>
              {finished.length} {finished.length === 1 ? "show" : "shows"} · {formatAirtime(Math.floor(totalLive))} live in total
            </>
          )}
        </p>
      </div>

      {/* The most recent show, at a glance. The list answers "what have I
          done", but what someone opening this page after a show wants first
          is "how did last night go" — one row of figures, before the table. */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-faint">Last show</div>
            <div className="mt-1.5 font-mono text-sm tabular-nums">{formatDateTime(last.started_at)}</div>
          </div>
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-faint">On air</div>
            <div className="mt-1.5 font-display text-[26px] font-bold leading-none tabular-nums">{formatDateRange(last.started_at, last.ended_at!)}</div>
          </div>
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-faint">Peak listeners</div>
            <div className="mt-1.5 font-display text-[26px] font-bold leading-none tabular-nums">{last.peak_listeners}</div>
          </div>
          <div className="hidden sm:block">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-faint">Source</div>
            <div className="mt-1.5 truncate text-sm font-semibold" title={last.client ?? undefined}>
              {SOURCE_LABEL[last.source_type] ?? last.source_type}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {/* Sentence-case column heads, not tracked caps: the design system
              keeps uppercase for the ON AIR / LIVE state words alone. The
              rows below carry their own top hairline, so no Separator — the
              two stacked drew a double rule under the header. Start time and
              source, like the overview's Recent broadcasts: a date alone left
              four identical "Sep 26" rows nobody could tell apart. */}
          <div className={`${ROW} py-2 text-xs text-muted-foreground`}>
            <span>Started</span>
            <span className="hidden md:block">Source</span>
            <span>On air</span>
            <span className="text-right">
              <span className="md:hidden">Peak</span>
              <span className="hidden md:inline">Peak listeners</span>
            </span>
          </div>

          {finished.map((s) => {
            const share = Math.min(100, (seconds(s) / longest) * 100)
            return (
              <div
                key={s.id}
                className={`${ROW} items-center py-2.5 border-t border-border text-sm`}
              >
                <span className="truncate font-mono tabular-nums">{formatDateTime(s.started_at)}</span>
                <span className="hidden text-muted-foreground md:block" title={s.client ?? undefined}>
                  {SOURCE_LABEL[s.source_type] ?? s.source_type}
                </span>
                <span className="flex min-w-0 flex-col gap-1 md:flex-row-reverse md:items-center md:gap-3">
                  <span className="font-mono tabular-nums text-muted-foreground md:w-16 md:shrink-0">
                    {formatDateRange(s.started_at, s.ended_at!)}
                  </span>
                  {/* The mobile Recent shows bar: live red on the dark track. */}
                  <span className="block h-[5px] w-full overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
                    <span
                      className="block h-full bg-live"
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                  </span>
                </span>
                {/* Onest, not mono: a count of people is not a machine value. */}
                <span className="text-right tabular-nums text-muted-foreground">{s.peak_listeners}</span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
