import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"
import { cn } from "@/lib/utils"

/** ShowsList's columns; change one file, change the other. */
const COLUMNS = "grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] gap-4 px-5.5 md:grid-cols-[10rem_7rem_minmax(0,1fr)_4rem]"

/**
 * Your shows while the list loads, in the page's geometry: the title, the
 * summary line, and the table card with its column heads drawn for real.
 */
export default function YourShowsLoading() {
  return (
    <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <div className="flex flex-col gap-2">
        <PageHeader title="Your shows" />
        <Skeleton className="h-6 w-80 max-w-full" />
      </div>
      <Card size="none" className="gap-0 overflow-hidden rounded-panel">
        <div className={cn(COLUMNS, "py-3.5 eyebrow-sm text-text-faint")}>
          <span>Started</span>
          <span className="hidden md:block">From</span>
          <span>On air</span>
          <span className="text-right">Peak</span>
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn(COLUMNS, "items-center border-t border-line py-3.5")}>
            <span className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-24" />
            </span>
            <Skeleton className="hidden h-4 w-14 md:block" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="ml-auto h-4 w-5" />
          </div>
        ))}
      </Card>
    </div>
  )
}
