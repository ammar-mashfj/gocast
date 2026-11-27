"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ds/Button"
import { RadioGroup } from "radix-ui"
import { IconArrowUpRight, IconCircleCheckFilled, IconMail } from "@tabler/icons-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"
import { ProTag } from "@/components/ds/Tag"
import { Segmented } from "@/components/ds/Segmented"
import { useAccount } from "@/contexts/AccountContext"
import { cn } from "@/lib/utils"
import { useCatalog } from "@/hooks/useCatalog"
import {
  billingError,
  fetchCardInterest,
  formatUsd,
  isLifetime,
  notifyCardPayments,
  quoteProduct,
  startCheckout,
  type CatalogProduct,
} from "@/lib/billing"

/**
 * Card and PayPal: plain links to lava.top, which owns the price, the
 * checkout and the subscription. The webhook matches the payment to an
 * account by the buyer's email. Both unset = no card tab, just OxaPay.
 */
/** The link if it parses as a URL, else "": a mistyped env value turns the card tab off instead of crashing the dialog. */
function lavaLink(value: string | undefined): string {
  if (!value) return ""
  try {
    new URL(value)
    return value
  } catch {
    return ""
  }
}

const LAVA_SUBSCRIPTION_URL = lavaLink(process.env.NEXT_PUBLIC_LAVA_SUBSCRIPTION_URL)
const LAVA_PRODUCT_URL = lavaLink(process.env.NEXT_PUBLIC_LAVA_PRODUCT_URL)
const CARDS_ON = LAVA_SUBSCRIPTION_URL !== "" && LAVA_PRODUCT_URL !== ""

type Method = "card" | "crypto"

/**
 * Get Pro, two ways:
 * - Card or PayPal (first): links to lava.top's subscription and pay-once
 *   pages, in a new tab.
 * - Digital currency: pick a term, optionally a coupon, and pay on OxaPay's page.
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
  onStarted: (payment: { uuid: string; paymentUrl: string }) => void
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
  const account = useAccount()
  // A link that names a term or a coupon is an OxaPay link (a renewal email,
  // a coupon someone was sent): open on that tab. Everyone else starts on card.
  const startOn: Method = CARDS_ON && !initialProduct && !initialCoupon ? "card" : "crypto"
  const [picked, setPicked] = useState<Method | null>(null)
  const method = picked ?? startOn

  // Whether they already asked to hear about cards, so the line doesn't
  // offer "Notify me" twice.
  useEffect(() => {
    if (!open || CARDS_ON || cards !== "unknown") return
    let live = true
    fetchCardInterest()
      .then((subscribed) => live && setCards(subscribed ? "subscribed" : "idle"))
      .catch(() => live && setCards("idle"))
    return () => {
      live = false
    }
  }, [open, cards])

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

  const chosen = (applied?.slug === selected ? applied : products?.find((p) => p.slug === selected)) ?? null

  function reset() {
    setExtra(null)
    setSelected(null)
    setCouponOpen(false)
    setCode("")
    setApplied(null)
    setCouponError(null)
    setBusy(null)
    setError(null)
    setPicked(null)
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
    const typed = code.trim()
    if (typed && applied?.slug !== chosen.slug && !(await applyCoupon(chosen.slug, typed))) return
    setBusy("pay")
    setError(null)
    try {
      const { payment, payment_url } = await startCheckout(chosen.slug, typed || null)
      onStarted({ uuid: payment, paymentUrl: payment_url })
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
            {method === "card" ? (
              <>
                Card and PayPal payments are handled by <span className="font-semibold text-foreground">lava.top</span>, our payment partner. You’ll pay on their page, in a new tab.
              </>
            ) : (
              <>
                Pay once with <span className="font-semibold text-pro-text">USDT, USDC or another digital currency</span>. Nothing renews by itself, and we’ll email you before it ends.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {CARDS_ON && (
          <Segmented
            aria-label="How to pay"
            value={method}
            onChange={setPicked}
            options={[
              { value: "card", label: "Card or PayPal" },
              { value: "crypto", label: "Digital currency" },
            ]}
          />
        )}

        {method === "card" ? (
          <CardOrPayPal email={account?.email ?? null} accountId={account?.id ?? null} onLeave={() => handleOpenChange(false)} />
        ) : !products ? (
          <p role="status" className="text-body text-muted-foreground">
            {error ?? "Loading prices…"}
          </p>
        ) : products.length === 0 ? (
          <p role="status" className="text-body text-muted-foreground">
            Pro isn’t on sale right now. Email hello@gocast.fm and we’ll sort it out.
          </p>
        ) : (
          <>
            {!CARDS_ON && <CardPaymentsSoon state={cards} onNotify={notifyCards} />}

            <TermPicker
              products={products}
              applied={applied}
              value={selected ?? defaultSlug(products, initialProduct)}
              onChange={setSelected}
            />

            {couponOpen ? (
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
              You’ll pay on OxaPay, our payment provider. Pro switches on by itself as soon as the payment confirms, usually within a few minutes.
            </p>
          </>
        )}

        <DialogFooter>
          <Button size="lg" variant="ghost" onClick={() => handleOpenChange(false)}>
            Not now
          </Button>
          {method === "crypto" && (
            <Button size="lg" variant="pro" onClick={pay} disabled={!chosen || busy !== null}>
              {busy === "pay" ? "Preparing payment…" : chosen ? `Pay ${formatUsd(chosen.price_usd)}` : "Pay"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The link with this account's id as `utm_content`, which lava.top hands back
 * in the webhook (clientUtm): the payment then finds the account even when
 * the buyer types another email. The email stays the fallback.
 */
