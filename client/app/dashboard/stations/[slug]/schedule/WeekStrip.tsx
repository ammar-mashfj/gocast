"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MINUTES_PER_DAY = 24 * 60

/** Distinct enough at a glance, muted enough to sit on a dark card. Indexed by playlist order in the rail. */
const SWATCHES = [
  "bg-primary/70",
  "bg-sky-500/60",
  "bg-amber-500/60",
  "bg-emerald-500/60",
  "bg-fuchsia-500/60",
  "bg-rose-500/60",
  "bg-teal-500/60",
  "bg-indigo-500/60",
]

export interface StripSlot {
  key: string
  playlistId: string
  label: string | null
  days: number[]
  start_time: string
  end_time: string
}

interface Props {
  slots: StripSlot[]
  /** id → name, in rail order; the index picks the colour. */
  playlists: Array<{ id: string; name: string }>
  defaultName: string
  /** Rows to paint as conflicting (from the editor's own overlap check). */
  conflicts?: Set<string>
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

/**
 * Seven day bands, each a 24-hour axis with the slots painted in per-playlist
 * colours; the gaps ARE the default playlist, which is why they are labelled
 * once rather than drawn. A slot past midnight is drawn on the day it starts
 * and continues on the next row, which is exactly the rule the API applies.
 */
export function WeekStrip({ slots, playlists, defaultName, conflicts }: Props) {
  const colour = useMemo(() => {
    const map = new Map<string, string>()
    playlists.forEach((p, i) => map.set(p.id, SWATCHES[i % SWATCHES.length]))
    return map
  }, [playlists])

  const nameOf = useMemo(() => new Map(playlists.map((p) => [p.id, p.name])), [playlists])

  // Every segment to draw, split at midnight so each lives in one row.
  const segments = useMemo(() => {
    const out: Array<{ day: number; from: number; to: number; slot: StripSlot }> = []
    for (const slot of slots) {
      const start = minutes(slot.start_time)
      let duration = minutes(slot.end_time) - start
      if (duration <= 0) duration += MINUTES_PER_DAY
      for (const day of slot.days) {
        const end = start + duration
        if (end > MINUTES_PER_DAY) {
          out.push({ day, from: start, to: MINUTES_PER_DAY, slot })
          out.push({ day: (day + 1) % 7, from: 0, to: end - MINUTES_PER_DAY, slot })
        } else {
          out.push({ day, from: start, to: end, slot })
        }
      }
    }
    return out
  }, [slots])

  const used = useMemo(() => new Set(slots.map((s) => s.playlistId)), [slots])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        <span />
        <div className="relative h-4 text-[10px] text-muted-foreground tabular-nums">
          {[0, 6, 12, 18, 24].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {h === 24 ? "24" : String(h).padStart(2, "0")}
            </span>
          ))}
        </div>

        {DAY_NAMES.map((name, day) => (
          <div key={name} className="contents">
            <span className="text-xs text-muted-foreground self-center">{name}</span>
            <div className="relative h-6 rounded bg-muted/60 overflow-hidden">
              {[6, 12, 18].map((h) => (
                <span
                  key={h}
                  className="absolute top-0 bottom-0 w-px bg-border/70"
                  style={{ left: `${(h / 24) * 100}%` }}
                />
              ))}
              {segments
                .filter((s) => s.day === day)
                .map((s, i) => (
                  <span
                    key={`${s.slot.key}-${i}`}
                    title={`${s.slot.label ?? nameOf.get(s.slot.playlistId) ?? ""} · ${s.slot.start_time}–${s.slot.end_time}`}
                    className={cn(
                      "absolute top-0.5 bottom-0.5 rounded-sm",
                      conflicts?.has(s.slot.key) ? "bg-destructive/70 ring-1 ring-destructive" : colour.get(s.slot.playlistId),
                    )}
                    style={{
                      left: `${(s.from / MINUTES_PER_DAY) * 100}%`,
                      width: `${((s.to - s.from) / MINUTES_PER_DAY) * 100}%`,
                    }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-muted/60 border border-border" />
          {defaultName} (default)
        </span>
        {playlists
          .filter((p) => used.has(p.id))
          .map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-block size-2.5 rounded-sm", colour.get(p.id))} />
              {p.name}
            </span>
          ))}
      </div>
    </div>
  )
}
