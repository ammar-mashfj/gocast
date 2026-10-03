"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // The design system's Switch: 40×24, live red when on with a
        // dark-ink knob, warm grey track and faint knob when off.
        "peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent px-[2px] transition-all outline-none",
        "data-[state=checked]:bg-live data-[state=unchecked]:bg-border-subtle",
        "focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-[18px] rounded-full ring-0 transition-transform",
          "data-[state=checked]:translate-x-4 data-[state=checked]:bg-live-ink data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-text-faint"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
