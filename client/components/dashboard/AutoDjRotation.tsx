import Link from "next/link"
import { IconArrowRight, IconPlaylist } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Track } from "@/interfaces/Track"
import { formatAirtime, formatClock } from "@/lib/format"

/** Enough to prove the rotation is real without turning the page into a library. */
const PREVIEW_COUNT = 4

interface AutoDjRotationProps {
  slug: string
  /** The `music` list, already in `position` order — the API orders by it. */
  tracks: Track[]
  /**
   * True when the track fetch failed. The rest of the page is still worth
   * rendering, so the card degrades to a link instead of taking the route down
   * with it.
   */
  unavailable?: boolean
}

/**
 * What the AutoDJ will actually play, on the page where someone decides
 * whether to trust it.
 *
 * This card used to say only "tracks that play in order when you're not live",
 * which is a description of the feature rather than an answer about this
 * station — you had to open the library to find out whether there was anything
 * in it at all.
 */
export function AutoDjRotation({ slug, tracks, unavailable = false }: AutoDjRotationProps) {
  const totalSeconds = tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0)
  const preview = tracks.slice(0, PREVIEW_COUNT)
  const remaining = tracks.length - preview.length

  const subtitle = unavailable
    ? "Couldn't load the rotation just now."
    : tracks.length === 0
      ? "Empty — a station with no tracks goes on air to silence."
      : `${tracks.length} track${tracks.length === 1 ? "" : "s"} • ${formatAirtime(totalSeconds)} • plays in order whenever you're off air`

  return (
    <Card className="gap-0 overflow-hidden">
      <CardContent className="flex items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-md bg-muted flex items-center justify-center shrink-0">
            <IconPlaylist size={18} className="text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-medium">AutoDJ rotation</div>
            <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
          </div>
        </div>
        <Button variant="outline" asChild className="shrink-0">
          <Link href={`/dashboard/stations/${slug}/library`}>
            {tracks.length === 0 && !unavailable ? "Add tracks" : "Manage tracks"}
            <IconArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>

      {preview.length > 0 && (
        <div>
          {preview.map((track, i) => (
            <div
              key={track.id}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] md:grid-cols-[1.5rem_minmax(0,1fr)_8rem_auto] items-center gap-3 px-6 py-2.5 border-t border-border text-sm"
            >
              <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="truncate">{track.title}</span>
              <span className="hidden md:block text-xs text-muted-foreground truncate">
                {track.artist ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums text-right">
                {formatClock(track.duration_seconds).replace(/^00:/, "")}
              </span>
            </div>
          ))}
          {remaining > 0 && (
            <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground">
              {remaining} more track{remaining === 1 ? "" : "s"} in rotation
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
