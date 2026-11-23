"use client"

import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The AI-station hero: a station that never stops, acted out. Tracks move
 * on, the deck count climbs, and the level meter shows each new track
 * landing at the same loudness (GoCast measures every upload and plays it at
 * the station's level — LIQUIDSOAP_APPLY_AMPLIFY, on by default). No play
 * button: a labelled preview. Neon Drift and the tracks are made up.
 */

const TRACKS = ["Chrome Sunset", "Night Grid 04", "Pale Arcade", "Lowlight Drive", "Signal Bloom", "Glass Static"]
/** Each track's original loudness (LUFS) before levelling: AI exports vary. */
const RAW = [-9, -17, -12, -20, -11, -15]
const TRACK_S = 6
const TARGET = -14
const DECK = 600

export function AiStationDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const i = Math.floor(secs / TRACK_S)
  const k = i % TRACKS.length
  const played = 212 + i

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · an AI station, day 41</span>
      <div ref={ref} className="flex flex-col gap-4 rounded-card bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-display text-heading">Neon Drift Radio</span>
            <StatusLamp tone="onair" size="sm" pulse>
              On air · 24/7
            </StatusLamp>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
            <IconHeadphones size={16} />
            <span className="text-foreground">{demoListeners(58, secs)}</span>
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-well bg-background p-4">
          <span className="eyebrow-sm text-text-faint">Now</span>
          <span key={k} className="animate-in fade-in duration-500 truncate font-display text-title-sm">
            {TRACKS[k]}
          </span>
          <span className="text-body-sm text-muted-foreground">AI-made synthwave</span>
        </div>

        {/* Before and after levelling: the file's loudness, and what plays. */}
        <div className="flex flex-col gap-2.5">
          <Meter label="As uploaded" lufs={RAW[k]} tone="bg-surface-strong" />
          <Meter label="On air" lufs={TARGET} tone="bg-on-air" />
        </div>

        <div className="flex items-center justify-between gap-3 font-mono text-caption tabular-nums text-text-faint">
          <span>
            {played} of {DECK} played, no repeats yet
          </span>
          <span>{TARGET} LUFS</span>
        </div>
      </div>
    </div>
  )
}

function Meter({ label, lufs, tone }: { label: string; lufs: number; tone: string }) {
  // -24 LUFS empty … -6 LUFS full
  const pct = Math.max(4, Math.min(100, ((lufs + 24) / 18) * 100))
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.25rem] items-center gap-3">
      <span className="eyebrow-sm text-text-faint">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-raised">
        <span className={cn("block h-full rounded-full transition-[width] duration-700", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right font-mono text-caption tabular-nums text-muted-foreground">{lufs}</span>
    </div>
  )
}
