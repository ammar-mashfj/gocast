import { Skeleton } from "@/components/ui/skeleton"

/**
 * Mirror of the PlayerView shell shown while the heavy IcecastMetadataPlayer
 * dynamic import resolves. Keeps the layout from popping in.
 */
export function PlayerSkeleton() {
  return (
    <div className="relative h-screen bg-background text-foreground flex flex-col md:grid md:grid-cols-2 overflow-hidden">
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute -bottom-[10%] -left-[10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-primary/15 to-transparent z-[1]" />

      {/* Mobile-then-desktop layout that matches PlayerView */}
      <div className="flex flex-1 flex-col items-center justify-center min-h-0 md:contents">
        {/* Vinyl placeholder */}
        <div className="relative w-full flex items-center justify-center pb-14 md:p-12 z-2 shrink-0 md:min-h-0">
          <Skeleton className="rounded-full w-full max-w-[160px] sm:max-w-[220px] md:max-w-[320px] aspect-square" />
        </div>

        {/* Title block */}
        <div className="relative w-full flex flex-col items-center md:items-start md:justify-center px-6 md:pr-12 md:pl-4 pb-4 md:py-12 z-2 shrink-0 gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 md:h-12 w-56 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full mb-4" />
          <Skeleton className="h-14 w-72 rounded-xl mb-4" />
          <div className="flex items-center gap-4 mb-4">
            <Skeleton className="size-14 md:size-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto md:mt-0 md:absolute bottom-0 left-0 right-0 px-6 md:px-12 py-3.5 md:py-3 flex justify-center z-[3] border-t border-white/5 shrink-0 bg-background/40 backdrop-blur-sm">
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    </div>
  )
}
