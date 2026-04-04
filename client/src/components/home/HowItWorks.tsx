interface Step {
  num: string
  title: string
  description: string
  time: string
  icon: React.ReactNode
}

const STEPS: Step[] = [
  {
    num: '01',
    title: 'Create your station',
    description:
      'Pick a name, choose a genre, and claim your URL. Your player page goes live instantly.',
    time: '15 seconds',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Go live',
    description:
      'Hit broadcast. Your browser captures audio and streams it to your audience in real-time.',
    time: '1 click',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Share your link',
    description:
      'Send your player page to anyone. They click, they listen. No app download required.',
    time: 'Instant',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
]

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

export default function HowItWorks() {
  return (
    <section className="px-10 py-24" id="features">
      <div className="text-center mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          How it works
        </div>
        <h2 className="text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          Three steps. Zero complexity.
        </h2>
        <p className="text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          Everything happens in your browser. No software to install, no servers
          to manage.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="group bg-white/[0.02] border border-white/[0.06] rounded-xl px-8 py-10 transition-all hover:border-violet-border/50 hover:bg-violet-full/[0.03]"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-full/10 border border-violet-full/15 flex items-center justify-center text-violet-muted mb-6 group-hover:text-violet group-hover:border-violet-border/50 transition-colors">
              {step.icon}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] tracking-[2px] text-violet-muted font-medium">
                STEP {step.num}
              </span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="text-lg font-medium text-text-secondary mb-2.5">
              {step.title}
            </div>
            <div className="text-sm text-text-muted/85 leading-[1.7] mb-4">
              {step.description}
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-violet-muted tracking-wide">
              <ClockIcon /> {step.time}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
