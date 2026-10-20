import { describe, expect, it } from "vitest"
import { formatUsd, monthlyProduct, yearlyProduct, type CatalogProduct } from "./billing-catalog"

function product(slug: string, unit: "week" | "month", count: number, price: string, perMonth: string): CatalogProduct {
  return {
    slug,
    name: slug,
    description: null,
    badge: null,
    plan: { slug: "pro", name: "Pro" },
    duration: { unit, count, label: `${count} ${unit}s` },
    per_month_usd: perMonth,
    list_price_usd: price,
    discount_usd: "0.00",
    price_usd: price,
    discount: null,
    coupon_error: null,
  }
}

describe("billing catalog helpers", () => {
  it("drops .00 from whole dollars only", () => {
    expect(formatUsd("20.00")).toBe("$20")
    expect(formatUsd("13.33")).toBe("$13.33")
    expect(formatUsd(80)).toBe("$80")
  })

  it("quotes per month from the one-month term when there is one", () => {
    const list = [product("y", "month", 12, "160.00", "13.33"), product("m", "month", 1, "20.00", "20.00")]
    expect(monthlyProduct(list)?.slug).toBe("m")
    expect(yearlyProduct(list)?.slug).toBe("y")
  })

  it("quotes no monthly price without a one-month term", () => {
    const list = [product("q", "month", 3, "52.00", "17.33"), product("y", "month", 12, "160.00", "13.33")]
    expect(monthlyProduct(list)).toBeUndefined()
  })
})
