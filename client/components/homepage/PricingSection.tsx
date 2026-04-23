import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import WaitlistButton from "./WaitlistButton"

const FREE_FEATURES = [
  "1 station",
  "25 concurrent listeners",
  "Browser broadcasting + push-to-talk",
  "Drag-and-drop file queue",
  "Shareable player page with live metadata",
]

const PRO_FEATURES = [
  "Up to 5 stations",
  "500 concurrent listeners",
  "Custom domain for your player page",
  "Listener analytics & history",
  "Higher-bitrate audio",
  "Priority support",
]

export default function PricingSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24" id="pricing">
      <div className="text-center mb-10 md:mb-16">
        <div className="text-xs tracking-[3px] uppercase text-violet-muted mb-4">
          Pricing
        </div>
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold -tracking-wide leading-tight mb-4">
          Start free. Upgrade when you&apos;re ready.
        </h2>
        <p className="text-sm md:text-base text-text-muted max-w-[480px] leading-relaxed mx-auto">
          No credit card required. No trial period. Broadcast for free, forever.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {/* Free plan */}
        <div className="bg-violet-full/[0.04] border border-violet-border/70 rounded-xl px-5 md:px-7 py-7 md:py-9 transition-all flex flex-col shadow-[0_0_40px_rgba(139,92,246,0.1)]">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm tracking-[2px] uppercase text-text-muted">Free</div>
            <span className="inline-flex items-center gap-1.5 bg-violet-full/15 border border-violet-border/50 text-violet-muted text-[10px] tracking-[2px] uppercase font-medium px-2.5 py-1 rounded-full">
              <span className="size-1.5 rounded-full bg-violet-muted" />
              Free forever
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <div className="text-4xl font-semibold text-text-primary -tracking-wide">$0</div>
            <div className="text-sm text-text-faint">/mo</div>
          </div>
          <div className="text-sm text-text-faint mb-6 leading-relaxed">
            Everything you need to launch your first station.
          </div>
          <ul className="list-none p-0 flex-1">
            {FREE_FEATURES.map((feature) => (
              <li
                key={feature}
                className="text-sm text-text-muted py-1.5 flex items-center gap-2.5"
              >
                <IconCheck size={14} className="text-violet-muted shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/auth/register"
            className="block w-full mt-6 py-3 rounded-lg text-sm text-center cursor-pointer font-medium no-underline bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all"
          >
            Start broadcasting free
          </Link>
        </div>

        {/* Pro plan — preview */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 md:px-7 py-7 md:py-9 transition-all flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm tracking-[2px] uppercase text-text-muted">Pro</div>
            <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] tracking-[2px] uppercase font-medium px-2.5 py-1 rounded-full">
              <span className="size-1.5 rounded-full bg-amber-400" />
              Coming soon
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <div className="text-4xl font-semibold text-text-primary -tracking-wide">$20</div>
            <div className="text-sm text-text-faint">/mo</div>
          </div>
          <div className="text-sm text-text-faint mb-6 leading-relaxed">
            For broadcasters with growing audiences.
          </div>
          <ul className="list-none p-0 flex-1">
            {PRO_FEATURES.map((feature) => (
              <li
                key={feature}
                className="text-sm text-text-muted py-1.5 flex items-center gap-2.5"
              >
                <IconCheck size={14} className="text-text-faint shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          <WaitlistButton
            plan="pro"
            className="block w-full mt-6 py-3 rounded-lg text-sm text-center cursor-pointer font-medium text-text-secondary bg-white/[0.03] border border-white/[0.08] hover:border-violet-border/70 hover:text-white hover:bg-violet-full/[0.06] transition-all"
          >
            Join the Pro waitlist
          </WaitlistButton>
        </div>
      </div>
    </section>
  )
}
