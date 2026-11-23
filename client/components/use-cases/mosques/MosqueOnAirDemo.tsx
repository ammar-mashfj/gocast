"use client"

import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The mosque hero: a Friday on a mosque's station, acted out. Recitation
 * plays (AutoDJ, Pro), the imam goes live for the khutbah (Free), then the
 * recitation picks up again. Titles are bilingual; `dir="auto"` runs the
 * Arabic right to left, in the marketing surface's Arabic font. The
 * recitations are the mosque's own imam's (rights-clean, as the page
 * advises). No play button: a labelled preview. Al-Noor is made up.
 */

const FRIDAY = [
  { en: "Surah Al-Kahf", ar: "سورة الكهف", by: "Recited by Imam Yusuf", kind: "autodj" as const },
  { en: "Jumu’ah khutbah", ar: "خطبة الجمعة", by: "Imam Yusuf, live from the minbar", kind: "live" as const },
  { en: "Surah Yasin", ar: "سورة يس", by: "Recited by Imam Yusuf", kind: "autodj" as const },
]

const STEP_S = 7

export function MosqueOnAirDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const now = FRIDAY[Math.floor(secs / STEP_S) % FRIDAY.length]
  const live = now.kind === "live"

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · Friday at Al-Noor</span>
      <div ref={ref} className="flex flex-col gap-4 rounded-card bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-display text-heading">Al-Noor Mosque Radio</span>
            <span dir="auto" className="truncate text-body-sm text-muted-foreground">
              إذاعة مسجد النور
            </span>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
            <IconHeadphones size={16} />
            <span className="text-foreground">{demoListeners(live ? 164 : 47, secs)}</span>
          </span>
        </div>

        <div
          key={now.en}
          className={cn(
            "flex animate-in fade-in flex-col gap-2 rounded-well p-4 duration-500",
            live ? "bg-live-tint shadow-[0_0_0_1.5px_var(--color-live)]" : "bg-background",
          )}
        >
          {live ? (
            <StatusLamp tone="live" size="sm" pulse>
              Live
            </StatusLamp>
          ) : (
            <StatusLamp tone="onair" size="sm">
              Recitation · AutoDJ
            </StatusLamp>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-display text-title-sm">{now.en}</span>
            <span dir="auto" className="shrink-0 text-title-sm font-semibold">
              {now.ar}
            </span>
          </div>
          <span className="truncate text-body-sm text-muted-foreground">{now.by}</span>
        </div>
      </div>
    </div>
  )
}
