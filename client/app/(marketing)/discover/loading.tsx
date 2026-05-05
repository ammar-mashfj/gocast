import { Skeleton } from "@/components/ui/skeleton"

export default function DiscoverLoading() {
  return (
    <>
      <section className="px-4 md:px-10 pt-8 md:pt-12 pb-6">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-10 md:h-12 w-72 max-w-full mb-3" />
        <Skeleton className="h-4 w-48" />
      </section>

      <section className="px-4 md:px-10 pb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full md:w-[140px]" />
          <Skeleton className="h-10 w-full md:w-[120px]" />
        </div>
      </section>

      <section className="px-4 md:px-10 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3"
            >
              <Skeleton className="size-12 rounded-xl shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
