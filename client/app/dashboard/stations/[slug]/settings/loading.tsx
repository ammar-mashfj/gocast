import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"

/**
 * Station settings while the station loads, in page.tsx's geometry: the
 * header, then the two columns of cards. Card titles are constants and drawn
 * for real; change one file, change the other.
 */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
      <PageHeader title="Station settings" />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Profile" />
            <div className="flex items-start gap-4">
              <Skeleton className="size-16 shrink-0 rounded-well" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Links on your player page" />
            <Skeleton className="h-12 w-full rounded-control" />
            <Skeleton className="h-11 w-full rounded-control" />
          </Card>
          <Card>
            <CardHeader title="When you’re usually live" />
            <Skeleton className="h-11 w-full rounded-control" />
            <Skeleton className="h-28 w-full rounded-well" />
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Where listeners find you" />
            <Skeleton className="h-13 w-full rounded-button" />
            <Skeleton className="h-13 w-full rounded-button" />
            <Skeleton className="h-5 w-48" />
          </Card>
          <Card>
            <CardHeader title="Use your own DJ software" />
          </Card>
          <Skeleton className="h-22 w-full rounded-card" />
        </div>
      </div>
    </div>
  )
}
