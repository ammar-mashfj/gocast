"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * The design system's Switch: 40×24, the knob dark ink when on. The colour
 * says what is switched — `live` (red) for the mic, `onair` (violet) for
 * AutoDJ and jingles.
 */
export function Switch({
  tone = "onair",
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { tone?: "live" | "onair" }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-item bg-surface-strong p-0.75 transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45",
        tone === "live" ? "data-[state=checked]:bg-live" : "data-[state=checked]:bg-on-air",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4.5 rounded-full bg-text-faint transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-live-ink" />
    </SwitchPrimitive.Root>
  )
}

/**
 * A setting with its switch: title, a line under it, the switch on the right.
 * The whole row is the label, so clicking the words flips it.
 */
export function SwitchRow({
  title,
  description,
  tone,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  tone?: "live" | "onair"
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const id = React.useId()
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-well bg-card px-4 py-3.5", className)}>
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.75">
        <span className="text-body font-semibold">{title}</span>
        {description && <span className="text-caption text-text-faint">{description}</span>}
      </label>
      <Switch id={id} tone={tone} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}
