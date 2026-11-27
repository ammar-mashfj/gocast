import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Plan } from "@/interfaces/Plan"

/** Cancel subscription on the Account page's plan card. */

const h = vi.hoisted(() => ({
  plan: null as Plan | null,
  cancel: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("@/contexts/AccountContext", () => ({ usePlan: () => h.plan }))
vi.mock("@/contexts/ProCheckoutContext", () => ({ useProCheckout: () => ({ open: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }))
vi.mock("@/lib/billing", async (original) => ({
  ...(await original<typeof import("@/lib/billing")>()),
  cancelSubscription: h.cancel,
}))

import { PlanCard } from "./PlanCard"

const IN_12_DAYS = new Date(Date.now() + 12 * 86_400_000 - 60_000).toISOString()

function pro(extra: Partial<Plan> = {}): Plan {
  return {
    slug: "pro",
    name: "Pro",
    autodj_enabled: true,
    analytics_days: 90,
    max_listeners: 1000,
    embed_enabled: true,
    encoder_enabled: true,
    watermarked: false,
    expires_at: IN_12_DAYS,
    ...extra,
  } as Plan
}

beforeEach(() => {
  h.cancel.mockReset()
  h.refresh.mockReset()
})

describe("PlanCard: cancel subscription", () => {
  it("cancels after the confirm and says how much Pro is left", async () => {
    h.plan = pro({ subscribed: true })
    h.cancel.mockResolvedValue({ pro_until: IN_12_DAYS })
    render(<PlanCard />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }))
    expect(h.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel subscription" }).at(-1)!)

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/cancelled\. You still have Pro for 12 days, until/))
    expect(h.cancel).toHaveBeenCalledTimes(1)
    expect(h.refresh).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).toBeNull()
  })

  it("gives no day count when a day or less is left", async () => {
    const tomorrow = new Date(Date.now() + 20 * 3_600_000).toISOString()
    h.plan = pro({ subscribed: true, expires_at: tomorrow })
    h.cancel.mockResolvedValue({ pro_until: tomorrow })
    render(<PlanCard />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel subscription" }).at(-1)!)

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/cancelled\. You still have Pro until \d/))
    expect(screen.getByRole("status").textContent).not.toMatch(/days?,/)
  })

  it("keeps the button and shows why when it couldn't cancel", async () => {
    h.plan = pro({ subscribed: true })
    h.cancel.mockRejectedValue(new Error("down"))
    render(<PlanCard />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel subscription" }).at(-1)!)

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Cancel subscription" })).toBeTruthy()
  })

  it("lets a subscriber who lapsed to Free cancel, instead of offering Get Pro", async () => {
    h.plan = { ...pro({ subscribed: true, expires_at: null }), slug: "free", name: "Free" } as Plan
    h.cancel.mockResolvedValue({ pro_until: null })
    render(<PlanCard />)

    expect(screen.queryByRole("button", { name: "Get Pro" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel subscription" }).at(-1)!)

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Your subscription is cancelled. You won’t be charged again."))
  })

  it("offers no cancel to Pro that was paid once", () => {
    h.plan = pro({ subscribed: false })
    render(<PlanCard />)

    expect(screen.queryByRole("button", { name: "Cancel subscription" })).toBeNull()
    expect(screen.getByText(/Ends .*, then your account moves to Free/)).toBeTruthy()
  })
})
