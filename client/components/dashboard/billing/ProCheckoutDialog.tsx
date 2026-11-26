"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ds/Button"
import { RadioGroup } from "radix-ui"
import { IconCircleCheckFilled } from "@tabler/icons-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"
import { Segmented } from "@/components/ds/Segmented"
import { ProTag } from "@/components/ds/Tag"
import { cn } from "@/lib/utils"
import { useCatalog } from "@/hooks/useCatalog"
import {
  billingError,
  fetchCardInterest,
  fetchLavaStatus,
  formatUsd,
  isLifetime,
  notifyCardPayments,
  quoteProduct,
  startCheckout,
  startLavaCheckout,
  type CatalogProduct,
  type LavaStatus,
  type PaymentProvider,
} from "@/lib/billing"

type Method = "card" | "paypal" | "crypto"

/**
 * Get Pro: pick how to pay, a term, optionally a coupon, and pay on the
 * provider's page.
 *
 * Three ways to pay, once card checkout is switched on (`/billing/lava`):
 * - Card or PayPal, both through lava.top (each payment is tied to one
 *   processor, so the buyer picks here). The one-month term is a membership
 *   that lava.top charges again every month; it is shown at its full price
 *   (lava.top owns that price, so no sale or coupon applies to it). Every
 *   other term is paid once.
 * - USDT, USDC or another digital currency, through OxaPay. Everything is
 *   paid once.
 * Until card checkout is on, the dialog is digital-currency only, with the
 * "card payments are coming soon" line.
 *
 * Pay only creates the invoice and hands it to `onStarted`; the payment page
 * itself opens from a real link in the status dialog, in a new tab. The
 * invoice URL doesn't exist until checkout answers, so Pay can't be that link,
 * and opening a tab after the request (window.open) is what popup blockers
 * stop. Never this tab: leaving /dashboard would end a live show.
 *
 * Every number comes from the API — the catalog for the terms and any running
 * sale, a quote for a coupon — and checkout prices it again server-side, so
 * this dialog only ever displays prices, never decides them.
 *
 * `initialProduct` may name a product the catalog doesn't list (a hidden,
 * link-only one, or a renewal of a term no longer listed); it is fetched by
 * quote and offered on its own.
 */
