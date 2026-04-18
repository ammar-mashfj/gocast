import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import ComingSoonBadge from "./ComingSoonBadge"
import WaitlistButton from "./WaitlistButton"

interface Plan {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  cta: string
  ctaHref: string
  popular?: boolean
  primaryCta?: boolean
  waitlist?: boolean
}

interface AddOn {
  name: string
  price: string
  description: string
  ctaHref: string
}

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    description: "Everything you need to start broadcasting",
    features: [
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
    ],
    cta: "Start broadcasting",
    ctaHref: "/auth/register",
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For serious broadcasters and growing audiences",
    features: [
      "Everything in Free",
      "5 stations",
      "500 concurrent listeners",
      "Connect OBS, BUTT, or any streaming software",
      "Scheduled broadcasts",
      "Listener analytics & geographic insights",
      "Embeddable player widget",
      "Direct stream URL for third-party players",
      "Priority support",
    ],
    cta: "Join the waitlist",
    ctaHref: "",
    popular: true,
    primaryCta: true,
    waitlist: true,
  },
]

const ADDONS: AddOn[] = [
  {
    name: "Custom Player Page",
    price: "$149",
    description: "A professionally designed player page tailored to your brand. Custom layout, colors, fonts, artwork, social links, donation buttons, show schedule, and embeddable widget for your website. One-time purchase, yours forever.",
    ctaHref: "mailto:hello@gocast.fm?subject=Custom%20Player%20Page&body=Hi%2C%0A%0AI'm%20interested%20in%20a%20custom%20player%20page%20(%24149).%0A%0AMy%20station%3A%20%0ABrand%20colors%2Fstyle%20notes%3A%20%0A%0AThanks!",
  },
  {
    name: "Custom Domain",
    price: "$49",
    description: "Serve your player page from your own domain — listen.yourstation.com instead of gocast.fm/station/you. SSL certificate included. One-time setup.",
    ctaHref: "mailto:hello@gocast.fm?subject=Custom%20Domain%20Setup&body=Hi%2C%0A%0AI'd%20like%20to%20set%20up%20a%20custom%20domain%20(%2449).%0A%0AMy%20station%3A%20%0ADomain%20I%20want%20to%20use%3A%20%0A%0AThanks!",
  },
  {
    name: "Mobile App",
    price: "$499",
    description: "A branded mobile app for your station on iOS and Android. Your name, your icon, push notifications for live alerts, and your listeners' home screens. One-time purchase.",
    ctaHref: "mailto:hello@gocast.fm?subject=GoCast%20Mobile%20App&body=Hi%2C%0A%0AI'm%20interested%20in%20a%20branded%20mobile%20app%20(%24499).%0A%0AMy%20station%3A%20%0APlatform%20preference%20(iOS%2FAndroid%2Fboth)%3A%20%0A%0AThanks!",
  },
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

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-16">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative bg-white/[0.02] border rounded-xl px-5 md:px-7 py-7 md:py-9 transition-all flex flex-col hover:-translate-y-0.5 ${
              plan.popular
                ? "border-violet-border/70 bg-violet-full/[0.04] shadow-[0_0_40px_rgba(139,92,246,0.1)]"
                : "border-white/[0.06]"
            } ${plan.waitlist ? "opacity-85" : ""}`}
          >
            {plan.waitlist && <ComingSoonBadge />}
            <div className="text-[13px] tracking-[2px] uppercase text-text-muted/85 mb-3">
              {plan.name}
            </div>
            <div className="text-4xl font-semibold text-text-primary -tracking-wide mb-1">
              {plan.price}
              {plan.period && <span className="text-sm text-text-muted font-normal"> {plan.period}</span>}
            </div>
            <div className="text-[13px] text-text-faint mb-6 leading-relaxed">
              {plan.description}
            </div>
            <ul className="list-none p-0 flex-1">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="text-[13px] text-text-muted py-1.5 flex items-center gap-2.5"
                >
                  <IconCheck size={14} className="text-violet-muted shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            {plan.waitlist ? (
              <WaitlistButton
                plan="pro"
                className="block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all"
              >
                {plan.cta}
              </WaitlistButton>
            ) : plan.ctaHref.startsWith("mailto:") ? (
              <a
                href={plan.ctaHref}
                className={`block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium no-underline transition-all ${
                  plan.primaryCta
                    ? "bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)]"
                    : "bg-transparent text-text-muted border border-white/[0.08] hover:border-white/[0.15] hover:text-white"
                }`}
              >
                {plan.cta}
              </a>
            ) : (
              <Link
                href={plan.ctaHref}
                className={`block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium no-underline transition-all ${
                  plan.primaryCta
                    ? "bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)]"
                    : "bg-transparent text-text-muted border border-white/[0.08] hover:border-white/[0.15] hover:text-white"
                }`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Add-ons */}
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-3">
            Add-ons
          </div>
          <h3 className="text-2xl font-semibold -tracking-wide">
            Take it further.
          </h3>
          <p className="text-sm text-text-faint mt-2">
            One-time purchases. No recurring fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {ADDONS.filter((a) => a.name !== "Custom Domain").map((addon) => (
            <div
              key={addon.name}
              className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-8 py-7 md:py-9 flex flex-col transition-all hover:-translate-y-0.5 shadow-[0_0_40px_rgba(139,92,246,0.1)] opacity-80"
            >
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-base font-medium text-text-secondary">
                  {addon.name}
                </div>
                <div className="text-2xl font-semibold text-text-primary -tracking-wide">
                  {addon.price}
                </div>
              </div>
              <div className="text-[13px] text-text-faint leading-[1.7] mb-6 flex-1">
                {addon.description}
              </div>
              <div className="text-[11px] tracking-[2px] uppercase text-text-faint text-center py-3">
                Coming soon
              </div>
            </div>
          ))}
        </div>

        {/* Custom Domain — full width */}
        {ADDONS.filter((a) => a.name === "Custom Domain").map((addon) => (
          <div
            key={addon.name}
            className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-8 py-6 md:py-7 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8 transition-all hover:-translate-y-0.5 shadow-[0_0_40px_rgba(139,92,246,0.1)] opacity-80"
          >
            <div className="flex-1">
              <div className="flex items-baseline gap-3 mb-1.5">
                <div className="text-base font-medium text-text-secondary">
                  {addon.name}
                </div>
                <div className="text-lg font-semibold text-text-primary -tracking-wide">
                  {addon.price}
                </div>
              </div>
              <div className="text-[13px] text-text-faint leading-[1.7]">
                {addon.description}
              </div>
            </div>
            <div className="shrink-0 text-[11px] tracking-[2px] uppercase text-text-faint text-center md:text-right px-2">
              Coming soon
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
