"use client"

import { ToggleGroup } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * Pick days of the week: round chips, filled when chosen. The fill says
 * whose days they are — `onair` (violet) for an AutoDJ slot, `neutral`
 * (off-white) for your show times, which are a promise to listeners and not
 * live right now (red is only for live). `live` is kept for a control that is
 * about going live.
 */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export function DayToggle({
  value,
  onChange,
  tone = "onair",
  size = "md",
  labels = WEEKDAYS,
  stretch = false,
  "aria-label": ariaLabel,
  className,
}: {
  /** Chosen days as indexes into `labels` (0 = Monday). */
  value: number[]
  onChange: (days: number[]) => void
  tone?: "live" | "onair" | "neutral"
  size?: "sm" | "md"
  labels?: readonly string[]
  /** Share the row's width in seven equal columns, so a narrow card never wraps one day alone. */
  stretch?: boolean
  "aria-label": string
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="multiple"
      value={value.map(String)}
      onValueChange={(v) => onChange(v.map(Number).sort((a, b) => a - b))}
      aria-label={ariaLabel}
      className={cn(stretch ? "grid grid-cols-7 gap-1.5" : "flex flex-wrap gap-1.5", className)}
    >
      {labels.map((label, i) => (
        <ToggleGroup.Item
          key={label}
          value={String(i)}
          aria-label={label}
          className={cn(
            "flex items-center justify-center rounded-full font-semibold transition-colors outline-none",
            "bg-surface-control text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            tone === "live" && "data-[state=on]:bg-live data-[state=on]:text-live-ink",
            tone === "onair" && "data-[state=on]:bg-on-air data-[state=on]:text-live-ink",
            tone === "neutral" && "data-[state=on]:bg-foreground data-[state=on]:text-background",
            size === "sm" ? "h-9.5 text-caption" : "h-11 text-body-sm",
            stretch ? "w-full" : size === "sm" ? "w-9.5" : "w-11",
          )}
        >
          {label.slice(0, size === "sm" ? 1 : 2)}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
