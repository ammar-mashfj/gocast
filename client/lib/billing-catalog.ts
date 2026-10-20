/**
 * Self-serve checkout, as the API's BillingController answers it.
 *
 * Every price here comes from the server — products, sales and coupons are
 * rows edited in the admin panel — so nothing on the client may hardcode one.
 * Amounts are decimal strings ("13.33") exactly as the API sends them.
 */
export interface CatalogProduct {
  slug: string
  name: string
  description: string | null
  badge: string | null
  plan: { slug: string; name: string } | null
  duration: { unit: "week" | "month" | "lifetime" | null; count: number | null; label: string | null }
  /** The total divided across the term — what to compare terms by. */
  per_month_usd: string | null
  list_price_usd: string
  discount_usd: string
  /** What they pay today: list price minus the running sale or their coupon. */
  price_usd: string
  discount: { label: string; code: string | null; ends_at: string | null } | null
  /** Set when a coupon was tried and is not the discount applied. */
  coupon_error: string | null
}

/**
 * What the buyer is told about one payment: not paid yet, paid and waiting on
 * confirmation, done, the invoice lapsed, or something a human must look at.
 */
export type PaymentState = "pending" | "confirming" | "granted" | "expired" | "attention"

export interface PaymentStatus {
  payment: string
  state: PaymentState
  product_name: string
  amount_usd: string
  granted_until: string | null
  payment_url: string | null
}

/** Bought once, never ends: no per-month price, no renewal. */
export function isLifetime(p: CatalogProduct): boolean {
  return p.duration.unit === "lifetime"
}

/** "$20", "$13.33" — whole dollars lose the ".00". */
export function formatUsd(amount: string | number): string {
  const n = typeof amount === "number" ? amount : Number.parseFloat(amount)
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

/**
 * The one-month term, which every "$20 / month" line quotes. No fallback to
 * another term: its price is a total, not a month's, and "$160 / month" is
 * worse than showing no price. Without one the line is left out.
 */
export function monthlyProduct(products: CatalogProduct[]): CatalogProduct | undefined {
  return products.find((p) => p.plan?.slug !== "free" && p.duration.unit === "month" && p.duration.count === 1)
}

/** The twelve-month term, for "or $160 / year" lines. */
export function yearlyProduct(products: CatalogProduct[]): CatalogProduct | undefined {
  return products.find((p) => p.duration.unit === "month" && p.duration.count === 12)
}
