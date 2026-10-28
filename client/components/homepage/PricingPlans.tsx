"use client"

import Link from "next/link"
import { useState } from "react"
import { IconCheck } from "@tabler/icons-react"
import { Button, buttonVariants } from "@/components/ds/Button"
import { Segmented } from "@/components/ds/Segmented"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { PRO_FEATURES } from "@/interfaces/Plan"
import { formatUsd, type CatalogProduct } from "@/lib/billing-catalog"
import { cn } from "@/lib/utils"
import WaitlistButton from "./WaitlistButton"

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

const CARD = "flex flex-col gap-5 rounded-card p-5 sm:p-6"
const PRICE = "font-display text-[3rem] leading-none font-extrabold tracking-[-0.045em] sm:text-[3.5rem]"

function FeatureList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul role="list" className={cn("flex flex-col gap-2.5", className)}>
      {items.map((f) => (
        <li key={f} className="flex gap-2.5 text-[0.9375rem] leading-[1.4] font-medium">
          <IconCheck aria-hidden size={16} stroke={3} className="mt-0.75 shrink-0" />
          {f}
        </li>
      ))}
    </ul>
  )
}

/**
 * Pro is paid once per term and nothing renews, so no line here may read as
 * a subscription ("billed monthly", "every 3 months", "cancel any time"). The
 * big number is the term's total; the per-month split (often $x.33) sits here.
 */
function termLine(p: CatalogProduct, monthlyRate: number | null) {
  const count = p.duration.count ?? 1
  if (count === 1) return "One month at a time. Nothing renews by itself."
  const perMonth = Number(p.per_month_usd ?? p.price_usd)
  const saving = monthlyRate ? Math.round((1 - perMonth / monthlyRate) * 100) : 0
  return [`${formatUsd(perMonth)} a month`, saving > 0 && `save ${saving}%`, p.badge?.toLowerCase()]
    .filter(Boolean)
    .join(" · ")
}

/**
 * The three plans, with Pro's term switch inside its card. Every Pro price is the
 * catalog's (admin-edited, sales included); with no catalog the switch and the
 * price are left out rather than guessed.
 *
 * Pro's button leads to sign-up, not checkout: checkout needs an account, and
 * nothing carries the chosen term across sign-up yet, so the label names no term.
 */
