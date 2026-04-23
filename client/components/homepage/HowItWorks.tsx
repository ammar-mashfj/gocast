type Accent = 'violet' | 'sky' | 'emerald'

interface Step {
  num: string
  title: string
  description: string
  time: string
  accent: Accent
  icon: React.ReactNode
}

const ACCENT_CLASSES: Record<Accent, { bg: string; border: string; text: string; hoverBorder: string; hoverBg: string }> = {
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/15',  text: 'text-violet-300',  hoverBorder: 'group-hover:border-violet-500/50',  hoverBg: 'hover:border-violet-500/30 hover:bg-violet-500/[0.03]'  },
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/15',     text: 'text-sky-300',     hoverBorder: 'group-hover:border-sky-500/50',     hoverBg: 'hover:border-sky-500/30 hover:bg-sky-500/[0.03]'     },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/15', text: 'text-emerald-300', hoverBorder: 'group-hover:border-emerald-500/50', hoverBg: 'hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]' },
}

const STEPS: Step[] = [
  {
    num: '01',
    title: 'Create your station',
    description:
      'Pick a name, choose a genre, and claim your URL. Your player page goes live instantly.',
    time: '15 seconds',
    accent: 'violet',
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
    accent: 'sky',
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
    accent: 'emerald',
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
    <section className="px-4 md:px-10 py-12 md:py-24" id="features">
      <div className="text-center mb-10 md:mb-16">
        <div className="text-xs tracking-[3px] uppercase text-violet-muted mb-4">
          How it works
        </div>
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold -tracking-wide leading-tight mb-4">
          Three steps. Zero complexity.
        </h2>
        <p className="text-sm md:text-base text-text-muted max-w-[480px] leading-relaxed mx-auto">
          Everything happens in your browser. No software to install, no servers
          to manage.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STEPS.map((step) => {
          const a = ACCENT_CLASSES[step.accent]
          return (
            <div
              key={step.num}
              className={`group bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-8 py-7 md:py-10 transition-all ${a.hoverBg}`}
            >
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-6 transition-colors ${a.bg} ${a.border} ${a.text} ${a.hoverBorder}`}>
                {step.icon}
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-xs tracking-[2px] font-medium ${a.text}`}>
                  STEP {step.num}
                </span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="text-lg font-medium text-text-secondary mb-2.5">
                {step.title}
              </div>
              <div className="text-sm text-text-muted leading-relaxed mb-4">
                {step.description}
              </div>
              <div className={`inline-flex items-center gap-1.5 text-xs tracking-wide ${a.text}`}>
                <ClockIcon /> {step.time}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
