import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function StationDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="h-4 w-28 mb-6" />

      {/* Header — matches the live page layout */}
      <div className="mb-8">
        <div className="flex gap-4 items-start">
          <Skeleton className="size-16 md:size-[72px] rounded-2xl shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64 mb-3" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
          {/* Desktop action buttons */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        {/* Mobile action buttons */}
        <div className="flex flex-col gap-2 mt-4 md:hidden">
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-20" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      {/* Stats + Share/Embed */}
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-stretch">
        <div className="grid grid-cols-3 gap-2 md:flex md:gap-3 shrink-0">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="py-2 md:py-3 gap-0 md:px-2 justify-center">
              <CardContent className="px-2 md:px-4 text-center flex flex-col items-center gap-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-7 w-10" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="flex-1">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-3 w-full max-w-xs mb-3" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent broadcasts */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-16" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[100px_1fr_60px] md:grid-cols-[140px_1fr_80px] px-3 py-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10 ml-auto" />
          </div>
          <Separator />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[100px_1fr_60px] md:grid-cols-[140px_1fr_80px] px-3 py-2.5 border-t border-border"
            >
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-8 ml-auto" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  )
}
