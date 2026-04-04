import Equalizer from './Equalizer'

interface LiveStation {
  name: string
  genre: string
  listeners: string
  gradient: string
  icon: string
}

const LIVE_STATIONS: LiveStation[] = [
  {
    name: 'Midnight Jazz',
    genre: 'Smooth Jazz',
    listeners: '847 listening',
    gradient: 'linear-gradient(135deg, #1a0533, #2d1b69)',
    icon: '♫',
  },
  {
    name: 'Lo-Fi Study',
    genre: 'Lo-Fi / Chill',
    listeners: '2,341 listening',
    gradient: 'linear-gradient(135deg, #0f2b1a, #1a5c33)',
    icon: '♬',
  },
  {
    name: 'Sunday Sermon',
    genre: 'Church / Talk',
    listeners: '156 listening',
    gradient: 'linear-gradient(135deg, #2b1a0f, #5c3a1a)',
    icon: '♩',
  },
  {
    name: 'Berlin Techno',
    genre: 'Electronic',
    listeners: '1,089 listening',
    gradient: 'linear-gradient(135deg, #1a0f2b, #3a1a5c)',
    icon: '♪',
  },
]

function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-emerald-live tracking-wide uppercase font-medium">
      <div className="w-[5px] h-[5px] bg-emerald-live rounded-full animate-live-dot" />
      Live
    </div>
  )
}

export default function LiveNow() {
  return (
    <section className="px-10 py-24" id="live">
      <div className="text-center mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          Live now
        </div>
        <h2 className="text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          Discover what's on air.
        </h2>
        <p className="text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          Thousands of stations broadcasting right now. Music, talk, community — all
          powered by GoCast.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {LIVE_STATIONS.map((station) => (
          <div
            key={station.name}
            className="group bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer overflow-hidden transition-all hover:border-violet-border/50 hover:bg-violet-full/[0.03] hover:-translate-y-0.5"
          >
            <div className="flex justify-between items-start mb-3.5">
              <div
                className="w-12 h-12 rounded-[10px] flex items-center justify-center text-[22px] transition-transform group-hover:scale-105"
                style={{ background: station.gradient }}
              >
                {station.icon}
              </div>
              <LiveBadge />
            </div>
            <div className="text-[15px] font-medium text-text-secondary mb-1">
              {station.name}
            </div>
            <div className="text-xs text-text-muted mb-3">{station.genre}</div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-text-faint">{station.listeners}</span>
              <Equalizer />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
