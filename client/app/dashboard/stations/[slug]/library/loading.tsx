"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { AutoDjTabs } from "@/components/dashboard/AutoDjTabs"
import { useStationBySlug } from "@/contexts/StationContext"
import { ROW_GRID } from "./TrackRow"

/**
 * The Music page while its three fetches are in flight.
 *
 * It exists because this route used to inherit the station overview's
 * skeleton — a power card, an activity chart, a listener dial — which shares
 * nothing with the page being opened. See the note in
 * `(overview)/loading.tsx` for how that inheritance worked.
 *
 * Same rule as that file: anything already known is drawn for real, not as a
 * grey bar. The back link, the tab strip, the "Music" heading and the rail's
 * section labels are all constants or come from the layout's station context,
 * so they render once and simply stay put when the real page arrives. Only the
 * counts, the rail entries and the track list are genuinely pending.
 */
export default function LibraryLoading() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""
  const station = useStationBySlug(slug)

  return (
    <div>
      <Link
        href={`/dashboard/stations/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        {station ? `Back to ${station.name}` : "Back"}
      </Link>

      <AutoDjTabs slug={slug} />

      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[280px] flex flex-col gap-2">
            <h1 className="text-2xl font-medium">Music</h1>
            {/* The count · runtime · storage line: real work, real skeleton. */}
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* PlaylistRail — a column from md up, a chip row on a phone. The
              two section labels are fixed copy, so they are real here too. */}
          <div className="flex md:flex-col gap-1 md:w-56 shrink-0 overflow-hidden pb-1 md:pb-0">
            <span className="hidden md:block px-2.5 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/70">
              Library
            </span>
            <Skeleton className="h-8 w-28 md:w-full shrink-0 rounded-md" />
            <span className="hidden md:block px-2.5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/70">
              Playlists
            </span>
            <Skeleton className="h-8 w-32 md:w-full shrink-0 rounded-md" />
            <Skeleton className="h-8 w-28 md:w-full shrink-0 rounded-md" />
            <Skeleton className="h-8 w-28 md:w-full shrink-0 rounded-md" />
          </div>

          <div className="flex-1 min-w-0 w-full rounded-xl border border-border bg-card overflow-hidden">
            {/* Playlist title bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Skeleton className="size-8 rounded-md shrink-0" />
                <div className="min-w-0 flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="size-8" />
              </div>
            </div>

            {/* Search and sort */}
            <div className="flex flex-wrap items-center gap-3 p-3 border-b border-border">
              <Skeleton className="h-9 flex-1 min-w-[220px]" />
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>

            {/* Column headings, then rows on the same grid so nothing shifts. */}
            <div className={`${ROW_GRID} py-2 border-b border-border`}>
              <span />
              <Skeleton className="h-3 w-3 ml-auto" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="hidden md:block h-3 w-10" />
              <Skeleton className="hidden md:block h-3 w-10 ml-auto" />
              <Skeleton className="hidden md:block h-3 w-8 ml-auto" />
              <Skeleton className="hidden md:block h-3 w-10 ml-auto" />
              <span />
            </div>

            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`${ROW_GRID} py-2.5 border-b border-border/60`}>
                <span />
                <Skeleton className="h-3 w-4 ml-auto" />
                <Skeleton className="h-4 w-full max-w-[16rem]" />
                <Skeleton className="hidden md:block h-3 w-full max-w-[9rem]" />
                <Skeleton className="hidden md:block h-3 w-10 ml-auto" />
                <Skeleton className="hidden md:block h-3 w-12 ml-auto" />
                <Skeleton className="hidden md:block h-3 w-14 ml-auto" />
                <Skeleton className="h-6 w-12 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
