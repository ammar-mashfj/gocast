"use client"

import { AudioEngine } from "@/lib/audioEngine"
import { formatClock } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SIGNAL_TONE, type StudioSignal, type TransportHealth } from "./signal"

/**
 * The studio's one answer to "is it working?".
 *
 * It replaced three competing ones: a green "You're live" banner, a red
 * "On air" strip on the deck (red, for the healthy state), and a 12px grey
 * encoder line in the corner that was the only place a dead socket showed
 * up. Now the whole strip changes state — emerald while live, sky while the
 * mic is open, red only when listeners are not hearing what the broadcaster
 * thinks they are — and the encoder's health lives inside it.
 */
export function OnAirLamp({
  signal,
  transport,
  uptime,
  listeners,
  compact = false,
}: {
  signal: StudioSignal
  transport: TransportHealth
  uptime: number
  listeners: number | null
  compact?: boolean
}) {
  const tone = SIGNAL_TONE[signal.tone]
  const fault = signal.tone === "fault"
  const lost = transport.stats ? transport.stats.droppedMs / 1000 : 0

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 border-b transition-colors duration-200",
        compact ? "px-4 py-3" : "px-5 py-3",
        tone.strip,
      )}
    >
      {/* Keyed on the code so each change of state is announced once. */}
      <p key={signal.code} className="sr-only" role={fault ? "alert" : "status"}>
        {signal.label}. {signal.detail}
      </p>

      <div className="flex min-w-0 flex-1 items-center gap-3.5" aria-hidden>
        <span
          key={signal.code}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] font-bold uppercase tracking-[0.08em]",
            tone.chip,
            // A healthy change settles in; a fault blinks three times instead.
            fault ? "animate-[pulse_0.7s_ease-in-out_3] motion-reduce:animate-none" : "lamp-settle",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full bg-current",
              !fault && "animate-pulse motion-reduce:animate-none",
            )}
          />
          {signal.label}
        </span>
        <span className={cn("min-w-0 text-sm leading-snug", tone.text)}>{signal.detail}</span>
      </div>

      <dl className={cn("flex shrink-0 items-center gap-5 text-xs", compact && "w-full justify-between gap-3")}>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">Uptime</dt>
          <dd className="font-mono text-sm text-foreground tabular-nums">{formatClock(uptime)}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Listening now</dt>
          <dd className="text-sm font-semibold text-foreground tabular-nums">
            {listeners === null ? "—" : listeners.toLocaleString()}
          </dd>
          <span className="text-muted-foreground" aria-hidden>listening</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Encoder</dt>
          <dd className="font-mono text-muted-foreground tabular-nums">
            {AudioEngine.encoderInfo().bitrate} kbps
            {lost > 0 && (
              <span className={cn("ml-1.5", transport.droppingNow ? "text-fault-text" : "text-foreground")}>
                · {lost.toFixed(1)}s of audio lost
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
