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
