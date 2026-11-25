import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LEAVE_FALLBACK_MS, isSigningOut, leaveSignedOut, setSigningOut } from "./signOutState"

// jsdom doesn't navigate; it reports "not implemented" and the page stays,
// which is exactly the page load that never happens.
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  setSigningOut(false)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("leaveSignedOut", () => {
  it("keeps the flag up while the page is leaving", () => {
    leaveSignedOut("/", "signed-out")
    vi.advanceTimersByTime(LEAVE_FALLBACK_MS - 1)
    expect(isSigningOut()).toBe(true)
  })

  it("drops the flag if the page is still here after the fallback", () => {
    leaveSignedOut("/", "signed-out")
    vi.advanceTimersByTime(LEAVE_FALLBACK_MS)
    expect(isSigningOut()).toBe(false)
  })

  it("an old fallback can't drop the flag of a newer sign-out", () => {
    leaveSignedOut("/", "signed-out")
    vi.advanceTimersByTime(LEAVE_FALLBACK_MS - 1000)
    // Back from the bfcache, then signing out again.
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    setSigningOut(true)
    vi.advanceTimersByTime(1000)
    expect(isSigningOut()).toBe(true)
  })
})
