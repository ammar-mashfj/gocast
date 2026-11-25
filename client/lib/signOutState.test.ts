import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// signedInAtLoad is read when the module loads, so each case loads it fresh
// with the cookie it needs.
async function load(cookie: "signed-in" | "signed-out") {
  vi.resetModules()
  document.cookie = cookie === "signed-in" ? "user=%7B%7D; path=/" : "user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
  return import("./signOutState")
}
const signOutCookie = () => { document.cookie = "user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" }

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}))
afterEach(() => {
  signOutCookie()
  vi.restoreAllMocks()
})

describe("a page restored from the back/forward cache", () => {
  it("loaded signed in, now signed out: reloads instead of showing the last user's data", async () => {
    const m = await load("signed-in")
    signOutCookie()
    expect(m.onPageShow(true)).toBe("reload")
  })

  it("still signed in: drops the stale flag and stays", async () => {
    const m = await load("signed-in")
    m.setSigningOut(true)
    expect(m.onPageShow(true)).toBe("reset")
    expect(m.isSigningOut()).toBe(false)
  })

  it("a page that was signed out all along (the homepage) isn't reloaded", async () => {
    const m = await load("signed-out")
    expect(m.onPageShow(true)).toBe("reset")
  })

  it("an ordinary page load does nothing", async () => {
    const m = await load("signed-in")
    m.setSigningOut(true)
    expect(m.onPageShow(false)).toBeNull()
    expect(m.isSigningOut()).toBe(true)
  })
})

describe("leaveSignedOut", () => {
  it("keeps the flag up with no timeout: a slow load mustn't let a late 401 navigate", async () => {
    vi.useFakeTimers()
    const m = await load("signed-in")
    m.leaveSignedOut("/", "signed-out")
    vi.advanceTimersByTime(60_000)
    expect(m.isSigningOut()).toBe(true)
    m.setSigningOut(false)
    vi.useRealTimers()
  })
})
