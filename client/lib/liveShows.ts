import type { StreamSession } from "@/interfaces/StreamSession"

/**
 * "Your live shows" over the last 14 days, from stream sessions.
 *
 * Sessions exist only for people broadcasting, so this is live airtime —
 * AutoDJ hours are in Audience. A show is counted on the day it STARTED, so
 * one running past midnight is last night's show, not two. Days are the
 * viewer's local days, like the chart's axis.
 *
 * `truncated` means the sessions endpoint returned a full page, so the
 * window may be cut off: the comparison with the 14 days before is then
 * arithmetic on partial data, and comes back null rather than as a fact.
 */
export const LIVE_SHOW_DAYS = 14

export interface LiveShows {
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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function liveShows(sessions: StreamSession[], now: Date, truncated: boolean): LiveShows {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: LIVE_SHOW_DAYS }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() - (LIVE_SHOW_DAYS - 1 - i))
    return { date, seconds: 0 }
  })
  const index = new Map(days.map((d, i) => [dayKey(d.date), i]))
  const windowStart = days[0].date.getTime()
  const priorStart = new Date(days[0].date)
  priorStart.setDate(priorStart.getDate() - LIVE_SHOW_DAYS)

  let seconds = 0
  let prior = 0
  let count = 0
  let peak: LiveShows["peak"] = null

  for (const s of sessions) {
    if (!s.ended_at) continue
    const started = new Date(s.started_at)
    const length = Math.max(0, Math.floor((new Date(s.ended_at).getTime() - started.getTime()) / 1000))
    const slot = index.get(dayKey(started))
    if (slot !== undefined) {
      days[slot].seconds += length
      seconds += length
      count += 1
      if (s.peak_listeners > 0 && (!peak || s.peak_listeners > peak.listeners)) {
        peak = { listeners: s.peak_listeners, at: started }
      }
    } else if (started.getTime() >= priorStart.getTime() && started.getTime() < windowStart) {
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
