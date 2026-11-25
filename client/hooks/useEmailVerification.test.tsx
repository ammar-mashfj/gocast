import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

const h = vi.hoisted(() => ({ steps: [] as string[] }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }))
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }))
vi.mock("@/actions/auth", () => ({ clearAuth: () => h.steps.push("clearAuth"), saveAuth: () => {} }))
vi.mock("@/lib/axios", () => ({
  default: {
    post: async (url: string) => { h.steps.push(`post ${url}`); return {} },
    get: async () => ({ data: {} }),
  },
}))

import { useEmailVerification } from "./useEmailVerification"
import { setSigningOut } from "@/lib/signOutState"

beforeEach(() => { h.steps = [] })

describe("Use a different account", () => {
  it("on login/register: logs out itself, then cancels", async () => {
    const { result } = renderHook(() => useEmailVerification({ open: false, onCancel: () => h.steps.push("onCancel") }))
    await act(() => result.current.dismiss())
    expect(h.steps).toEqual(["post /logout", "clearAuth", "onCancel"])
  })

  it("in the dashboard: hands the whole exit to the caller's sign-out", async () => {
    const { result } = renderHook(() =>
      useEmailVerification({
        open: false,
        onCancel: () => h.steps.push("onCancel"),
        signOut: async () => { h.steps.push("signOut"); return true },
      }),
    )
    await act(() => result.current.dismiss())
    expect(h.steps).toEqual(["signOut"])
    // Busy until the page goes: a code typed now mustn't verify mid sign-out.
    expect(result.current.signingOut).toBe(true)
  })

  it("Cancel on the on-air prompt gives the dialog back", async () => {
    const { result } = renderHook(() =>
      useEmailVerification({ open: false, onCancel: () => {}, signOut: async () => false }),
    )
    await act(() => result.current.dismiss())
    expect(result.current.signingOut).toBe(false)
  })

  it("a code typed during a sign-out isn't sent", async () => {
    setSigningOut(true)
    const { result } = renderHook(() => useEmailVerification({ open: false, onCancel: () => {} }))
    await act(async () => {
      result.current.onCodeChange({ target: { value: "123456" } } as React.ChangeEvent<HTMLInputElement>)
    })
    expect(h.steps).toEqual([])
    setSigningOut(false)
  })
})
