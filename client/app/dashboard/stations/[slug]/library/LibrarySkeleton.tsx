import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ds/PageHeader"
import { ROW_GRID } from "./TrackRow"
import type { LibraryPage } from "./useLibrary"

/**
 * Library and Playlists while their fetches are in flight. Anything constant
 * (the title, the line under it, the column heads) is drawn for real; only
 * counts, playlists and tracks are placeholders. The geometry is
 * LibraryView's, so nothing moves when the page lands: change one, change
 * the other.
 */
export function LibrarySkeleton({ page }: { page: LibraryPage }) {
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
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden md:block">Added</span>
        <span className="hidden text-right md:block">Length</span>
        <span />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`${ROW_GRID} border-t border-line py-3`}>
          <span />
          <Skeleton className="ml-auto h-3.5 w-4" />
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
      <Skeleton className="h-12 rounded-control lg:hidden" />
      <PageHeader
        title={page === "library" ? "Library" : "Playlists"}
        description={
          page === "library"
            ? "Every track you’ve uploaded. AutoDJ plays them from your playlists whenever you’re not live."
            : "What AutoDJ plays, in order or shuffled. The default playlist plays whenever nothing else is scheduled."
        }
      />
      <Skeleton className="-mt-3.5 h-4 w-64" />

      {page === "library" ? (
        table
      ) : (
        <div className="flex min-w-0 flex-col gap-5 md:flex-row md:items-start">
          <div className="flex shrink-0 flex-col gap-1 md:w-60">
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
