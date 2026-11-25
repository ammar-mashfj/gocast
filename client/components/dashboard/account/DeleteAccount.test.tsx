import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { AxiosError } from "axios"

const h = vi.hoisted(() => ({
  onAir: false,
  outcome: "leave" as "leave" | "skip" | "fail" | "expired",
  toast: vi.fn(),
  steps: [] as string[],
}))

vi.mock("sonner", () => ({ toast: { error: h.toast, success: () => {} } }))
vi.mock("@/hooks/useSignOut", () => ({
  useSignOut: () => ({
    isBroadcasting: h.onAir,
    signingOut: false,
    signOut: async () => {
      if (h.outcome === "fail") throw new AxiosError("Server Error")
      if (h.outcome === "expired") {
        throw Object.assign(new AxiosError("Unauthenticated"), { response: { status: 401, data: {} } })
      }
      return h.outcome === "leave"
    },
  }),
}))

vi.mock("@/actions/auth", () => ({ clearAuth: () => h.steps.push("clearAuth") }))
vi.mock("@/lib/signOutState", () => ({ leaveExpired: () => h.steps.push("leaveExpired") }))

import { DeleteAccount } from "./DeleteAccount"

const EMAIL = "host@example.com"

async function deleteIt() {
  render(<DeleteAccount email={EMAIL} />)
  fireEvent.click(screen.getByRole("button", { name: /Delete account/ }))
  fireEvent.change(screen.getByRole("dialog").querySelector("input")!, { target: { value: EMAIL } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete forever" })) })
}

beforeEach(() => {
  h.onAir = false
  h.outcome = "leave"
  h.toast.mockClear()
  h.steps = []
})

describe("DeleteAccount", () => {
  it("on air: lists the show ending among the consequences", () => {
    h.onAir = true
    render(<DeleteAccount email={EMAIL} />)
    fireEvent.click(screen.getByRole("button", { name: /Delete account/ }))
    expect(screen.getByText("Ends the show you’re broadcasting now")).toBeTruthy()
  })

  it("a failed delete off air: nothing was removed", async () => {
    h.outcome = "fail"
    await deleteIt()
    expect(h.toast).toHaveBeenCalledWith("Couldn’t delete your account.", { description: "Nothing was removed." })
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeTruthy()
  })

  it("a failed delete on air: says the show was ended", async () => {
    h.onAir = true
    h.outcome = "fail"
    await deleteIt()
    expect(h.toast).toHaveBeenCalledWith("Couldn’t delete your account.", { description: "Your show was ended, but nothing else was removed." })
  })

  it("another sign-out already running: the button doesn't stay on Deleting…", async () => {
    h.outcome = "skip"
    await deleteIt()
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Deleting…" })).toBeNull()
  })

  it("leaving: stays on Deleting… while the page goes", async () => {
    await deleteIt()
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeTruthy()
  })

  it("an expired session goes to sign-in instead of failing on every try", async () => {
    h.outcome = "expired"
    await deleteIt()
    expect(h.steps).toEqual(["clearAuth", "leaveExpired"])
    expect(h.toast).not.toHaveBeenCalled()
  })
})
