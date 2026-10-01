import { describe, expect, it } from "vitest"
import { showsTrend, type TrendShow } from "./showsTrend"

const shows = (...pairs: [minutes: number, peak: number][]): TrendShow[] => pairs.map(([m, peak]) => ({ seconds: m * 60, peak }))
const repeat = (n: number, minutes: number, peak: number) => shows(...Array.from({ length: n }, () => [minutes, peak] as [number, number]))

describe("showsTrend", () => {
  it("says nothing with fewer than three shows on each side", () => {
    expect(showsTrend([...repeat(2, 120, 20), ...repeat(3, 60, 5)])).toBeNull()
  })

  it("says nothing when the change is small", () => {
    expect(showsTrend([...repeat(5, 65, 10), ...repeat(5, 60, 10)])).toBeNull()
  })

  it("names length and peak together when both move", () => {
    expect(showsTrend([...repeat(5, 90, 20), ...repeat(5, 60, 10)])).toBe("Your recent shows run longer and draw more listeners at their peak.")
    expect(showsTrend([...repeat(5, 40, 20), ...repeat(5, 60, 10)])).toBe("Your recent shows run shorter but draw more listeners at their peak.")
  })

  it("names only what moved", () => {
    expect(showsTrend([...repeat(4, 40, 10), ...repeat(4, 60, 10)])).toBe("Your recent shows run shorter than the ones before.")
    expect(showsTrend([...repeat(3, 60, 4), ...repeat(3, 60, 8)])).toBe("Your recent shows draw fewer listeners at their peak than the ones before.")
  })

  it("ignores a peak that moved by less than one listener", () => {
    // 1 → 1.6 is +60%, but it's less than one person.
    expect(showsTrend([...shows([60, 2], [60, 2], [60, 1], [60, 1], [60, 2]), ...repeat(5, 60, 1)])).toBeNull()
  })

  it("compares the latest five with the five before, not the whole history", () => {
    const history = [...repeat(5, 90, 10), ...repeat(5, 60, 10), ...repeat(10, 300, 10)]
    expect(showsTrend(history)).toBe("Your recent shows run longer than the ones before.")
  })
})
