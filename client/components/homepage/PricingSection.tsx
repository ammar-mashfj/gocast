import Link from "next/link"
import { IconCheck, IconArrowRight } from "@tabler/icons-react"
import WaitlistButton from "./WaitlistButton"

const FREE_FEATURES = [
  "1 station",
  "25 concurrent listeners",
  "High-quality audio",
  "Browser broadcasting",
  "Player page",
  "Live metadata",
  "Push-to-talk",
  "File queue with drag & drop",
  "Keyboard shortcuts",
  "Seamless reconnect",
]

export default function PricingSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24" id="pricing">
      <div className="text-center mb-10 md:mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          Pricing
        </div>
        <h2 className="text-2xl md:text-[32px] lg:text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          Start free. Upgrade when you're ready.
        </h2>
        <p className="text-sm md:text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          No credit card required. No trial period. Broadcast for free, forever.
        </p>
      </div>

      {/* Plan */}
      <div className="max-w-md mx-auto mb-4">
        <div className="relative bg-violet-full/[0.04] border border-violet-border/70 rounded-xl px-5 md:px-7 py-7 md:py-9 transition-all flex flex-col hover:-translate-y-0.5 shadow-[0_0_40px_rgba(139,92,246,0.1)]">
          <div className="text-[13px] tracking-[2px] uppercase text-text-muted/85 mb-3">
            Free
          </div>
          <div className="text-4xl font-semibold text-text-primary -tracking-wide mb-1">
            $0
          </div>
          <div className="text-[13px] text-text-faint mb-6 leading-relaxed">
            Everything you need to start broadcasting
          </div>
          <ul className="list-none p-0 flex-1">
            {FREE_FEATURES.map((feature) => (
              <li
                key={feature}
                className="text-[13px] text-text-muted py-1.5 flex items-center gap-2.5"
              >
                <IconCheck size={14} className="text-violet-muted shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/auth/register"
            className="block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium no-underline bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all"
          >
            Start broadcasting — free.
          </Link>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="text-sm md:text-base text-text-muted/85">
          Need more? Pro plan launching soon.
        </div>
        <WaitlistButton
          plan="pro"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-text-secondary bg-white/[0.03] border border-white/[0.08] hover:border-violet-border/70 hover:text-white hover:bg-violet-full/[0.06] transition-all cursor-pointer group"
        >
          Join the waitlist
          <IconArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </WaitlistButton>
      </div>
    </section>
  )
}
