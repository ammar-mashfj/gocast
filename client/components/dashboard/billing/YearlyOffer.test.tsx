import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { CatalogProduct } from "@/lib/billing"

/**
 * The yearly offer: who sees it, when it opens by itself, the floating
 * button that brings it back, and where it never shows (the studio flow).
 */

const h = vi.hoisted(() => ({
  plan: { slug: "free" } as { slug: string } | null,
  pathname: "/dashboard",
  state: "idle",
  products: null as CatalogProduct[] | null,
  openCheckout: vi.fn(),
}))

vi.mock("@/contexts/AccountContext", () => ({ usePlan: () => h.plan }))
vi.mock("@/contexts/BroadcastContext", () => ({ useBroadcast: () => ({ state: h.state }) }))
vi.mock("@/contexts/ProCheckoutContext", () => ({ useProCheckout: () => ({ open: h.openCheckout }) }))
vi.mock("@/hooks/useCatalog", () => ({ useCatalog: () => h.products }))
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }))

import { YearlyOffer } from "./YearlyOffer"

function product(slug: string, count: number, list: string, price: string, discount: CatalogProduct["discount"] = null): CatalogProduct {
  return {
    slug,
    name: `Pro · ${count} months`,
    description: null,
    badge: null,
    plan: { slug: "pro", name: "Pro" },
    duration: { unit: "month", count, label: `${count} months` },
    per_month_usd: null,
    list_price_usd: list,
    discount_usd: (Number(list) - Number(price)).toFixed(2),
    price_usd: price,
    discount,
    coupon_error: null,
  }
}

const SALE = { label: "45% off", code: null, ends_at: "2026-12-31T23:59:59Z" }

beforeEach(() => {
  h.plan = { slug: "free" }
  h.pathname = "/dashboard"
  h.state = "idle"
  h.products = [product("pro-1-month", 1, "20.00", "20.00"), product("pro-12-months", 12, "180.00", "99.00", SALE)]
  h.openCheckout.mockReset()
  window.history.replaceState(null, "", "/dashboard")
})

describe("YearlyOffer", () => {
  it("opens by itself for a Free account while the year is on sale", () => {
    render(<YearlyOffer />)

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("A full year of Pro for $99")).toBeTruthy()
    expect(screen.getByText(/\$8\.25 a month instead of \$20/)).toBeTruthy()
  })

  it("leaves a floating button after closing, which opens it again", () => {
    render(<YearlyOffer />)

    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }))
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /see the offer/ }))
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("hands on to checkout with the 12-month term picked", () => {
    render(<YearlyOffer />)

    fireEvent.click(screen.getByRole("button", { name: "Get a year for $99" }))

    expect(h.openCheckout).toHaveBeenCalledWith({ product: "pro-12-months" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it.each(["/dashboard/stations/jazz/studio", "/dashboard/stations/jazz/live", "/dashboard/stations/jazz/studio/wrap"])(
    "shows neither the offer nor the button on %s",
    (path) => {
      h.pathname = path
      render(<YearlyOffer />)

      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.queryByRole("button", { name: /see the offer/ })).toBeNull()
    },
  )

  it("does not pop up over a live show, but keeps the button", () => {
    h.state = "live"
    render(<YearlyOffer />)

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: /see the offer/ })).toBeTruthy()
  })

  it.each(["?product=pro-3-months", "?lava=abc", "?payment=abc"])("does not cover a checkout or payment link (%s)", (query) => {
    window.history.replaceState(null, "", `/dashboard${query}`)
    render(<YearlyOffer />)

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("shows nothing to a Pro account", () => {
    h.plan = { slug: "pro" }
    const { container } = render(<YearlyOffer />)

    expect(container.innerHTML).toBe("")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("shows nothing when the year is not on sale, or only through a coupon", () => {
    h.products = [product("pro-12-months", 12, "180.00", "180.00")]
    const { unmount } = render(<YearlyOffer />)
    expect(screen.queryByRole("dialog")).toBeNull()
    unmount()

    h.products = [product("pro-12-months", 12, "180.00", "99.00", { label: "45% off", code: "FRIEND", ends_at: null })]
    render(<YearlyOffer />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
