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
  /** Used below sm in place of `message`, so the band stays one row. "" shows none there. */
  shortMessage?: string
  /** Right-hand readouts: uptime, listener count. Mono. */
  meta?: React.ReactNode
  /** Buttons, last in the row. */
  children?: React.ReactNode
  className?: string
}

export function StatusBand({ tone, label, message, shortMessage, meta, children, className }: StatusBandProps) {
  return (
    <section aria-label="Station status" data-tone={tone} className={cn(band({ tone }), className)}>
      {/* Announced when the state changes, not on every new sentence. */}
      {/* Phones (below sm): one row with the short sentence when there is
          one; without it (a fault to read in full) the lamp, readouts and
          buttons share the first row and the sentence gets its own under
          them. From sm it is one row in source order. */}
      {/* flex, not inline: an inline box sits the lamp on a text baseline,
          which dropped it a few pixels below the sentence beside it. */}
      <span aria-live="polite" className="flex">
        <StatusLamp tone={tone} variant={LAMP_VARIANT[tone]} pulse={tone === "mic"}>
          {label}
        </StatusLamp>
      </span>
      <p
        className={cn(
          "text-sm leading-snug sm:order-none sm:min-w-48 sm:flex-1 sm:basis-auto",
          // Live, the sentence is the warning (closing the tab ends the show):
          // bold, so it's read rather than skimmed.
          tone === "live" ? "font-bold" : "font-semibold",
          shortMessage !== undefined ? "min-w-0 flex-1" : "order-last basis-full",
        )}
      >
        {shortMessage !== undefined ? (
          <>
            <span className="sm:hidden">{shortMessage}</span>
            <span className="max-sm:hidden">{message}</span>
          </>
        ) : (
          message
        )}
      </p>
      {/* A fault (losing audio, a slow line, silence) is read out in full and
          at once: the polite label above only says the state changed. Always
          rendered, so a fault arriving is a change the reader hears. */}
      <p role="alert" className="sr-only">
        {tone === "warn" ? `${label}. ${message}` : ""}
      </p>
      {/* empty:hidden — callers pass a fragment whose parts may all be off,
          and an empty box still takes a gap in the row. */}
      {meta && <div className="flex items-center gap-3.5 font-mono text-xs font-semibold tracking-widest tabular-nums empty:hidden">{meta}</div>}
      {children && <div className="ml-auto flex items-center gap-1.5 sm:ml-0">{children}</div>}
    </section>
  )
}
