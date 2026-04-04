interface OrbitStation {
  name: string
  count: string
  color: string
  animClass: string
}

const ORBIT_STATIONS: OrbitStation[] = [
  { name: 'Lo-Fi Beats', count: '342', color: '#34d399', animClass: 'animate-orbit-1' },
  { name: 'Jazz FM', count: '89', color: '#f472b6', animClass: 'animate-orbit-2' },
  { name: 'Church Live', count: '1.2k', color: '#818cf8', animClass: 'animate-orbit-3' },
]

interface HeroSectionProps {
  onOpenRegister: () => void
}

export default function HeroSection({ onOpenRegister }: HeroSectionProps) {
  return (
    <section className="relative grid grid-cols-2 gap-10 items-center min-h-[540px] px-10 pt-20 pb-24 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 w-[700px] h-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.08)_0%,transparent_65%)] pointer-events-none" />

      {/* Left: copy */}
      <div className="relative z-2">
        <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] px-3.5 py-1.5 rounded-full text-xs text-text-muted tracking-wide mb-7">
          <div className="w-1.5 h-1.5 bg-emerald-live rounded-full animate-live-dot" />
          Stations are live right now
        </div>

        <h1 className="text-[64px] font-semibold -tracking-[2px] leading-[1.05] mb-5">
          Your voice.
          <br />
          On air in
          <br />
          <em className="not-italic bg-gradient-to-br from-violet-full via-purple-400 to-pink-500 bg-clip-text text-transparent hero-glow-text">
            60 seconds.
          </em>
        </h1>

        <p className="text-[17px] text-text-muted leading-[1.7] mb-9 max-w-[400px]">
          Hit go live. Get a player page your audience can tune into instantly.
          No servers. No downloads.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={onOpenRegister}
            className="group bg-violet text-white px-8 py-3.5 rounded-lg text-[15px] font-medium border-none cursor-pointer hover:bg-violet-full hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(139,92,246,0.3)] transition-all"
          >
            Start broadcasting — free
          </button>
          <a
            href="#live"
            className="text-text-muted border border-border-hover px-7 py-3.5 rounded-lg text-[15px] no-underline hover:text-white hover:border-white/30 transition-all"
          >
            Listen live
          </a>
        </div>
      </div>

      {/* Right: orbit */}
      <div className="relative z-2 flex justify-center items-center h-[420px]">
        {/* Rings */}
        <div className="absolute w-[280px] h-[280px] rounded-full border border-border-subtle top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[360px] h-[360px] rounded-full border border-white/[0.04] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[440px] h-[440px] rounded-full border border-white/[0.03] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

        {/* Center icon */}
        <div className="w-25 h-25 rounded-full bg-violet-subtle border border-violet-border flex items-center justify-center relative animate-center-pulse">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(139,92,246,0.8)"
            strokeWidth="1.5"
            className="opacity-70"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="10,8 16,12 10,16" fill="rgba(139,92,246,0.6)" stroke="none" />
          </svg>
        </div>

        {/* Orbiting cards */}
        {ORBIT_STATIONS.map((station) => (
          <div
            key={station.name}
            className={`absolute top-1/2 left-1/2 -mt-[22px] -ml-[22px] ${station.animClass}`}
          >
            <div className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-[10px] px-3.5 py-2.5 flex items-center gap-2 whitespace-nowrap shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <div className="w-2 h-2 rounded-full shrink-0 animate-live-dot" style={{ background: station.color }} />
              <span className="text-[11px] text-white/70 font-medium">{station.name}</span>
              <span className="text-[10px] text-text-muted">{station.count}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
