"use client"

import { DEFAULT_BITRATE } from "@/lib/audioEngine"
import { formatClock } from "@/lib/format"
import { cn } from "@/lib/utils"
import { LAMP_LABEL, SIGNAL_TONE, type StudioSignal, type TransportHealth } from "./signal"

/**
 * The studio's one answer to "is it working?".
 *
 * It replaced three competing ones: a green "You're live" banner, a red
 * "On air" strip on the deck (red, for the healthy state), and a 12px grey
 * encoder line in the corner that was the only place a dead socket showed
 * up. Now the whole strip changes state — red while live, a stronger red
 * edge while the mic is open, amber only when listeners are not hearing what
 * the broadcaster thinks they are — and the encoder's health lives inside it.
 */
export function OnAirLamp({
  signal,
  transport,
  uptime,
  listeners,
  action,
}: {
  signal: StudioSignal
  transport: TransportHealth
  uptime: number
  listeners: number | null
  /** The band's own control at the end of the first row (the studio's End). */
  action?: React.ReactNode
}) {
  const tone = SIGNAL_TONE[signal.tone]
  const fault = signal.tone === "fault"
  const lost = transport.stats ? transport.stats.droppedMs / 1000 : 0

  return (
    // The mobile studio's band (mobile/src/components/studio/Band.tsx): a card
    // inset from the page edges with its own fill, so the state reads as an
    // object on the page, not a tint of it. Chip and uptime on the first row;
    // the message and the listener count under them.
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2.5 rounded-3xl border py-3 pl-3.5 pr-3 transition-colors duration-200",
        tone.strip,
      )}
    >
      {/* Keyed on the code so each change of state is announced once. */}
      <p key={signal.code} className="sr-only" role={fault ? "alert" : "status"}>
        {signal.label}. {signal.detail}
      </p>

      <div className="flex items-center gap-2.5">
        <span
          key={signal.code}
          aria-hidden
          className={cn(
            "inline-flex h-[30px] shrink-0 items-center gap-[7px] rounded-[10px] px-3 text-xs",
            LAMP_LABEL,
            tone.chip,
            // A healthy change settles in; a fault blinks three times instead.
            fault ? "animate-[pulse_0.7s_ease-in-out_3] motion-reduce:animate-none" : "lamp-settle",
          )}
        >
          <span className="size-[7px] rounded-full bg-current" />
          {signal.label}
        </span>
        <span className="flex-1 font-mono text-base font-semibold text-foreground tabular-nums">
          <span className="sr-only">On air for </span>
          {formatClock(uptime)}
        </span>
        {/* Web only: the encoder's rate, and audio lost on the way out. */}
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
          <span
            className={cn(transport.stats && transport.stats.bitrate < DEFAULT_BITRATE && "text-foreground")}
            title={transport.stats && transport.stats.bitrate < DEFAULT_BITRATE ? "Lowered to keep up with your connection" : undefined}
          >
            {transport.stats?.bitrate ?? DEFAULT_BITRATE} kbps
          </span>
          {lost > 0 && (
            <span className={cn("ml-1.5", transport.droppingNow ? "text-fault-text" : "text-foreground")}>
              · {lost.toFixed(1)}s lost
            </span>
          )}
        </span>
        {action}
      </div>

      <div className="flex items-start justify-between gap-2.5">
        <span aria-hidden className={cn("min-w-0 flex-1 text-[13px] font-medium leading-snug", tone.text)}>
          {signal.detail}
        </span>
        <span className="shrink-0 font-mono text-xs font-semibold text-foreground tabular-nums">
          {listeners === null ? "–" : listeners.toLocaleString()} listening
        </span>
      </div>
    </div>
  )
}
