"use client"

import { useEffect, useRef } from "react"
import type { StationStatus } from "@/interfaces/StationStatus"
import type { HeroNowPlaying } from "@/lib/stationHero"
import { formatTrackTime } from "@/lib/format"
import { useTrackProgress } from "@/hooks/useTrackProgress"

/**
 * What AutoDJ is playing, in a well inside the hero: title · artist, the
 * time left (violet, mono), a progress bar, and what's next.
 *
 * The bar and the time are written straight to the DOM each animation frame
 * from useTrackProgress, which counts forward from the last poll — a
 * re-render per frame would be absurd, and a value updated per poll would
 * lurch in poll-sized steps.
 */
export function NowPlayingWell({ nowPlaying, status }: { nowPlaying: HeroNowPlaying; status: StationStatus | null }) {
  const { track, line, progress, next } = nowPlaying
  return (
    <div className="flex flex-col gap-2 rounded-well bg-black/25 p-3.5">
      {track ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate">
            <span className="font-display text-base font-bold">{track.title ?? "Untitled"}</span>
            {track.artist && <span className="text-body-sm text-muted-foreground"> · {track.artist}</span>}
          </p>
          {progress && <TimeLeft status={status} />}
        </div>
      ) : (
        line && <p className="text-body font-semibold">{line}</p>
      )}
      {progress && <ProgressLine status={status} />}
      {next && <p className="truncate text-caption text-text-faint">Next: {next}</p>}
    </div>
  )
}

function useFrame(status: StationStatus | null, draw: (p: { elapsed: number; duration: number } | null) => void) {
  const read = useTrackProgress(status)
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  })
  useEffect(() => {
    let raf = 0
    const tick = () => {
      drawRef.current(read())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [read])
}

/** Time left on AutoDJ's track, counted per frame. `signed`: "-3:21", for a readout on its own. */
export function TimeLeft({ status, signed = true }: { status: StationStatus | null; signed?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useFrame(status, (p) => {
    if (ref.current) ref.current.textContent = p ? `${signed ? "-" : ""}${formatTrackTime(p.duration - p.elapsed)}` : ""
  })
  return <span ref={ref} aria-hidden className="shrink-0 font-mono text-body-sm font-semibold text-on-air-text tabular-nums" />
}

function ProgressLine({ status }: { status: StationStatus | null }) {
  const bar = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  useFrame(status, (p) => {
    if (wrap.current) wrap.current.style.visibility = p ? "visible" : "hidden"
    if (p && bar.current) bar.current.style.width = `${Math.min(100, (p.elapsed / p.duration) * 100)}%`
  })
  return (
    <div ref={wrap} aria-hidden className="h-1 overflow-hidden rounded-full bg-foreground/8" style={{ visibility: "hidden" }}>
      <div ref={bar} className="h-full rounded-full bg-on-air" style={{ width: "0%" }} />
    </div>
  )
}
