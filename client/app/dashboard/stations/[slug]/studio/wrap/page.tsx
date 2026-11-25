"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { signOffKey, type ShowSummary } from "@/components/studio/EndBroadcast"
import { formatAirtime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { StatTile } from "@/components/ds/Stat"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { IDLE_MS, WARN_MS, describeDuration, idleEndedKey, idleTimings } from "@/lib/idleShow"
import { usePlan } from "@/contexts/AccountContext"
import { isSigningOut } from "@/lib/signOutState"

/** A summary older than this is from another visit, not the show just ended. */
const FRESH_MS = 30 * 60 * 1000

const AFTER: Record<ShowSummary["after"], { eyebrow: string; line: string | null }> = {
  autodj: { eyebrow: "Show ended · AutoDJ has the station", line: null },
  silence: {
    eyebrow: "Show ended · AutoDJ has nothing to play",
    line: "Your station goes silent and switches off in a few minutes. Add tracks to AutoDJ’s playlist to keep it on air next time.",
  },
  off_air: { eyebrow: "Show ended · Station off air", line: null },
}

/**
 * "That's a wrap." — the end of a show as a moment, not a redirect: how long
 * it ran, the most listening at once, how many tracks played, and how much
 * audio was lost on the way. Reads the summary End show left in this tab
 * (once); without one — a reload later, storage blocked — there is nothing
 * to say, and it goes to the overview.
 */
export default function WrapPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [summary, setSummary] = useState<ShowSummary | null>(null)
  // The idle check ended this show (IdleShowGuard): say so, and offer the
  // thing that would have kept the station on air.
  const [endedIdle, setEndedIdle] = useState(false)
  const checkout = useProCheckout()
  const timings = idleTimings(usePlan())
  // What the first read found. The read deletes the stored summary, and
  // React's development double-run would otherwise find it gone the second
  // time and send the host to the overview a second after the wrap appeared.
  const read = useRef<ShowSummary | null>(null)

  useEffect(() => {
    if (read.current) return
    let found: ShowSummary | null = null
    try {
      const key = signOffKey(slug)
      const raw = sessionStorage.getItem(key)
      if (raw) {
        // Read once: left in place, a later idle hand-off within the half
        // hour would show this show's wrap again.
        sessionStorage.removeItem(key)
        const parsed = JSON.parse(raw) as ShowSummary
        if (Date.now() - parsed.endedAt < FRESH_MS) found = parsed
      }
    } catch {
      // Unreadable or blocked: no summary.
    }
    let idle = false
    try {
      const key = idleEndedKey(slug)
      const at = Number(sessionStorage.getItem(key))
      sessionStorage.removeItem(key)
      idle = at > 0 && Date.now() - at < FRESH_MS
    } catch {
      // Unreadable or blocked: the wrap just doesn't say why.
    }
    if (found) {
      read.current = found
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once, after hydration
      setEndedIdle(idle)
      setSummary(found)
    } else if (!isSigningOut()) {
      router.replace(`/dashboard/stations/${slug}`)
    }
  }, [slug, router])

  if (!summary) return null
  const after = AFTER[summary.after]
  const lost = summary.lostSeconds
  const stats: { label: string; value: React.ReactNode; sub?: string; good?: boolean }[] = [
    { label: "On air", value: formatAirtime(summary.durationSeconds) },
    { label: "Peak", value: summary.peakListeners.toLocaleString(), sub: "listening at once" },
    ...(summary.tracksPlayed !== undefined ? [{ label: "Tracks", value: summary.tracksPlayed }] : []),
    { label: "Audio lost", value: lost > 0 ? `${lost.toFixed(1)} s` : "0 s", good: lost === 0 },
  ]

  return (
    <div className="mx-auto flex w-full max-w-190 flex-col gap-4 sm:gap-5.5">
      <span className="eyebrow text-text-faint">{after.eyebrow}</span>
      <h1 className="signoff-rise font-display text-hero">That’s a wrap.</h1>
      {after.line && <p className="text-lead text-pretty text-muted-foreground">{after.line}</p>}
      {endedIdle && (
        <section className="flex flex-col gap-4 rounded-panel bg-card p-4.5 sm:p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-title text-balance">The show ended because nobody was at the desk</h2>
            <p className="text-body leading-relaxed text-pretty text-muted-foreground">
              The studio went untouched for {describeDuration(timings?.idleMs ?? IDLE_MS)}, and nobody answered within{" "}
              {describeDuration(timings?.warnMs ?? WARN_MS)}. Free shows need someone in the studio.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 rounded-well bg-on-air-tint p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-body font-bold">Keep playing while you’re away</p>
              <p className="text-body leading-relaxed text-pretty text-muted-foreground">
                With Pro, AutoDJ plays your music 24/7. No laptop left on.
              </p>
            </div>
            <Button size="lg" className="shrink-0" onClick={() => checkout.open()}>
              Get AutoDJ
            </Button>
          </div>
        </section>
      )}
      {/* Phones: the numbers in one card, one row, so the buttons stay on the
          first screen (two rows of tiles pushed them below it). Values sit at
          the bottom so they line up when a label ("Audio lost") wraps. */}
      <dl className="flex rounded-well bg-card py-3.5 sm:hidden">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 border-line px-3 not-first:border-l">
            <dt className="eyebrow font-medium text-balance text-text-faint">{stat.label}</dt>
            <dd className={cn("font-display text-title font-bold tabular-nums", stat.good && "text-ok")}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5 max-sm:hidden">
        {stats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} good={stat.good} />
        ))}
      </div>
      {/* Phones: Go live again across the width, the other two in one shorter
          row under it, so the page stays about a screen tall. Their padding
          shrinks there too: buttons never wrap their text, and at full size
          the two labels side by side overflow a 360px screen. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        {/* Straight back on air: the Go live page offers to pick the saved
            queue up where this show left it. Most wanted after a show that
            ended without the host meaning it to (the idle check, a drop). */}
        <Button size="lg" dot="live" asChild>
          <Link href={`/dashboard/stations/${slug}/live`}>Go live again</Link>
        </Button>
        <div className="grid grid-cols-2 gap-2.5 sm:contents">
          <Button size="lg" variant="subtle" className="min-w-0 max-sm:h-10 max-sm:px-3 max-sm:text-sm" asChild>
            <Link href={`/dashboard/stations/${slug}`}>Back to station</Link>
          </Button>
          <Button size="lg" variant="ghost" className="min-w-0 max-sm:h-10 max-sm:px-3 max-sm:text-sm" asChild>
            <Link href="/dashboard/broadcasts">See all shows</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
