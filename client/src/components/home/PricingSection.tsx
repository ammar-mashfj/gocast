interface Plan {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  cta: string
  popular?: boolean
  primaryCta?: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    description: 'Get started instantly',
    features: ['1 station', '30 listeners', 'Live from browser', 'Player page', '96 kbps quality'],
    cta: 'Get started',
  },
  {
    name: 'Starter',
    price: '$5',
    period: '/mo',
    description: 'For growing stations',
    features: ['2 stations', '150 listeners', 'No ads', 'Custom branding', '128 kbps quality'],
    cta: 'Start free, upgrade later',
  },
  {
    name: 'Pro',
    price: '$10',
    period: '/mo',
    description: 'For serious broadcasters',
    features: [
      '5 stations',
      '500 listeners',
      'AutoDJ + uploads',
      'Custom domain',
      '320 kbps quality',
      'Full analytics',
    ],
    cta: 'Start free, upgrade later',
    popular: true,
    primaryCta: true,
  },
  {
    name: 'Studio',
    price: '$20',
    period: '/mo',
    description: 'For organizations',
    features: [
      'Unlimited stations',
      'Unlimited listeners',
      'White-label',
      '100 GB storage',
      'Priority support',
      'API access',
    ],
    cta: 'Contact us',
  },
]

interface PricingSectionProps {
  onOpenRegister: () => void
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-violet-muted shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function PricingSection({ onOpenRegister }: PricingSectionProps) {
  return (
    <section className="px-10 py-24" id="pricing">
      <div className="text-center mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          Pricing
        </div>
        <h2 className="text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          Start free. Upgrade when you're ready.
        </h2>
        <p className="text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          No credit card required. No trial period. Broadcast for free, forever.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative bg-white/[0.02] border rounded-xl px-7 py-9 transition-all hover:-translate-y-0.5 flex flex-col ${
              plan.popular
                ? 'border-violet-border/70 bg-violet-full/[0.04] shadow-[0_0_40px_rgba(139,92,246,0.08)]'
                : 'border-white/[0.06]'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet text-white text-[10px] tracking-[1.5px] uppercase px-3.5 py-1 rounded-full font-medium">
                Most popular
              </div>
            )}
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
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={onOpenRegister}
              className={`block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium font-[inherit] transition-all ${
                plan.primaryCta
                  ? 'bg-violet text-white border border-transparent hover:bg-violet-full hover:shadow-[0_4px_20px_rgba(139,92,246,0.3)]'
                  : 'bg-transparent text-text-muted border border-white/[0.08] hover:border-white/[0.15] hover:text-white'
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
