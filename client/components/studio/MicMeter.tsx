"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/** Bottom of the scale. Anything quieter reads as no signal at all. */
const FLOOR_DB = -60
const SEGMENTS = 40
/** How long the peak marker holds before it starts to fall. */
const PEAK_HOLD_MS = 1200
/** Fall rates, in dB per second — fast enough to follow speech, slow enough to read. */
const LEVEL_RELEASE_DB_S = 24
const PEAK_RELEASE_DB_S = 18
/** Screen readers get the level at a human pace, not at frame rate. */
const ARIA_EVERY_MS = 750

const SCALE = [-48, -24, -12, -6, 0]

const COLORS = {
  unlit: "rgba(255,255,255,0.06)",
  // Level check: the mic is hearing you, but none of it is going out.
  check: "rgba(255,255,255,0.32)",
  open: "#38bdf8",
  hot: "#e0f2fe",
  clip: "#ff6467",
}

function toPct(db: number) {
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB))
}

/**
 * The mic meter, measured in dBFS off the microphone itself.
 *
 * It taps the MediaStream rather than the mixer, before the talk-button gain,
 * so it answers "is it hearing me?" whether or not the mic is open — the
 * broadcaster can check their level with nothing going out, which the old
 * meter (zeroed until the mic opened) could never do. Closed, it draws in
 * grey; open, in the mic's sky.
 *
 * Drawn on a canvas from its own rAF loop. The previous meter pushed levels
 * through React state sixty times a second, which re-rendered the whole deck
 * at frame rate to move a few bars.
 */
export function MicMeter({
  stream,
  open,
  className,
}: {
  stream: MediaStream | null
  open: boolean
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext("2d")
    if (!g) return

    let width = 0
    let height = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const tracks = stream?.getAudioTracks() ?? []
    let ctx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let buf: Float32Array<ArrayBuffer> | null = null
    if (stream && tracks.length > 0) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
      source = ctx.createMediaStreamSource(stream)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      buf = new Float32Array(analyser.fftSize)
    }

    // The studio is reached by a redirect, not a tap, so a browser that wants
    // a gesture (iOS Safari) creates this context suspended and the meter
    // reads "No signal" off a working mic. Wake it on the first gesture.
    const wake = () => {
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {})
    }
    wake()
    document.addEventListener("pointerdown", wake)
    document.addEventListener("keydown", wake)

    let level = FLOOR_DB
    let peak = FLOOR_DB
    let peakAt = 0
    let last = performance.now()
    let lastAria = 0
    let raf = 0

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      let instant = FLOOR_DB
      if (analyser && buf) {
        analyser.getFloatTimeDomainData(buf)
        let max = 0
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i])
          if (v > max) max = v
        }
        instant = max > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(max)) : FLOOR_DB
      }
      // Instant attack, steady release — a peak programme meter, not an average.
      level = instant > level ? instant : Math.max(instant, level - LEVEL_RELEASE_DB_S * dt)
      if (instant >= peak) {
        peak = instant
        peakAt = now
      } else if (now - peakAt > PEAK_HOLD_MS) {
        peak = Math.max(level, peak - PEAK_RELEASE_DB_S * dt)
      }

      const isOpen = openRef.current
      g.clearRect(0, 0, width, height)
      const gap = 2
      const segW = (width - gap * (SEGMENTS - 1)) / SEGMENTS
      const lit = Math.round(toPct(level) * SEGMENTS)
      for (let i = 0; i < SEGMENTS; i++) {
        const segDb = FLOOR_DB + ((i + 1) / SEGMENTS) * -FLOOR_DB
        let color = COLORS.unlit
        if (i < lit) {
          if (!isOpen) color = COLORS.check
          else if (segDb > -1) color = COLORS.clip
          else if (segDb > -6) color = COLORS.hot
          else color = COLORS.open
        }
        g.fillStyle = color
        // Hot and clipping segments glow while the mic is open — the level a
        // host should back off from is the one that catches the eye.
        g.shadowColor = color
        g.shadowBlur = isOpen && i < lit && segDb > -6 ? 6 : 0
        g.beginPath()
        g.roundRect(i * (segW + gap), 0, segW, height, 1.5)
        g.fill()
      }
      g.shadowBlur = 0
      if (peak > FLOOR_DB + 1) {
        const x = toPct(peak) * width
        g.fillStyle = !isOpen ? "rgba(255,255,255,0.6)" : peak > -1 ? COLORS.clip : "#ffffff"
        g.fillRect(Math.min(width - 2, x - 1), 0, 2, height)
      }

      if (meterRef.current && now - lastAria > ARIA_EVERY_MS) {
        lastAria = now
        const db = Math.round(level)
        meterRef.current.setAttribute("aria-valuenow", String(db))
        meterRef.current.setAttribute(
          "aria-valuetext",
          level <= FLOOR_DB + 1
            ? "No signal"
            : `${db} dB${peak > -1 ? ", clipping" : ""}, mic ${isOpen ? "open" : "closed"}`,
        )
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("pointerdown", wake)
      document.removeEventListener("keydown", wake)
      ro.disconnect()
      source?.disconnect()
      void ctx?.close()
    }
  }, [stream])

  return (
    <div
      ref={meterRef}
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={FLOOR_DB}
      aria-valuemax={0}
      aria-valuenow={FLOOR_DB}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <canvas ref={canvasRef} className="block h-4 w-full" />
      <div className="relative h-3.5 font-mono text-[11px] leading-none text-muted-foreground tabular-nums" aria-hidden>
        {SCALE.map((db) => (
          <span
            key={db}
            className="absolute top-0 -translate-x-1/2 last:translate-x-[-100%]"
            style={{ left: `${toPct(db) * 100}%` }}
          >
            {db}
          </span>
        ))}
      </div>
    </div>
  )
}
