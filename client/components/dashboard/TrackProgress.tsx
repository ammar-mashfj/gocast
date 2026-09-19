"use client"

import { useEffect, useRef } from "react"
import { formatTrackTime } from "@/lib/format"
import { useTrackProgress } from "@/hooks/useTrackProgress"
import type { StationStatus } from "@/interfaces/StationStatus"

/**
 * Where the current AutoDJ track is, as a bar that actually moves.
 *
 * Driven by requestAnimationFrame writing straight into the DOM rather than
 * by React state — the same shape as the studio's own deck. Nothing else on
 * the dashboard needs to re-render sixty times a second so that a bar can
 * advance a pixel, and rAF stops by itself in a background tab, which is the
 * throttling we would otherwise have to write.
 *
 * Renders nothing at all when there is no track length to measure against: a
 * live broadcast has no duration, and the silence bed is one endless `blank()`
 * track where `elapsed` counts silence rather than a position. A bar with
 * nothing behind it is worse than no bar.
 */
export function TrackProgress({ status }: { status: StationStatus | null }) {
  const read = useTrackProgress(status)
  const barRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const remainingRef = useRef<HTMLSpanElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0

    function tick() {
      const progress = read()

      if (wrapRef.current) {
        // Hidden rather than unmounted, so the row appearing and disappearing
        // between tracks never reflows the card around it.
        wrapRef.current.style.display = progress === null ? "none" : ""
      }

      if (progress !== null) {
        const pct = Math.min(100, (progress.elapsed / progress.duration) * 100)
        if (barRef.current) barRef.current.style.width = `${pct}%`
        if (elapsedRef.current) elapsedRef.current.textContent = formatTrackTime(progress.elapsed)
        if (remainingRef.current) {
          remainingRef.current.textContent = `-${formatTrackTime(progress.duration - progress.elapsed)}`
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [read])

  return (
    <div ref={wrapRef} className="flex items-center gap-2.5 pt-1" style={{ display: "none" }}>
      <span
        ref={elapsedRef}
        className="text-xs text-muted-foreground tabular-nums shrink-0"
        // aria-hidden on the whole row: it retimes itself every frame, and a
        // screen reader announcing a clock that never stops changing would
        // bury the track name beside it. The title and "up next" carry the
        // information that matters.
        aria-hidden="true"
      >
        0:00
      </span>
      <div className="flex-1 min-w-[80px] h-1 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div ref={barRef} className="h-full rounded-full bg-primary/70" style={{ width: "0%" }} />
      </div>
      <span
        ref={remainingRef}
        className="text-xs text-muted-foreground tabular-nums shrink-0"
        aria-hidden="true"
      >
        --:--
      </span>
    </div>
  )
}
