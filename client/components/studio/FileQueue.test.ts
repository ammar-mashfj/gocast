import { describe, expect, it } from "vitest"
import { secondsUntilLoop } from "./FileQueue"

describe("secondsUntilLoop", () => {
  it("adds what's left of this track to every track after it", () => {
    expect(secondsUntilLoop([200, 180, 240], 0, 50)).toBe(150 + 180 + 240)
  })

  it("is just this track's remainder on the last track", () => {
    expect(secondsUntilLoop([200, 180, 240], 2, 40)).toBe(200)
  })

  it("counts an unknown duration as nothing", () => {
    expect(secondsUntilLoop([200, Number.NaN, 0], 0, 0)).toBe(200)
  })

  it("is zero when nothing is playing", () => {
    expect(secondsUntilLoop([200], -1, 0)).toBe(0)
  })
})
