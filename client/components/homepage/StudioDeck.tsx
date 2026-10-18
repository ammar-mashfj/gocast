"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerSkipForwardFilled } from "@tabler/icons-react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ds/Dialog"
import { Button } from "@/components/ds/Button"
import { StatTile } from "@/components/ds/Stat"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"

/** A fictional running order. Original titles; nothing here exists. */
const TRACKS = [
  { title: "Night Bus", artist: "The Ember Set", len: 248 },
  { title: "Low Tide", artist: "Marisol", len: 203 },
  { title: "Harmattan", artist: "Kemi Adé", len: 241 },
  { title: "Late Bus Home", artist: "Northline", len: 185 },
  { title: "Paper Moons", artist: "Okafor Trio", len: 222 },
] as const

const STATION = { name: "Late Shift", link: "gocast.fm/station/late-shift" }

/** The real studio's two modes (audioEngine RepeatMode): the queue loops, or one track does. */
type Repeat = "all" | "one"
const NEXT_REPEAT: Record<Repeat, Repeat> = { all: "one", one: "all" }

/** The row the real studio prints under the deck, minus the ones that need
    a monitor device to make sense. */
const KEYS = [
  { key: "Space", label: "talk" },
  { key: "K", label: "play / pause" },
  { key: "N", label: "next" },
  { key: "P", label: "previous" },
  { key: "R", label: "repeat" },
] as const

/** Simulation tick. Ten a second is enough for a countdown and a meter. */
const TICK_MS = 100
/** The real studio's talk-up cue: the countdown turns amber this close to the end. */
const TALK_UP_S = 20
const METER_SEGMENTS = 24

interface Sim {
  playing: boolean
  cur: number
  pos: number
  repeat: Repeat
  micOpen: boolean
  level: number
  showSecs: number
  listeners: number
  peak: number
}

const INITIAL: Sim = {
  playing: true,
  cur: 0,
  pos: 196,
  repeat: "all",
  micOpen: false,
  level: 0,
  showSecs: 32 * 60 + 14,
  listeners: 142,
  peak: 187,
}

