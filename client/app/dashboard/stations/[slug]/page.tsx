import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft, IconExternalLink, IconArrowRight, IconCode } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CopyButton } from "@/components/dashboard/CopyButton"
import { StationActions } from "./StationActions"
import { DeleteStation } from "./DeleteStation"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatAirtime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return "0m"
}

function formatSessionDuration(start: string, end: string): string {
  const seconds = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

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
  } catch {
    notFound()
  }

  const recentSessions = sessions.filter((s) => s.ended_at).slice(0, 3)
  const playerUrl = `${env.appUrl}/station/${station.slug}`

  return (
    <div>
      {/* Back */}
      <Link
        href="/dashboard/stations"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        Back to stations
      </Link>

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex gap-4 items-center">
          <div className="size-[72px] rounded-[14px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center text-[30px] shrink-0 overflow-hidden">
            {station.artwork_url ? (
              <img src={station.artwork_url} alt={station.name} className="size-full object-cover" />
            ) : (
              "♫"
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-medium">{station.name}</h1>
              {station.is_live && (
                <Badge variant="secondary" className="text-emerald-400 gap-1">
                  <span className="size-1.5 bg-emerald-400 rounded-full" />
                  Live
                </Badge>
              )}
            </div>
            {station.description && (
              <p className="text-[13px] text-muted-foreground mb-1 max-w-md">{station.description}</p>
            )}
            <div className="flex gap-2 mt-2">
              {station.genre && (
                <Badge variant="secondary">{station.genre}</Badge>
              )}
              <Badge variant="secondary">Created {formatDate(station.created_at)}</Badge>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
              <IconExternalLink data-icon="inline-start" />
              Player page
            </a>
          </Button>
          <StationActions station={station} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Sessions</div>
            <div className="text-3xl font-medium">{station.stats?.sessions ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Total airtime</div>
            <div className="text-3xl font-medium">{formatAirtime(station.stats?.total_airtime_seconds ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Peak listeners</div>
            <div className="text-3xl font-medium">{station.stats?.peak_listeners ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Share + Embed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs tracking-widest uppercase text-muted-foreground font-normal">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-xs tracking-widest uppercase text-muted-foreground font-normal flex items-center gap-1.5">
              <IconCode size={14} />
              Embed player
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Add this snippet to your website to embed the player.
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs text-muted-foreground truncate">
                {`<iframe src="${playerUrl}" ...>`}
              </code>
              <CopyButton text={`<iframe src="${playerUrl}" width="100%" height="180" frameborder="0" allow="autoplay" style="border-radius:12px"></iframe>`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent broadcasts */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs tracking-widest uppercase text-muted-foreground font-normal">
            Recent broadcasts
          </CardTitle>
          <Link
            href="/dashboard/broadcasts"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors"
          >
            View all
            <IconArrowRight size={12} />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[140px_1fr_80px] px-3 py-2 text-xs text-muted-foreground tracking-wide uppercase">
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
                className="grid grid-cols-[140px_1fr_80px] px-3 py-2.5 border-t border-border text-sm"
              >
                <span className="text-muted-foreground">{formatDate(s.started_at)}</span>
                <span className="text-muted-foreground">{formatSessionDuration(s.started_at, s.ended_at!)}</span>
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
