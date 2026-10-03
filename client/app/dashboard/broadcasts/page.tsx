import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { apiFetch, redirectIfSessionExpired } from "@/lib/api-server"
import { getMyStation } from "@/lib/station-server"
import type { Station } from "@/interfaces/Station"
import { formatAirtime } from "@/lib/format"
import { showsTrend } from "@/lib/showsTrend"
import { Button } from "@/components/ds/Button"
import { PageHeader } from "@/components/ds/PageHeader"
import { ShowsList, type ShowsPage } from "@/components/dashboard/shows/ShowsList"

export const metadata: Metadata = { title: "Your shows" }

type SessionsResponse = ShowsPage & { summary: { shows: number; live_seconds: number } }

/**
 * Your shows: every time someone was on the mic, newest first. AutoDJ airs
 * write no rows (see StreamSession), so this is live time only.
 *
 * The summary counts every past show (the API adds it up), and the trend
 * sentence compares the latest shows with the ones before — see showsTrend
 * for what it will and won't say.
 */
export default async function YourShowsPage() {
  let station: Station | null
  let res: SessionsResponse | null = null

  try {
    station = await getMyStation()
    if (station) res = await apiFetch<SessionsResponse>(`/stations/${station.slug}/sessions?finished=1`)
  } catch (err) {
    redirectIfSessionExpired(err)
    notFound()
  }

  if (!station || !res || res.data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5">
        <PageHeader
          title="Your shows"
          description="Nothing here yet. Every time you go live, the show lands here with how long you were on and the most people listening at once."
        />
        <Button asChild>
          <Link href={station ? `/dashboard/stations/${station.slug}/live` : "/dashboard"}>{station ? "Go live" : "Create your station"}</Link>
        </Button>
      </div>
    )
  }

  const { shows, live_seconds } = res.summary
  const trend = showsTrend(
    res.data.map((s) => ({
      seconds: Math.max(0, (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000),
      peak: s.peak_listeners,
    })),
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Your shows"
        description={
          <>
            <span className="tabular-nums">
              {shows} {shows === 1 ? "show" : "shows"} · {formatAirtime(live_seconds)} live in total.
            </span>
            {trend && ` ${trend}`}
          </>
        }
      />
      <ShowsList slug={station.slug} timeZone={station.timezone} initial={res} />
    </div>
  )
}
