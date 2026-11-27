import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

/** A mistyped lava.top link in the env turns the card tab off; the dialog still opens on digital currency. */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_LAVA_SUBSCRIPTION_URL = "app.lava.top/products/not-a-url"
  process.env.NEXT_PUBLIC_LAVA_PRODUCT_URL = "https://lava.test/product"
})

vi.mock("@/contexts/AccountContext", () => ({ useAccount: () => ({ id: "42", email: "dj.mike@example.com" }) }))
vi.mock("@/hooks/useCatalog", () => ({ useCatalog: () => [] }))
vi.mock("@/lib/billing", async (original) => ({
  ...(await original<typeof import("@/lib/billing")>()),
  fetchCardInterest: vi.fn(async () => false),
  quoteProduct: vi.fn(),
  startCheckout: vi.fn(),
}))

import { ProCheckoutDialog } from "./ProCheckoutDialog"

describe("ProCheckoutDialog with a bad lava.top link", () => {
  it("renders without the card tab instead of crashing", () => {
    render(<ProCheckoutDialog open onOpenChange={vi.fn()} onStarted={vi.fn()} />)

    expect(screen.queryByRole("radio", { name: "Card or PayPal" })).toBeNull()
    expect(screen.queryByRole("link", { name: /Subscribe for/ })).toBeNull()
  })
})
