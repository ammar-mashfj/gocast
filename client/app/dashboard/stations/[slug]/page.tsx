import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft, IconExternalLink, IconArrowRight } from "@tabler/icons-react"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CopyButton } from "@/components/dashboard/CopyButton"
import { StationArtwork } from "@/components/StationArtwork"
import { formatDate, formatAirtime, formatDateRange } from "@/lib/format"
import { StationActions } from "./StationActions"
import { DeleteStation } from "./DeleteStation"

export default async function StationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let station: Station
  let sessions: StreamSession[]

  try {
    const [stationRes, sessionsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: StreamSession[] }>(`/stations/${slug}/sessions`),
    ])
    station = stationRes.data
    sessions = sessionsRes.data
  } catch (err) {
    // Only render the 404 page when the backend actually said the station
    // is missing. Any other failure (timeout, 401 from a stale cookie, 5xx)
    // is a real error and must not be silently masked as "not found" — log
    // it and rethrow so Next.js surfaces it via the error boundary.
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[station/${slug}] fetch failed:`, err)
    throw err
  }

  const recentSessions = sessions.filter((s) => s.ended_at).slice(0, 3)
  const playerUrl = `${env.appUrl}/station/${station.slug}`

  return (
    <div>
      {/* Back */}
      <Link
        href="/dashboard/stations"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        Back to stations
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex gap-4 items-start">
          <StationArtwork
            src={station.artwork_url}
            alt={station.name}
            className="size-16 md:size-[72px] rounded-2xl shrink-0"
            iconSize={24}
            sizes="72px"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-medium truncate">{station.name}</h1>
              {station.is_live && (
                <Badge variant="secondary" className="text-emerald-400 gap-1 shrink-0">
                  <span className="size-1.5 bg-emerald-400 rounded-full" />
                  Live
                </Badge>
              )}
            </div>
            {station.description && (
              <p className="text-sm text-muted-foreground mb-1 max-w-md truncate">{station.description}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {station.genre && (
                <Badge variant="secondary">{station.genre}</Badge>
              )}
              <Badge variant="secondary">Created {formatDate(station.created_at)}</Badge>
            </div>
          </div>

          {/* Desktop: buttons next to station info */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Button variant="outline" asChild>
              <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
                <IconExternalLink data-icon="inline-start" />
                Player page
              </a>
            </Button>
            <StationActions station={station} mode="edit" />
            <StationActions station={station} mode="live" />
          </div>
        </div>

        {/* Mobile: buttons below */}
        <div className="flex flex-col gap-2 mt-4 md:hidden">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
                <IconExternalLink data-icon="inline-start" />
                Player page
              </a>
            </Button>
            <StationActions station={station} mode="edit" />
          </div>
          <StationActions station={station} mode="live" />
        </div>
      </div>

      {/* Stats + Share */}
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-stretch">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 md:flex md:gap-3 shrink-0">
          <Card className="py-2 md:py-3 gap-0 md:px-2 justify-center">
            <CardContent className="px-2 md:px-4 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Sessions</div>
              <div className="text-xl md:text-2xl font-medium">{station.stats?.sessions ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="py-2 md:py-3 gap-0 md:px-2 justify-center">
            <CardContent className="px-2 md:px-4 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Airtime</div>
              <div className="text-xl md:text-2xl font-medium">{formatAirtime(station.stats?.total_airtime_seconds ?? 0)}</div>
            </CardContent>
          </Card>
          <Card className="py-2 md:py-3 gap-0 md:px-2 justify-center">
            <CardContent className="px-2 md:px-4 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Peak</div>
              <div className="text-xl md:text-2xl font-medium">{station.stats?.peak_listeners ?? 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Share + Embed */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Share your station
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Send this link to your listeners so they can tune in from any browser.
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs text-muted-foreground truncate">{playerUrl}</code>
              <CopyButton text={playerUrl} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent broadcasts */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">
            Recent broadcasts
          </CardTitle>
          <Link
            href="/dashboard/broadcasts"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors"
          >
            View all
            <IconArrowRight size={14} />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[100px_1fr_60px] md:grid-cols-[140px_1fr_80px] px-3 py-2 text-xs text-muted-foreground">
            <span>Date</span>
            <span>Duration</span>
            <span className="text-right">Peak</span>
          </div>
          <Separator />

          {recentSessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No broadcasts yet. Go live to see your session history here.
            </div>
          ) : (
            recentSessions.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[100px_1fr_60px] md:grid-cols-[140px_1fr_80px] px-3 py-2.5 border-t border-border"
              >
                <span className="text-muted-foreground">{formatDate(s.started_at)}</span>
                <span className="text-muted-foreground">{formatDateRange(s.started_at, s.ended_at!)}</span>
                <span className="text-right text-muted-foreground">{s.peak_listeners}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <DeleteStation slug={station.slug} />
    </div>
  )
}
