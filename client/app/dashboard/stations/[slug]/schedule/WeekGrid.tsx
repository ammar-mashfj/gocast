"use client"

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { StationSchedule } from "@/interfaces/Station"
import {
  DAY_MINUTES,
  SNAP,
  edgeLimits,
  freeBounds,
  freeSpanAt,
  fromSpan,
  segments,
  toClock,
  toMinutes,
  weekSpan,
  type Block,
} from "./weekModel"

/** Monday first, as a week is read; values are the API's weekdays (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Hour labels over the grid: every two hours, so they never crowd at laptop widths. */
const HOUR_LABELS = Array.from({ length: 13 }, (_, i) => i * 2)

/**
 * Every slot is AutoDJ airtime, so every swatch is a step on the on-air
 * violet ramp (DESIGN.md, the One Meaning Rule) rather than a rainbow, with
 * the ink that reads on it. Indexed by playlist order.
 */
export const SWATCHES = [
  { fill: "bg-violet-950 ring-1 ring-inset ring-violet-400/40", ink: "text-violet-100", dot: "bg-violet-950 ring-1 ring-violet-400/60" },
  { fill: "bg-violet-full/75", ink: "text-white", dot: "bg-violet-full" },
  { fill: "bg-indigo-300/85", ink: "text-indigo-950", dot: "bg-indigo-300" },
  { fill: "bg-violet-200/90", ink: "text-violet-950", dot: "bg-violet-200" },
]

export type Swatch = (typeof SWATCHES)[number]

interface Props {
  blocks: Block[]
  shows: StationSchedule[]
  showsHref: string
  swatchFor: (playlistId: string) => Swatch
  nameFor: (block: Block) => string
  selectedKey: string | null
  /** Keys sharing the selection's playlist, name and times: the same slot on other days. */
  siblings: Set<string>
  overlaps: Set<string>
  /** Station-clock "now", or null before mount / without a timezone. */
  now: { day: number; minute: number } | null
  readOnly: boolean
  onSelect: (key: string) => void
  /** A new slot on `day`, as a week-minute span. */
  onCreate: (day: number, span: [number, number]) => void
  onChange: (block: Block) => void
}

type EdgeDrag = {
  kind: "edge"
  block: Block
  edge: "start" | "end"
  originX: number
  /** Pixels per minute of the row the drag started in. */
  scale: number
  origin: number
  other: number
  limits: [number, number]
}
type CreateDrag = {
  kind: "create"
  day: number
  originX: number
  anchor: number
  bounds: [number, number]
  /** The span drawn so far, in minutes of the day. Kept here, not only in
   *  React state: a pointerup in the same frame as the last move would read
   *  a ghost one move behind and create the slot one snap short. */
  span: { from: number; to: number } | null
}

/**
 * The week as a timeline: one row per day, midnight to midnight left to
 * right, so the whole week fits on one screen without scrolling — radio
 * programming is mostly long blocks, and this draws them wide.
 *
 * Drag along an empty stretch to draw a slot (a plain click makes an hour);
 * drag a slot's left or right edge to move its start or end. On a touch
 * screen a finger on the rows scrolls: the grid overflows sideways on a
 * phone, and rows that swallowed every touch left only the day labels to pan
 * with. A tap still makes an hour, and the dialog sets exact times; drawing
 * a span and dragging edges are for mouse and pen, which never scroll a
 * page. An edge drag
 * changes THAT day only — the slot splits off from its siblings — so weekday
 * mornings and weekend mornings can differ without any setting for it.
 * Everything snaps to 15 minutes and stops at the neighbouring slot, because
 * the server refuses overlaps.
 *
 * Show times are drawn as dashed marks for context — going live takes over
 * from any slot — and link to Station settings, where they are edited.
 */
