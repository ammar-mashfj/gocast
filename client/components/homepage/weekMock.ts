/**
 * The homepage's fictional week, shared by the grid (md and up) and the day
 * list (below md) so both tell the same story.
 *
 * A plausible week, not a real one. Chosen to show the three things the
 * Schedule page actually does: one playlist repeating across weekdays, a
 * different one at the weekend, and a slot that runs past midnight onto the
 * next day — drawn as two segments exactly as the API resolves it. The gaps
 * are not empty; they are the default rotation (All Tracks).
 */
export const MINUTES_PER_DAY = 24 * 60
/** Monday first, as the Schedule page draws it; indexes are JS `getDay()`. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export const PLAYLISTS = [
  { id: "coffee", name: "Morning Coffee", days: [1, 2, 3, 4, 5], start: "06:00", end: "10:00" },
  { id: "drive", name: "Drivetime", days: [1, 2, 3, 4, 5], start: "16:00", end: "19:00" },
  { id: "brunch", name: "Weekend Brunch", days: [0, 6], start: "09:00", end: "13:00" },
  { id: "late", name: "Late Night", days: [5, 6], start: "22:00", end: "02:00" },
] as const

export type PlaylistId = (typeof PLAYLISTS)[number]["id"]

export function minutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10))
  return h * 60 + m
}

export function hhmm(minute: number): string {
  const m = minute % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

export interface Segment {
  day: number
  from: number
  to: number
  /** Index into PLAYLISTS. */
  index: number
  /** Part of a slot that crosses midnight: `tail` is the part after it. */
  wraps: boolean
  tail: boolean
}

// Split at midnight so every segment belongs to exactly one day. Static, so
// it runs once at module load rather than on every render.
export const SEGMENTS: Segment[] = []
PLAYLISTS.forEach((slot, index) => {
  const start = minutes(slot.start)
  let duration = minutes(slot.end) - start
  if (duration <= 0) duration += MINUTES_PER_DAY
  for (const day of slot.days) {
    const end = start + duration
    if (end > MINUTES_PER_DAY) {
      SEGMENTS.push({ day, from: start, to: MINUTES_PER_DAY, index, wraps: true, tail: false })
      SEGMENTS.push({ day: (day + 1) % 7, from: 0, to: end - MINUTES_PER_DAY, index, wraps: true, tail: true })
    } else {
      SEGMENTS.push({ day, from: start, to: end, index, wraps: false, tail: false })
    }
  }
})

export type Now = { day: number; minute: number }

export function currentSegment(now: Now | null): Segment | undefined {
  return now ? SEGMENTS.find((s) => s.day === now.day && now.minute >= s.from && now.minute < s.to) : undefined
}
