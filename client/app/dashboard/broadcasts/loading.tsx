import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function BroadcastsLoading() {
  return (
    <div>
      <Skeleton className="h-6 w-32 mb-6" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[140px_1fr_100px_80px] px-3 py-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10 ml-auto" />
          </div>
          <Separator />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[140px_1fr_100px_80px] px-3 py-3 border-t border-border"
            >
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-8 ml-auto" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
