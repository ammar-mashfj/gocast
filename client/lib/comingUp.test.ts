import { describe, expect, it } from "vitest"
import { comingUp, formatWhen } from "./comingUp"
import type { Programme, StationSchedule } from "@/interfaces/Station"

// Thursday 1 October 2026, 18:00 in London (17:00 UTC).
const now = new Date(Date.UTC(2026, 9, 1, 17, 0))

const show = (id: string, iso: string | null, label: string | null = null): StationSchedule => ({
  id,
  label,
  days: [3],
  start_time: "21:00",
  next_occurrence: iso,
})

const programme = (startsAt: string, label: string | null = "Breakfast"): Programme => ({
  playlist: { id: "p1", name: "Main rotation" },
  slot_id: null,
  until: startsAt,
  next: { slot_id: "s1", label, playlist: { id: "p2", name: "Morning Soul" }, starts_at: startsAt },
})

describe("formatWhen", () => {
  it("says today, tomorrow, or the weekday, in the station's zone", () => {
    expect(formatWhen(new Date(Date.UTC(2026, 9, 1, 20, 0)), "Europe/London", now)).toBe("Today 21:00")
    expect(formatWhen(new Date(Date.UTC(2026, 9, 2, 5, 0)), "Europe/London", now)).toBe("Tomorrow 06:00")
    expect(formatWhen(new Date(Date.UTC(2026, 9, 3, 9, 0)), "Europe/London", now)).toBe("Sat 10:00")
  })

  it("counts days in the station's zone, not the viewer's", () => {
    // "now" is already Friday 02:00 in Tokyo, so Friday 08:30 there is today
    // and Saturday 00:30 is tomorrow.
    expect(formatWhen(new Date(Date.UTC(2026, 9, 1, 23, 30)), "Asia/Tokyo", now)).toBe("Today 08:30")
    expect(formatWhen(new Date(Date.UTC(2026, 9, 2, 15, 30)), "Asia/Tokyo", now)).toBe("Tomorrow 00:30")
  })
})

describe("comingUp", () => {
  it("merges show times and AutoDJ's next slot, soonest first", () => {
    const items = comingUp({
      schedules: [show("a", "2026-10-03T19:00:00Z", "Saturday Session"), show("b", "2026-10-01T20:00:00Z")],
      programme: programme("2026-10-02T05:00:00Z"),
      timeZone: "Europe/London",
      now,
    })
    expect(items.map((i) => [i.when, i.title, i.meta, i.kind])).toEqual([
      ["Today 21:00", "Your show", "You, live", "show"],
      ["Tomorrow 06:00", "Breakfast", "AutoDJ · Morning Soul", "autodj"],
      ["Sat 20:00", "Saturday Session", "You, live", "show"],
    ])
  })

  it("drops past and unknown occurrences, and caps the list", () => {
    const items = comingUp({
      schedules: [show("a", "2026-09-30T19:00:00Z"), show("b", null), show("c", "2026-10-05T19:00:00Z"), show("d", "2026-10-06T19:00:00Z")],
      programme: null,
      timeZone: "Europe/London",
      now,
      limit: 1,
    })
    expect(items.map((i) => i.key)).toEqual(["show-c"])
  })

  it("names an unlabelled slot by its playlist", () => {
    const [item] = comingUp({ schedules: [], programme: programme("2026-10-02T05:00:00Z", null), timeZone: "Europe/London", now })
    expect(item).toMatchObject({ title: "Morning Soul", meta: "AutoDJ" })
  })
})
