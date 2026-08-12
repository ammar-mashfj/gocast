import Link from "next/link"
import { redirect } from "next/navigation"
import { IconPlaylist, IconArrowRight, IconRadio } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"
import { Card, CardContent } from "@/components/ui/card"
import { StationArtwork } from "@/components/StationArtwork"
import { CreateStationButton } from "@/components/dashboard/CreateStationButton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"

/**
 * AutoDJ libraries are owned per-station; there's no shared library yet.
 * This page is a thin picker:
 *   - 0 stations  → empty-state CTA to create one first
 *   - 1 station   → straight redirect into that station's library (saves a click)
 *   - 2+ stations → list of cards, user picks
 */
export default async function LibraryIndexPage() {
  const { data: stations } = await apiFetch<{ data: Station[] }>("/stations")

  if (stations.length === 1) {
    redirect(`/dashboard/stations/${stations[0].slug}/library`)
  }

  if (stations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Empty className="py-10">
          <EmptyMedia variant="icon">
            <IconRadio size={48} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-lg">Create a station first</EmptyTitle>
            <EmptyDescription className="text-sm">
              The AutoDJ library is per-station — you&apos;ll have one waiting once a station exists.
            </EmptyDescription>
          </EmptyHeader>
          <CreateStationButton />
        </Empty>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-medium mb-1">AutoDJ libraries</h1>
        <p className="text-sm text-muted-foreground">
          Pick a station to manage its rotation. Tracks here play in order whenever the station isn&apos;t live.
        </p>
      </div>

      <div className="grid gap-3">
        {stations.map((station) => (
          <Link key={station.id} href={`/dashboard/stations/${station.slug}/library`} className="no-underline">
            <Card className="hover:bg-muted/40 transition-colors">
              <CardContent className="flex items-center gap-4 py-4">
                <StationArtwork
                  src={station.artwork_url}
                  alt={station.name}
                  className="size-12 rounded-lg shrink-0"
                  iconSize={20}
                  sizes="48px"
                />
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <IconPlaylist size={16} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{station.name}</div>
                    {station.genre && (
                      <div className="text-xs text-muted-foreground truncate">{station.genre}</div>
                    )}
                  </div>
                </div>
                <IconArrowRight size={16} className="text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
