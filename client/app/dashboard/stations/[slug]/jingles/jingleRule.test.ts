import { describe, expect, it } from "vitest"
import type { JingleRule } from "@/interfaces/JingleList"
import { daysPhrase, HOURLY, ruleSentence, usesClock } from "./jingleRule"

const base: JingleRule = {
  pick: "random",
  pinned_track_id: null,
  frequency: "songs",
  every_minutes: null,
  every_songs: 4,
  times: [],
  exact: false,
  days: null,
  from_time: null,
  to_time: null,
}

describe("ruleSentence", () => {
  it("says the default rule plainly", () => {
    expect(ruleSentence(base)).toBe("A random jingle every 4 songs.")
  })

  it("covers each way of picking", () => {
    expect(ruleSentence({ ...base, pick: "in_order" })).toBe("The next jingle in order every 4 songs.")
    expect(ruleSentence({ ...base, pick: "single" }, "Top of the hour")).toBe("“Top of the hour” every 4 songs.")
    expect(ruleSentence({ ...base, every_songs: 1 })).toBe("A random jingle after every song.")
  })

  it("says minutes in hours when they are hours", () => {
    expect(ruleSentence({ ...base, frequency: "minutes", every_minutes: 15 })).toBe("A random jingle every 15 minutes.")
    expect(ruleSentence({ ...base, frequency: "minutes", every_minutes: 60 })).toBe("A random jingle every hour.")
    expect(ruleSentence({ ...base, frequency: "minutes", every_minutes: 120 })).toBe("A random jingle every 2 hours.")
  })

  it("names set times, and says whether they are exact", () => {
    const times = { ...base, frequency: "times" as const, times: ["08:00", "12:00", "20:30"] }
    expect(ruleSentence(times)).toBe("A random jingle around 08:00, 12:00 and 20:30.")
    expect(ruleSentence({ ...times, exact: true })).toBe("A random jingle at 08:00, 12:00 and 20:30 on the dot.")
    expect(ruleSentence({ ...times, times: HOURLY, exact: true })).toBe("A random jingle at the top of every hour, on the dot.")
  })

  it("adds the hours and days it is limited to", () => {
    expect(ruleSentence({ ...base, days: [1, 2, 3, 4, 5], from_time: "07:00", to_time: "10:00" })).toBe(
      "A random jingle every 4 songs, 07:00–10:00 on weekdays.",
    )
  })
})

describe("daysPhrase", () => {
  it("names weekdays, weekends and odd sets in week order", () => {
    expect(daysPhrase(null)).toBe("")
    expect(daysPhrase([0, 1, 2, 3, 4, 5, 6])).toBe("")
    expect(daysPhrase([5, 1, 3, 2, 4])).toBe("on weekdays")
    expect(daysPhrase([6, 0])).toBe("at weekends")
    expect(daysPhrase([0, 3, 1])).toBe("on Mon, Wed and Sun")
  })
})

describe("usesClock", () => {
  it("is true for set times, days or hours", () => {
    expect(usesClock(base)).toBe(false)
    expect(usesClock({ ...base, frequency: "times" })).toBe(true)
    expect(usesClock({ ...base, days: [1] })).toBe(true)
    expect(usesClock({ ...base, from_time: "07:00" })).toBe(true)
  })
})
