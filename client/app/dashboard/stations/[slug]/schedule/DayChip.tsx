"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * One weekday toggle, shared by the two weekly editors: AutoDJ slots on the
 * Schedule page and show times in Station settings.
 *
 * Drawn at 36px so seven fit on a phone row beside nothing else, but the hit
 * area is 44px: the `after:` box reaches 4px past every edge, and the 8px gap
 * the callers set between chips means neighbouring hit areas meet without
 * overlapping. The two editors looked at 32–36px targets on a touch screen,
 * the one place a volunteer is most likely to be fixing a schedule.
 *
 * `tone` is the colour rule: violet for AutoDJ airtime, red for a person
 * live. Filled, as the mobile editor's day picker is (it was a tint while
 * the page's filled button was violet too; now that button is off-white, the
 * discs no longer compete with it).
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
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        // Mobile's day picker: a chosen day is filled with the kind's colour
        // (red for your shows, violet for AutoDJ) with dark ink.
        on
          ? tone === "live"
            ? "border-live bg-live font-bold text-live-ink"
            : "border-on-air bg-on-air font-bold text-background"
          : "border-transparent bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
