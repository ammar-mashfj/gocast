import { describe, expect, it } from "vitest"
import { formatStationClock } from "./format"

describe("formatStationClock", () => {
  // Saturday 4 October 2026, 20:04 UTC.
  const at = new Date(Date.UTC(2026, 9, 3, 20, 4))

  it("shows the station's local day and time with its city", () => {
    expect(formatStationClock(at, "Europe/London")).toBe("SAT 21:04 · LONDON")
    expect(formatStationClock(at, "America/New_York")).toBe("SAT 16:04 · NEW YORK")
  })

  it("rolls the day over with the timezone", () => {
    expect(formatStationClock(at, "Asia/Tokyo")).toBe("SUN 05:04 · TOKYO")
  })

  it("keeps a zone with no city", () => {
    expect(formatStationClock(at, "UTC")).toBe("SAT 20:04 · UTC")
  })
})
