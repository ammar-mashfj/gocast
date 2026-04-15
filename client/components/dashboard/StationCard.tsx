import Link from "next/link"
import { Station } from "@/interfaces/Station"
import { Badge } from "@/components/ui/badge"

interface StationCardProps {
  station: Station
}

export function StationCard({ station }: StationCardProps) {
  return (
    <Link
      href={`/dashboard/stations/${station.slug}`}
      className="bg-card border rounded-xl p-5 cursor-pointer transition-all hover:border-primary/30 hover:bg-primary/[0.04] no-underline block"
    >
      <div className="flex items-start justify-between mb-3.5">
        <div className="size-12 rounded-[10px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center text-[22px] shrink-0 overflow-hidden">
          {station.artwork_url ? (
            <img src={station.artwork_url} alt={station.name} className="size-full object-cover" />
          ) : (
            "♫"
          )}
        </div>
        {station.is_live ? (
          <Badge variant="secondary" className="text-emerald-400 gap-1">
            <span className="size-1.5 bg-emerald-400 rounded-full" />
            Live
          </Badge>
        ) : (
          <Badge variant="secondary">Offline</Badge>
        )}
      </div>
      <div className="text-[15px] font-medium text-foreground mb-1">{station.name}</div>
      <div className="text-xs text-muted-foreground mb-1">{station.genre || "No genre"}</div>
    </Link>
  )
}
