"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/** Bottom of the scale. Anything quieter reads as no signal at all. */
const FLOOR_DB = -60
const SEGMENTS = 30
/** How long the peak marker holds before it starts to fall. */
const PEAK_HOLD_MS = 1200
/** Fall rates, in dB per second — fast enough to follow speech, slow enough to read. */
const LEVEL_RELEASE_DB_S = 24
const PEAK_RELEASE_DB_S = 18
/** Screen readers get the level at a human pace, not at frame rate. */
const ARIA_EVERY_MS = 750

const SCALE = [-48, -24, -12, -6, 0]

/**
 * The mobile talk pad's meter (Console.tsx). On a dark card it is a traffic
 * light: green, amber from −12 dB, red from −6. On a solid red surface
 * (`onRed`) it is drawn in the red's dark ink, the hottest segments in a
 * warm white.
 */
const COLORS = {
  unlit: "#2A2723",
  ok: "#5FD39A",
  warm: "#FFB547",
  hot: "#FF5A4E",
  openUnlit: "rgba(26,8,6,0.22)",
  openOn: "#1A0806",
  openHot: "#FFF1E0",
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
 * meter (zeroed until the mic opened) could never do. See COLORS for how
 * each state is drawn.
 *
 * Drawn on a canvas from its own rAF loop. The previous meter pushed levels
 * through React state sixty times a second, which re-rendered the whole deck
 * at frame rate to move a few bars.
 */
export function MicMeter({
  stream,
  open,
  onRed = false,
  className,
}: {
  stream: MediaStream | null
  open: boolean
  /** Drawn on a solid red surface: ink segments instead of the traffic light. */
  onRed?: boolean
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const meterRef = useRef<HTMLSpanElement>(null)
  const openRef = useRef(open)
  const onRedRef = useRef(onRed)

  useEffect(() => {
    openRef.current = open
    onRedRef.current = onRed
  }, [open, onRed])

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
      const red = onRedRef.current
      g.clearRect(0, 0, width, height)
      const gap = 3
      const segW = (width - gap * (SEGMENTS - 1)) / SEGMENTS
      const lit = Math.round(toPct(level) * SEGMENTS)
      for (let i = 0; i < SEGMENTS; i++) {
        const segDb = FLOOR_DB + ((i + 1) / SEGMENTS) * -FLOOR_DB
        const on = i < lit
        const hot = segDb > -6
        const color = red
          ? on ? (hot ? COLORS.openHot : COLORS.openOn) : COLORS.openUnlit
          : on ? (hot ? COLORS.hot : segDb > -12 ? COLORS.warm : COLORS.ok) : COLORS.unlit
        g.fillStyle = color
        g.beginPath()
        g.roundRect(i * (segW + gap), 0, segW, height, 2)
        g.fill()
      }
      if (peak > FLOOR_DB + 1) {
        const x = toPct(peak) * width
        g.fillStyle = red ? COLORS.openOn : peak > -1 ? COLORS.hot : "#F4F1EC"
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
    // Spans, not divs: the meter sits inside the talk pad, which is a button.
    <span
      ref={meterRef}
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={FLOOR_DB}
      aria-valuemax={0}
      aria-valuenow={FLOOR_DB}
      className={cn("@container flex flex-col gap-1.5", className)}
    >
      <canvas ref={canvasRef} className="block h-6 w-full" />
      {/* The scale takes its colour from the pad around it. */}
      <span className="relative block h-3.5 font-mono text-[11px] leading-none tabular-nums" aria-hidden>
        {SCALE.map((db) => (
          <span
            key={db}
            // -12, -6 and 0 share the top quarter; on a narrow meter the
            // middle one collides with both, so it goes.
            className={cn("absolute top-0 -translate-x-1/2 last:translate-x-[-100%]", db === -6 && "@max-[18rem]:hidden")}
            style={{ left: `${toPct(db) * 100}%` }}
          >
            {db}
          </span>
        ))}
      </span>
    </span>
  )
}
