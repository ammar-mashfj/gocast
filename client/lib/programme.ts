import type { Programme } from "@/interfaces/Station"

/**
 * "12:00" if the instant falls within the next day in the station's zone,
 * otherwise "Mon 06:00". Wall clock of the STATION, never the viewer's —
 * an owner in Berlin scheduling a Madrid station still reads Madrid times.
 */
export function formatSlotInstant(iso: string, timeZone: string | null): string {
  const date = new Date(iso)
  const zone = timeZone ?? undefined
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone,
  }).format(date)

  const withinDay = date.getTime() - Date.now() < 24 * 60 * 60 * 1000
  if (withinDay) return time

  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: zone }).format(date)
  return `${day} ${time}`
}

/**
 * The one line that says what AutoDJ is doing: "Morning Calm · until 12:00 ·
 * then Main rotation". Shared by the schedule page and the station card so
 * the two never disagree.
 */
export function describeProgramme(
  programme: Programme,
  timeZone: string | null,
  defaultName: string | null,
): { now: string; detail: string | null } {
  const playing = programme.playlist?.name ?? "Nothing"

  if (programme.slot_id !== null) {
    const until = programme.until ? `until ${formatSlotInstant(programme.until, timeZone)}` : null
    // What follows is the next slot only if it starts the moment this one
    // ends; otherwise the default fills the gap.
    const handsTo =
      programme.next && programme.until && programme.next.starts_at === programme.until
        ? programme.next.playlist.name
        : defaultName
    const then = handsTo ? `then ${handsTo}` : null
    return { now: playing, detail: [until, then].filter(Boolean).join(" · ") || null }
  }

  if (programme.next) {
    return {
      now: playing,
      detail: `next: ${programme.next.playlist.name ?? "…"}, ${formatSlotInstant(programme.next.starts_at, timeZone)}`,
    }
  }

  return { now: playing, detail: null }
}
