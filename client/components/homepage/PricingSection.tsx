import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import WaitlistButton from "./WaitlistButton"
import { PRO_PRICE_USD } from "@/interfaces/Plan"

const LAST_UPDATED = "30 August 2026"

const FREE_FEATURES = [
  "100 concurrent listeners",
  "Browser broadcasting + push-to-talk",
  "Drag-and-drop file queue",
  "Shareable player page with live metadata",
]

// Condensed for the compact roadmap card — the full list lives in the docs.
const PRO_FEATURES = [
  "24/7 AutoDJ from your library (2 GB)",
  "Broadcast from BUTT, Mixxx or any Icecast encoder",
  "Public stream URL for TuneIn & Sonos",
  "1,000 concurrent listeners",
  "Custom domain + listener analytics",
  "Higher-bitrate audio, priority support",
]

export default function PricingSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24" id="pricing">
      <div className="flex flex-col items-center text-center gap-3.5 mb-12 md:mb-16">
        <div className="flex items-center gap-2 text-xs tracking-[3px] uppercase text-violet-muted">
          <span className="size-1.5 rounded-full bg-violet-muted animate-pulse" />
          Pricing
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold -tracking-wide leading-[1.08] text-balance max-w-[16ch]">
          Free is the whole product.
        </h2>
        <p className="text-sm md:text-base text-text-muted max-w-[52ch] leading-relaxed">
          No credit card, no trial clock. Everything below is live today — paid
          tiers arrive when you actually outgrow it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 lg:gap-7 items-stretch max-w-5xl mx-auto">
        {/* Free — the only plan you can actually start on */}
        <div className="flex flex-col rounded-2xl border border-violet-border/40 px-6 md:px-10 py-8 md:py-10 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(139,92,246,0.13),rgba(139,92,246,0)_62%)] shadow-[0_0_60px_rgba(139,92,246,0.1)]">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex flex-col gap-3">
              <span className="text-xs tracking-[3px] uppercase text-text-muted">Free</span>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl md:text-6xl font-bold -tracking-[0.04em] leading-[0.9] text-text-primary">
                  $0
                </span>
                <span className="text-base text-text-faint">/ forever</span>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 bg-violet-full/15 border border-violet-border/50 text-violet-muted text-[10px] tracking-[2px] uppercase font-medium px-2.5 py-1 rounded-full">
              <span className="size-1.5 rounded-full bg-violet-muted" />
              Live now
            </span>
          </div>

          <p className="text-base text-text-muted leading-relaxed max-w-[34ch] mb-7">
            You&apos;re the station. Go live from any browser, share one link, done.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 py-6 border-y border-white/[0.07] mb-7">
            {FREE_FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5 text-sm text-text-secondary leading-snug">
                <IconCheck size={14} className="text-violet-muted shrink-0 mt-0.5" />
                {feature}
              </div>
            ))}
          </div>

          <Link
            href="/auth/register"
            className="block w-full mt-auto py-4 rounded-lg text-base text-center cursor-pointer font-semibold no-underline bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all"
          >
            Start broadcasting free
          </Link>
        </div>

        {/* Roadmap column — neither of these is buyable yet */}
        <div className="flex flex-col gap-4">
          <div className="text-[11px] tracking-[3px] uppercase text-text-faint">
            When you outgrow it
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-text-primary">Pro</span>
                <span className="text-sm text-text-faint">${PRO_PRICE_USD}/mo</span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] tracking-[2px] uppercase font-medium px-2.5 py-1 rounded-full">
                <span className="size-1.5 rounded-full bg-amber-400" />
                In beta
              </span>
            </div>

            <p className="text-sm text-text-faint leading-relaxed">
              Everything in Free, plus:
            </p>

            <div className="flex flex-col gap-2.5">
              {PRO_FEATURES.map((feature) => (
                <div key={feature} className="flex gap-2.5 text-sm text-text-muted leading-snug">
                  <span className="text-text-faint shrink-0">·</span>
                  {feature}
                </div>
              ))}
            </div>

            {/* Deliberately not a button. Pro is granted by hand after looking
                at a real station, so a request from someone who has never
                signed up is not something anyone can act on — and the form
                used to convert a curious visitor into a form-fill instead of
                the signup we actually want. The card stays because the price
                and the feature list still do their job unclicked. */}
            <p className="mt-1 pt-4 border-t border-white/[0.06] text-xs text-text-faint leading-relaxed">
              Requested from your dashboard once your station is set up — we
              onboard a few at a time.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border border-white/[0.06] px-6 py-6">
            <span className="text-base font-semibold text-text-secondary">Custom</span>
            <p className="text-sm text-text-faint leading-relaxed">
              Bigger limits, white-label player, or something we haven&apos;t built yet.
            </p>
            <WaitlistButton
              plan="custom"
              title="Tell us what you need"
              description="Custom plans are put together one at a time. Tell us about your station and what you're missing."
              confirmation="Thanks — we've got your note. We'll read it properly and get back to you."
              submitLabel="Send request"
              className="text-left text-sm font-medium text-violet-muted cursor-pointer hover:brightness-125 transition-all"
            >
              Talk to us →
            </WaitlistButton>
          </div>
        </div>
      </div>

      <p className="text-xs text-text-faint text-center mt-8 md:mt-10">
        Pricing last updated {LAST_UPDATED}
      </p>
    </section>
  )
}
