import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"

const success = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { success } }))

import { LeaveNoticeToast } from "./LeaveNoticeToast"

function at(path: string) {
  window.history.replaceState(null, "", path)
}
const here = () => window.location.pathname + window.location.search + window.location.hash

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  success.mockClear()
  at("/")
})
const tick = () => act(() => { vi.runAllTimers() })

describe("LeaveNoticeToast", () => {
  it("says it once and takes the param out of the address bar", () => {
    at("/?left=signed-out")
    const { unmount } = render(<LeaveNoticeToast />)
    tick()
    expect(success).toHaveBeenCalledExactlyOnceWith("Signed out")
    expect(here()).toBe("/")

    // A refresh: the param is gone, so nothing is said again.
    unmount()
    render(<LeaveNoticeToast />)
    tick()
    expect(success).toHaveBeenCalledOnce()
  })

  it("keeps the rest of the URL", () => {
    at("/auth/login?utm_source=x&left=account-deleted#top")
    render(<LeaveNoticeToast />)
    tick()
    expect(success).toHaveBeenCalledWith("Account deleted — sorry to see you go.")
    expect(here()).toBe("/auth/login?utm_source=x#top")
  })

  it("shows nothing for a value it doesn't know, but still cleans the URL", () => {
    at("/?left=<b>hi</b>")
    render(<LeaveNoticeToast />)
    tick()
    expect(success).not.toHaveBeenCalled()
    expect(here()).toBe("/")
  })

  it("leaves a page without the param alone", () => {
    at("/discover?genre=jazz")
    render(<LeaveNoticeToast />)
    tick()
    expect(success).not.toHaveBeenCalled()
    expect(here()).toBe("/discover?genre=jazz")
  })

  // Next patches replaceState in the root router's effect, which React runs
  // after this child's. The raw one wiped Next's history entry: Back to the
  // page then changed the address bar and not the screen.
  it("strips through the replaceState a parent effect installed", () => {
    const seen: unknown[] = []
    function Router({ children }: { children: ReactNode }) {
      useEffect(() => {
        const original = window.history.replaceState.bind(window.history)
        window.history.replaceState = (data, unused, url) => {
          seen.push(url)
          original(data, unused, url)
        }
        return () => { window.history.replaceState = original }
      }, [])
      return children
    }
    at("/?left=signed-out")
    const { unmount } = render(<Router><LeaveNoticeToast /></Router>)
    expect(seen).toEqual([])
    tick()
    expect(seen).toEqual(["/"])
    unmount()
  })

  it("does nothing if it unmounts before the tick", () => {
    at("/?left=signed-out")
    const { unmount } = render(<LeaveNoticeToast />)
    unmount()
    tick()
    expect(success).not.toHaveBeenCalled()
    expect(here()).toBe("/?left=signed-out")
  })
})