export function ProCheckoutDialog({
  open,
  onOpenChange,
  initialProduct,
  initialCoupon,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (payment: { uuid: string; paymentUrl: string; provider: PaymentProvider }) => void
  initialProduct?: string | null
  initialCoupon?: string | null
}) {
  const catalog = useCatalog()
  const [extra, setExtra] = useState<CatalogProduct | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [couponOpen, setCouponOpen] = useState(false)
  const [code, setCode] = useState("")
  const [applied, setApplied] = useState<CatalogProduct | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"quote" | "pay" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<"unknown" | "idle" | "saving" | "subscribed">("unknown")
  const [lava, setLava] = useState<LavaStatus | null>(null)
  // Pay waits for this: until it answers, "card is on" is unknown, and a card
  // buyer must not fall through to digital-currency checkout.
  const [lavaLoaded, setLavaLoaded] = useState(false)
  const [method, setMethod] = useState<Method>("card")

  // Whether card checkout is on, asked on every open: it is a server switch,
  // and a membership bought in another tab changes what may be sold.
  useEffect(() => {
    if (!open) return
    let live = true
    fetchLavaStatus()
      .then((status) => {
        if (!live) return
        setLava(status)
        setLavaLoaded(true)
      })
      .catch(() => {
        if (!live) return
        setLava(null)
        setLavaLoaded(true)
      })
    return () => {
      live = false
    }
  }, [open])

  const cardOn = lava?.enabled === true
  const viaCard = cardOn && method !== "crypto"
  // The term lava.top sells as a monthly membership, when paying by card.
  const membershipSlug = viaCard ? (lava?.membership_product ?? null) : null

  // Whether they already asked to hear about cards, so the line doesn't
  // offer "Notify me" twice. Only asked while cards aren't on.
  useEffect(() => {
    if (!open || cards !== "unknown" || lava === null || lava.enabled) return
    let live = true
    fetchCardInterest()
      .then((subscribed) => live && setCards(subscribed ? "subscribed" : "idle"))
      .catch(() => live && setCards("idle"))
    return () => {
      live = false
    }
  }, [open, cards, lava])

  async function notifyCards() {
    setCards("saving")
    try {
      await notifyCardPayments()
      setCards("subscribed")
    } catch {
      setCards("idle")
    }
  }

  // A link-only product, or one the catalog doesn't list any more.
  useEffect(() => {
    if (!open || !initialProduct || !catalog || catalog.some((p) => p.slug === initialProduct)) return
    let live = true
    quoteProduct(initialProduct, "")
      .then((p) => live && setExtra(p))
      .catch((err) => live && setError(billingError(err)))
    return () => {
      live = false
    }
  }, [open, initialProduct, catalog])

  const products = useMemo(() => {
    if (!catalog) return null
    return extra ? [extra] : catalog
  }, [catalog, extra])

  // Each open starts from what the link asked for, else the first term.
  useEffect(() => {
    if (!open || !products?.length) return
    setSelected(
      (current) =>
        current ?? defaultSlug(products, initialProduct),
    )
  }, [open, products, initialProduct])

  useEffect(() => {
    if (open && initialCoupon) {
      setCouponOpen(true)
      setCode(initialCoupon)
    }
  }, [open, initialCoupon])

  /** The quoted product when the coupon applies, else null (with the reason shown). */
  async function applyCoupon(product: string, value: string): Promise<CatalogProduct | null> {
    if (!value.trim()) return null
    setBusy("quote")
    setCouponError(null)
    try {
      const quoted = await quoteProduct(product, value.trim())
      if (quoted.coupon_error) {
        setApplied(null)
        setCouponError(quoted.coupon_error)
        return null
      }
      setApplied(quoted)
      return quoted
    } catch (err) {
      setApplied(null)
      setCouponError(billingError(err))
      return null
    } finally {
      setBusy(null)
    }
  }

  // A coupon from a link is tried as soon as there is a term to try it on,
  // and an applied coupon follows the buyer to whichever term they pick.
  useEffect(() => {
    if (!open || !selected || !code.trim()) return
    if (applied?.slug === selected) return
    if (!applied && !initialCoupon) return
    void applyCoupon(selected, code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected])

  const isMembership = selected !== null && selected === membershipSlug
  const listed = products?.find((p) => p.slug === selected) ?? null
  const chosen = isMembership
    ? listed && atFullPrice(listed)
    : ((applied?.slug === selected ? applied : listed) ?? null)

  function reset() {
    setExtra(null)
    setSelected(null)
    setCouponOpen(false)
    setCode("")
    setApplied(null)
    setCouponError(null)
    setBusy(null)
    setError(null)
    setMethod("card")
    setLavaLoaded(false)
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) reset()
  }

  async function pay() {
    if (!chosen) return
    // A code typed but never applied would otherwise be dropped and the
    // buyer charged full price. Apply it now; if it's refused, stop here so
    // the reason shows under the field and they choose: fix it or clear it.
    // The membership takes no coupon (lava.top charges its own price), so
    // one typed for another term is left out rather than refused.
    const typed = isMembership ? "" : code.trim()
    if (typed && applied?.slug !== chosen.slug && !(await applyCoupon(chosen.slug, typed))) return
    setBusy("pay")
    setError(null)
    try {
      const provider: PaymentProvider = viaCard ? "lava" : "oxapay"
      const { payment, payment_url } = viaCard
        ? await startLavaCheckout(chosen.slug, typed || null, method === "paypal" ? "paypal" : "card")
        : await startCheckout(chosen.slug, typed || null)
      onStarted({ uuid: payment, paymentUrl: payment_url, provider })
      handleOpenChange(false)
    } catch (err) {
      setError(billingError(err))
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* gap-3, not the shared 18px: with a lifetime on top this dialog is tall, and it should fit a laptop screen without scrolling. */}
      <DialogContent size="lg" className="gap-3">
        <DialogHeader>
          <ProTag className="self-start" />
          <DialogTitle>Get Pro</DialogTitle>
          {/* text-body, not the shared 14px/400 subtitle: this one has to be read before paying. */}
          <DialogDescription className="text-body text-muted-foreground">
            {viaCard ? (
              <>
                Pay {method === "paypal" ? "with " : "by "}
                <span className="font-semibold text-pro-text">{method === "paypal" ? "PayPal" : "card"}</span>. Monthly renews by itself until you turn it off; longer terms are paid once.
              </>
            ) : (
              <>
                Pay once with <span className="font-semibold text-pro-text">USDT, USDC or another digital currency</span>. Nothing renews by itself, and we’ll email you before it ends.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!products ? (
          <p role="status" className="text-body text-muted-foreground">
            {error ?? "Loading prices…"}
          </p>
        ) : products.length === 0 ? (
          <p role="status" className="text-body text-muted-foreground">
            Pro isn’t on sale right now. Email hello@gocast.fm and we’ll sort it out.
          </p>
        ) : (
          <>
            {cardOn ? (
              <Segmented<Method>
                aria-label="How to pay"
                value={method}
                onChange={setMethod}
                options={[
                  { value: "card", label: "Card" },
                  { value: "paypal", label: "PayPal" },
                  { value: "crypto", label: "Digital currency" },
                ]}
              />
            ) : (
              lava !== null && <CardPaymentsSoon state={cards} onNotify={notifyCards} />
            )}

            <TermPicker
              products={products}
              applied={applied}
              membershipSlug={membershipSlug}
              value={selected ?? defaultSlug(products, initialProduct)}
              onChange={setSelected}
            />

            {isMembership ? null : couponOpen ? (
              <form
                className="flex items-start gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (selected) void applyCoupon(selected, code)
                }}
              >
                <TextField
                  label="Coupon"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setApplied(null)
                    setCouponError(null)
                  }}
                  autoCapitalize="characters"
                  maxLength={60}
                  error={couponError}
                  hint={applied ? `${applied.discount?.label} applied.` : undefined}
                  className="flex-1"
                />
                <Button type="submit" variant="subtle" className="mt-3.75" disabled={busy !== null || !code.trim()}>
                  {busy === "quote" ? "Checking…" : "Apply"}
                </Button>
              </form>
            ) : (
              <Button variant="quiet" size="sm" className="self-start" onClick={() => setCouponOpen(true)}>
                Have a coupon?
              </Button>
            )}

            {error && (
              <p role="alert" className="text-body text-fault-text">
                {error}
              </p>
            )}

            <p className="text-body text-muted-foreground">
              {viaCard
                ? `You’ll pay ${method === "paypal" ? "with PayPal" : "by card"} on lava.top, our payment provider, and they’ll email you a receipt. Pro switches on by itself as soon as the payment goes through.${
                    isMembership
                      ? " You can turn auto-renew off any time, from lava.top’s email or on your Account page here."
                      : ""
                  }`
                : "You’ll pay on OxaPay, our payment provider. Pro switches on by itself as soon as the payment confirms, usually within a few minutes."}
            </p>
          </>
        )}

        <DialogFooter>
          <Button size="lg" variant="ghost" onClick={() => handleOpenChange(false)}>
            Not now
          </Button>
          <Button size="lg" variant="pro" onClick={pay} disabled={!chosen || busy !== null || !lavaLoaded}>
            {busy === "pay"
              ? "Preparing payment…"
              : chosen
                ? `Pay ${formatUsd(chosen.price_usd)}${isMembership ? " a month" : ""}`
                : "Pay"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The product at its list price, no sale: how the card membership is shown,
 * since lava.top charges its own fixed price every month.
 */
function atFullPrice(p: CatalogProduct): CatalogProduct {
  return { ...p, price_usd: p.list_price_usd, discount_usd: "0.00", discount: null, coupon_error: null }
}

/**
 * What the dialog opens on: the product a link asked for, else the term the
 * admin badged (the one we recommend), else the first term. A lifetime is
 * never preselected: it is the big purchase, and should be a choice.
 */
function defaultSlug(products: CatalogProduct[], initialProduct: string | null | undefined): string {
  const terms = products.filter((p) => !isLifetime(p))
  return (
    products.find((p) => p.slug === initialProduct) ??
    terms.find((p) => p.badge) ??
    terms[0] ??
    products[0]
  ).slug
}

/** "25% off until 30 Oct" / "Coupon: 25% off". */
function saleLine(p: CatalogProduct): string {
  if (!p.discount) return ""
  if (p.discount.code) return `Coupon: ${p.discount.label}`
  if (!p.discount.ends_at) return p.discount.label
  const ends = new Date(p.discount.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return `${p.discount.label} until ${ends}`
}

/**
 * "Card payments are coming soon" — first in the dialog, because a card is
 * what most people reach for, and they should learn it isn't here yet before
 * picking a term rather than after.
 */
function CardPaymentsSoon({
  state,
  onNotify,
}: {
  state: "unknown" | "idle" | "saving" | "subscribed"
  onNotify: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-well bg-surface-raised px-4 py-2.5">
      <span className="text-body">
        <span className="font-semibold">Paying by card? Card payments are coming soon.</span>
        {state === "subscribed" && <span className="text-muted-foreground"> We’ll email you when they’re here.</span>}
      </span>
      {state !== "subscribed" && (
        <Button variant="subtle" size="sm" onClick={onNotify} disabled={state === "saving" || state === "unknown"}>
          {state === "saving" ? "Saving…" : "Notify me"}
        </Button>
      )}
    </div>
  )
}

/**
 * Lifetime products first, across both columns in solid Pro amber; then the
 * terms, two per row. Every card leads with the total paid; a term adds its
 * per-month price so longer ones visibly cost less. A term the admin gave a
 * badge (e.g. "Best value") is drawn in the amber tint with the badge on top,
 * and every term cheaper per month than the monthly one says how much it
 * saves, in the "good" green. All of it comes from the catalog, so which
 * product is pushed is an admin edit, not a code change.
 */
function TermPicker({
  products,
  applied,
  membershipSlug,
  value,
  onChange,
}: {
  products: CatalogProduct[]
  applied: CatalogProduct | null
  /** The term sold as a monthly membership (card checkout), or null. */
  membershipSlug: string | null
  value: string
  onChange: (slug: string) => void
}) {
  const monthly = products.find((p) => p.duration.unit === "month" && p.duration.count === 1)
  const monthlyRate = monthly ? Number(monthly.list_price_usd) : null
  const ordered = [...products.filter(isLifetime), ...products.filter((p) => !isLifetime(p))]

  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onChange}
      aria-label="How long"
      className="grid grid-cols-2 gap-x-2.5 gap-y-5"
    >
      {ordered.map((p) => {
        const renews = p.slug === membershipSlug
        const shown = renews ? atFullPrice(p) : applied?.slug === p.slug ? applied : p
        const lifetime = isLifetime(p)
        const perMonth = Number(shown.per_month_usd ?? shown.price_usd)
        const isMonthly = p === monthly
        const saving = monthlyRate && !isMonthly && !lifetime ? Math.round((1 - perMonth / monthlyRate) * 100) : 0
        const onSale = Number(shown.discount_usd) > 0
        const featured = Boolean(p.badge) && !lifetime

        return (
          <RadioGroup.Item
            key={p.slug}
            value={p.slug}
            className={cn(
              "group relative flex flex-col gap-0.5 rounded-well px-4 py-2.5 text-left outline-none transition-colors",
              "ring-2 ring-transparent focus-visible:ring-ring data-[state=checked]:ring-pro",
              lifetime
                ? "col-span-2 bg-pro text-pro-ink ring-offset-background hover:bg-pro/90 data-[state=checked]:bg-pro data-[state=checked]:ring-foreground data-[state=checked]:ring-offset-2"
                : featured
                  ? "bg-pro-tint hover:bg-pro-tint/80"
                  : "bg-card hover:bg-surface-raised",
            )}
          >
            {p.badge && (
              <span
                className={cn(
                  "absolute -top-2.5 left-3.5 rounded-tag px-1.5 py-0.5 eyebrow-sm",
                  lifetime ? "bg-foreground text-background" : "bg-pro text-pro-ink",
                )}
              >
                {p.badge}
              </span>
            )}
            <IconCircleCheckFilled
              aria-hidden
              className={cn(
                "absolute top-3 right-3 size-5 opacity-0 transition-opacity group-data-[state=checked]:opacity-100",
                lifetime ? "text-pro-ink" : "text-pro",
              )}
            />
            {lifetime ? (
              // One row, price on the right: full width has room for it, and a
              // stacked lifetime card was what pushed the dialog into scrolling.
              <span className="flex items-center justify-between gap-4 pr-7">
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-base font-bold">{p.duration.label ?? p.name}</span>
                  <span className="text-body text-pro-ink/80">Paid once, yours for good. Nothing to renew.</span>
                  {p.description && <span className="text-body-sm font-semibold">{p.description}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-display text-title-lg">{formatUsd(shown.price_usd)}</span>
                  {onSale && <s className="text-body text-pro-ink/70">{formatUsd(shown.list_price_usd)}</s>}
                </span>
              </span>
            ) : (
              <>
                {/* The chips ride on the title row: a row of their own made the
                    dialog scroll on a laptop screen. */}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-6">
                  <span className={cn("font-display text-base font-bold", featured && "text-pro-text")}>
                    {p.duration.label ?? p.name}
                  </span>
                  {renews && (
                    <span className="rounded-tag bg-pro/15 px-1.5 py-0.5 text-caption font-bold text-pro-text">Subscription</span>
                  )}
                  {saving > 0 && (
                    <span className="rounded-tag bg-ok/15 px-1.5 py-0.5 text-caption font-bold text-ok-text">Save {saving}%</span>
                  )}
                  {shown.discount && (
                    <span className="rounded-tag bg-on-air-tint px-1.5 py-0.5 text-caption font-bold text-on-air-text">{saleLine(shown)}</span>
                  )}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-display text-title-lg text-foreground">{formatUsd(shown.price_usd)}</span>
                  {onSale && <s className="text-body text-muted-foreground">{formatUsd(shown.list_price_usd)}</s>}
                </span>
                <span className="text-body text-muted-foreground">
                  {renews ? "Every month, until you turn it off" : isMonthly ? "Paid once" : `${formatUsd(perMonth)} / month, paid once`}
                </span>
              </>
            )}
            {lifetime && shown.discount && (
              <span className="mt-1 self-start rounded-tag bg-pro-ink px-1.5 py-0.5 text-caption font-bold text-pro">{saleLine(shown)}</span>
            )}
            {p.description && !lifetime && <span className="text-body-sm text-muted-foreground">{p.description}</span>}
          </RadioGroup.Item>
        )
      })}
    </RadioGroup.Root>
  )
}
