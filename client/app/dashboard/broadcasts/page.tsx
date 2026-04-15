import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDuration(start: string, end: string): string {
  const seconds = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

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

  return (
    <div>
      <h1 className="text-2xl font-medium mb-6">Broadcasts</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs tracking-widest uppercase text-muted-foreground font-normal">
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

          {allSessions.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              No broadcasts yet. Go live to see your session history here.
            </div>
          ) : (
            allSessions.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[140px_1fr_100px_80px] px-3 py-2.5 border-t border-border text-sm"
              >
                <span className="text-muted-foreground">{formatDate(s.started_at)}</span>
                <Link
                  href={`/dashboard/stations/${s.stationSlug}`}
                  className="text-foreground no-underline hover:text-primary transition-colors truncate"
                >
                  {s.stationName}
                </Link>
                <span className="text-muted-foreground">{formatDuration(s.started_at, s.ended_at!)}</span>
                <span className="text-right text-muted-foreground">{s.peak_listeners}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
