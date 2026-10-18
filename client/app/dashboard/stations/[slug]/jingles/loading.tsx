"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"
import { ProTag } from "@/components/ds/Tag"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { AutoDjUpsell } from "../library/AutoDjUpsell"

/**
 * The Jingles page while it loads, in JinglesView's geometry: the section
 * links, the header and its stats line, then the two cards. Titles are
 * constants and drawn for real; change one file, change the other.
 */
export default function JinglesLoading() {
  const locked = useAutoDjLocked()
  const station = useCurrentStation()

  return (
    <div className="flex flex-col gap-5.5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <Skeleton className="h-12 rounded-control lg:hidden" />
      <PageHeader
        title="Jingles"
        aside={locked ? <ProTag /> : undefined}
        description="Short clips that play between AutoDJ songs, like “You’re listening to…”. Radio calls them station IDs and liners."
      />
      <Skeleton className="-mt-3.5 h-5 w-56" />
      {locked && station && <AutoDjUpsell stationName={station.name} />}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your jingles" />
          <Skeleton className="h-14 rounded-control" />
          <Skeleton className="h-14 rounded-control" />
        </Card>
        <Card>
          <CardHeader title="When they play" />
          <Skeleton className="h-16 rounded-control" />
          <Skeleton className="h-11 rounded-control" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </div>
    </div>
  )
}
