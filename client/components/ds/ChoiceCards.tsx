"use client"

import { RadioGroup } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * A choice between a few things that each need a sentence: "Mic + music" or
 * "Music only", "Pick up where you stopped" or "Start over". The chosen card
 * is off-white with dark ink (the prototype's mode cards); a radio group
 * underneath, so arrows move the choice.
 */
export interface Choice<T extends string> {
  value: T
  title: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
}

export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  "aria-label": ariaLabel,
  className,
}: {
  options: readonly Choice<T>[]
  value: T
  onChange: (value: T) => void
  /** md: the 22px title of a main choice; sm: a quieter secondary one. */
  size?: "sm" | "md"
  "aria-label": string
  className?: string
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-label={ariaLabel}
      className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-2.5", className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            "group flex flex-col gap-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45",
            "bg-card text-foreground hover:bg-surface-raised data-[state=checked]:bg-foreground data-[state=checked]:text-background",
            size === "md" ? "rounded-panel p-5" : "rounded-well p-4",
          )}
        >
          <span className="eyebrow text-muted-foreground group-data-[state=checked]:text-text-faint">
            <span className="group-data-[state=checked]:hidden">Tap to choose</span>
            <span className="hidden group-data-[state=checked]:inline">Selected</span>
          </span>
          <span className={cn("font-display", size === "md" ? "text-title-sm" : "text-base font-bold")}>{o.title}</span>
          {o.description && (
            <span className="text-sm text-muted-foreground group-data-[state=checked]:text-text-faint">{o.description}</span>
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
