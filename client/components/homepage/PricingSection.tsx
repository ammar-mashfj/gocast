import Link from "next/link"
import { Button, buttonVariants } from "@/components/ds/Button"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Tag } from "@/components/ds/Tag"
import { PRO_FEATURES } from "@/interfaces/Plan"
import { formatUsd, isLifetime, monthlyProduct, type CatalogProduct } from "@/lib/billing-catalog"
import { getCatalog } from "@/lib/billing-server"
import { cn } from "@/lib/utils"
import { Section, SectionIntro } from "./Section"
import WaitlistButton from "./WaitlistButton"

const LAST_UPDATED = "14 October 2026"

// Eight, deliberately matching PRO_FEATURES. Free showing five against Pro's
// eight made the cheaper column look like the lesser product directly under a
// heading that claims the opposite. Every line below is from the Free column of
// the "What you get on Free and on Pro" help article.
const FREE_FEATURES = [
  "100 concurrent listeners",
  "Browser broadcasting + push-to-talk",
  "Drag-and-drop file queue",
  "Shareable player page with live metadata",
  "Live listener count and all-time peak",
  "Unlimited broadcast hours",
  "No bandwidth bill, ever",
  "Listeners need no app or account",
]


// Custom is scoped by hand, so this list can carry things we build to order
// rather than things you can switch on: the website is one of those (see
// docs/STATION-CMS-PLAN.md), and bespoke design is the add-on under it.
const CUSTOM_FEATURES = [
  "Unlimited listeners",
  "A white-label player",
  "A full website around your player — pages, widgets and templates",
  "Something we haven't built yet",
]

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul role="list" className="flex flex-col">
      {items.map((f) => (
        <li key={f} className="border-t border-line py-2.75 text-sm leading-[1.35] font-medium text-foreground">
          {f}
        </li>
      ))}
    </ul>
  )
}

const CARD = "flex flex-col gap-4.5 rounded-card p-6 sm:p-7"

/**
 * "Pro, paid ahead": the longer Pro terms in a band of their own, in the
 * catalog's order, each with its total, its price per month, and what it saves
 * against paying monthly (the same sum the Get Pro dialog shows). A band, not
 * a list inside the Pro card, because the three cards share a row and stretch
 * to the tallest. Lifetime is never listed here: it is a dashboard-only offer,
 * switched on and off by hand.
 */