export function PricingPlans({ terms, isAuthed, intro }: { terms: CatalogProduct[]; isAuthed: boolean; intro: React.ReactNode }) {
  const [slug, setSlug] = useState(terms[0]?.slug ?? "")
  const term = terms.find((p) => p.slug === slug) ?? terms[0]
  const monthlyRate = terms[0]?.duration.count === 1 ? Number(terms[0].list_price_usd) : null
  const onSale = term ? Number(term.discount_usd) > 0 : false

  return (
    <>
      {intro}

      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {/* Free — the only plan you can actually start on. */}
        <div className={cn(CARD, "bg-card")}>
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow-sm text-muted-foreground">Where everyone starts</span>
            <StatusLamp tone="onair" size="sm">Live now</StatusLamp>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-display text-title">Free</span>
            <span className="flex items-baseline gap-2">
              <span className={PRICE}>$0</span>
              <span className="eyebrow text-muted-foreground">/ forever</span>
            </span>
            <p className="text-body text-muted-foreground text-pretty">You’re the station. Go live from any browser, share one link, done.</p>
          </div>
          <Button asChild size="lg" full>
            <Link href="/auth/register" className="no-underline">Start broadcasting free</Link>
          </Button>
          <FeatureList items={FREE_FEATURES} />
          {/* States the limits rather than leaving them to be discovered: the
              heading makes a naked claim, and an unqualified claim on a
              pricing page reads as a catch being hidden. It also hands the
              reader the exact reason Pro exists, which is the card next door. */}
          <p className="mt-auto text-body-sm text-text-faint text-pretty">
            Broadcast mic, files or both. It plays while your browser is open, and goes quiet when you close it.
          </p>
        </div>

        <div className={cn(CARD, "bg-pro text-pro-ink")}>
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow-sm">When you outgrow it</span>
            <span className="rounded-tag bg-pro-ink px-1.5 py-0.75 eyebrow-sm text-pro">Pro</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-display text-title">Pro</span>
            {/* The term switch lives in the card it changes, so the price
                moves under the finger instead of a scroll away. Recoloured
                for the amber fill: ink track, ink thumb, amber label. */}
            {terms.length > 1 && (
              <Segmented
                aria-label="Pro term"
                size="sm"
                value={term.slug}
                onChange={setSlug}
                className="my-1.5 bg-pro-ink/12 [&>button]:h-10 lg:[&>button]:h-7.5 [&>button]:text-pro-ink/70 [&>button:hover]:text-pro-ink [&>button[data-state=checked]]:bg-pro-ink [&>button[data-state=checked]]:text-pro"
                options={terms.map((p) => ({
                  value: p.slug,
                  label: (p.duration.count ?? 1) === 1 ? "Monthly" : `${p.duration.count} mo`,
                }))}
              />
            )}
            {term && (
              <>
                <span className="flex flex-wrap items-baseline gap-x-2">
                  {onSale && <s className="font-display text-title-lg text-pro-ink/55">{formatUsd(term.list_price_usd)}</s>}
                  <span className={cn(PRICE, "tabular-nums")}>{formatUsd(term.price_usd)}</span>
                  <span className="eyebrow text-pro-ink/75">
                    / {(term.duration.count ?? 1) === 1 ? "month" : `${term.duration.count} months`}
                  </span>
                </span>
                <span className="text-body-sm font-semibold text-pro-ink/75">{termLine(term, monthlyRate)}</span>
              </>
            )}
          </div>
          <Link
            href={isAuthed ? "/dashboard" : "/auth/register"}
            className="flex h-13 items-center justify-center rounded-button bg-pro-ink px-5 text-base font-bold text-pro no-underline transition-transform active:scale-[0.98]"
          >
            {isAuthed ? "Go Pro from your dashboard" : "Start free, then go Pro"}
          </Link>
          <span className="eyebrow-sm">Everything in Free, plus</span>
          <FeatureList items={PRO_FEATURES} />
          <p className="mt-auto text-body-sm text-pro-ink/75">Upgrade from your dashboard whenever you’re ready.</p>
        </div>

        {/* Custom — the one card whose button is a form, because a network
            sizing up a white-label deal has no account yet and should not
            need one to talk to us. On tablets Free and Pro share a row and
            this one takes the next row whole. */}
        <div className={cn(CARD, "bg-card md:col-span-2 lg:col-span-1")}>
          <span className="eyebrow-sm text-muted-foreground">By hand · Made to order</span>
          <div className="flex flex-col gap-2">
            <span className="font-display text-title">Custom</span>
            <span className="font-display text-[2.5rem] leading-[1.2] font-extrabold tracking-[-0.045em] sm:text-[2.75rem]">Let’s talk</span>
            <p className="text-body text-muted-foreground text-pretty">
              Tell us what you’re running — a network, a campus station, a festival — and we’ll scope it with you.
            </p>
          </div>
          <WaitlistButton
            plan="custom"
            className={buttonVariants({ variant: "ghost", size: "lg", full: true })}
            title="Tell us what you need"
            description="Custom plans are put together one at a time. Tell us about your station and what you're missing."
            confirmation="Thanks — we've got your note. We'll read it properly and get back to you."
            submitLabel="Send request"
          >
            Talk to us →
          </WaitlistButton>
          <span className="eyebrow-sm text-muted-foreground">Everything in Pro, shaped around you</span>
          <FeatureList items={CUSTOM_FEATURES} />
          {/* The one paid extra, set apart from the list so it reads as an
              add-on with its own quote, not another bullet. */}
          <div className="mt-auto flex flex-col gap-1.5 rounded-well bg-background p-4">
            <span className="eyebrow-sm text-muted-foreground">Add-on · Custom design</span>
            <p className="text-body-sm text-muted-foreground text-pretty">
              We design your site and player around your brand — your colours, your type, your layout. Quoted on top.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
