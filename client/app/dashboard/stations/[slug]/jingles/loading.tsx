import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ds/PageHeader"

/** JinglesView's geometry with placeholders, so nothing moves when it lands. */
export default function JinglesLoading() {
  return (
    <div className="flex flex-col gap-5.5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <Skeleton className="h-12 rounded-control lg:hidden" />
      <PageHeader
        title="Jingles"
        description="Short clips AutoDJ plays between songs: station IDs, sweepers, promos. Give each kind its own list and tell it when to play."
      />
      <div className="-mt-3.5 flex flex-col gap-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-0.75 max-w-md" />
      </div>
      <Skeleton className="h-64 rounded-card" />
      <Skeleton className="h-48 rounded-card" />
    </div>
  )
}
