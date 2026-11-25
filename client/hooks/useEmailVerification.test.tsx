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
        signOut: async () => { h.steps.push("signOut") },
      }),
    )
    await act(() => result.current.dismiss())
    expect(h.steps).toEqual(["signOut"])
  })
})
