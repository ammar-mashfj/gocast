"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StationArtwork } from "@/components/StationArtwork"
import { useStationBySlug } from "@/contexts/StationContext"

/**
 * Station settings while its fetch is in flight.
 *
 * Added alongside the `(overview)` route group, which stopped this route
 * inheriting the station overview's skeleton — a power card and a listener
 * dial that settings has never had.
 *
 * The layout already carries the station's identity, so the Details card is
 * drawn for real: artwork, name, genre. Everything below it is a form bound to
 * data that has not arrived, and those are bars. The card titles are constants
 * and stay as text, which keeps the page's outline readable while it fills.
 */
export default function SettingsLoading() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""
  const station = useStationBySlug(slug)

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/stations/${slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors mb-3"
        >
          <IconArrowLeft size={14} />
          {station ? `Back to ${station.name}` : "Back"}
        </Link>
        <h1 className="text-2xl font-medium">Station settings</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Details</CardTitle>
          <Skeleton className="h-8 w-16" />
        </CardHeader>
        <CardContent className="flex gap-4">
          {station ? (
            <StationArtwork
              src={station.artwork_url}
              alt={station.name}
              className="size-16 rounded-xl shrink-0"
              iconSize={22}
              sizes="64px"
            />
          ) : (
            <Skeleton className="size-16 rounded-xl shrink-0" />
          )}
          <div className="min-w-0 flex flex-col gap-1.5">
            {station ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{station.name}</span>
                {station.genre && (
                  <Badge variant="secondary" className="shrink-0">{station.genre}</Badge>
                )}
              </div>
            ) : (
              <Skeleton className="h-5 w-40" />
            )}
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1.5">
          <CardTitle className="text-base font-medium">Show times</CardTitle>
          <Skeleton className="h-3 w-full max-w-md" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
          <Skeleton className="h-9 w-28" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Stream</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
              <Skeleton className="h-3 w-24 md:w-32 md:shrink-0" />
              <Skeleton className="h-3 w-full max-w-xs" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* EncoderSection and DeleteStation — both render their own card. */}
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}
