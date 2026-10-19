"use client"

import { useEffect, useState } from "react"
import { fetchCatalog, type CatalogProduct } from "@/lib/billing"

/**
 * The checkout catalog, for anything that shows a Pro price. Null until it
 * has loaded (and if it fails) — callers render no price rather than a
 * guessed one, because the price is whatever the admin panel says today.
 */
export function useCatalog(): CatalogProduct[] | null {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null)

  useEffect(() => {
    let live = true
    fetchCatalog()
      .then((p) => live && setProducts(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return products
}
