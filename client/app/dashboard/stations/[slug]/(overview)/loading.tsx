"use client"

import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Tag } from "@/components/ds/Tag"
import { StationArtwork } from "@/components/StationArtwork"
import { useStationBySlug } from "@/contexts/StationContext"

/**
 * The overview while its data is in flight.
 *
 * The layout already knows the station's identity, so the header is drawn
 * for real — a skeleton where the station's own name belongs, replaced by the
 * same name, is a flicker for nothing. Only what depends on the fetches is a
 * placeholder, and in the page's own geometry (page.tsx), so nothing jumps
 * when it lands: change one, change the other.
 *
 * Under the (overview) route group so it covers this page only, not every
 * station sub-page below [slug].
 */
export default function StationOverviewLoading() {
  const params = useParams<{ slug: string }>()
  const station = useStationBySlug(params?.slug ?? null)

  return (
    <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <header className="flex flex-wrap items-start gap-5">
        {station ? (
          <StationArtwork src={station.artwork_url} alt="" className="size-20 shrink-0 rounded-card text-text-faint sm:size-26" iconSize={24} sizes="104px" />
        ) : (
          <Skeleton className="size-20 shrink-0 rounded-card sm:size-26" />
        )}
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-2">
          {station ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-page">{station.name}</h1>
              {station.genre && <Tag>{station.genre}</Tag>}
            </div>
          ) : (
            <Skeleton className="h-10 w-64" />
          )}
          {station?.description && <p className="max-w-[65ch] text-lead text-muted-foreground line-clamp-2">{station.description}</p>}
          <Skeleton className="h-4 w-48" />
        </div>
      </header>

      <Skeleton className="h-72 rounded-hero" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] gap-5">
        <Skeleton className="h-48 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] gap-5">
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-80 rounded-card" />
      </div>
    </div>
  )
}
