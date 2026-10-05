import type { Programme, StationSchedule } from "@/interfaces/Station"

/**
 * The overview's "Coming up": what happens next on the station, from the two
 * things that put something on air at a time — your show times (you, live)
 * and AutoDJ's schedule. Times are the station's, as everywhere else on the
 * schedule.
 *
 * Only what the API already resolves: each show time's next occurrence, and
 * AutoDJ's next slot change (programme.next). The API doesn't hand back a
 * list of future slots, so AutoDJ contributes at most one row — enough for
 * "what plays when I walk away".
 */
export interface ComingUpItem {
  key: string
  at: Date
  /** "Today 21:00", "Tomorrow 06:00", "Sat 10:00" in the station's zone. */
  when: string
  title: string
  meta: string
  kind: "show" | "autodj"
}

export function comingUp({
  schedules,
  programme,
  timeZone,
  now,
  limit = 3,
}: {
  schedules: StationSchedule[] | undefined
  programme: Programme | null | undefined
  timeZone: string | null
  now: Date
  limit?: number
}): ComingUpItem[] {
  const tz = timeZone ?? "UTC"
  const items: ComingUpItem[] = []

  for (const s of schedules ?? []) {
    if (!s.next_occurrence) continue
    const at = new Date(s.next_occurrence)
    if (at <= now) continue
    items.push({ key: `show-${s.id}`, at, when: formatWhen(at, tz, now), title: s.label || "Your show", meta: "You, live", kind: "show" })
  }

  const next = programme?.next
  if (next) {
    const at = new Date(next.starts_at)
    if (at > now) {
      const playlist = next.playlist.name ?? "your music"
      items.push({
        key: `slot-${next.slot_id}`,
        at,
        when: formatWhen(at, tz, now),
        title: next.label || playlist,
        meta: next.label ? `AutoDJ · ${playlist}` : "AutoDJ",
        kind: "autodj",
      })
    }
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit)
}

/** The calendar day of `date` in `tz`, as Y-M-D. */
function dayIn(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

export function formatWhen(at: Date, tz: string, now: Date): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(at)
  const day = dayIn(at, tz)
  if (day === dayIn(now, tz)) return `Today ${time}`
  if (day === dayIn(new Date(now.getTime() + 86_400_000), tz)) return `Tomorrow ${time}`
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(at)
  return `${weekday} ${time}`
}
