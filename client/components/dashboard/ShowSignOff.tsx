"use client"

import { useEffect, useState } from "react"
import { IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { signOffKey, type ShowSummary } from "@/components/studio/EndBroadcast"
import { formatDuration } from "@/lib/format"

/** A summary older than this is from another visit, not the show just ended. */
const FRESH_MS = 30 * 60 * 1000

/**
 * The end of a show, as a moment rather than a redirect.
 *
 * Ending a broadcast used to drop the host on the overview with nothing to
 * say it had happened — the last thing they felt about the show was the
 * confirm dialog. This card reads the summary the studio left behind (how
 * long, how many at the peak, how much audio was lost) and says what the
 * station is doing now. Shown once: dismissing it, or the next visit,
 * clears it.
 */
export function ShowSignOff({ slug }: { slug: string }) {
  const [summary, setSummary] = useState<ShowSummary | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(signOffKey(slug))
      if (!raw) return
      sessionStorage.removeItem(signOffKey(slug))
      const parsed = JSON.parse(raw) as ShowSummary
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage on mount
      if (Date.now() - parsed.endedAt < FRESH_MS) setSummary(parsed)
    } catch {
      // Blocked storage or a malformed entry: no card, nothing else breaks.
    }
  }, [slug])

  if (!summary) return null

  const facts = [
    { label: "On air", value: formatDuration(summary.durationSeconds) },
    { label: "Peak listeners", value: summary.peakListeners.toLocaleString() },
    { label: "Audio lost", value: summary.lostSeconds > 0 ? `${summary.lostSeconds.toFixed(1)}s` : "None" },
  ]

  return (
    <section
      aria-labelledby="signoff-title"
      className="signoff-rise relative flex flex-col gap-5 rounded-2xl border border-white/[0.09] bg-panel px-6 py-5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] md:flex-row md:items-center md:gap-10"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="signoff-title" className="font-display text-xl font-semibold tracking-tight">
          That&apos;s a wrap.
        </h2>
        <p className="text-sm text-muted-foreground">
          {summary.after === "autodj"
            ? "AutoDJ picks back up in a few seconds, so your station stays on air."
            : summary.after === "silence"
              ? "AutoDJ has nothing to play, so your station goes silent and switches off in a few minutes. Add tracks to its playlist to keep it on air next time."
              : "Your station is off air until your next show."}
        </p>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {facts.map((f, i) => (
          <div
            key={f.label}
            className="signoff-rise flex flex-col gap-0.5"
            style={{ animationDelay: `${180 + i * 70}ms` }}
          >
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-9 text-muted-foreground md:static md:ml-auto"
        onClick={() => setSummary(null)}
        aria-label="Dismiss show summary"
      >
        <IconX size={16} />
      </Button>
    </section>
  )
}
