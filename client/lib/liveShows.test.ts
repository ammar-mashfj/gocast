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

  it("counts days in the station's zone, not the clock's", () => {
    // 1 Oct 12:00 UTC is 1 Oct everywhere; a show at 02:00 UTC that morning
    // is Thursday lunchtime in Tokyo and Wednesday evening in Los Angeles.
    const noon = new Date(Date.UTC(2026, 9, 1, 12))
    const sessions = [session(new Date(Date.UTC(2026, 9, 1, 2)), 60, 3)]
    const tokyo = liveShows(sessions, noon, false, "Asia/Tokyo")
    expect(tokyo.days[13].seconds).toBe(3600)
    expect(tokyo.days[13].date.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    const la = liveShows(sessions, noon, false, "America/Los_Angeles")
    expect(la.days[12].seconds).toBe(3600)
    expect(la.days[13].seconds).toBe(0)
  })

  it("puts the window's edge where the station's day starts", () => {
    // 14 days before 1 Oct is 18 Sep; a show at 22:30 UTC on 17 Sep is
    // 23:30 BST, still 17 Sep in London (prior window), but 07:30 on 18
    // Sep in Tokyo.
    const noon = new Date(Date.UTC(2026, 9, 1, 12))
    const sessions = [session(new Date(Date.UTC(2026, 8, 17, 22, 30)), 60), session(new Date(Date.UTC(2026, 9, 1, 2)), 30)]
    expect(liveShows(sessions, noon, false, "Europe/London").delta).toBe(1800 - 3600)
    expect(liveShows(sessions, noon, false, "Asia/Tokyo")).toMatchObject({ seconds: 5400, delta: 5400 })
  })
})
