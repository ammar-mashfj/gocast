import { Skeleton } from "@/components/ui/skeleton"

/**
 * The overview while its data is in flight, in the page's own geometry
 * (page.tsx: OverviewHero; the Pro card under it is Free-only, so not drawn) so nothing
 * jumps when it lands: change one, change the other.
 *
 * No station header here — the page has none any more, and drawing the
 * artwork and name only for them to vanish when the page arrives is worse
 * than a quiet placeholder.
 *
 * Under the (overview) route group so it covers this page only, not every
 * station sub-page below [slug].
 */
export default function StationOverviewLoading() {
  return (
    <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <Skeleton className="h-80 rounded-hero" />
    </div>
  )
}
