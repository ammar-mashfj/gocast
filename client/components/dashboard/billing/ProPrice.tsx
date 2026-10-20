"use client"

import { useCatalog } from "@/hooks/useCatalog"
import { formatUsd, monthlyProduct, yearlyProduct } from "@/lib/billing"
import { cn } from "@/lib/utils"

/**
 * "$20 / month" for the upsells, from the catalog — with the list price
 * struck through while a sale runs. Holds its line height while loading so
 * the card doesn't jump, and shows nothing at all if the catalog fails.
 */
export function ProPrice({
  className,
  amountClassName = "font-display text-title-lg",
  unitClassName = "text-sm text-muted-foreground",
}: {
  className?: string
  amountClassName?: string
  unitClassName?: string
}) {
  const products = useCatalog()
  const monthly = products ? monthlyProduct(products) : undefined

  if (!monthly) {
    return <span aria-hidden className={cn("invisible flex items-baseline gap-1.5", className)}><span className={amountClassName}>$0</span></span>
  }

  const onSale = Number(monthly.discount_usd) > 0

  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-1.5", className)}>
      {onSale && <s className={cn(unitClassName, "font-normal")}>{formatUsd(monthly.list_price_usd)}</s>}
      <span className={amountClassName}>{formatUsd(monthly.price_usd)}</span>
      <span className={unitClassName}>/ month</span>
    </span>
  )
}

/** "$20/mo" as plain text, for one-line descriptions. Empty until loaded. */
export function useProPriceShort(): string {
  const products = useCatalog()
  const monthly = products ? monthlyProduct(products) : undefined
  return monthly ? `${formatUsd(monthly.price_usd)}/mo` : ""
}

/** "or $160 / year, save $80" — null without a yearly term or a saving. */
export function useYearlyLine(): { price: string; saving: string } | null {
  const products = useCatalog()
  if (!products) return null
  const monthly = monthlyProduct(products)
  const yearly = yearlyProduct(products)
  if (!monthly || !yearly) return null
  const saving = Number(monthly.price_usd) * 12 - Number(yearly.price_usd)
  return saving > 0 ? { price: formatUsd(yearly.price_usd), saving: formatUsd(saving) } : null
}
