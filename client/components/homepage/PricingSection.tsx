import Link from "next/link"
import { Button, buttonVariants } from "@/components/ds/Button"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Tag } from "@/components/ds/Tag"
import { PRO_PRICE_USD } from "@/interfaces/Plan"
import { cn } from "@/lib/utils"
import { Section, SectionIntro } from "./Section"
import WaitlistButton from "./WaitlistButton"

const LAST_UPDATED = "21 September 2026"

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

// Condensed for the compact card — the full list lives in the docs.
const PRO_FEATURES = [
  "24/7 AutoDJ from your library (3 GB)",
  "Playlists and a weekly schedule",
  "Broadcast from BUTT, Mixxx or any Icecast encoder",
  "Public stream URL for TuneIn & Sonos",
  "Embed your player, on your own domain",
  "1,000 concurrent listeners",
  "90 days of listener analytics, by country",
  "Priority support",
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

export default function PricingSection() {
  return (
    <Section id="pricing" tone="card">
      <SectionIntro
        eyebrow="Pricing"
        title="Free is the whole product."
        lead="No credit card, no trial clock. Everything below is live today — paid tiers arrive when you actually outgrow it."
      />

      <div className="grid items-stretch gap-3.5 lg:grid-cols-3">
        {/* Free — the only plan you can actually start on. */}
        <div className={cn(CARD, "bg-surface-raised")}>
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
            One station. Broadcast mic, files or both — it plays while your browser is open, and goes quiet when you close it.
          </p>
          <Button asChild size="lg" full className="mt-auto">
            <Link href="/auth/register" className="no-underline">Start broadcasting free</Link>
          </Button>
        </div>

        {/* Pro — in beta, granted by hand. Deliberately no button: a request
            from someone who has never signed up is not something anyone can
            act on, and the form used to convert curious visitors into
            form-fills instead of the signup we actually want. */}
        <div className={cn(CARD, "bg-pro-tint")}>
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-fault-text">When you outgrow it</span>
            <Tag variant="pro">In beta</Tag>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-display">Pro</span>
            <span className="font-mono text-base font-semibold">
              Free in beta <span className="text-fault-text">then ${PRO_PRICE_USD}/mo</span>
            </span>
          </div>
          <p className="text-body text-fault-text">Everything in Free, plus:</p>
          <FeatureList items={PRO_FEATURES} />
          <p className="mt-auto text-body-sm text-fault-text">
            Requested from your dashboard once your station is set up — we onboard a few at a time. Nothing to pay while it’s in beta, and we’ll give notice before billing opens.
          </p>
        </div>

        {/* Custom — the one card whose button is a form, because a network
            sizing up a white-label deal has no account yet and should not
            need one to talk to us. */}
        <div className={cn(CARD, "bg-on-air-tint")}>
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
      </div>

      <p className="font-mono text-caption text-text-faint">Pricing last updated {LAST_UPDATED}</p>
    </Section>
  )
}
