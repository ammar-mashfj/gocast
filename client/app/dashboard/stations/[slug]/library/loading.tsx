"use client"

import { IconMusic } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { HelpLink } from "@/components/dashboard/HelpLink"
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
 * grey bar. The "AutoDJ" heading, the tab strip, the rail's section labels
 * and the table's column heads are all constants, so they render once and
 * simply stay put when the real page arrives. Only the counts, the rail
 * entries and the track list are genuinely pending.
 *
 * The geometry is LibraryView's, wrapper for wrapper: the `.sheet` ground,
 * the rail flat on it, and ONE raised panel for the track table with the
 * page's own edge, fill and shadow. The rows use ROW_GRID and the real row
 * height (a 32px action button inside `py-2`), so the list does not grow or
 * shrink when the tracks land. The panel draws the default playlist's view,
 * because that is what the page selects on arrival.
 */
export default function LibraryLoading() {
  return (
    <div>
      {/* The Skeleton primitive pulses unconditionally; stopping it here
          keeps the page still for anyone who asked for reduced motion. */}
      <div className="sheet flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none">
        <div className="flex flex-col gap-4">
          <header className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display flex items-center gap-2 text-2xl font-semibold tracking-tight">
              AutoDJ
              <HelpLink
                article="playlists-and-the-rotation"
                label="how AutoDJ and playlists work"
              />
            </h1>
            <p className="w-full text-sm text-muted-foreground">
              AutoDJ plays your uploaded music whenever you&apos;re not live, so the
              station keeps going when you step away.
            </p>
          </header>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* The count · runtime · storage line: real work, real skeleton. */}
          <div className="flex-1 min-w-[240px]">
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
          {/* "Add tracks" — or the upgrade button on a locked plan, which is
              wider; the bar takes the common case. */}
          <Skeleton className="h-9 w-28 shrink-0" />
        </div>

        <div className="flex min-w-0 flex-col md:flex-row gap-4 items-stretch md:items-start">
          {/* PlaylistRail — a column from md up, a chip row on a phone. The
              two section labels and "All tracks" are fixed copy. */}
          <div className="flex min-w-0 max-w-full md:flex-col gap-1 md:w-56 shrink-0 overflow-hidden pb-1 md:pb-0">
            <span className="hidden md:block px-2.5 pb-1 text-xs font-medium text-muted-foreground select-none">
              Library
            </span>
            <div className="flex min-h-9 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground shrink-0 md:shrink min-w-0 max-w-[14rem] md:max-w-none">
              <span className="shrink-0 inline-flex">
                <IconMusic size={15} />
              </span>
              <span className="truncate flex-1">All tracks</span>
              <Skeleton className="h-3 w-5 shrink-0" />
            </div>
            <span className="hidden md:block px-2.5 pb-1 md:pt-3 text-xs font-medium text-muted-foreground select-none">
              Playlists
            </span>
            <Skeleton className="h-9 w-32 md:w-full shrink-0 rounded-md" />
            <Skeleton className="h-9 w-28 md:w-full shrink-0 rounded-md" />
            <Skeleton className="h-9 w-28 md:w-full shrink-0 rounded-md" />
          </div>

          {/* The one raised panel. */}
          <div className="flex-1 min-w-0 w-full rounded-2xl border border-white/[0.09] bg-panel shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]">
            {/* Playlist title bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Skeleton className="size-8 rounded-md shrink-0" />
                <div className="min-w-0 flex flex-col gap-1">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-3.5 w-48 max-w-full" />
                </div>
              </div>
            </div>

            {/* Search, sort, ⋯ */}
            <div className="flex flex-wrap items-center gap-3 p-3 border-b border-border">
              <Skeleton className="h-9 flex-1 min-w-[220px]" />
              <Skeleton className="h-9 w-36" />
              <Skeleton className="size-9" />
            </div>

            {/* TrackListHeader, verbatim: the column names never change. */}
            <div className={`${ROW_GRID} py-2 border-b border-border text-xs text-muted-foreground`}>
              <span />
              <span className="text-right">#</span>
              <span>Title</span>
              <span className="hidden md:block">Artist</span>
              <span className="hidden md:block text-right">Length</span>
              <span className="hidden md:block text-right">Size</span>
              <span className="hidden md:block">Added</span>
              <span />
            </div>

            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`${ROW_GRID} py-2 border-b border-border last:border-b-0`}>
                <span />
                <Skeleton className="h-3 w-4 ml-auto" />
                <div className="min-w-0 flex flex-col gap-1">
                  <Skeleton className="h-4 w-full max-w-[16rem]" />
                  <Skeleton className="md:hidden h-3 w-24" />
                </div>
                <Skeleton className="hidden md:block h-3 w-full max-w-[9rem]" />
                <Skeleton className="hidden md:block h-3 w-10 ml-auto" />
                <Skeleton className="hidden md:block h-3 w-12 ml-auto" />
                <Skeleton className="hidden md:block h-3 w-16" />
                {/* The row's action buttons are 32px, and they set its height. */}
                <div className="flex h-8 items-center justify-end">
                  <Skeleton className="h-4 w-10" />
                </div>
              </div>
            ))}

            <div className="flex items-center px-4 py-3 border-t border-border">
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed max-w-[34rem]">
          Drop audio files anywhere on the list to upload. MP3, M4A, AAC, FLAC, OGG or WAV, up to
          300 MB each. A track can be in any number of playlists; the default one plays when
          nothing else is scheduled. Put short clips like &ldquo;You&apos;re listening to&hellip;&rdquo; in{" "}
          <span className="text-violet-muted">Jingles</span> so they play between songs.
        </p>
      </div>
    </div>
  )
}
