"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"

const TAU = Math.PI * 2
const TOP = -Math.PI / 2
/** Under this many seconds the ring goes to full white — see the deck's talk-up cue. */
const ENDING_SOON_S = 20

/**
 * The track dial: one ring, one meaning. It is the track on air, full when
 * the track starts and draining clockwise to empty as it plays, around the
 * time-left number the broadcaster is really watching.
 *
 * It replaced a two-ring hot clock (the wall-clock hour outside, the track
 * inside) that hosts couldn't read mid-show: neither ring said what it was.
 * A dial that does one job needs no legend.
 *
 * Canvas on its own rAF loop, like the mic meter: it reads the engine every
 * frame and nothing re-renders to move it.
 */
export function TrackDial({ size, children }: { size: number; children: ReactNode }) {
  const { engine } = useBroadcast()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext("2d")
    if (!canvas || !g || !engine) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)

    const c = size / 2
    const w = size > 140 ? 8 : 6
    const r = c - w / 2 - 1

    let raf = 0
    const draw = () => {
      g.clearRect(0, 0, size, size)

      // The unlit track: what the ring drains into.
      g.beginPath()
      g.strokeStyle = "rgba(255,255,255,0.07)"
      g.lineWidth = w
      g.arc(c, c, r, 0, TAU)
      g.stroke()

      const current = engine.getCurrentTrack()
      const duration = current?.duration ?? 0
      if (duration > 0) {
        const left = Math.max(0, duration - engine.getElapsed())
        const frac = left / duration
        if (frac > 0.002) {
          g.beginPath()
          g.strokeStyle = left <= ENDING_SOON_S ? "#ffffff" : "rgba(255,255,255,0.8)"
          g.lineWidth = w
          g.lineCap = "round"
          g.arc(c, c, r, TOP, TOP + frac * TAU)
          g.stroke()
          g.lineCap = "butt"
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [engine, size])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Decorative: the number inside says the same thing in words. */}
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0" style={{ width: size, height: size }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
