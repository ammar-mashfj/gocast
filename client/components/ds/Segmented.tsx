"use client"

import { RadioGroup } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * The design system's Segmented: a track with one chosen option in
 * off-white. A radio group underneath, so arrow keys move the choice and a
 * screen reader hears "3 of 4".
 *
 *   md — 40px, body type, on the page colour (inside a card)
 *   sm — 30px, mono, on the card colour (a range picker on a page)
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
}

export interface SegmentedProps<T extends string> {
  options: readonly (SegmentedOption<T> | T)[]
  value: T
  onChange: (value: T) => void
  size?: "sm" | "md"
  /** Names the group for assistive tech. */
  "aria-label": string
  className?: string
}

export function Segmented<T extends string>({ options, value, onChange, size = "md", className, ...aria }: SegmentedProps<T>) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      aria-label={aria["aria-label"]}
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-0.75",
        size === "sm" ? "rounded-item bg-card p-0.75" : "rounded-control bg-surface-inset p-1",
        className,
      )}
    >
      {items.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            "flex items-center justify-center px-3 whitespace-nowrap text-muted-foreground transition-colors outline-none",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
            "data-[state=checked]:bg-foreground data-[state=checked]:text-background",
            size === "sm" ? "h-7.5 rounded-segment font-mono text-caption font-semibold" : "h-10 rounded-item text-sm font-semibold",
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
