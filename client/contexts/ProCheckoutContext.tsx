"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ProCheckoutDialog } from "@/components/dashboard/billing/ProCheckoutDialog"
import { PaymentStatusDialog } from "@/components/dashboard/billing/PaymentStatusDialog"

/**
 * The Get Pro checkout, mounted once for the whole dashboard.
 *
 * Every upgrade affordance — the sidebar plan card, the overview tile, the
 * AutoDJ and audience upsells, settings — opens THIS dialog, so they can't
 * disagree about prices or state, and the sidebar (on every route) has
 * somewhere to open it from.
 *
 * It also answers the links that arrive from outside the dashboard, on any
 * dashboard route:
 * - `?payment=<uuid>` — OxaPay sending the buyer back (in the tab the payment
 *   page opened in); shows the payment's progress until Pro is granted.
 * - `?product=<slug>` — a renewal reminder or an admin's product link; opens
 *   checkout with that term picked (hidden, link-only products included).
 * - `?coupon=<CODE>` — a founder's coupon link; opens checkout with it filled.
 * - `?checkout=1` — just open it (the "plan ended" email).
 *
 * The parameters are removed from the address once read, so a reload doesn't
 * open the dialog again.
 */
interface ProCheckoutValue {
  open: (options?: { product?: string; coupon?: string }) => void
}

const ProCheckoutContext = createContext<ProCheckoutValue>({ open: () => {} })

const LINK_PARAMS = ["payment", "product", "coupon", "checkout"] as const

export function ProCheckoutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [product, setProduct] = useState<string | null>(null)
  const [coupon, setCoupon] = useState<string | null>(null)
  const [payment, setPayment] = useState<string | null>(null)
  // Set only for a payment just started here: its link is already in hand,
  // and the dialog opens on "Your payment is ready" rather than "Waiting".
  const [startedUrl, setStartedUrl] = useState<string | null>(null)

  const open = useCallback((options?: { product?: string; coupon?: string }) => {
    setProduct(options?.product ?? null)
    setCoupon(options?.coupon ?? null)
    setIsOpen(true)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!LINK_PARAMS.some((key) => params.has(key))) return

    const paymentId = params.get("payment")
    if (paymentId) {
      setStartedUrl(null)
      setPayment(paymentId)
    } else if (params.has("product") || params.has("coupon") || params.has("checkout")) {
      open({ product: params.get("product") ?? undefined, coupon: params.get("coupon") ?? undefined })
    }

    for (const key of LINK_PARAMS) params.delete(key)
    const rest = params.toString()
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })
    // Read once, on arrival — not on every client navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<ProCheckoutValue>(() => ({ open }), [open])

  return (
    <ProCheckoutContext.Provider value={value}>
      {children}
      <ProCheckoutDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        initialProduct={product}
        initialCoupon={coupon}
        onStarted={({ uuid, paymentUrl }) => {
          setStartedUrl(paymentUrl)
          setPayment(uuid)
        }}
      />
      <PaymentStatusDialog
        key={payment ?? "none"}
        uuid={payment}
        startedUrl={startedUrl}
        onClose={() => {
          setPayment(null)
          setStartedUrl(null)
        }}
      />
    </ProCheckoutContext.Provider>
  )
}

export function useProCheckout(): ProCheckoutValue {
  return useContext(ProCheckoutContext)
}