function clock(total: number) {
  const s = Math.floor(total)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

function mmss(total: number) {
  const s = Math.max(0, Math.floor(total))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** What the demo deck's QR says when someone actually scans it off the screen. */
const DEMO_QR_MESSAGE =
  "Welcome to GoCast! You just scanned a radio station that doesn't exist (yet). " +
  "Late Shift is only a demo — name yours and it's on air in a minute: https://gocast.fm"

/**
 * A working mock of the on-air deck. Nothing is fetched and no audio plays:
 * a timer walks a fictional running order, the pad opens a pretend mic, the
 * listener count drifts. The point is that every control answers, so a
 * visitor learns what the desk feels like before signing up.
 *
 * It only runs while on screen (IntersectionObserver), and the keyboard
 * shortcuts only apply then — Space on a marketing page must keep scrolling
 * the page until the deck is in front of you.
 */
export function StudioDeck() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [sim, setSim] = useState<Sim>(INITIAL)
  const [inView, setInView] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const togglePlay = useCallback(() => setSim((s) => ({ ...s, playing: !s.playing })), [])
  const next = useCallback(
    () => setSim((s) => ({ ...s, cur: (s.cur + 1) % TRACKS.length, pos: 0, playing: true })),
    [],
  )
  const prev = useCallback(
    () =>
      setSim((s) =>
        s.pos > 3 ? { ...s, pos: 0 } : { ...s, cur: (s.cur - 1 + TRACKS.length) % TRACKS.length, pos: 0 },
      ),
    [],
  )
  const cycleRepeat = useCallback(() => setSim((s) => ({ ...s, repeat: NEXT_REPEAT[s.repeat] })), [])
  const press = useCallback(() => setSim((s) => (s.micOpen ? s : { ...s, micOpen: true })), [])
  const release = useCallback(() => setSim((s) => (s.micOpen ? { ...s, micOpen: false, level: 0 } : s)), [])
  const playAt = useCallback((i: number) => setSim((s) => ({ ...s, cur: i, pos: 0, playing: true })), [])

  const flashKey = useCallback((k: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash(k)
    flashTimer.current = setTimeout(() => setFlash(null), 200)
  }, [])

  // On screen?
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        // Half the deck on screen, or half the screen filled by it: a deck
        // taller than two screens (a phone held sideways) never reaches half
        // its own height, and the demo stayed frozen there.
        const seen = entry.isIntersecting && (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5)
        setInView(seen)
        // Scrolling the deck away with the mic held: let go.
        if (!seen) release()
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [release])

  // The simulation, while on screen.
  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => {
      setSim((s) => {
        const n: Sim = { ...s, showSecs: s.showSecs + TICK_MS / 1000 }
        if (s.micOpen) n.level = 0.35 + Math.random() * 0.55
        if (s.playing) {
          let pos = s.pos + TICK_MS / 1000
          let cur = s.cur
          if (pos >= TRACKS[cur].len) {
            pos = 0
            if (s.repeat === "all") cur = cur + 1 < TRACKS.length ? cur + 1 : 0
          }
          n.pos = pos
          n.cur = cur
        }
        return n
      })
    }, TICK_MS)
    const l = setInterval(() => {
      setSim((s) => {
        const listeners = Math.max(1, s.listeners + Math.round(Math.random() * 6 - 2))
        return { ...s, listeners, peak: Math.max(s.peak, listeners) }
      })
    }, 2400)
    return () => {
      clearInterval(t)
      clearInterval(l)
    }
  }, [inView])

  // Keyboard, while on screen and not typing somewhere.
  useEffect(() => {
    if (!inView) return
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName ?? ""
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return
      // A focused button, link or dialog owns Space (and the letters): the
      // deck's own Copy link, the QR dialog's close, anything on the page.
      // Taking them made those unpressable from the keyboard.
      if (active?.closest("button, a[href], [role=button], [contenteditable=''], [contenteditable=true], [role=dialog]")) return
      if (e.code === "Space") {
        e.preventDefault()
        if (e.type === "keydown" && !e.repeat) press()
        if (e.type === "keyup") release()
        return
      }
      if (e.type !== "keydown" || e.repeat) return
      const k = e.key.toUpperCase()
      const act = { K: togglePlay, N: next, P: prev, R: cycleRepeat }[k]
      if (!act) return
      act()
      flashKey(k)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [inView, press, release, togglePlay, next, prev, cycleRepeat, flashKey])

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  const track = TRACKS[sim.cur]
  const upNext = TRACKS[(sim.cur + 1) % TRACKS.length]
  const left = Math.max(0, track.len - sim.pos)
  const talkUp = sim.playing && left < TALK_UP_S
  const tone = sim.micOpen ? "mic" : sim.playing ? "live" : "warn"
  const queue = TRACKS.map((t, i) => ({ ...t, i })).filter((t) => t.i !== sim.cur)

  return (
    <div
      ref={rootRef}
      id="studio-deck"
      className="flex flex-col gap-3 rounded-hero bg-background p-3 sm:p-4"
      aria-label="A working demo of the studio"
    >
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1.5">
        <div className="flex items-center gap-3.5">
          <StatusLamp tone={tone} variant="solid">
            {sim.micOpen ? "On mic" : sim.playing ? "Live" : "Silence"}
            <span className="font-medium tabular-nums">{clock(sim.showSecs)}</span>
          </StatusLamp>
          <span className="font-display text-heading">{STATION.name}</span>
        </div>
        <span className="font-mono text-caption text-text-faint">{STATION.link}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Left: now playing + the pad */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-card bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow text-text-faint">{sim.playing ? "On air now" : "Paused"}</span>
              <span
                className={cn(
                  "font-mono text-meter-sm tabular-nums",
                  talkUp ? "text-fault-text motion-safe:animate-pulse" : "text-foreground",
                )}
                aria-label={`${mmss(left)} left`}
              >
                −{mmss(left)}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-display text-title-sm">{track.title}</span>
              <span className="text-body-sm text-muted-foreground">{track.artist}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-control" aria-hidden="true">
              <div
                className={cn("h-full rounded-full transition-[width] duration-100 ease-linear", sim.micOpen ? "bg-foreground/35" : "bg-foreground")}
                style={{ width: `${(sim.pos / track.len) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-caption text-text-faint">
                {talkUp ? "Talk up — " : "Up next · "}
                {upNext.title} — {upNext.artist}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="subtle" size="icon" onClick={togglePlay} aria-label={sim.playing ? "Pause" : "Play"}>
                  {sim.playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
                </Button>
                <Button variant="subtle" size="icon" onClick={next} aria-label="Next track">
                  <IconPlayerSkipForwardFilled />
                </Button>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-pressed={sim.micOpen}
            aria-keyshortcuts="Space"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              press()
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.repeat) {
                e.preventDefault()
                press()
              }
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter") release()
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              // flex-1: the pad takes whatever the right column is taller by, so the
              // two columns bottom out together instead of leaving a hole under it.
              "flex min-h-44 w-full flex-1 touch-none select-none flex-col justify-between gap-4 rounded-hero p-5 text-left transition-colors duration-150",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-0",
              // The real pad: a plain card with a speaker grille, red only while the mic is open.
              sim.micOpen
                ? "bg-live grille-live text-live-ink"
                : "bg-card grille text-foreground hover:inset-ring-2 hover:inset-ring-live/35",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-display text-display">{sim.micOpen ? "You’re on" : "Hold anywhere here to talk"}</span>
              {!sim.micOpen && (
                <span className="eyebrow mt-1.5 inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="size-2 rounded-full bg-live" />
                  Mic live while held
                </span>
              )}
            </span>
            <span className="flex flex-col gap-3">
              <span className={cn("text-sm font-medium", sim.micOpen ? "text-live-ink/70" : "text-muted-foreground")}>
                {sim.micOpen ? (
                  "Music ducked under your voice · release to stop"
                ) : (
                  <>
                    <span className="md:hidden">Keep your finger down for as long as you talk</span>
                    <span className="hidden md:inline">Or hold Space while the deck is on screen</span>
                  </>
                )}
              </span>
              <span className="flex h-2 items-stretch gap-0.5" aria-hidden="true">
                {Array.from({ length: METER_SEGMENTS }).map((_, i) => {
                  const lit = sim.micOpen && i < Math.round(sim.level * METER_SEGMENTS)
                  return (
                    <span
                      key={i}
                      className={cn(
                        "flex-1 rounded-swatch",
                        sim.micOpen
                          ? lit
                            ? i >= METER_SEGMENTS - 4
                              ? "bg-foreground"
                              : "bg-live-ink"
                            : "bg-live-ink/22"
                          : "bg-foreground/8",
                      )}
                    />
                  )
                })}
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 text-body-sm text-text-faint">
            <span>
              {sim.micOpen ? "Bed at 20% while you talk" : sim.playing ? "Bed at full level" : "Nothing’s playing right now."}
            </span>
            <span className="font-mono text-caption uppercase tracking-widest">Repeat {sim.repeat}</span>
          </div>
        </div>

        {/* Right: the room */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Listening" value={sim.listeners} sub="right now" />
            <StatTile label="Peak" value={sim.peak} sub="all time" />
          </div>

          <div className="flex flex-col rounded-card bg-surface-raised p-4">
            <span className="eyebrow pt-1 pb-2 text-text-faint">Running order</span>
            <ol>
              {queue.map((t, j) => (
                <li key={t.i}>
                  <button
                    type="button"
                    onClick={() => playAt(t.i)}
                    className="grid min-h-12 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-item border-t border-line px-1 text-left transition-colors outline-none hover:bg-surface-control focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-mono text-caption text-text-faint">{String(j + 1).padStart(2, "0")}</span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-body font-semibold">{t.title}</span>
                      <span className="text-body-sm text-muted-foreground">{t.artist}</span>
                    </span>
                    <span className="font-mono text-caption text-text-faint tabular-nums">{mmss(t.len)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-4 rounded-card bg-surface-raised p-4">
            {/* A real, scannable code. Late Shift is a demo, so it carries a
                note instead of a dead link — with the real site at the end.
                The 72px tile is too small to scan off a screen, so it opens
                a big copy. */}
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  aria-label="Show the QR code bigger"
                  className="aspect-square cursor-zoom-in rounded-item bg-white p-1.5 outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <QRCodeSVG value={DEMO_QR_MESSAGE} size={60} level="L" className="size-full" />
                </button>
              </DialogTrigger>
              <DialogContent size="sm">
                <DialogHeader>
                  <DialogTitle>Scan me</DialogTitle>
                  <DialogDescription>Point your phone camera at it.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-center">
                  <div className="rounded-card bg-white p-5">
                    <QRCodeSVG value={DEMO_QR_MESSAGE} size={280} level="L" marginSize={2} title="Demo QR code" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <div className="flex min-w-0 flex-col gap-2.5">
              <span className="truncate font-mono text-body-sm">{STATION.link}</span>
              <Button
                variant="subtle"
                size="md"
                className="self-start"
                onClick={() => toast("That one is a demo. Your station gets its own link the moment you name it.")}
              >
                Copy link
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Shortcut row. Hidden below md: a phone has no keyboard, and that is
          also where the deck collapses to one column. */}
      <div className="hidden flex-wrap items-center gap-x-4.5 gap-y-2 px-2 md:flex">
        {KEYS.map((k) => {
          const lit = k.key === "Space" ? sim.micOpen : flash === k.key
          const run = { Space: null, K: togglePlay, N: next, P: prev, R: cycleRepeat }[k.key]
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => {
                if (run) {
                  run()
                  flashKey(k.key)
                } else {
                  toast("Hold the pad, or hold Space, to talk.")
                }
              }}
              className="flex min-h-11 items-center gap-2 text-body-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <kbd
                className={cn(
                  "min-w-8 rounded-tag px-2 py-1.5 text-center font-mono text-caption font-semibold transition-colors",
                  lit ? "bg-foreground text-background" : "bg-surface-control text-foreground",
                )}
              >
                {k.key}
              </kbd>
              {k.label}
            </button>
          )
        })}
        <span className="ml-auto font-mono text-caption text-text-faint">Shortcuts work while the deck is on screen.</span>
      </div>
    </div>
  )
}
