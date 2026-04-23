import { notFound } from "next/navigation"
import Link from "next/link"
import { IconHistory } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { formatDate, formatDateRange } from "@/lib/format"

export default async function BroadcastsPage() {
  let stations: Station[]

  try {
    const res = await apiFetch<{ data: Station[] }>("/stations")
    stations = res.data
  } catch {
    notFound()
  }

  // Fetch sessions for all stations in parallel
  const sessionsPerStation = await Promise.all(
    stations.map(async (station) => {
      try {
        const res = await apiFetch<{ data: StreamSession[] }>(`/stations/${station.slug}/sessions`)
        return res.data
          .filter((s) => s.ended_at)
          .map((s) => ({ ...s, stationName: station.name, stationSlug: station.slug }))
      } catch {
        return []
      }
    }),
  )

  // Flatten and sort by most recent first
  const allSessions = sessionsPerStation
    .flat()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  if (allSessions.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-medium mb-6">Broadcasts</h1>
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <IconHistory size={48} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-lg">No broadcasts yet</EmptyTitle>
            <EmptyDescription className="text-sm">
              Once you go live, every session shows up here with its duration and peak audience.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link href="/dashboard/stations">Pick a station to broadcast</Link>
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-medium mb-6">Broadcasts</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            All broadcast sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[140px_1fr_100px_80px] px-3 py-2 text-xs text-muted-foreground tracking-wide uppercase">
            <span>Date</span>
            <span>Station</span>
            <span>Duration</span>
            <span className="text-right">Peak</span>
          </div>
          <Separator />

          {allSessions.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[140px_1fr_100px_80px] px-3 py-2.5 border-t border-border text-sm"
            >
              <span className="text-muted-foreground">{formatDate(s.started_at, "short")}</span>
              <Link
                href={`/dashboard/stations/${s.stationSlug}`}
                className="text-foreground no-underline hover:text-primary transition-colors truncate"
              >
                {s.stationName}
              </Link>
              <span className="text-muted-foreground">{formatDateRange(s.started_at, s.ended_at!)}</span>
              <span className="text-right text-muted-foreground">{s.peak_listeners}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
