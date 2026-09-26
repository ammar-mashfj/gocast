"use client"

import { useMemo, useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MINUTES_PER_DAY = 24 * 60

/**
 * Every slot is AutoDJ airtime, so every swatch is a step on the on-air
 * violet ramp (DESIGN.md, the Live Is Brightest Rule) rather than a rainbow.
 * The old set spent emerald, amber and sky on playlists, and those colours
 * mean live, Pro and mic everywhere else in the dashboard. The legend below
 * carries the playlist names; the ramp only has to keep neighbours apart.
 * Indexed by playlist order in the rail.
 */
const SWATCHES = [
  "bg-violet-950 ring-1 ring-inset ring-violet-400/40",
  "bg-violet-full/55",
  "bg-indigo-300/70",
  "bg-violet-200/85",
]

/** An advertised live show: a start, never a window (see StationSchedule). */
export interface StripShow {
  key: string
  label: string | null
  days: number[]
  start_time: string
}

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
  /**
   * Show times (the Schedule page's live lane), when a person means to be live. Drawn as solid
   * emerald marks at their start, above the AutoDJ ramp, because a live show
   * takes over from any slot (DESIGN.md, the Live Is Brightest Rule). A show
   * has no end time, so it is a mark, not a bar — drawing a length would be
   * inventing one.
   */
  shows?: StripShow[]
  /**
   * What the empty stretches mean. Defaults to the default playlist; on a
   * plan without AutoDJ they are silence, and saying "AutoDJ" there would
   * promise music the station won't play.
   */
  gapLabel?: string
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

/**
 * The week at a glance, drawn above the slot editor as its summary: a
 * volunteer should be able to answer "what's on Sunday morning?" from this
 * alone. It reads the editor's unsaved rows, so it moves as they are edited.
 *
 * Seven day bands, each a 24-hour axis with the slots painted in per-playlist
 * colours; the gaps ARE the default playlist, which is why they are labelled
 * once rather than drawn. A slot past midnight is drawn on the day it starts
 * and continues on the next row, which is exactly the rule the API applies.
 */
export function WeekStrip({ slots, playlists, defaultName, conflicts, shows = [], gapLabel }: Props) {
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

  const marks = useMemo(
    () =>
      shows
        .filter((show) => show.start_time !== "")
        .flatMap((show) => show.days.map((day) => ({ day, at: minutes(show.start_time), show }))),
    [shows],
  )

  // The axis follows the viewer's clock, like the native time fields below
  // it: a 12-hour locale got "18" on the strip and "6:00 PM" in the inputs.
  const hourLabel = useHourLabel()

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        <span />
        <div className="relative h-4 text-[11px] text-muted-foreground tabular-nums">
          {[0, 6, 12, 18, 24].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {hourLabel(h)}
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
                      conflicts?.has(s.slot.key) ? "bg-fault/70 ring-1 ring-fault" : colour.get(s.slot.playlistId),
                    )}
                    style={{
                      left: `${(s.from / MINUTES_PER_DAY) * 100}%`,
                      width: `${((s.to - s.from) / MINUTES_PER_DAY) * 100}%`,
                    }}
                  />
                ))}
              {marks
                .filter((m) => m.day === day)
                .map((m, i) => (
                  <span
                    key={`${m.show.key}-${i}`}
                    title={`${m.show.label ?? "Live show"} · live from ${m.show.start_time}`}
                    className="absolute top-0 bottom-0 z-10 w-1 -translate-x-1/2 rounded-full bg-live"
                    style={{ left: `${(m.at / MINUTES_PER_DAY) * 100}%` }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {marks.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-live-text">
            <span className="inline-block h-2.5 w-1 rounded-full bg-live" />
            Live show starts
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-muted/60 border border-border" />
          {gapLabel ?? `AutoDJ: ${defaultName} (default)`}
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

/**
 * Hour labels for the axis in the viewer's own 12- or 24-hour clock.
 *
 * Resolved after mount: the server has no idea what the browser's locale is,
 * and rendering it there would mismatch on hydration. The first paint uses
 * 24-hour digits, which every reader can parse.
 */
function useHourLabel(): (h: number) => string {
  // useSyncExternalStore gives the server snapshot (24-hour) during hydration
  // and the browser's answer after, without a setState-in-effect round trip.
  const twelveHour = useSyncExternalStore(
    noopSubscribe,
    () => {
      const cycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle
      return cycle === "h12" || cycle === "h11"
    },
    () => false,
  )
  return (h) => {
    if (!twelveHour) return h === 24 ? "24" : String(h).padStart(2, "0")
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}${h % 24 < 12 ? "am" : "pm"}`
  }
}

/** The locale never changes under a running page, so there is nothing to subscribe to. */
function noopSubscribe(): () => void {
  return () => {}
}
