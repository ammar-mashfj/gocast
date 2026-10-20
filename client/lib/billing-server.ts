import { env } from "@/lib/env"
import { publicApiHeaders } from "@/lib/public-api"
import type { CatalogProduct } from "@/lib/billing-catalog"

/**
 * The checkout catalog for server-rendered marketing pages (the homepage's
 * pricing section), so the public price is whatever the admin panel says
 * today rather than a constant in this repo.
 *
 * Null on any failure: the page renders without a price instead of erroring
 * or showing a stale guess. Revalidated every five minutes, so a sale started
 * in admin shows up on the homepage within that.
 */
export async function getCatalog(): Promise<CatalogProduct[] | null> {
  try {
    const res = await fetch(`${env.apiUrl}/billing/catalog`, {
      headers: publicApiHeaders(),
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data as CatalogProduct[]
  } catch {
    return null
  }
}
