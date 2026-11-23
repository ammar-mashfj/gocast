import { IconArrowRight, IconCheck } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { ProTag } from "@/components/ds/Tag"
import { cn } from "@/lib/utils"

/**
 * The community page's stills. The relay is the centrepiece: an evening as
 * a chain of presenters, each passing the station to the next — a shape
 * none of the other audience pages use. Eastside is made up.
 */

type Leg = { time: string; who: string; show: string; where: string; kind: "live" | "recorded" | "autodj" }

const RELAY: Leg[] = [
  { time: "17:00", who: "Amira", show: "Kitchen Table Talk", where: "From home", kind: "live" },
  { time: "18:00", who: "Youth Hour", show: "Four students, one mic", where: "From the school hall", kind: "live" },
  { time: "19:00", who: "Tom", show: "The Folk Show", where: "Recorded Tuesday, plays on time", kind: "recorded" },
  { time: "20:00", who: "Joy", show: "Eastside Tonight", where: "From the community centre", kind: "live" },
  { time: "22:00", who: "Overnight", show: "Local bands", where: "From the station’s library", kind: "autodj" },
]

export function PresenterRelay() {
  return (
    <ol
      role="list"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0"
    >
      {RELAY.map((l, i) => {
        const live = l.kind === "live"
        return (
          <li key={l.time} className="relative flex min-w-0 lg:pr-4">
            <div
              className={cn(
                "flex w-full flex-col gap-4 rounded-card p-4",
                live ? "bg-live-tint" : "bg-on-air-tint",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-body-sm tabular-nums text-muted-foreground">{l.time}</span>
                {live ? (
                  <StatusLamp tone="live" size="sm">
                    Live
                  </StatusLamp>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusLamp tone="onair" size="sm">
                      {l.kind === "recorded" ? "Recorded" : "AutoDJ"}
                    </StatusLamp>
                    <ProTag />
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-full font-display text-title-sm",
                  live ? "bg-live text-live-ink" : "bg-on-air text-live-ink",
                )}
              >
                {l.who[0]}
              </span>
              <div className="flex flex-col gap-1">
                <span className="font-display text-heading">{l.who}</span>
                <span className="text-body-sm text-foreground">{l.show}</span>
                <span className="text-body-sm text-muted-foreground">{l.where}</span>
              </div>
            </div>
            {/* The baton: an arrow into the next leg, desktop only. */}
            {i < RELAY.length - 1 && (
              <span
                aria-hidden
                className="absolute top-1/2 right-0 z-10 hidden size-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-background text-muted-foreground lg:flex"
              >
                <IconArrowRight size={16} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The Go live page on the next presenter's laptop, before and after the
 * previous LIVE show ends (live/page.tsx: "You’re already live", polled
 * every 3 s, opens by itself). Only a live source blocks; a recorded AutoDJ
 * show never does — going live just takes over from it.
 */
export function HandoverPicture() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-card bg-card p-5">
        <span className="eyebrow-sm text-text-faint">Youth Hour’s laptop · 17:58</span>
        <span className="font-display text-heading">You’re already live</span>
        <StatusLamp tone="live" size="sm" pulse>
          Another browser
        </StatusLamp>
        <span className="text-body-sm text-muted-foreground">
          Amira is still on air from home. The station takes one source at a time.
        </span>
        <div className="mt-auto flex h-11 items-center justify-center rounded-item bg-surface-raised text-body-sm font-bold text-text-faint">
          Waiting for the show to end
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-[0_0_0_1.5px_var(--color-ok)]">
        <span className="eyebrow-sm text-text-faint">Youth Hour’s laptop · 18:00</span>
        <span className="font-display text-heading">Go live</span>
        <span className="eyebrow-sm inline-flex items-center gap-2 text-ok">
          <IconCheck size={14} stroke={3} /> Amira has signed off
        </span>
        <span className="text-body-sm text-muted-foreground">The page changed by itself: no refresh, no phone call.</span>
        <div className="mt-auto flex h-11 items-center justify-center rounded-item bg-foreground text-body-sm font-bold text-background">
          Go live
        </div>
      </div>
    </div>
  )
}
