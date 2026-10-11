"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const SEGMENTS = 24
/** The comp drifts its level every 80 ms; this smooths toward a new target
    so the bar wanders like programme audio rather than flickering. */
const TICK_MS = 80
const REDUCED_MOTION_LEVEL = 0.55

/**
 * The design system's LevelMeter, as the hero wears it: 24 segments that
 * step up from left to right, green through the body, amber for the last six
 * and red for the last three, unlit segments on the control surface.
 *
 * The level is simulated. The stream is cross-origin, so an AnalyserNode on
 * the <audio> element would read silence (or taint it) without CORS headers
 * on the mount; the meter only exists while audio is genuinely playing, so
 * what it claims — "there is signal" — is still true. It freezes at a static
 * mid level under prefers-reduced-motion rather than going flat, which would
 * read as no signal.
 */
export function HeroLevelMeter({ className }: { className?: string }) {
  const [level, setLevel] = useState(REDUCED_MOTION_LEVEL)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let current = REDUCED_MOTION_LEVEL
    let target = current
    const t = setInterval(() => {
      // New target most ticks, with occasional dips so the top end goes dark.
      if (Math.random() < 0.6) target = Math.random() < 0.15 ? 0.2 + Math.random() * 0.2 : 0.4 + Math.random() * 0.5
      current += (target - current) * 0.45
      setLevel(current)
    }, TICK_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={cn("flex h-2 items-end gap-0.75", className)} aria-hidden="true">
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const on = i / SEGMENTS < level
        const hot = i >= SEGMENTS - 3
        const warm = i >= SEGMENTS - 6
        return (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[2px]",
              !on ? "bg-surface-strong" : hot ? "bg-live" : warm ? "bg-fault" : "bg-ok",
            )}
            style={{ height: `${40 + (i / (SEGMENTS - 1)) * 60}%` }}
          />
        )
      })}
    </div>
  )
}
