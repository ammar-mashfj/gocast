import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const success = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { success } }))

import { LeaveNoticeToast } from "./LeaveNoticeToast"

function at(path: string) {
  window.history.replaceState(null, "", path)
}
const here = () => window.location.pathname + window.location.search + window.location.hash

afterEach(() => {
  success.mockClear()
  at("/")
})

describe("LeaveNoticeToast", () => {
  it("says it once and takes the param out of the address bar", () => {
    at("/?left=signed-out")
    const { unmount } = render(<LeaveNoticeToast />)
    expect(success).toHaveBeenCalledExactlyOnceWith("Signed out")
    expect(here()).toBe("/")

    // A refresh: the param is gone, so nothing is said again.
    unmount()
    render(<LeaveNoticeToast />)
    expect(success).toHaveBeenCalledOnce()
  })

  it("keeps the rest of the URL", () => {
    at("/auth/login?utm_source=x&left=account-deleted#top")
    render(<LeaveNoticeToast />)
    expect(success).toHaveBeenCalledWith("Account deleted — sorry to see you go.")
    expect(here()).toBe("/auth/login?utm_source=x#top")
  })

  it("shows nothing for a value it doesn't know, but still cleans the URL", () => {
    at("/?left=<b>hi</b>")
    render(<LeaveNoticeToast />)
    expect(success).not.toHaveBeenCalled()
    expect(here()).toBe("/")
  })

  it("leaves a page without the param alone", () => {
    at("/discover?genre=jazz")
    render(<LeaveNoticeToast />)
    expect(success).not.toHaveBeenCalled()
    expect(here()).toBe("/discover?genre=jazz")
  })
})
