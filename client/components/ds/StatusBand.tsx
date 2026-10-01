import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import type { AirTone } from "@/lib/airState"
import { StatusLamp } from "./StatusLamp"

/**
 * The strip under the top bar that says what the station is doing, on every
 * page (the prototype's status band). Its fill is the state:
 *
 *   off    plain card                 onair  violet tint
 *   live   red tint, pale-red words   mic    solid red, dark ink
 *   warn   solid amber, dark ink
 *
 * Presentational: the shell's StationBand decides the state and the
 * buttons. On the two solid fills `--ink` / `--paper` are set for the `ink`
 * Button variant.
 */
const band = cva(
  "flex min-h-13 flex-wrap items-center gap-x-3.5 gap-y-2 px-gutter py-2 transition-colors duration-150",
  {
    variants: {
      tone: {
        off: "bg-card text-foreground",
        onair: "bg-on-air-tint text-foreground",
        live: "bg-live-tint text-live-soft",
        mic: "bg-live text-live-ink [--ink:var(--color-live-ink)] [--paper:var(--color-live)]",
        warn: "bg-fault text-fault-ink [--ink:var(--color-fault-ink)] [--paper:var(--color-fault)]",
      },
    },
  },
)

const LAMP_VARIANT = { off: "soft", onair: "soft", live: "solid", mic: "bare", warn: "bare" } as const

export interface StatusBandProps {
  tone: AirTone
  label: string
  message: string
  /** Right-hand readouts: uptime, listener count. Mono. */
  meta?: React.ReactNode
  /** Buttons, last in the row. */
  children?: React.ReactNode
  className?: string
}

export function StatusBand({ tone, label, message, meta, children, className }: StatusBandProps) {
  return (
    <section aria-label="Station status" data-tone={tone} className={cn(band({ tone }), className)}>
      {/* Announced when the state changes, not on every new sentence. */}
      <span aria-live="polite">
        <StatusLamp tone={tone} variant={LAMP_VARIANT[tone]} pulse={tone === "mic"}>
          {label}
        </StatusLamp>
      </span>
      <p className="min-w-48 flex-1 text-sm leading-snug font-semibold">{message}</p>
      {meta && <div className="flex items-center gap-3.5 font-mono text-xs font-semibold tracking-widest tabular-nums">{meta}</div>}
      {children && <div className="flex items-center gap-1.5">{children}</div>}
    </section>
  )
}