export function WeekGrid({
  blocks,
  shows,
  showsHref,
  swatchFor,
  nameFor,
  selectedKey,
  siblings,
  overlaps,
  now,
  readOnly,
  onSelect,
  onCreate,
  onChange,
}: Props) {
  const drag = useRef<EdgeDrag | CreateDrag | null>(null)
  const [ghost, setGhost] = useState<{ day: number; from: number; to: number } | null>(null)

  const allSegments = blocks.flatMap(segments)
  const snap = (minutes: number) => Math.round(minutes / SNAP) * SNAP
  const pct = (minutes: number) => `${(minutes / DAY_MINUTES) * 100}%`

  // ── Edge drags ──

  function startEdge(e: ReactPointerEvent<HTMLSpanElement>, block: Block, edge: "start" | "end") {
    if (readOnly) return
    e.stopPropagation()
    e.preventDefault()
    const row = (e.currentTarget.closest("[data-day-row]") as HTMLElement | null)?.getBoundingClientRect()
    if (!row) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // The handle can vanish mid-drag: pushing an end past midnight (or a
    // start before it) re-cuts the block into segments and the segment that
    // carried this handle no longer does, so the captured span unmounts and
    // its pointerup never arrives. The window still hears the release.
    window.addEventListener("pointerup", endEdge)
    window.addEventListener("pointercancel", endEdge)
    const [start, end] = weekSpan(block)
    drag.current = {
      kind: "edge",
      block,
      edge,
      originX: e.clientX,
      scale: row.width / DAY_MINUTES,
      origin: edge === "start" ? start : end,
      other: edge === "start" ? end : start,
      limits: edgeLimits(blocks, block, edge),
    }
    // No onSelect here: selecting opens the slot dialog, which would cover
    // the grid mid-drag. A drag is its own edit; a click opens the dialog.
  }

  function moveEdge(e: ReactPointerEvent<HTMLSpanElement>) {
    const d = drag.current
    if (d?.kind !== "edge") return
    // A hover, not a drag: the release was missed, so end it here rather
    // than rewrite the slot under a pointer with no button down.
    if (e.buttons === 0) {
      endEdge()
      return
    }
    const value = Math.min(d.limits[1], Math.max(d.limits[0], snap(d.origin + (e.clientX - d.originX) / d.scale)))
    onChange(d.edge === "start" ? fromSpan(d.block, value, d.other) : fromSpan(d.block, d.other, value))
  }

  function endEdge() {
    window.removeEventListener("pointerup", endEdge)
    window.removeEventListener("pointercancel", endEdge)
    if (drag.current?.kind !== "edge") return
    drag.current = null
  }

  // ── Drawing a new slot ──

  function minuteAt(e: ReactPointerEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(DAY_MINUTES - 1, ((e.clientX - rect.left) / rect.width) * DAY_MINUTES))
  }

  function startCreate(e: ReactPointerEvent<HTMLDivElement>, day: number) {
    if (readOnly || e.button !== 0 || e.target !== e.currentTarget) return
    const minute = minuteAt(e)
    const bounds = freeBounds(blocks, day, minute)
    if (!bounds) return
    // A touch is not captured: one that turns into a scroll is cancelled by
    // the browser, and one that stays put ends here as a click.
    if (e.pointerType !== "touch") e.currentTarget.setPointerCapture(e.pointerId)
    const anchor = day * DAY_MINUTES + Math.floor(minute / SNAP) * SNAP
    drag.current = { kind: "create", day, originX: e.clientX, anchor, bounds, span: null }
  }

  function moveCreate(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (d?.kind !== "create" || e.pointerType === "touch") return
    const at = d.day * DAY_MINUTES + snap(minuteAt(e))
    const from = Math.max(d.bounds[0], Math.min(d.anchor, at))
    const to = Math.min(d.bounds[1], Math.max(d.anchor + SNAP, at))
    d.span = { from: from - d.day * DAY_MINUTES, to: to - d.day * DAY_MINUTES }
    setGhost({ day: d.day, ...d.span })
  }

  function endCreate(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (d?.kind !== "create") return
    drag.current = null
    setGhost(null)
    // Barely moved: a click, which makes an hour from where it landed.
    if (!d.span || Math.abs(e.clientX - d.originX) < 6) {
      const span = freeSpanAt(blocks, d.day, d.anchor - d.day * DAY_MINUTES)
      if (span) onCreate(d.day, span)
      return
    }
    const base = d.day * DAY_MINUTES
    onCreate(d.day, [base + d.span.from, base + d.span.to])
  }

  return (
    // Seven 24-hour rows need room to be touched; below ~44rem the grid
    // scrolls sideways rather than shrinking slots to slivers.
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="grid min-w-[44rem] grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        <span />
        <div className="relative mb-1 h-4 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {HOUR_LABELS.map((h) => (
            <span
              key={h}
              className={cn(
                "absolute",
                h === 0 ? "translate-x-0" : h === 24 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: pct(h * 60) }}
            >
              {String(h % 24).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {WEEK_ORDER.map((day) => {
          const isToday = now?.day === day
          return (
            <div key={day} className="contents">
              <span
                className={cn(
                  "self-center text-xs",
                  isToday ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {DAY_SHORT[day]}
              </span>
              <div
                data-day-row
                onPointerDown={(e) => startCreate(e, day)}
                onPointerMove={moveCreate}
                onPointerUp={endCreate}
                onPointerCancel={() => {
                  drag.current = null
                  setGhost(null)
                }}
                className={cn(
                  "relative h-12 touch-pan-x touch-pan-y rounded-md bg-white/[0.025] select-none",
                  isToday && "bg-white/[0.045]",
                  !readOnly && "cursor-crosshair",
                )}
                // Hour lines; the six-hourly ones are drawn stronger below.
                style={{
                  backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)",
                  backgroundSize: "calc(100% / 24) 100%",
                }}
              >
                {[6, 12, 18].map((h) => (
                  <span
                    key={h}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 w-px bg-white/[0.09]"
                    style={{ left: pct(h * 60) }}
                  />
                ))}

                {allSegments
                  .filter((s) => s.day === day)
                  .map((s) => {
                    const swatch = swatchFor(s.block.playlistId)
                    const selected = s.block.key === selectedKey
                    const sibling = !selected && siblings.has(s.block.key)
                    const clash = overlaps.has(s.block.key)
                    const narrow = s.to - s.from < 90
                    return (
                      <div
                        key={`${s.block.key}-${s.head ? "h" : "t"}`}
                        className={cn(
                          "absolute inset-y-1 overflow-hidden rounded-md",
                          swatch.fill,
                          swatch.ink,
                          selected && "z-10 outline-2 outline-offset-1 outline-white",
                          sibling && "outline-1 outline-offset-1 outline-white/45",
                          clash && "outline-2 outline-offset-1 outline-fault",
                        )}
                        style={{ left: pct(s.from), width: pct(s.to - s.from) }}
                      >
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => onSelect(s.block.key)}
                          title={`${nameFor(s.block)} · ${s.block.start}–${s.block.end}${s.block.startMode === "hard" ? " · starts on time" : ""}`}
                          className={cn(
                            "flex h-full w-full min-w-0 flex-col justify-center px-2.5 text-left leading-tight",
                            !readOnly && "cursor-pointer",
                            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
                          )}
                        >
                          <span className="truncate text-[12px] font-semibold">{nameFor(s.block)}</span>
                          {!narrow && (
                            <span className="truncate font-mono text-[10.5px] opacity-80 tabular-nums">
                              {s.head
                                ? `${s.block.start}–${s.block.end}${s.block.startMode === "hard" ? " · on time" : ""}`
                                : `→ ${s.block.end}`}
                            </span>
                          )}
                        </button>
                        {!readOnly && s.head && (
                          <span
                            role="presentation"
                            onPointerDown={(e) => startEdge(e, s.block, "start")}
                            onPointerMove={moveEdge}
                            onPointerUp={endEdge}
                            onPointerCancel={endEdge}
                            className="group absolute inset-y-0 left-0 flex w-2.5 cursor-ew-resize touch-none items-center justify-center"
                          >
                            <span className="h-4 w-0.5 rounded-full bg-current opacity-40 group-hover:opacity-90" />
                          </span>
                        )}
                        {!readOnly && s.tail && (
                          <span
                            role="presentation"
                            onPointerDown={(e) => startEdge(e, s.block, "end")}
                            onPointerMove={moveEdge}
                            onPointerUp={endEdge}
                            onPointerCancel={endEdge}
                            className="group absolute inset-y-0 right-0 flex w-2.5 cursor-ew-resize touch-none items-center justify-center"
                          >
                            <span className="h-4 w-0.5 rounded-full bg-current opacity-40 group-hover:opacity-90" />
                          </span>
                        )}
                      </div>
                    )
                  })}

                {ghost?.day === day && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-1 z-20 flex items-center overflow-hidden rounded-md border border-on-air bg-on-air/25 px-2 font-mono text-[10.5px] whitespace-nowrap text-foreground tabular-nums"
                    style={{ left: pct(ghost.from), width: pct(ghost.to - ghost.from) }}
                  >
                    {toClock(ghost.from)}–{toClock(ghost.to)}
                  </div>
                )}

                {shows
                  .filter((show) => show.days.includes(day))
                  .map((show) => (
                    <Link
                      key={`${show.id}-${day}`}
                      href={showsHref}
                      title={`${show.label ?? "Show time"} · ${show.start_time}. Edit in Station settings.`}
                      className="absolute inset-y-1 z-20 flex min-w-9 items-center justify-center rounded-md border border-dashed border-live/70 bg-background/85 px-1 font-mono text-[9.5px] font-semibold tracking-[0.12em] text-live-text hover:border-live"
                      style={{ left: pct(toMinutes(show.start_time)) }}
                    >
                      SHOW
                    </Link>
                  ))}

                {isToday && now && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-y-0.5 z-30 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                    style={{ left: pct(now.minute) }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
