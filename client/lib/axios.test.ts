import { afterEach, describe, expect, it, vi } from "vitest"
import type { AxiosAdapter } from "axios"

const nav = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock("./navigation", () => ({ navigate: (href: string) => { nav.calls.push(href) } }))
vi.mock("@/actions/auth", () => ({ clearAuth: () => {} }))

import api from "./axios"
import { setSigningOut } from "./signOutState"

const unauthorized: AxiosAdapter = async (config) => {
  throw Object.assign(new Error("Unauthenticated"), { config, response: { status: 401, data: {}, config } })
}

afterEach(() => {
  setSigningOut(false)
  nav.calls = []
  vi.useRealTimers()
})

describe("the 401 redirect", () => {
  it("sends an expired session to sign-in", async () => {
    vi.useFakeTimers()
    await expect(api.get("/stations/x", { adapter: unauthorized })).rejects.toThrow()
    expect(nav.calls).toEqual(["/auth/login?expired=1"])
    // Let the one-shot guard go, so the next test starts clean.
    vi.advanceTimersByTime(2000)
  })

  it("stays out of a sign-out: the requests /logout just revoked are not an expiry", async () => {
    setSigningOut(true)
    await Promise.allSettled([
      api.get("/stations/x", { adapter: unauthorized }),
      api.get("/stations/x/playlists", { adapter: unauthorized }),
    ])
    expect(nav.calls).toEqual([])
  })
})
