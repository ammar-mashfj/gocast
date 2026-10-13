import type { StreamSession } from "@/interfaces/StreamSession"

/**
 * "Your live shows" over the last 14 days, from stream sessions.
 *
 * Sessions exist only for people broadcasting, so this is live airtime —
 * AutoDJ hours are in Audience. A show is counted on the day it STARTED, so
 * one running past midnight is last night's show, not two. Days are the
 * station's (`timeZone`), since the overview is rendered on the server and
 * the server's midnight is nobody's; without a zone they are the clock's own.
 *
 * `truncated` means the sessions endpoint returned a full page, so the
 * window may be cut off: the comparison with the 14 days before is then
 * arithmetic on partial data, and comes back null rather than as a fact.
 */
export const LIVE_SHOW_DAYS = 14

export interface LiveShows {
  /** `date` is the calendar day as 00:00 UTC; format it with timeZone "UTC". */
  days: { date: Date; seconds: number }[]
  seconds: number
  /** Change against the 14 days before; null when it can't be trusted. */
  delta: number | null
  count: number
  average: number
  peak: { listeners: number; at: Date } | null
  /** Index of the latest day with a show, for the chart's highlight. */
  latest: number | null
}

/** The calendar day `days` after a Y-M-D string, as Y-M-D. */
function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function liveShows(sessions: StreamSession[], now: Date, truncated: boolean, timeZone?: string): LiveShows {
  // en-CA gives Y-M-D, which sorts and shifts as plain calendar arithmetic.
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
  const today = dayOf.format(now)
  const keys = Array.from({ length: LIVE_SHOW_DAYS }, (_, i) => shiftDay(today, -(LIVE_SHOW_DAYS - 1 - i)))
  const days = keys.map((key) => ({ date: new Date(`${key}T00:00:00Z`), seconds: 0 }))
  const index = new Map(keys.map((key, i) => [key, i]))
  const priorKeys = new Set(Array.from({ length: LIVE_SHOW_DAYS }, (_, i) => shiftDay(keys[0], -(i + 1))))

  let seconds = 0
  let prior = 0
  let count = 0
  let peak: LiveShows["peak"] = null

  for (const s of sessions) {
    if (!s.ended_at) continue
    const started = new Date(s.started_at)
    const length = Math.max(0, Math.floor((new Date(s.ended_at).getTime() - started.getTime()) / 1000))
    const key = dayOf.format(started)
    const slot = index.get(key)
    if (slot !== undefined) {
      days[slot].seconds += length
      seconds += length
      count += 1
      if (s.peak_listeners > 0 && (!peak || s.peak_listeners > peak.listeners)) {
        peak = { listeners: s.peak_listeners, at: started }
      }
    } else if (priorKeys.has(key)) {
      prior += length
    }
  }

  let latest: number | null = null
  days.forEach((d, i) => {
    if (d.seconds > 0) latest = i
  })

  return {
    days,
    seconds,
    delta: truncated ? null : seconds - prior,
    count,
    average: count > 0 ? Math.round(seconds / count) : 0,
    peak,
    latest,
  }
}
