import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { CatalogProduct } from "@/lib/billing"

/**
 * The Get Pro dialog's two ways to pay: lava.top links for card and PayPal
 * (first), and the OxaPay term picker for digital currency.
 */

const h = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_LAVA_SUBSCRIPTION_URL = "https://lava.test/subscription"
  process.env.NEXT_PUBLIC_LAVA_PRODUCT_URL = "https://lava.test/product"
  return { products: null as CatalogProduct[] | null }
})

vi.mock("@/contexts/AccountContext", () => ({ useAccount: () => ({ id: "42", email: "dj.mike@example.com" }) }))
vi.mock("@/hooks/useCatalog", () => ({ useCatalog: () => h.products }))
vi.mock("@/lib/billing", async (original) => ({
  ...(await original<typeof import("@/lib/billing")>()),
  fetchCardInterest: vi.fn(async () => false),
  quoteProduct: vi.fn(),
  startCheckout: vi.fn(),
}))

import { ProCheckoutDialog } from "./ProCheckoutDialog"

function product(slug: string, count: number, price: string): CatalogProduct {
  return {
    slug,
    name: `Pro · ${count} months`,
    description: null,
    badge: null,
    plan: { slug: "pro", name: "Pro" },
    duration: { unit: "month", count, label: `${count} months` },
    per_month_usd: null,
    list_price_usd: price,
    discount_usd: "0.00",
    price_usd: price,
    discount: null,
    coupon_error: null,
  }
}

function open(props: { initialProduct?: string; initialCoupon?: string } = {}) {
  const onOpenChange = vi.fn()
  render(<ProCheckoutDialog open onOpenChange={onOpenChange} onStarted={vi.fn()} {...props} />)
  return onOpenChange
}

beforeEach(() => {
  h.products = [product("pro-1-month", 1, "20.00"), product("pro-3-months", 3, "52.00")]
})

describe("ProCheckoutDialog", () => {
  it("opens on card or PayPal, with both lava.top links in a new tab", () => {
    open()

    expect(screen.getByRole("radio", { name: "Card or PayPal" }).getAttribute("aria-checked")).toBe("true")
    const subscribe = screen.getByRole("link", { name: /Subscribe for \$20/ })
    const product = screen.getByRole("link", { name: /Choose a plan/ })
    expect(subscribe.getAttribute("href")).toBe("https://lava.test/subscription?utm_source=gocast&utm_medium=dashboard&utm_content=42")
    expect(product.getAttribute("href")).toBe("https://lava.test/product?utm_source=gocast&utm_medium=dashboard&utm_content=42")
    expect(subscribe.getAttribute("target")).toBe("_blank")
    expect(product.getAttribute("target")).toBe("_blank")
    expect(screen.getByText("dj.mike@example.com")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull()
  })

  it("closes once a link is followed", () => {
    const onOpenChange = open()

    fireEvent.click(screen.getByRole("link", { name: /Choose a plan/ }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("switches to the digital currency picker, without the cards-soon line", () => {
    open()

    fireEvent.click(screen.getByRole("radio", { name: "Digital currency" }))

    expect(screen.getByRole("button", { name: "Pay $20" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /Choose a plan/ })).toBeNull()
    expect(screen.queryByText(/Card payments are coming soon/)).toBeNull()
  })

  it.each([{ initialProduct: "pro-3-months" }, { initialCoupon: "FRIEND" }])("opens on digital currency for an OxaPay link (%o)", (props) => {
    open(props)

    expect(screen.getByRole("radio", { name: "Digital currency" }).getAttribute("aria-checked")).toBe("true")
  })
})
