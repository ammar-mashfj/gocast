import { describe, expect, it } from "vitest"
import { canonicalZone, supportedZones } from "./timezones"

describe("timezones", () => {
  it("maps Chrome's old names to the ones the API stores", () => {
    expect(canonicalZone("Asia/Calcutta")).toBe("Asia/Kolkata")
    expect(canonicalZone("Europe/Kiev")).toBe("Europe/Kyiv")
    expect(canonicalZone("Europe/London")).toBe("Europe/London")
  })

  it("lists current names only, once each", () => {
    const zones = supportedZones()
    expect(zones).toContain("Asia/Kolkata")
    expect(zones).not.toContain("Asia/Calcutta")
    expect(new Set(zones).size).toBe(zones.length)
  })
})
