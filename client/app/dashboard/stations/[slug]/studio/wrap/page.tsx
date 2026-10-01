"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { signOffKey, type ShowSummary } from "@/components/studio/EndBroadcast"
import { formatAirtime } from "@/lib/format"
import { Button } from "@/components/ds/Button"
import { StatTile } from "@/components/ds/Stat"

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

  useEffect(() => {
    let found: ShowSummary | null = null
    try {
      const raw = sessionStorage.getItem(signOffKey(slug))
      if (raw) {
        const parsed = JSON.parse(raw) as ShowSummary
        if (Date.now() - parsed.endedAt < FRESH_MS) found = parsed
      }
    } catch {
      // Unreadable or blocked: no summary.
    }
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once, after hydration
      setSummary(found)
    } else {
      router.replace(`/dashboard/stations/${slug}`)
    }
  }, [slug, router])

  if (!summary) return null
  const after = AFTER[summary.after]
  const lost = summary.lostSeconds

  return (
    <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5">
      <span className="eyebrow text-text-faint">{after.eyebrow}</span>
      <h1 className="signoff-rise font-display text-hero">That’s a wrap.</h1>
      {after.line && <p className="text-lead text-pretty text-muted-foreground">{after.line}</p>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
        <StatTile label="On air" value={formatAirtime(summary.durationSeconds)} />
        <StatTile label="Peak" value={summary.peakListeners.toLocaleString()} sub="listening at once" />
        {summary.tracksPlayed !== undefined && <StatTile label="Tracks" value={summary.tracksPlayed} />}
        <StatTile label="Audio lost" value={lost > 0 ? `${lost.toFixed(1)} s` : "0 s"} good={lost === 0} />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button size="lg" asChild>
          <Link href={`/dashboard/stations/${slug}`}>Back to station</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link href="/dashboard/broadcasts">See all shows</Link>
        </Button>
      </div>
    </div>
  )
}