function PaidAhead({ terms, monthly, className }: { terms: CatalogProduct[]; monthly: CatalogProduct | undefined; className?: string }) {
  const monthlyRate = monthly ? Number(monthly.list_price_usd) : null

  return (
    <div className={cn("flex flex-col gap-4 rounded-card bg-pro-tint p-6 sm:p-7", className)}>
      <span className="eyebrow text-fault-text">Pro, paid ahead</span>
      <ul role="list" className="flex flex-col sm:grid sm:auto-cols-fr sm:grid-flow-col">
        {terms.map((p) => {
          const perMonth = Number(p.per_month_usd ?? p.price_usd)
          const saving = monthlyRate ? Math.round((1 - perMonth / monthlyRate) * 100) : 0
          const onSale = Number(p.discount_usd) > 0
          return (
            <li
              key={p.slug}
              className="flex flex-col gap-1 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:border-t-0 sm:border-l sm:px-5 sm:py-0 sm:first:border-l-0 sm:first:pl-0"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
                {p.duration.label ?? p.name}
                {p.badge && <Tag variant="pro">{p.badge}</Tag>}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-title-lg text-foreground">{formatUsd(p.price_usd)}</span>
                {onSale && <s className="text-body-sm text-fault-text">{formatUsd(p.list_price_usd)}</s>}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-fault-text">
                {formatUsd(perMonth)} / month
                {saving > 0 && <span className="rounded-tag bg-ok/15 px-1.5 py-0.5 text-caption font-bold text-ok-text">Save {saving}%</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default async function PricingSection() {
  const catalog = await getCatalog()
  const monthly = catalog ? monthlyProduct(catalog) : undefined
  const onSale = monthly ? Number(monthly.discount_usd) > 0 : false
  const terms = (catalog ?? []).filter((p) => p !== monthly && !isLifetime(p) && p.plan?.slug !== "free" && p.per_month_usd)

  return (
    <Section id="pricing" tone="card">
      <SectionIntro
        eyebrow="Pricing"
        title="Free is the whole product."
        lead="Free needs no card and never runs out. Everything below is live today — Pro is there when you outgrow it."
      />

      <div className="grid items-stretch gap-3.5 lg:grid-cols-3">
        {/* Free — the only plan you can actually start on. */}
        <div className={cn(CARD, "order-1 bg-surface-raised")}>
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-text-faint">Where everyone starts</span>
            <StatusLamp tone="onair" size="sm">Live now</StatusLamp>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-display">Free</span>
            <span className="font-mono text-base font-semibold">
              $0 <span className="text-text-faint">/ forever</span>
            </span>
          </div>
          <p className="text-body text-muted-foreground">You’re the station. Go live from any browser, share one link, done.</p>
          <FeatureList items={FREE_FEATURES} />
          {/* States the limits rather than leaving them to be discovered: the
              heading above makes a naked claim, and an unqualified claim on a
              pricing page reads as a catch being hidden. It also hands the
              reader the exact reason Pro exists, which is the card next door. */}
          <p className="text-body-sm text-text-faint">
            Broadcast mic, files or both. It plays while your browser is open, and goes quiet when you close it.
          </p>
          <Button asChild size="lg" full className="mt-auto">
            <Link href="/auth/register" className="no-underline">Start broadcasting free</Link>
          </Button>
        </div>

        {/* Pro — bought from the dashboard. Deliberately no button: the signup
            is what we want from a visitor, and checkout needs an account. The
            prices are the catalog's (admin-edited); without it they are left
            out rather than guessed. */}
        <div className={cn(CARD, "order-2 bg-pro-tint")}>
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-fault-text">When you outgrow it</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-display">Pro</span>
            {monthly && (
              <span className="font-mono text-base font-semibold">
                {onSale && <s className="mr-1.5 font-normal text-fault-text">{formatUsd(monthly.list_price_usd)}</s>}
                {formatUsd(monthly.price_usd)} <span className="text-fault-text">/ month</span>
              </span>
            )}
          </div>
          <p className="text-body text-fault-text">Everything in Free, plus:</p>
          <FeatureList items={PRO_FEATURES} />
          <p className="mt-auto text-body-sm text-fault-text">
            Upgrade from your dashboard whenever you’re ready.
          </p>
        </div>

        {/* Custom — the one card whose button is a form, because a network
            sizing up a white-label deal has no account yet and should not
            need one to talk to us. */}
        <div className={cn(CARD, "order-4 bg-on-air-tint lg:order-3")}>
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-on-air-text">By hand</span>
            <Tag variant="onair">Made to order</Tag>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-display">Custom</span>
            <span className="font-mono text-base font-semibold">
              Let’s talk <span className="text-on-air-text">/ quoted to fit</span>
            </span>
          </div>
          <p className="text-body text-on-air-text">Everything in Pro, shaped around you:</p>
          <FeatureList items={CUSTOM_FEATURES} />
          {/* The one paid extra, set apart from the list so it reads as an
              add-on with its own quote, not a fourth bullet. */}
          <div className="flex flex-col gap-1.5 rounded-well bg-background/45 p-4">
            <span className="eyebrow text-on-air-text">Add-on · Custom design</span>
            <p className="text-sm leading-[1.35] font-medium text-foreground">
              We design your site and player around your brand — your colours, your type, your layout. Quoted on top.
            </p>
          </div>
          <p className="text-body-sm text-on-air-text">
            Tell us what you’re running — a network, a campus station, a festival — and we’ll scope it with you.
          </p>
          <WaitlistButton
            plan="custom"
            className={cn(buttonVariants({ variant: "ghost", size: "lg", full: true }), "mt-auto")}
            title="Tell us what you need"
            description="Custom plans are put together one at a time. Tell us about your station and what you're missing."
            confirmation="Thanks — we've got your note. We'll read it properly and get back to you."
            submitLabel="Send request"
          >
            Talk to us →
          </WaitlistButton>
        </div>

        {/* Straight after the Pro card on a phone, so it reads as part of
            Pro; a full-width row under all three from lg. One element, moved
            by order, not two copies. */}
        {terms.length > 0 && <PaidAhead terms={terms} monthly={monthly} className="order-3 lg:order-4 lg:col-span-3" />}
      </div>

      <p className="font-mono text-caption text-text-faint">Pricing last updated {LAST_UPDATED}</p>
    </Section>
  )
}
