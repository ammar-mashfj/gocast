import type { AutodjSlot } from "@/interfaces/Station"

/**
 * The Schedule grid's working model.
 *
 * The API stores a slot as one row with several days ("Morning jazz, Mon–Fri
 * 06:00–12:00"). The grid edits BLOCKS instead: one per day. Dragging
 * Tuesday's edge must move Tuesday only — otherwise "different times on
 * different days" is impossible again — so a multi-day row is exploded into
 * blocks on load and identical blocks are merged back into one row on save.
 * The server never sees the difference.
 *
 * Times are handled in WEEK MINUTES: 0 is Sunday 00:00 (the API's day 0) and
 * the week is 10080 minutes long. A block is [start, start + duration) there,
 * which makes crossing midnight — including Saturday into Sunday — ordinary
 * arithmetic rather than a special case.
 */

export const DAY_MINUTES = 24 * 60
export const WEEK_MINUTES = 7 * DAY_MINUTES
/** Every drag and stepper moves in quarter hours. */
export const SNAP = 15

export interface Block {
  /** Client-only identity; the server re-creates row IDs on every save. */
  key: string
  /** The weekday the block STARTS on, 0 = Sunday, as the API counts. */
  day: number
  playlistId: string
  label: string
  /** "HH:MM" wall clock in the station's timezone. */
  start: string
  /** "HH:MM"; at or before `start` means it runs past midnight. */
  end: string
}

/** The row shape `PUT /stations/{slug}/autodj-slots` takes. */
export interface SlotPayload {
  label: string | null
  playlist_id: string
  days: number[]
  start_time: string
  end_time: string
}

let counter = 0
export function newKey(): string {
  counter += 1
  return `b${Date.now().toString(36)}${counter}`
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

export function toClock(minutes: number): string {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/** Length in minutes; an end at or before the start wraps to the next day. */
export function duration(block: Pick<Block, "start" | "end">): number {
  const d = toMinutes(block.end) - toMinutes(block.start)
  return d <= 0 ? d + DAY_MINUTES : d
}

/** [start, end) in week minutes; `end` can pass WEEK_MINUTES (Saturday night into Sunday). */
export function weekSpan(block: Block): [number, number] {
  const start = block.day * DAY_MINUTES + toMinutes(block.start)
  return [start, start + duration(block)]
}

/** Rebuild a block's day/start/end from a week-minute span. */
export function fromSpan(block: Block, start: number, end: number): Block {
  const s = ((start % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES
  return {
    ...block,
    day: Math.floor(s / DAY_MINUTES),
    start: toClock(s),
    end: toClock(s + (end - start)),
  }
}

export function explode(slots: AutodjSlot[]): Block[] {
  return slots.flatMap((slot) =>
    [...new Set(slot.days)].sort().map((day) => ({
      key: newKey(),
      day,
      playlistId: slot.playlist_id,
      label: slot.label ?? "",
      start: slot.start_time,
      end: slot.end_time,
    })),
  )
}

/** Blocks that are the same slot on different days: same playlist, name and times. */
export function signature(block: Block): string {
  return JSON.stringify([block.playlistId, block.label.trim(), block.start, block.end])
}

/** Merge identical blocks back into multi-day rows, in first-seen order. */
export function merge(blocks: Block[]): SlotPayload[] {
  const rows = new Map<string, SlotPayload>()
  for (const block of blocks) {
    const sig = signature(block)
    const row = rows.get(sig)
    if (row) {
      if (!row.days.includes(block.day)) row.days.push(block.day)
      continue
    }
    rows.set(sig, {
      label: block.label.trim() === "" ? null : block.label.trim(),
      playlist_id: block.playlistId,
      days: [block.day],
      start_time: block.start,
      end_time: block.end,
    })
  }
  return [...rows.values()].map((row) => ({ ...row, days: [...row.days].sort() }))
}

/** A stable fingerprint of what the server would store, for "unsaved changes". */
export function snapshot(blocks: Block[]): string {
  return JSON.stringify(
    merge(blocks)
      .map((row) => JSON.stringify(row))
      .sort(),
  )
}

/** Every other block's span, repeated a week either side so wrap-around needs no special case. */
function others(blocks: Block[], exceptKey: string): Array<[number, number]> {
  return blocks
    .filter((b) => b.key !== exceptKey)
    .flatMap((b) => {
      const [s, e] = weekSpan(b)
      return [
        [s - WEEK_MINUTES, e - WEEK_MINUTES],
        [s, e],
        [s + WEEK_MINUTES, e + WEEK_MINUTES],
      ] as Array<[number, number]>
    })
}

/**
 * Where a dragged edge may go. The server refuses overlaps, so an edge stops
 * at its neighbour instead of producing a clash to explain afterwards; a
 * block stays at least SNAP long and under a full day.
 */
export function edgeLimits(blocks: Block[], block: Block, edge: "start" | "end"): [number, number] {
  const [start, end] = weekSpan(block)
  const spans = others(blocks, block.key)

  if (edge === "end") {
    let max = start + DAY_MINUTES - SNAP
    for (const [s] of spans) if (s >= end && s < max) max = s
    // A neighbour that already overlaps (only possible from panel edits)
    // must not trap the edge behind the block's own start.
    return [start + SNAP, Math.max(max, start + SNAP)]
  }

  let min = end - DAY_MINUTES + SNAP
  for (const [, e] of spans) if (e <= start && e > min) min = e
  return [Math.min(min, end - SNAP), end - SNAP]
}

/** Keys of every block involved in an overlap — the server's check, run before asking it. */
export function findOverlaps(blocks: Block[]): Set<string> {
  const spans = blocks.flatMap((b) => {
    const [s, e] = weekSpan(b)
    return e > WEEK_MINUTES
      ? [
          { s, e: WEEK_MINUTES, key: b.key },
          { s: 0, e: e - WEEK_MINUTES, key: b.key },
        ]
      : [{ s, e, key: b.key }]
  })
  spans.sort((a, b) => a.s - b.s || a.e - b.e)
  const clash = new Set<string>()
  let reach = { e: -1, key: "" }
  for (const span of spans) {
    if (span.s < reach.e && span.key !== reach.key) {
      clash.add(span.key)
      clash.add(reach.key)
    }
    if (span.e > reach.e) reach = span
  }
  return clash
}

/**
 * The empty stretch around `minute` on `day`, in week minutes: from the end of
 * whatever comes before (or midnight) to the start of whatever comes next (or
 * the next midnight). Null when the minute is inside a block. A drag to create
 * a slot is clamped to this, so it can never draw an overlap.
 */
export function freeBounds(blocks: Block[], day: number, minute: number): [number, number] | null {
  const at = day * DAY_MINUTES + minute
  const spans = others(blocks, "")
  if (spans.some(([s, e]) => at >= s && at < e)) return null

  let lo = day * DAY_MINUTES
  let hi = lo + DAY_MINUTES
  for (const [s, e] of spans) {
    if (e <= at && e > lo) lo = e
    if (s > at && s < hi) hi = s
  }
  return hi - lo >= SNAP ? [lo, hi] : null
}

/**
 * What a plain click (no drag) creates: `length` minutes from the quarter
 * hour clicked, cut short by the next block. Null inside a block.
 */
export function freeSpanAt(blocks: Block[], day: number, minute: number, length = 60): [number, number] | null {
  const bounds = freeBounds(blocks, day, minute)
  if (!bounds) return null
  const from = Math.max(bounds[0], day * DAY_MINUTES + Math.floor(minute / SNAP) * SNAP)
  const to = Math.min(bounds[1], from + length)
  return to - from >= SNAP ? [from, to] : null
}
