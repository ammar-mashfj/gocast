interface Feature {
  title: string
  description: string
  icon: React.ReactNode
  tag?: string
}

const FEATURES: Feature[] = [
  {
    title: 'Talk over music like a DJ',
    description:
      'Push-to-talk with auto-ducking. Hold space, the music lowers, your voice takes over. Release and the music fades back up.',
    tag: 'Studio',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    title: 'Live track metadata',
    description:
      'Listeners see what\'s playing in real-time. Track titles and artist names update automatically as your queue advances.',
    tag: 'Listeners',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    title: 'Seamless reconnect',
    description:
      'Accidentally close the tab? Your stream keeps going for 30 seconds while you reconnect. Listeners hear silence, not a disconnect.',
    tag: 'Reliability',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
      </svg>
    ),
  },
  {
    title: 'Queue that remembers',
    description:
      'Your files and playback position are saved locally. Refresh the page, reconnect, and pick up exactly where you left off.',
    tag: 'Studio',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  {
    title: 'Nothing to install',
    description:
      'Everything runs in your browser. MP3 encoding, mixing, streaming — all handled by the Web Audio API. Just open and broadcast.',
    tag: 'Platform',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    title: 'Keyboard-first controls',
    description:
      'Space for push-to-talk, K to play/pause, N/P to skip tracks, R to toggle repeat. Built for speed, not clicking around.',
    tag: 'Studio',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
      </svg>
    ),
  },
]

export default function FeaturesSection() {
  return (
    <section className="px-10 py-24">
      <div className="text-center mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          Built for broadcasters
        </div>
        <h2 className="text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          A studio in your browser.
        </h2>
        <p className="text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          Professional broadcasting tools that run entirely in your browser. No downloads, no complexity.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="group bg-white/[0.02] border border-white/[0.06] rounded-xl px-8 py-8 transition-all hover:border-violet-border/50 hover:bg-violet-full/[0.03]"
          >
            <div className="flex items-start justify-between mb-5">
              <div className="w-11 h-11 rounded-xl bg-violet-full/10 border border-violet-full/15 flex items-center justify-center text-violet-muted group-hover:text-violet group-hover:border-violet-border/50 transition-colors">
                {feature.icon}
              </div>
              {feature.tag && (
                <span className="text-[10px] tracking-[1.5px] uppercase text-text-dim bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-full">
                  {feature.tag}
                </span>
              )}
            </div>
            <div className="text-[17px] font-medium text-text-secondary mb-2">
              {feature.title}
            </div>
            <div className="text-sm text-text-muted/85 leading-[1.7]">
              {feature.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
