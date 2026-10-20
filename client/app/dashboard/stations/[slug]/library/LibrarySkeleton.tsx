"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ds/PageHeader"
import { ProTag } from "@/components/ds/Tag"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { AutoDjUpsell } from "./AutoDjUpsell"
import { ROW_GRID } from "./TrackRow"
import type { LibraryPage } from "./useLibrary"

/**
 * Library and Playlists while their fetches are in flight. Anything constant
 * (the title, the line under it, the column heads) is drawn for real; only
 * counts, playlists and tracks are placeholders. The geometry is
 * LibraryView's, so nothing moves when the page lands: change one, change
 * the other.
 *
 * A free account's page leads with the Pro card and a "preview" divider
 * (LibraryView's `locked` branch). Both are static, so they are drawn for
 * real here too — without them the whole skeleton jumps down when it lands.
 */
export function LibrarySkeleton({ page }: { page: LibraryPage }) {
  const locked = useAutoDjLocked()
  const station = useCurrentStation()
  const table = (
    <div className="min-w-0 flex-1 rounded-card bg-card">
      <div className="flex flex-col gap-2 px-5.5 pt-5 pb-3.5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="px-5.5 pb-3.5">
        <Skeleton className="h-11 rounded-control" />
      </div>
      <div className={`${ROW_GRID} border-t border-line py-2.5 eyebrow text-text-faint`}>
        <span />
        <span />
        <span>Title</span>
        <span className="hidden md:block">Added</span>
        <span className="hidden text-right md:block">Length</span>
        <span />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`${ROW_GRID} border-t border-line py-3`}>
          <span />
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="hidden h-3.5 w-16 md:block" />
          <Skeleton className="ml-auto hidden h-3.5 w-10 md:block" />
          <span />
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-5.5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <PageHeader
        title={page === "library" ? "Library" : "Playlists"}
        aside={locked ? <ProTag /> : undefined}
        description={
          page === "library"
            ? "Every track you’ve uploaded. AutoDJ plays them from your playlists whenever you’re not live."
            : "What AutoDJ plays, in order or shuffled. The default playlist plays whenever nothing else is scheduled."
        }
      />
      {page === "library" && <Skeleton className="-mt-3.5 h-4 w-64" />}

      {locked && station && (
        <>
          <AutoDjUpsell stationName={station.name} />
          <div className="flex items-center gap-3">
            <span className="shrink-0 eyebrow text-text-faint">{page === "library" ? "Preview of your library" : "Preview of the playlist editor"}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {page === "library" ? (
        table
      ) : (
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
          {/* PlaylistRail: the picker button below lg, the column from lg. */}
          <Skeleton className="h-24 rounded-control lg:hidden" />
          <div className="hidden w-60 shrink-0 flex-col gap-1 lg:flex">
            <Skeleton className="h-12 rounded-control" />
            <Skeleton className="h-12 rounded-control" />
            <Skeleton className="h-12 rounded-control" />
          </div>
          {table}
        </div>
      )}
    </div>
  )
}
