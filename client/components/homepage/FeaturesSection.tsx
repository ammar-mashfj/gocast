type Accent = 'violet' | 'sky' | 'emerald' | 'amber'

interface Feature {
  title: string
  description: string
  icon: React.ReactNode
  tag: string
  accent: Accent
}

const ACCENTS: Record<Accent, {
  iconBg: string
  iconBorder: string
  iconText: string
  tagText: string
  tagBorder: string
  tagBg: string
  hoverBorder: string
  hoverBg: string
}> = {
  violet: {
    iconBg: 'bg-violet-500/10',
    iconBorder: 'border-violet-500/20',
    iconText: 'text-violet-300',
    tagText: 'text-violet-300/90',
    tagBorder: 'border-violet-500/20',
    tagBg: 'bg-violet-500/[0.06]',
    hoverBorder: 'group-hover:border-violet-500/50',
    hoverBg: 'hover:border-violet-500/30 hover:bg-violet-500/[0.03]',
  },
  sky: {
    iconBg: 'bg-sky-500/10',
    iconBorder: 'border-sky-500/20',
    iconText: 'text-sky-300',
    tagText: 'text-sky-300/90',
    tagBorder: 'border-sky-500/20',
    tagBg: 'bg-sky-500/[0.06]',
    hoverBorder: 'group-hover:border-sky-500/50',
    hoverBg: 'hover:border-sky-500/30 hover:bg-sky-500/[0.03]',
  },
  emerald: {
    iconBg: 'bg-emerald-500/10',
    iconBorder: 'border-emerald-500/20',
    iconText: 'text-emerald-300',
    tagText: 'text-emerald-300/90',
    tagBorder: 'border-emerald-500/20',
    tagBg: 'bg-emerald-500/[0.06]',
    hoverBorder: 'group-hover:border-emerald-500/50',
    hoverBg: 'hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]',
  },
  amber: {
    iconBg: 'bg-amber-500/10',
    iconBorder: 'border-amber-500/20',
    iconText: 'text-amber-300',
    tagText: 'text-amber-300/90',
    tagBorder: 'border-amber-500/20',
    tagBg: 'bg-amber-500/[0.06]',
    hoverBorder: 'group-hover:border-amber-500/50',
    hoverBg: 'hover:border-amber-500/30 hover:bg-amber-500/[0.03]',
  },
}

const FEATURES: Feature[] = [
  {
    title: 'Talk over music like a DJ',
    description: 'Hold space to duck music under your voice. Release to fade it back up.',
    tag: 'Studio',
    accent: 'violet',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    title: 'Live track metadata',
    description: 'Titles and artists update on every listener as your queue advances.',
    tag: 'Listeners',
    accent: 'sky',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    title: 'Seamless reconnect',
    description: 'Close the tab by accident? The stream holds for 30 seconds while you come back.',
    tag: 'Reliability',
    accent: 'emerald',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
      </svg>
    ),
  },
  {
    title: 'Queue that remembers',
    description: 'Files and playback position saved locally. Refresh and pick up where you left off.',
    tag: 'Studio',
    accent: 'violet',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  {
    title: 'Nothing to install',
    description: 'MP3 encoding, mixing, streaming — all in the browser. Just open and broadcast.',
    tag: 'Platform',
    accent: 'amber',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    title: 'Keyboard-first controls',
    description: 'Space to talk. K play/pause. N/P skip. R repeat. Built for speed.',
    tag: 'Studio',
    accent: 'violet',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
      </svg>
    ),
  },
]

export default function FeaturesSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24">
      <div className="text-center mb-10 md:mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          Built for broadcasters
        </div>
        <h2 className="text-2xl md:text-[32px] lg:text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          A studio in your browser.
        </h2>
        <p className="text-sm md:text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          Professional broadcasting tools that run entirely in your browser. No downloads, no complexity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {FEATURES.map((feature) => {
          const a = ACCENTS[feature.accent]
          return (
            <div
              key={feature.title}
              className={`group bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-7 py-6 md:py-7 transition-all ${a.hoverBg}`}
            >
              <div className="flex items-start justify-between mb-5">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${a.iconBg} ${a.iconBorder} ${a.iconText} ${a.hoverBorder}`}>
                  {feature.icon}
                </div>
                <span className={`text-[10px] tracking-[1.5px] uppercase px-2.5 py-1 rounded-full border ${a.tagText} ${a.tagBorder} ${a.tagBg}`}>
                  {feature.tag}
                </span>
              </div>
              <div className="text-[17px] font-medium text-text-secondary mb-1.5">
                {feature.title}
              </div>
              <div className="text-sm text-text-muted/85 leading-[1.6]">
                {feature.description}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
