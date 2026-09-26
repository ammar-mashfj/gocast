import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { HowWeCount } from "./HowWeCount"

/** Tile labels on the unlocked report, in page order. Fixed copy, so drawn as text. */
const TILES = ["Listening time", "Daily listeners", "Peak at once", "Average listen"]

/** The four breakdown cells, in page order. */
const BREAKDOWNS = ["Countries", "Devices", "Browsers", "Where they came from"]

/**
 * The Audience page while its fetch is in flight.
 *
 * Added when the station overview's skeleton stopped covering this route — see
 * `(overview)/loading.tsx`. That skeleton was never right for this page, but
 * losing it would have left the transition blank, which reads as a frozen tab.
 *
 * The plan gate lives on the API, so this file cannot know whether the page
 * will come back locked (two tiles and an upsell) or complete (four tiles, a
 * chart and four breakdowns). It draws the complete shape, because guessing
 * short would make the locked page the one that jumps.
 *
 * Same wrappers as the page — `sheet sheet-rules`, one Card per section, the
 * breakdowns as a 2×2 grid whose cells each open on their own hairline — so
 * the flat sheet does not arrive as a stack of boxes and then flatten. The
 * previous version drew boxed cards and a two-cell grid, and the whole page
 * visibly re-laid itself out on every load.
 */
export default function AudienceLoading() {
  return (
    // The Skeleton primitive pulses unconditionally; stopping it here keeps
    // the page still for anyone who asked for reduced motion.
    <div className="sheet sheet-rules flex flex-col gap-6 motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Audience
            <HelpLink
              article="read-your-audience-page"
              label="what the audience numbers mean"
            />
          </h1>
          {/* The blurb below the heading differs between the locked and the
              full page, so it is the one piece of copy that stays a bar. */}
          <Skeleton className="mt-1 h-5 w-96 max-w-full" />
        </div>

        {/* The range switcher: the bordered pill group, with its buttons
            pending because how many there are depends on the plan. */}
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.09] p-1 shrink-0">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-6 w-10" />
        </div>
      </header>

      <Card>
        <CardContent className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {TILES.map((label) => (
            <div key={label} className="flex flex-col gap-1 min-w-0">
              <div className="text-xs text-muted-foreground">{label}</div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {/* AudienceChart: title row, the 112px bars, the date axis. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-medium">Listening time</h2>
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 [&>[data-slot=card]]:border-t [&>[data-slot=card]]:border-white/[0.07] [&>[data-slot=card]]:pt-6">
        {BREAKDOWNS.map((title) => (
          <Card key={title}>
            <CardContent>
              <div className="flex flex-col gap-3 min-w-0">
                <h2 className="text-sm font-medium">{title}</h2>
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-10" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* The folded methodology, closed — it is closed on arrival too. */}
      <HowWeCount />
    </div>
  )
}
