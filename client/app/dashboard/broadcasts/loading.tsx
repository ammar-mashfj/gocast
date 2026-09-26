import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

/** Shared by the head row and every body row, as on the page, so the columns line up. */
const ROW =
  "grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] md:grid-cols-[11rem_6rem_minmax(0,1fr)_7rem] gap-3 px-3"

/**
 * The Broadcasts ledger while the session list is in flight.
 *
 * A copy of the page's own shape: a flat `.sheet` ledger under the heading,
 * column heads as real text, rows divided by hairlines. The version before
 * this drew the page it replaced — a boxed card with a title, a separator and
 * a different column grid — so the ledger arrived by rearranging itself.
 *
 * Only the rows and the tally under the heading are pending. The heading and
 * the column names are constants. The duration cell is pending as its figure
 * and its live bar, stacked on a phone and side by side from md, as on the page.
 */
export default function BroadcastsLoading() {
  return (
    // The Skeleton primitive pulses unconditionally; stopping it here keeps
    // the page still for anyone who asked for reduced motion.
    <div className="sheet motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Broadcasts</h1>
        <Skeleton className="mt-1 h-5 w-52 max-w-full" />
      </div>

      <Card>
        <CardContent>
          <div className={`${ROW} py-2 text-xs text-muted-foreground`}>
            <span>Started</span>
            <span className="hidden md:block">Source</span>
            <span>On air</span>
            <span className="text-right">
              <span className="md:hidden">Peak</span>
              <span className="hidden md:inline">Peak listeners</span>
            </span>
          </div>

          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${ROW} items-center py-2.5 border-t border-white/[0.06]`}>
              <Skeleton className="h-5 w-32 max-w-full" />
              <Skeleton className="hidden md:block h-5 w-16" />
              <div className="flex min-w-0 flex-col gap-1 md:flex-row-reverse md:items-center md:gap-3">
                <Skeleton className="h-5 w-14 md:w-16 md:shrink-0" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-5 w-6 ml-auto" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
