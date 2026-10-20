import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import type { AirTone } from "@/lib/airState"

/**
 * The design system's StatusLamp: a dot and a mono caps word.
 *
 *   solid — a filled chip (the band while live, a schedule pill)
 *   soft  — dot in the state colour, word in its pale tint (sidebar, hero)
 *   bare  — dot and word in the surrounding text colour, for a lamp sitting
 *           on a surface that is already the state colour (the red band
 *           while the mic is open, the amber one in silence)
 *
 * Red is live and mic only, violet AutoDJ, amber silence and faults, grey
 * off air: the same `AirTone` the status band uses.
 */
const lamp = cva("inline-flex items-center gap-2 whitespace-nowrap font-mono font-semibold uppercase", {
  variants: {
    variant: {
      solid: "h-7.5 rounded-chip px-3",
      soft: "",
      bare: "",
    },
    size: {
      md: "text-xs tracking-widest",
      sm: "eyebrow-sm gap-1.5",
    },
    tone: { off: "", onair: "", live: "", mic: "", warn: "" },
  },
  compoundVariants: [
    { variant: "solid", tone: "off", className: "bg-text-faint text-foreground" },
    { variant: "solid", tone: "onair", className: "bg-on-air text-live-ink" },
    { variant: "solid", tone: ["live", "mic"], className: "bg-live text-live-ink" },
    { variant: "solid", tone: "warn", className: "bg-fault text-fault-ink" },
    { variant: "soft", tone: "off", className: "text-muted-foreground" },
    { variant: "soft", tone: "onair", className: "text-on-air-text" },
    { variant: "soft", tone: ["live", "mic"], className: "text-live-text" },
    { variant: "soft", tone: "warn", className: "text-fault-text" },
  ],
  defaultVariants: { variant: "soft", size: "md", tone: "off" },
})

const DOT: Record<AirTone, string> = {
  off: "bg-text-faint",
  onair: "bg-on-air",
  live: "bg-live",
  mic: "bg-live",
  warn: "bg-fault",
}

export interface StatusLampProps extends VariantProps<typeof lamp> {
  tone: AirTone
  children: React.ReactNode
  /** Pulse the dot (a live state, where motion is welcome). */
  pulse?: boolean
  className?: string
}

export function StatusLamp({ tone, variant = "soft", size, pulse, className, children }: StatusLampProps) {
  return (
    <span data-slot="status-lamp" data-tone={tone} className={cn(lamp({ variant, size, tone }), className)}>
      <span
        aria-hidden
        className={cn(
          "shrink-0 rounded-full",
          size === "sm" ? "size-1.75" : "size-2",
          variant === "soft" ? DOT[tone] : "bg-current",
          pulse && "animate-pulse motion-reduce:animate-none",
        )}
      />
      {children}
    </span>
  )
}
