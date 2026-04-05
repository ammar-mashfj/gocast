import { Link } from 'react-router-dom'
import type { Station } from '../../types/station'

interface StationCardProps {
  station: Station
}

export default function StationCard({ station }: StationCardProps) {
  return (
    <Link
      to={`/dashboard/stations/${station.id}`}
      className="bg-surface-card border border-border-subtle rounded-xl p-5 cursor-pointer transition-all hover:border-violet-border hover:bg-violet-full/[0.04] no-underline block"
    >
      <div className="flex items-start justify-between mb-3.5">
        <div className="w-12 h-12 rounded-[10px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center text-[22px] shrink-0">
          ♫
        </div>
        {station.is_live ? (
          <div className="flex items-center gap-1 text-[10px] text-emerald-live tracking-wide uppercase">
            <div className="w-[5px] h-[5px] bg-emerald-live rounded-full animate-live-dot" />
            Live
          </div>
        ) : (
          <span className="text-[10px] text-text-ghost tracking-wide uppercase">Offline</span>
        )}
      </div>
      <div className="text-[15px] font-medium text-text-secondary mb-1">{station.name}</div>
      <div className="text-xs text-text-muted mb-1">{station.genre || 'No genre'}</div>
      <div className="text-[11px] text-text-faint">{new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href}</div>
    </Link>
  )
}
