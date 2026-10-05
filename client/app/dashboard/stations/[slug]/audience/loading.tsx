import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"

const TILES = ["Listening time", "Daily listeners", "Peak at once", "Average listen"]
const BREAKDOWNS = ["Countries", "Devices", "Browsers", "Where they came from"]

/**
 * The Audience page while it loads, in page.tsx's geometry: the header, four
 * stat tiles, the chart card and the breakdown cards. Labels and titles are
 * constants, drawn for real; change one file, change the other.
 */
export default function AudienceLoading() {
  return (
    <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <PageHeader title="Audience" description="Everyone who pressed play — on your player page and on the direct stream." />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {TILES.map((label) => (
          <div key={label} className="flex flex-col gap-2 rounded-well bg-card p-3.5">
            <span className="eyebrow font-medium text-text-faint">{label}</span>
            <Skeleton className="h-6.5 w-16" />
            <Skeleton className="h-3.5 w-28 max-w-full" />
          </div>
        ))}
      </div>

      <Card>
        <h2 className="font-display text-heading">Listening time per day</h2>
        <Skeleton className="h-50 w-full rounded-control" />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {BREAKDOWNS.map((title) => (
          <Card key={title}>
            <h2 className="font-display text-heading">{title}</h2>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </Card>
        ))}
      </div>
    </div>
  )
}
