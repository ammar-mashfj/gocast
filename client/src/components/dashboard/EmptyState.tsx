const STEPS = [
  { num: '1', text: 'Name it' },
  { num: '2', text: 'Go live' },
  { num: '3', text: 'Share link' },
] as const

function ArrowIcon() {
  return (
    <div className="text-text-dim">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 12h14" />
        <path d="M12 5l7 7-7 7" />
      </svg>
    </div>
  )
}

interface EmptyStateProps {
  onCreateStation: () => void
}

export default function EmptyState({ onCreateStation }: EmptyStateProps) {
  return (
    <>
      {/* Background glow */}
      <div className="absolute top-[40%] left-1/2 w-[400px] h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.05)_0%,transparent_65%)] pointer-events-none" />

      {/* Mic icon */}
      <div className="w-20 h-20 rounded-[20px] bg-violet-full/[0.08] border border-violet-full/15 flex items-center justify-center mb-6 relative z-1">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.6)" strokeWidth="1.2">
          <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      </div>

      <h1 className="text-[22px] font-medium text-text-secondary mb-2.5 relative z-1">
        Create your first station
      </h1>
      <p className="text-[15px] text-text-muted max-w-[380px] leading-relaxed mb-8 relative z-1">
        You're 60 seconds away from going on air. Name your station, pick a genre, and start broadcasting to the world.
      </p>

      <button
        onClick={onCreateStation}
        className="inline-flex items-center gap-2 px-7 py-3.5 bg-violet text-white border-none rounded-[10px] text-[15px] font-medium cursor-pointer hover:bg-violet-full hover:-translate-y-px transition-all relative z-1"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create station
      </button>

      {/* Steps */}
      <div className="flex items-center gap-8 mt-12 relative z-1">
        {STEPS.map((step, i) => (
          <div key={step.num} className="contents">
            {i > 0 && <ArrowIcon />}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-border-faint flex items-center justify-center text-xs text-text-ghost font-medium shrink-0">
                {step.num}
              </div>
              <span className="text-[13px] text-text-ghost">{step.text}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
