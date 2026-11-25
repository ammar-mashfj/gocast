import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

type BroadcastState = "idle" | "connecting" | "live" | "reconnecting" | "error"

const h = vi.hoisted(() => ({
  steps: [] as string[],
  broadcast: null as null | { state: BroadcastState; liveSince: number | null; stop: (o: unknown) => Promise<void> },
  logoutFails: false,
  signingOut: false,
}))

vi.mock("@/contexts/BroadcastContext", () => ({ useBroadcastOptional: () => h.broadcast }))
vi.mock("@/contexts/AccountContext", () => ({ useAutoDjLocked: () => true }))
vi.mock("@/actions/auth", () => ({ clearAuth: () => h.steps.push("clearAuth") }))
vi.mock("@/lib/axios", () => ({
  default: {
    post: async (url: string) => {
      h.steps.push(`post ${url} (signingOut=${h.signingOut})`)
      if (h.logoutFails) throw new Error("network")
      return {}
    },
  },
}))
vi.mock("@/lib/signOutState", async (orig) => {
  const real = await orig<typeof import("@/lib/signOutState")>()
  real.subscribeSigningOut((v) => { h.signingOut = v })
  return { ...real, leaveSignedOut: (href: string, notice: string) => { real.setSigningOut(true); h.steps.push(`leave ${href} (${notice})`) } }
})

import { useSignOut } from "./useSignOut"
import { isSigningOut, setSigningOut } from "@/lib/signOutState"

function onAir(stop: (o: unknown) => Promise<void> = async () => { h.steps.push(`stop (signingOut=${h.signingOut})`) }) {
  h.broadcast = { state: "live", liveSince: Date.now() - 60_000, stop }
}

beforeEach(() => {
  h.steps = []
  h.broadcast = null
  h.logoutFails = false
  setSigningOut(false)
})
afterEach(() => setSigningOut(false))

describe("useSignOut", () => {
  it("logs out and leaves with one full-page load, no router calls", async () => {
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.signOut())
    expect(h.steps).toEqual(["post /logout (signingOut=true)", "clearAuth", "leave / (signed-out)"])
    // Up until the page unloads, so the studio and the 401 redirect stay out.
    expect(isSigningOut()).toBe(true)
  })

  it("on air: the flag is up before the show stops, so the studio skips its wrap redirect", async () => {
    onAir()
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.signOut("/", { confirmed: true }))
    expect(h.steps).toEqual(["stop (signingOut=true)", "post /logout (signingOut=true)", "clearAuth", "leave / (signed-out)"])
  })

  it("still leaves when the stop throws", async () => {
    onAir(async () => { throw new Error("socket gone") })
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.signOut("/", { confirmed: true }))
    expect(h.steps).toEqual(["post /logout (signingOut=true)", "clearAuth", "leave / (signed-out)"])
  })

  it("still leaves when /logout fails", async () => {
    h.logoutFails = true
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.signOut("/auth/login"))
    expect(h.steps.at(-1)).toBe("leave /auth/login (signed-out)")
  })

  it("a second press while signing out does nothing", async () => {
    const { result } = renderHook(() => useSignOut())
    await act(async () => { await Promise.all([result.current.signOut(), result.current.signOut()]) })
    expect(h.steps.filter((s) => s.startsWith("leave"))).toEqual(["leave / (signed-out)"])
  })

  it("on air without a confirm: Cancel on the native prompt leaves everything as it was", async () => {
    onAir()
    vi.spyOn(window, "confirm").mockReturnValueOnce(false)
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.signOut())
    expect(h.steps).toEqual([])
    expect(isSigningOut()).toBe(false)
  })

  it("a page restored from the back/forward cache drops the stale flag", async () => {
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.signOut())
    expect(result.current.signingOut).toBe(true)
    act(() => { window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })) })
    expect(isSigningOut()).toBe(false)
    expect(result.current.signingOut).toBe(false)
  })

  it("drops the flag on a bfcache restore with no sign-out button mounted", () => {
    // Delete account and "Use a different account" may leave from a page
    // that has none; the listener lives in signOutState, not the hook.
    setSigningOut(true)
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    expect(isSigningOut()).toBe(false)
  })

  it("an ordinary pageshow leaves the flag alone", () => {
    setSigningOut(true)
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }))
    expect(isSigningOut()).toBe(true)
  })

  describe("account deletion (revoke)", () => {
    function revoker(fails = false) {
      return async () => {
        h.steps.push(`revoke (signingOut=${h.signingOut})`)
        if (fails) throw new Error("422")
      }
    }

    it("raises the flag before the token goes, skips /logout, leaves with its notice", async () => {
      const { result } = renderHook(() => useSignOut())
      await act(() => result.current.signOut("/", { confirmed: true, notice: "account-deleted", revoke: revoker() }))
      expect(h.steps).toEqual(["revoke (signingOut=true)", "clearAuth", "leave / (account-deleted)"])
    })

    it("on air: ends the show first, while the token still works", async () => {
      onAir()
      const { result } = renderHook(() => useSignOut())
      await act(() => result.current.signOut("/", { confirmed: true, notice: "account-deleted", revoke: revoker() }))
      expect(h.steps).toEqual(["stop (signingOut=true)", "revoke (signingOut=true)", "clearAuth", "leave / (account-deleted)"])
    })

    it("a failed DELETE drops the flag, keeps the auth, and reaches the caller", async () => {
      const { result } = renderHook(() => useSignOut())
      let caught: unknown
      await act(async () => {
        try { await result.current.signOut("/", { confirmed: true, revoke: revoker(true) }) } catch (e) { caught = e }
      })
      expect((caught as Error).message).toBe("422")
      expect(h.steps).toEqual(["revoke (signingOut=true)"])
      expect(isSigningOut()).toBe(false)
      expect(result.current.signingOut).toBe(false)
    })
  })
})
