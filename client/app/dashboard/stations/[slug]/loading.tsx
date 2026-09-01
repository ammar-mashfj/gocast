"use client"

import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { StationArtwork } from "@/components/StationArtwork"
import { useStationBySlug } from "@/contexts/StationContext"

/**
 * The station page while its data is in flight.
 *
 * A client component, and deliberately so: the dashboard layout persists
 * across this transition, so the station's IDENTITY — artwork, name, genre,
 * description — is already in context and is rendered for real here. Only the
 * parts that actually depend on the pending fetches are skeletons.
 *
 * That is the whole point. This file used to skeleton the name too, so the one
 * thing that never changes between renders was the thing that flickered: you
 * clicked into your station and watched a grey bar sit where its name belongs,
 * then get replaced by the same name it would have shown all along. Painting
 * known values as unknown is worse than painting nothing.
 *
 * It also drifted. The skeleton still described the multi-station layout — a
 * back link to the station list, a three-up stat row, a danger zone — none of
 * which the page has had since a user stopped being able to own more than one
 * station. The shape below tracks page.tsx: header, then a two-column grid
 * with power/activity/rotation/broadcasts on the left and share/checklist on
 * the right.
 */
export default function StationDetailLoading() {
  const params = useParams<{ slug: string }>()
  const station = useStationBySlug(params?.slug ?? null)

  return (
    <div className="flex flex-col gap-6">
      {/* Header — real wherever the layout already knows the answer. */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5">
        {station ? (
          <StationArtwork
            src={station.artwork_url}
            alt={station.name}
            className="size-16 md:size-[72px] rounded-2xl shrink-0"
            iconSize={24}
            sizes="72px"
          />
        ) : (
          <Skeleton className="size-16 md:size-[72px] rounded-2xl shrink-0" />
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {station ? (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-2xl font-medium truncate">{station.name}</h1>
              {station.genre && (
                <Badge variant="secondary" className="shrink-0">{station.genre}</Badge>
              )}
            </div>
          ) : (
            <Skeleton className="h-8 w-48" />
          )}

          {station ? (
            station.description && (
              <p className="text-sm text-muted-foreground max-w-xl line-clamp-2">
                {station.description}
              </p>
            )
          ) : (
            <Skeleton className="h-4 w-64" />
          )}

          {/* The meta line genuinely is pending — it counts broadcasts and
              reads the current state, neither of which the layout carries. */}
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="size-9" />
        </div>
      </header>

      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-6 min-w-0">
          {/* StationPower — a bordered section, not a Card. */}
          <section className="@container/power rounded-xl border border-border bg-card/40 p-5 flex flex-col gap-5 @xl/power:flex-row @xl/power:items-center @xl/power:justify-between">
            <div className="min-w-0 flex flex-col gap-1.5 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-56 max-w-full" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </section>

          {/* StationActivity */}
          <Card>
            <CardContent className="pt-1">
              <div className="flex items-baseline justify-between mb-5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="grid grid-cols-2 gap-5 md:grid-cols-4 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>

          {/* AutoDjRotation */}
          <Card className="gap-0 overflow-hidden">
            <CardContent className="flex items-center justify-between gap-4 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="size-10 rounded-md shrink-0" />
                <div className="min-w-0 flex flex-col gap-1.5">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-28 shrink-0" />
            </CardContent>
          </Card>

          {/* RecentBroadcasts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] gap-3 px-3 pb-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="hidden md:block h-3 w-14" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-8 ml-auto" />
              </div>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] gap-3 items-center px-3 py-2.5 border-t border-border"
                >
                  <Skeleton className="h-4 w-32 max-w-full" />
                  <Skeleton className="hidden md:block h-4 w-16" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-6 ml-auto" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6 min-w-0">
          {/* LiveListeners */}
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-2">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-col items-center gap-1.5">
                <Skeleton className="h-11 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-3 w-44 max-w-full" />
            </CardContent>
          </Card>

          {/* StationShare */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-full max-w-xs mb-3" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-9 w-full mt-3" />
            </CardContent>
          </Card>

          {/* StationChecklist */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="size-5 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