function withAccount(link: string, accountId: string | null): string {
  if (!accountId) return link
  const url = new URL(link)
  url.searchParams.set("utm_source", "gocast")
  url.searchParams.set("utm_medium", "dashboard")
  url.searchParams.set("utm_content", accountId)
  return url.toString()
}

/** The pay-once plans as lava.top prices them, in USD. */
const PAY_ONCE = [
  ["3 months", "$52"],
  ["6 months", "$96"],
  ["12 months", "$160"],
] as const

/**
 * The two lava.top links. Prices are lava.top's; these labels only describe
 * them, so a price change there needs the matching change here.
 * Real links, not window.open, so nothing blocks the new tab, and never this
 * tab: leaving /dashboard would end a live show.
 */
function CardOrPayPal({ email, accountId, onLeave }: { email: string | null; accountId: string | null; onLeave: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-3 rounded-well bg-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display text-base font-bold">Monthly</span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-display text-title-lg">$20</span>
            <span className="text-body text-muted-foreground">/ month</span>
          </span>
          <span className="text-body text-muted-foreground">Renews every month. Cancel any time.</span>
        </span>
        <Button asChild size="lg" variant="subtle" className="shrink-0">
          <a href={withAccount(LAVA_SUBSCRIPTION_URL, accountId)} target="_blank" rel="noopener noreferrer" onClick={onLeave}>
            Subscribe for $20
            <IconArrowUpRight aria-hidden />
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-well bg-pro-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-base font-bold text-pro-text">Pay once</span>
          <span className="grid grid-cols-3 gap-3">
            {PAY_ONCE.map(([length, price]) => (
              <span key={length} className="flex flex-col">
                <span className="font-display text-title-lg">{price}</span>
                <span className="text-body-sm text-muted-foreground">{length}</span>
              </span>
            ))}
          </span>
          <span className="text-body text-muted-foreground">Paid once. Nothing renews.</span>
        </span>
        <Button asChild size="lg" variant="subtle" className="shrink-0">
          <a href={withAccount(LAVA_PRODUCT_URL, accountId)} target="_blank" rel="noopener noreferrer" onClick={onLeave}>
            Choose a plan
            <IconArrowUpRight aria-hidden />
          </a>
        </Button>
      </div>

      <p className="flex items-start gap-2.5 rounded-well bg-surface-inset px-4 py-3 text-body text-muted-foreground">
        <IconMail aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {email ? (
            <>
              Pay with <span className="font-semibold text-foreground">{email}</span>, the email of your GoCast account,
            </>
          ) : (
            "Pay with the email of your GoCast account,"
          )}{" "}
          and Pro switches on by itself within a minute or two.
        </span>
      </p>
    </>
  )
}

/** "25% off until 30 Oct" / "Coupon: 25% off". */
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
  value,
  onChange,
}: {
  products: CatalogProduct[]
  applied: CatalogProduct | null
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
        const shown = applied?.slug === p.slug ? applied : p
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
                  {isMonthly ? "Paid once" : `${formatUsd(perMonth)} / month, paid once`}
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
