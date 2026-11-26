"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { IconCheck, IconGift } from "@tabler/icons-react"
import { useCatalog } from "@/hooks/useCatalog"
import { usePlan } from "@/contexts/AccountContext"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { PRO_FEATURES } from "@/interfaces/Plan"
import { formatUsd, monthlyProduct, yearlyProduct, type CatalogProduct } from "@/lib/billing"
import { activeNav } from "@/lib/dashboardNav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { ProTag } from "@/components/ds/Tag"

/** The links that open checkout or a payment's progress: never cover those. */
const CHECKOUT_PARAMS = ["payment", "lava", "product", "coupon", "checkout"]

/** Four of the eight, the ones a Free station feels the lack of first. */
const HIGHLIGHTS = [PRO_FEATURES[0], PRO_FEATURES[2], PRO_FEATURES[4], PRO_FEATURES[5]]

/**
 * The yearly Pro offer, for Free accounts while the 12-month term is on
 * sale in the admin panel (Products → its sale). The sale is the switch:
 * end it there and the offer and its button go away, no deploy.
 *
 * - Opens by itself once each time the dashboard is opened (a load, a new
 *   tab, a sign-in), not again while moving between pages.
 * - Once closed, a floating button in the corner opens it again.
 * - Never in the studio flow (go-live, the studio, the wrap screen), and
 *   never pops up over a live show elsewhere in the dashboard.
 *
 * "Get a year" hands on to the normal checkout with the 12-month term picked,
 * so the price there is the same one, priced again by the server.
 */
export function YearlyOffer() {
  const plan = usePlan()
  const products = useCatalog()
  const checkout = useProCheckout()
  const pathname = usePathname() ?? ""
  const { state } = useBroadcast()
  // null until they open or close it themselves. This (with the layout) stays
  // mounted across client navigations and mounts again on a reload or after
  // signing in, so "closed" lasts exactly one visit.
  const [chosen, setChosen] = useState<boolean | null>(null)
  // Read at mount, before the checkout provider clears the address: a
  // payment link must open checkout alone, not under this.
  const [arrivedForCheckout] = useState(
    () => typeof window !== "undefined" && CHECKOUT_PARAMS.some((key) => new URLSearchParams(window.location.search).has(key)),
  )

  const yearly = products ? onSale(yearlyProduct(products)) : null
  const monthly = products ? monthlyProduct(products) : undefined
  const eligible = plan?.slug === "free" && yearly !== null
  const inStudio = activeNav(pathname) === "studio"
  const broadcasting = state === "live" || state === "reconnecting"

  if (!eligible || !yearly) return null

  // Opens by itself until they choose, except where it would be in the way.
  const open = !inStudio && (chosen ?? (!arrivedForCheckout && !broadcasting))

  const perMonth = Number(yearly.price_usd) / 12
  const monthlyPrice = monthly ? Number(monthly.price_usd) : null
  const ends = yearly.discount?.ends_at
    ? new Date(yearly.discount.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={setChosen}>
        <DialogContent size="sm">
          <DialogHeader>
            <ProTag className="self-start" />
            <DialogTitle>A full year of Pro for {formatUsd(yearly.price_usd)}</DialogTitle>
            <DialogDescription>
              {monthlyPrice && perMonth < monthlyPrice
                ? `That’s ${formatUsd(perMonth.toFixed(2))} a month instead of ${formatUsd(monthlyPrice)}, paid once.`
                : "Paid once, nothing renews by itself."}
              {ends && ` Until ${ends}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-baseline gap-2">
            <s className="text-lead text-muted-foreground">{formatUsd(yearly.list_price_usd)}</s>
            <span className="font-display text-title-lg text-foreground">{formatUsd(yearly.price_usd)}</span>
            <span className="text-sm text-muted-foreground">/ year</span>
          </div>

          <ul className="flex flex-col">
            {HIGHLIGHTS.map((f) => (
              <li key={f} className="flex items-start gap-2.5 border-t border-line py-2.5 text-body-sm">
                <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pro-text" />
                {f}
              </li>
            ))}
          </ul>

          <DialogFooter>
            <DialogClose asChild>
              <Button size="lg" variant="ghost">Maybe later</Button>
            </DialogClose>
            <Button
              size="lg"
              variant="pro"
              onClick={() => {
                setChosen(false)
                checkout.open({ product: yearly.slug })
              }}
            >
              Get a year for {formatUsd(yearly.price_usd)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!open && !inStudio && (
        <Button
          variant="pro"
          size="md"
          onClick={() => setChosen(true)}
          aria-label={`Pro for a year, ${formatUsd(yearly.price_usd)}: see the offer`}
          className={cn(
            // Floating, so it casts the panel shadow. Above the phone tab bar
            // below 1024px; the corner of the page from there up.
            "fixed right-gutter bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 shadow-panel lg:bottom-6",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
          )}
        >
          <IconGift aria-hidden />
          {formatUsd(yearly.price_usd)} / year
        </Button>
      )}
    </>
  )
}

/** The term while a sale (not a coupon) runs on it, else null. */
function onSale(product: CatalogProduct | undefined): CatalogProduct | null {
  if (!product || Number(product.discount_usd) <= 0 || product.discount?.code) return null
  return product
}
