import api from "@/lib/axios"
import type { CatalogProduct, PaymentStatus } from "@/lib/billing-catalog"

export * from "@/lib/billing-catalog"

let catalogRequest: Promise<CatalogProduct[]> | null = null

/**
 * The listed products, fetched once per page load and shared by every upsell
 * that shows a price. A failure clears the cache so the next caller retries.
 */
export function fetchCatalog(): Promise<CatalogProduct[]> {
  catalogRequest ??= api
    .get<{ data: CatalogProduct[] }>("/billing/catalog")
    .then((res) => res.data.data)
    .catch((err) => {
      catalogRequest = null
      throw err
    })
  return catalogRequest
}

export async function quoteProduct(product: string, code: string): Promise<CatalogProduct> {
  const res = await api.post<{ data: CatalogProduct }>("/billing/quote", { product, code })
  return res.data.data
}

export async function startCheckout(product: string, code: string | null): Promise<{ payment: string; payment_url: string }> {
  const res = await api.post<{ data: { payment: string; payment_url: string } }>("/billing/checkout", { product, code })
  return res.data.data
}

/** Stop the lava.top monthly subscription. Pro stays until `pro_until`. */
export async function cancelSubscription(): Promise<{ pro_until: string | null }> {
  const res = await api.post<{ data: { pro_until: string | null } }>("/billing/subscription/cancel")
  return res.data.data
}

export async function fetchPayment(uuid: string): Promise<PaymentStatus> {
  const res = await api.get<{ data: PaymentStatus }>(`/billing/payments/${encodeURIComponent(uuid)}`)
  return res.data.data
}

/** The message the API put on a refusal, or a fallback for anything else. */
export function billingError(err: unknown): string {
  const response =
    typeof err === "object" && err && "response" in err
      ? (err as { response?: { status?: number; data?: { message?: string } } }).response
      : undefined
  if (response?.status === 429) return "Too many attempts. Wait a minute and try again."
  if (response?.status === 401) return "Your session has expired. Please sign in again."
  return response?.data?.message ?? "Something went wrong. Please try again."
}

/** Has this account asked to hear when card payments arrive? */
export async function fetchCardInterest(): Promise<boolean> {
  const res = await api.get<{ data: { subscribed: boolean } }>("/billing/card-interest")
  return res.data.data.subscribed
}

/** "Notify me" under "Card payments are coming soon". Safe to call twice. */
export async function notifyCardPayments(): Promise<void> {
  await api.post("/billing/card-interest")
}

/**
 * The link with this account's id as `utm_content`, which lava.top hands back
 * in the webhook (clientUtm): the payment then finds the account even when
 * the buyer types another email (LavaSales::account). The email stays the
 * fallback. `medium` and `campaign` are only for reading lava.top's own
 * stats: where in the dashboard the buyer came from.
 */
export function withLavaAccount(
  link: string,
  accountId: string | null,
  { medium = "dashboard", campaign }: { medium?: string; campaign?: string } = {},
): string {
  if (!accountId) return link
  const url = new URL(link)
  url.searchParams.set("utm_source", "gocast")
  url.searchParams.set("utm_medium", medium)
  if (campaign) url.searchParams.set("utm_campaign", campaign)
  url.searchParams.set("utm_content", accountId)
  return url.toString()
}

/** A link to lava.top's checkout pages (any lava.top host). */
export function isLavaLink(link: string): boolean {
  try {
    const host = new URL(link).hostname
    return host === "lava.top" || host.endsWith(".lava.top")
  } catch {
    return false
  }
}
