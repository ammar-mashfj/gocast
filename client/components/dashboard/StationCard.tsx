import Link from "next/link"
import { IconPlayerPlayFilled } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { Badge } from "@/components/ui/badge"
import { StationArtwork } from "@/components/StationArtwork"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"

interface StationCardProps {
  station: Station
}

export function StationCard({ station }: StationCardProps) {
  // The whole card opens the detail page; the Go-Live button is a sibling
  // (relative z-10) so it sits above the absolute card link and intercepts
  // its own click, opening the broadcast-mode picker before navigating.
  return (
    <div className="relative bg-card border rounded-xl p-5 transition-all hover:border-primary/30 hover:bg-primary/[0.04] group">
      <Link
        href={`/dashboard/stations/${station.slug}`}
        className="absolute inset-0 rounded-xl no-underline z-0"
        aria-label={`Open ${station.name}`}
      />
      <div className="flex items-start justify-between mb-3.5 relative z-[1] pointer-events-none">
        <StationArtwork
          src={station.artwork_url}
          alt={station.name}
          className="size-12 rounded-xl shrink-0"
          iconSize={18}
        />
        {station.is_live ? (
          <Badge variant="secondary" className="text-emerald-400 gap-1">
            <span className="size-1.5 bg-emerald-400 rounded-full" />
            Live
          </Badge>
        ) : (
          <Badge variant="secondary">Offline</Badge>
        )}
      </div>
      <div className="text-base font-medium text-foreground mb-1 relative z-[1] pointer-events-none">{station.name}</div>
      <div className="text-xs text-muted-foreground mb-3 relative z-[1] pointer-events-none">{station.genre || "No genre"}</div>

      {!station.is_live && (
        <GoLiveTrigger slug={station.slug} name={station.name}>
          <button
            type="button"
            className="relative z-10 inline-flex items-center gap-1.5 text-xs text-primary cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none p-0"
          >
            <IconPlayerPlayFilled size={14} />
            Go live
          </button>
        </GoLiveTrigger>
      )}
    </div>
  )
}
