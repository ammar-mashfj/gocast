import Link from "next/link"
import { IconRadio, IconBolt, IconShare3, IconHeadphones, IconPlayerPlayFilled, IconClock } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { StationCard } from "@/components/dashboard/StationCard"
import { CreateStationButton } from "@/components/dashboard/CreateStationButton"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"
import { Button } from "@/components/ui/button"
import { formatDate, formatDateRange } from "@/lib/format"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"

export default async function StationsPage() {
  const { data: stations } = await apiFetch<{ data: Station[] }>("/stations")

  // Pull the most recent ended session across offline stations for the "resume" card.
  // Done in parallel so it's effectively one round-trip.
  let lastSession: (StreamSession & { stationName: string; stationSlug: string }) | null = null
  const offlineStations = stations.filter((station) => !station.is_live)
  if (offlineStations.length > 0) {
    const sessionLists = await Promise.all(
      offlineStations.map(async (station) => {
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
    const sorted = sessionLists.flat().sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    lastSession = sorted[0] ?? null
  }

  if (stations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Empty className="py-10">
          <EmptyMedia variant="icon">
            <IconRadio size={48} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-lg">Create your first station</EmptyTitle>
            <EmptyDescription className="text-sm">
              Name it, give it a vibe, and you&apos;ll be on air in under a minute.
            </EmptyDescription>
          </EmptyHeader>
          <CreateStationButton />
        </Empty>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <IconBolt size={18} className="text-primary mb-2" />
            <div className="text-sm font-medium mb-1">Go live in seconds</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Browser-only. No downloads, no plugins, no studio.
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <IconShare3 size={18} className="text-primary mb-2" />
            <div className="text-sm font-medium mb-1">Share one link</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Listeners tap and tune in. No app, no signup.
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <IconHeadphones size={18} className="text-primary mb-2" />
            <div className="text-sm font-medium mb-1">Talk over music</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Push-to-talk plus a drag-and-drop queue, like a DJ.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium">Your stations</h1>
        <CreateStationButton />
      </div>

      {lastSession && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
              <IconClock size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-xs tracking-[2px] uppercase text-muted-foreground mb-0.5">Last broadcast</div>
              <div className="text-sm font-medium truncate">
                <Link href={`/dashboard/stations/${lastSession.stationSlug}`} className="text-foreground no-underline hover:text-primary transition-colors">
                  {lastSession.stationName}
                </Link>
                <span className="text-muted-foreground"> · {formatDate(lastSession.started_at, "relative")} · {formatDateRange(lastSession.started_at, lastSession.ended_at!)} · peak {lastSession.peak_listeners}</span>
              </div>
            </div>
          </div>
          <GoLiveTrigger slug={lastSession.stationSlug} name={lastSession.stationName}>
            <Button size="sm" className="self-start md:self-auto shrink-0">
              <IconPlayerPlayFilled data-icon="inline-start" />
              Go live again
            </Button>
          </GoLiveTrigger>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {stations.map((station) => (
          <StationCard key={station.id} station={station} />
        ))}
      </div>
    </div>
  )
}
