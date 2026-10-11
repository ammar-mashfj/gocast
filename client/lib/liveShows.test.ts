import { describe, expect, it } from "vitest"
import { liveShows } from "./liveShows"
import type { StreamSession } from "@/interfaces/StreamSession"

const now = new Date(2026, 9, 1, 18, 0) // local time, Thu 1 Oct 2026

function session(start: Date, minutes: number, peak = 0, ended = true): StreamSession {
  return {
    id: start.toISOString(),
    station_id: "s",
    started_at: start.toISOString(),
    ended_at: ended ? new Date(start.getTime() + minutes * 60_000).toISOString() : null,
    peak_listeners: peak,
    source_type: "browser",
  }
}

describe("liveShows", () => {
  it("adds up the window, counts shows and averages them", () => {
    const r = liveShows([session(new Date(2026, 9, 1, 9), 60, 4), session(new Date(2026, 8, 28, 21), 30, 9)], now, false)
    expect(r.seconds).toBe(5400)
    expect(r.count).toBe(2)
    expect(r.average).toBe(2700)
    expect(r.days).toHaveLength(14)
    expect(r.days[13].seconds).toBe(3600)
  })

  it("finds the peak and when it was", () => {
    const r = liveShows([session(new Date(2026, 9, 1, 9), 60, 4), session(new Date(2026, 8, 28, 21), 30, 9)], now, false)
    expect(r.peak).toEqual({ listeners: 9, at: new Date(2026, 8, 28, 21) })
    expect(r.latest).toBe(13)
  })

  it("compares with the 14 days before, unless the list was cut off", () => {
    const sessions = [session(new Date(2026, 9, 1, 9), 60), session(new Date(2026, 8, 10, 9), 90)]
    expect(liveShows(sessions, now, false).delta).toBe(3600 - 5400)
    expect(liveShows(sessions, now, true).delta).toBeNull()
  })

  it("counts a show past midnight on the day it started, and skips one still running", () => {
    const r = liveShows([session(new Date(2026, 8, 30, 23, 30), 90), session(new Date(2026, 9, 1, 17), 0, 0, false)], now, false)
    expect(r.days[12].seconds).toBe(5400)
    expect(r.days[13].seconds).toBe(0)
    expect(r.count).toBe(1)
  })

  it("has no peak when nobody tuned in", () => {
    expect(liveShows([session(new Date(2026, 9, 1, 9), 60, 0)], now, false).peak).toBeNull()
  })
})
