import { Skeleton } from "@/components/ui/skeleton"

/**
 * Mirror of the PlayerView shell shown while the heavy hls.js dynamic import
 * resolves. Keeps the layout from popping in — which matters more since the
 * dock: a transport bar that arrives late would shove the whole page up.
 */
export function PlayerSkeleton() {
  return (
    <div className="@container/player relative flex min-h-dvh flex-col bg-[#0b0a10] text-foreground">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(1200px_600px_at_20%_0%,#1a1530_0%,#0b0a10_60%)]"
        aria-hidden
      >
        <div className="absolute -top-[20%] -right-[10%] size-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)]" />
        <div className="absolute -bottom-[10%] -left-[10%] size-[400px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_70%)]" />
      </div>

      <header className="relative z-10 flex items-center justify-end px-8 py-5 @max-[520px]/player:p-4">
        <Skeleton className="h-3 w-40" />
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(220px,340px)_minmax(0,1fr)] items-center gap-[clamp(32px,6vw,96px)] px-8 py-[clamp(24px,5vh,64px)] @max-[900px]/player:grid-cols-[minmax(0,1fr)] @max-[900px]/player:content-start @max-[900px]/player:justify-items-center @max-[900px]/player:gap-7 @max-[900px]/player:pt-4 @max-[520px]/player:px-5">
        <div className="w-full max-w-[340px] justify-self-end @max-[900px]/player:max-w-[240px] @max-[900px]/player:justify-self-center @max-[520px]/player:max-w-[160px]">
          <Skeleton className="aspect-square w-full rounded-full" />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-5 @max-[900px]/player:items-center">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-[72px] w-[420px] max-w-full" />
          <Skeleton className="h-4 w-[52ch] max-w-full" />
          <div className="flex gap-2.5 @max-[900px]/player:justify-center">
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
      </main>

      <div className="sticky bottom-0 z-20 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] @max-[520px]/player:px-2.5">
        <div className="mx-auto flex max-w-[1176px] flex-col gap-2.5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-[20px] border border-[#2a2344] bg-[#161228]/85 p-4 backdrop-blur-[18px] @max-[520px]/player:gap-3 @max-[520px]/player:rounded-2xl @max-[520px]/player:p-3">
            <Skeleton className="size-16 rounded-full @max-[520px]/player:size-13" />
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-1.5">
            <Skeleton className="h-3 w-32 @max-[520px]/player:hidden" />
            <Skeleton className="h-8 w-48 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
