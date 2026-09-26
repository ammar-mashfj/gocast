"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * One weekday toggle, shared by the Schedule page's two lanes: AutoDJ slots
 * and show times.
 *
 * Drawn at 36px so seven fit on a phone row beside nothing else, but the hit
 * area is 44px: the `after:` box reaches 4px past every edge, and the 8px gap
 * the callers set between chips means neighbouring hit areas meet without
 * overlapping. The two editors looked at 32–36px targets on a touch screen,
 * the one place a volunteer is most likely to be fixing a schedule.
 *
 * `tone` is the One Meaning Rule: violet for AutoDJ airtime, emerald for a
 * person live. It is a tint, not a fill — seven solid discs per row drowned
 * out the page's one filled button.
 */
export function DayChip({
  on,
  tone,
  label,
  onToggle,
  children,
}: {
  on: boolean
  tone: "autodj" | "live"
  /** The full day name, for assistive tech; the chip shows two letters. */
  label: string
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative size-9 shrink-0 cursor-pointer rounded-full border text-xs transition-colors motion-reduce:transition-none",
        "after:absolute after:-inset-1 after:rounded-full",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet",
        on
          ? tone === "live"
            ? "border-live/50 bg-live/15 text-live-text"
            : "border-on-air/50 bg-on-air/15 text-violet"
          : "border-white/[0.09] bg-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
