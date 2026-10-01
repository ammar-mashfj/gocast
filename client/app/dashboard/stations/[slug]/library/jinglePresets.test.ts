import { describe, expect, it } from "vitest"
import { CUSTOM, presetFor } from "./jinglePresets"

describe("presetFor", () => {
  it("matches a preset in either mode", () => {
    expect(presetFor("interval", 30, 7)).toBe("30m")
    expect(presetFor("interval", 60, 3)).toBe("1h")
    expect(presetFor("tracks", 30, 5)).toBe("5t")
  })

  it("calls anything else custom", () => {
    expect(presetFor("interval", 15, 3)).toBe(CUSTOM)
    expect(presetFor("tracks", 30, 8)).toBe(CUSTOM)
  })
})
