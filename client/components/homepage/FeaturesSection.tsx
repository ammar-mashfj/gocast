type Accent = 'violet' | 'sky' | 'emerald' | 'amber'

interface Feature {
  title: string
  description: string
  icon: React.ReactNode
  tag: string
  accent: Accent
  /** Renders the Pro pill. Set only where the WHOLE card is gated — a card
      whose free half still works says so in its description instead. */
  pro?: boolean
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

/**
 * Two groups, deliberately: the page used to list six studio features and
 * stopped, which described the product as it was before AutoDJ. A visitor
 * looking to START A STATION needs to see that it keeps running when they
 * close the tab — that is the half that was missing, so it gets its own
 * heading rather than being mixed in as two more cards.
 */
const ON_MIC: Feature[] = [
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
    title: 'Keyboard-first controls',
    description: 'Space to talk. K play/pause. N/P skip. R repeat. Your queue and playback position survive a refresh.',
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

const OFF_MIC: Feature[] = [
  {
    title: '24/7 AutoDJ',
    description: 'Upload your library and the station never goes quiet. Step away from the mic and the music picks up where you left off.',
    tag: 'AutoDJ',
    accent: 'amber',
    pro: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 3v3M12 18v3" />
      </svg>
    ),
  },
  {
    title: 'Programme your week',
    description: 'Build playlists, then drop them on a weekly grid. Chill in the morning, hits at drivetime, a Friday-night special.',
    tag: 'AutoDJ',
    accent: 'violet',
    pro: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 10h18M8 2v4M16 2v4" />
        <rect x="6" y="13" width="5" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.6" />
        <rect x="13" y="13" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.35" />
      </svg>
    ),
  },
  {
    title: 'Broadcast from your own gear',
    description: 'BUTT, Mixxx, or any Icecast source client connects straight to your station. Keep the rig you already know.',
    tag: 'Encoders',
    accent: 'sky',
    pro: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 2v6M15 2v6" />
        <path d="M6 8h12v3a6 6 0 01-6 6 6 6 0 01-6-6V8z" />
        <path d="M12 17v5" />
      </svg>
    ),
  },
  {
    title: 'A stream URL of your own',
    description: 'A public Icecast URL that works in TuneIn, Sonos, VLC and every directory that takes one.',
    tag: 'Listeners',
    accent: 'emerald',
    pro: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="5" cy="19" r="1.5" />
        <path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" />
      </svg>
    ),
  },
  {
    title: 'Your site, your domain',
    description: 'Embed the player on your own page with one line of HTML, or point a DNS record at your station and it lives on your domain.',
    tag: 'Listeners',
    accent: 'violet',
    pro: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="13" y1="4" x2="11" y2="20" />
      </svg>
    ),
  },
  {
    title: 'Know who is listening',
    description: 'Live count and all-time peak on every plan. Pro adds 90 days of history, by country and by day.',
    tag: 'Audience',
    accent: 'sky',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 20h18" />
        <rect x="5" y="12" width="3.5" height="6" rx="1" />
        <rect x="10.25" y="8" width="3.5" height="10" rx="1" />
        <rect x="15.5" y="4" width="3.5" height="14" rx="1" />
      </svg>
    ),
  },
]

function ProPill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-300">
      Pro
    </span>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const a = ACCENTS[feature.accent]
  return (
    <div
      className={`group bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-7 py-7 md:py-8 transition-all ${a.hoverBg}`}
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${a.iconBg} ${a.iconBorder} ${a.iconText} ${a.hoverBorder}`}>
          {feature.icon}
        </div>
        <div className="flex items-center gap-1.5">
          {feature.pro && <ProPill />}
          <span className={`text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border ${a.tagText} ${a.tagBorder} ${a.tagBg}`}>
            {feature.tag}
          </span>
        </div>
      </div>
      <h3 className="text-[18px] font-semibold text-white mb-3">
        {feature.title}
      </h3>
      <div className="text-base text-text-secondary leading-[1.7] text-pretty tracking-[0.01em]">
        {feature.description}
      </div>
    </div>
  )
}

function GroupHeading({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
      <span className="text-xs tracking-[0.25em] uppercase text-text-secondary">{label}</span>
      <div className="h-px flex-1 min-w-8 bg-white/[0.06]" />
      {note && <span className="text-xs text-text-faint">{note}</span>}
    </div>
  )
}

export default function FeaturesSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24">
      <div className="text-center mb-10 md:mb-16">
        <div className="text-xs tracking-[0.25em] uppercase text-violet-muted mb-4">
          Built for broadcasters
        </div>
        <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-semibold -tracking-wide leading-tight mb-4">
          A station, not just a stream.
        </h2>
        <p className="text-base text-text-secondary tracking-[0.01em] max-w-[480px] leading-relaxed mx-auto">
          Everything you need at the microphone — and everything that keeps the
          station on air the rest of the week.
        </p>
      </div>

      <div className="max-w-6xl mx-auto flex flex-col gap-10 md:gap-14">
        <div>
          <GroupHeading label="When you're on the mic" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ON_MIC.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </div>

        <div>
          <GroupHeading label="When you're not" note="Pro — free while it's in beta" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {OFF_MIC.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
