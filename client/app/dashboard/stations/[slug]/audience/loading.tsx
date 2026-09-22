"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useStationBySlug } from "@/contexts/StationContext"

/**
 * The Audience page while its fetch is in flight.
 *
 * Added when the station overview's skeleton stopped covering this route — see
 * `(overview)/loading.tsx`. That skeleton was never right for this page, but
 * losing it would have left the transition blank, which reads as a frozen tab.
 *
 * The plan gate lives on the API, so this file cannot know whether the page
 * will come back locked (two tiles and an upsell) or complete (four tiles, a
 * chart and four breakdowns). It draws the complete shape, because guessing
 * short would make the locked page the one that jumps.
 */
export default function AudienceLoading() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""
  const station = useStationBySlug(slug)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground" asChild>
            <Link href={`/dashboard/stations/${slug}`}>
              <IconArrowLeft data-icon="inline-start" />
              {station ? station.name : "Back"}
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold">Audience</h1>
          {/* The blurb below the heading differs between the locked and the
              full page, so it is the one piece of copy that stays a bar. */}
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        <Skeleton className="h-10 w-48 shrink-0 rounded-lg" />
      </header>

      <Card>
        <CardContent className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((card) => (
          <Card key={card}>
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-5 w-32" />
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12 shrink-0" />
                </div>
              ))}
              <Skeleton className="h-3 w-full max-w-sm" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
