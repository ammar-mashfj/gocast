import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"

/**
 * Station settings while the station loads, in page.tsx's geometry: the
 * header, the profile, the stream card beside the two folds, then delete. Card titles are constants and drawn
 * for real; change one file, change the other.
 */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <PageHeader title="Station settings" />
      <Card>
        <div className="flex items-center gap-3.5 sm:gap-5">
          <Skeleton className="size-44 shrink-0 rounded-well sm:size-48" />
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-28 rounded-control" />
          </div>
        </div>
      </Card>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Where listeners find you" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-6 w-2/3" />
        </Card>
        <div className="flex min-w-0 flex-col gap-5 xl:self-stretch xl:*:flex-1 xl:*:justify-center">
          <Card>
            <CardHeader title="Links on your player page" />
          </Card>
          <Card>
            <CardHeader title="Use your own DJ software" />
          </Card>
        </div>
      </div>
      <Skeleton className="mt-4 h-22 w-full rounded-card" />
    </div>
  )
}
