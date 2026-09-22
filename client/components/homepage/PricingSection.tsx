import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import WaitlistButton from "./WaitlistButton"
import { PRO_PRICE_USD } from "@/interfaces/Plan"

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

export default function PricingSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24" id="pricing">
      <div className="flex flex-col items-center text-center gap-3.5 mb-12 md:mb-16">
        <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-violet-muted">
          <span className="size-1.5 rounded-full bg-violet-muted animate-pulse" />
          Pricing
        </div>
        <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold -tracking-wide leading-[1.08] text-balance max-w-[16ch]">
          Free is the whole product.
        </h2>
        <p className="text-base text-text-secondary tracking-[0.01em] max-w-[52ch] leading-relaxed">
          No credit card, no trial clock. Everything below is live today — paid
          tiers arrive when you actually outgrow it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 lg:gap-7 items-stretch max-w-5xl mx-auto">
        {/* Free — the only plan you can actually start on.
            Wrapped in a column so it can carry an eyebrow label matching the
            roadmap column's. The label is not decoration: it takes its height
            out of the card, which is stretched to the taller column and had
            been paying for the difference in dead space. */}
        <div className="flex flex-col gap-4">
          <div className="text-[11px] tracking-[0.2em] uppercase text-violet-muted/70">
            Where everyone starts
          </div>

          <div className="flex flex-col flex-1 rounded-2xl border border-violet-border/40 px-6 md:px-10 py-8 md:py-10 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(139,92,246,0.13),rgba(139,92,246,0)_62%)] shadow-[0_0_60px_rgba(139,92,246,0.1)]">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex flex-col gap-3">
                <span className="text-xs tracking-[0.25em] uppercase text-text-muted">Free</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-6xl font-bold -tracking-[0.04em] leading-[0.9] text-text-primary">
                    $0
                  </span>
                  <span className="text-base text-text-faint">/ forever</span>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 bg-violet-full/15 border border-violet-border/50 text-violet-muted text-[10px] tracking-[0.2em] uppercase font-medium px-2.5 py-1 rounded-full">
                <span className="size-1.5 rounded-full bg-violet-muted" />
                Live now
              </span>
            </div>

            <p className="text-base text-text-muted leading-relaxed max-w-[34ch] mb-7">
              You&apos;re the station. Go live from any browser, share one link, done.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 pt-6 pb-2 border-t border-white/[0.07] mb-7">
              {FREE_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2.5 text-base text-text-secondary leading-snug text-pretty">
                  <IconCheck size={14} className="text-violet-muted shrink-0 mt-0.5" />
                  {feature}
                </div>
              ))}
            </div>

            {/* Free's counterpart to the Pro card's closing paragraph. It states
                the limits rather than leaving them to be discovered, because the
                heading above makes a naked claim ("Free is the whole product")
                and an unqualified claim on a pricing page reads as a catch being
                hidden. It also hands the reader the exact reason Pro exists,
                which is the card sitting next to it. */}
            <p className="mt-auto pt-6 border-t border-white/[0.07] text-sm text-text-muted leading-relaxed">
              One station. Broadcast mic, files or both — it plays while your
              browser is open, and goes quiet when you close it.
            </p>

            <Link
              href="/auth/register"
              className="block w-full mt-7 py-4 rounded-lg text-base text-center cursor-pointer font-semibold no-underline bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all"
            >
              Start broadcasting free
            </Link>
          </div>
        </div>

        {/* Roadmap column — neither of these is buyable yet */}
        <div className="flex flex-col gap-4">
          <div className="text-[11px] tracking-[0.2em] uppercase text-amber-300/70">
            When you outgrow it
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-amber-500/30 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(245,158,11,0.10),rgba(245,158,11,0)_62%)] shadow-[0_0_60px_rgba(245,158,11,0.08)] px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-text-primary">Pro</span>
                <span className="text-base text-text-muted">
                  Free in beta, then ${PRO_PRICE_USD}/mo
                </span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] tracking-[0.2em] uppercase font-medium px-2.5 py-1 rounded-full">
                <span className="size-1.5 rounded-full bg-amber-400" />
                In beta
              </span>
            </div>

            <p className="text-base text-text-muted leading-relaxed">
              Everything in Free, plus:
            </p>

            <div className="flex flex-col gap-3.5">
              {PRO_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2.5 text-base text-text-secondary leading-snug text-pretty">
                  <IconCheck size={14} className="text-amber-400 shrink-0 mt-0.5" />
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
            <p className="mt-1 pt-4 border-t border-white/[0.06] text-sm text-text-muted leading-relaxed">
              Requested from your dashboard once your station is set up — we
              onboard a few at a time. Nothing to pay while it&apos;s in beta,
              and we&apos;ll give notice before billing opens.
            </p>
          </div>

          {/* Crimson, to sit alongside violet (Free) and amber (Pro). Three
              tiers, three temperatures — the card used to be the only grey one
              on the row, which read as disabled rather than as a third option. */}
          <div className="flex flex-col gap-4 rounded-xl border border-rose-500/30 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(244,63,94,0.10),rgba(244,63,94,0)_62%)] shadow-[0_0_60px_rgba(244,63,94,0.08)] px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-text-primary">Custom</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[10px] tracking-[0.2em] uppercase font-medium px-2.5 py-1 rounded-full">
                <span className="size-1.5 rounded-full bg-rose-400" />
                By hand
              </span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed">
              Bigger limits, white-label player, or something we haven&apos;t built yet.
            </p>
            <WaitlistButton
              plan="custom"
              title="Tell us what you need"
              description="Custom plans are put together one at a time. Tell us about your station and what you're missing."
              confirmation="Thanks — we've got your note. We'll read it properly and get back to you."
              submitLabel="Send request"
              className="text-left text-sm font-medium text-rose-300 underline underline-offset-4 decoration-rose-400/40 cursor-pointer hover:text-rose-200 hover:decoration-rose-300 transition-all"
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
