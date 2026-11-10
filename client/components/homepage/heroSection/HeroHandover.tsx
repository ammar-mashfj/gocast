"use client"

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { ProTag } from "@/components/ds/Tag"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The hero's handover loop: a 3-2-1, you're live — your own files playing,
 * then your voice over them with the music dipped — then you end the show and
 * AutoDJ takes the station over. Going
 * live is the free part, so it comes first; AutoDJ is what covers the rest of
 * the week. Nothing is fetched and nothing
 * plays; it is a picture of the one thing GoCast does that a plain stream
 * host doesn't.
 *
 * One 20-second loop drives three things that sit in different parts of the
 * hero: the glow behind it, the step chips beside the headline and the
 * floating studio. HeroStage owns the clock and hands the frame down through
 * context, so the copy between them stays server-rendered.
 */

type Phase = "autodj" | "count" | "live"

interface Frame {
  phase: Phase
  /** 3, 2, 1 during the countdown. */
  count: number
  /** Seconds on air, for the clock. */
  liveSecs: number
  listeners: number
  /** While live: false while your files play on their own, true once you
      hold the mic over them. */
  mic: boolean
  /** How far through the current step, 0–1: the chips' and bars' timer. */
  step: number
  /** Whole seconds until the next change (the next beat, not just the next
      step), for the "what's next" line. 0 when nothing is coming (reduced motion). */
  nextIn: number
  /** Where the playing track is, 0–1. */
  track: number
}

const LOOP_S = 20
const COUNT_END_S = 3
/** Step 02 in two beats: your music (3–8s), then you on the mic over it (8–14s). */
const MIC_AT_S = 8
const LIVE_END_S = 14
const TICK_MS = 250
/** The desktop stack's resting angle (globals.css, .hero-tilt) and how much
    of the way to the pointer's angle it covers each frame. */
const TILT_REST_Y = -20
const TILT_REST_X = 10
const TILT_EASE = 0.35

/**
 * Small, slow numbers on purpose. A believable station has a handful of
 * people on; the scene sells the handover, not the size of the audience,
 * and Free stations top out at 25 anyway. One more listener every 2.5s once
 * live, from 3 to 7, and AutoDJ keeps all 7 when the show ends.
 */
const START_LISTENERS = 3
const LISTENER_STEP_S = 2.5
const MAX_NEW_LISTENERS = 4

const FIRST_FRAME: Frame = {
  phase: "count",
  count: 3,
  liveSecs: 0,
  listeners: START_LISTENERS,
  mic: false,
  step: 0,
  nextIn: 3,
  track: 0.3,
}
/** Reduced motion holds on the payoff: live, a few people in. */
const STILL_FRAME: Frame = {
  phase: "live",
  count: 1,
  liveSecs: 42,
  listeners: 7,
  mic: true,
  step: 0.5,
  nextIn: 0,
  track: 0.62,
}

function frameAt(p: number): Frame {
  const track = 0.3 + (p / LOOP_S) * 0.4
  const until = (t: number) => Math.max(1, Math.ceil(t - p))
  if (p < COUNT_END_S)
    return {
      ...FIRST_FRAME,
      count: 3 - Math.floor(p),
      step: p / COUNT_END_S,
      nextIn: until(COUNT_END_S),
      track,
    }
  if (p >= LIVE_END_S) {
    return {
      phase: "autodj",
      count: 1,
      liveSecs: 0,
      listeners: START_LISTENERS + MAX_NEW_LISTENERS,
      mic: false,
      step: (p - LIVE_END_S) / (LOOP_S - LIVE_END_S),
      nextIn: until(LOOP_S),
      track,
    }
  }
  const on = p - COUNT_END_S
  return {
    phase: "live",
    count: 1,
    liveSecs: Math.floor(on),
    listeners: START_LISTENERS + Math.min(MAX_NEW_LISTENERS, Math.floor((on + 1) / LISTENER_STEP_S)),
    mic: p >= MIC_AT_S,
    step: on / (LIVE_END_S - COUNT_END_S),
    nextIn: until(p < MIC_AT_S ? MIC_AT_S : LIVE_END_S),
    track,
  }
}

function sameFrame(a: Frame, b: Frame) {
  return (
    a.phase === b.phase &&
    a.count === b.count &&
    a.liveSecs === b.liveSecs &&
    a.listeners === b.listeners &&
    a.mic === b.mic &&
    a.step === b.step &&
    a.nextIn === b.nextIn &&
    a.track === b.track
  )
}

function clock(secs: number) {
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`
}

const FrameContext = createContext<Frame>(FIRST_FRAME)

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

/** Reduced motion, read on the client only (the server renders the moving version). */
export function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}

/**
 * The hero's <section>: runs the loop while it is on screen and the tab is
 * visible, paints the glow, and leans the 3D stack toward the pointer
 * (written straight to the layer once a frame, no re-render per mouse move).
 */
export function HeroStage({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [loopFrame, setFrame] = useState<Frame>(FIRST_FRAME)
  const still = useReducedMotion()
  const frame = still ? STILL_FRAME : loopFrame

  useEffect(() => {
    const el = ref.current
    if (!el || still) return

    let inView = true
    let elapsed = 0
    let last = performance.now()
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
    })
    io.observe(el)

    const t = setInterval(() => {
      const now = performance.now()
      // Off screen or in a background tab, the loop waits where it is
      // instead of jumping ahead when it comes back.
      if (inView && !document.hidden) elapsed += Math.min(now - last, 1000)
      last = now
      const next = frameAt((elapsed / 1000) % LOOP_S)
      setFrame((f) => (sameFrame(f, next) ? f : next))
    }, TICK_MS)

    return () => {
      clearInterval(t)
      io.disconnect()
    }
  }, [still])

  // Lean toward the pointer, from lg where there is one. The angle is
  // written straight onto the tilted layer, at most once a frame, eased in
  // JS. Not a CSS transition fed by variables on this section: Chrome drew
  // one frame at the wrong angle whenever a variable changed mid-transition,
  // which read as the cards flickering under the mouse.
  const aim = useRef({ x: 0, y: 0 })
  const at = useRef({ x: 0, y: 0 })
  const raf = useRef(0)
  const ease = () => {
    const el = ref.current?.querySelector<HTMLElement>(".hero-tilt")
    if (!el) return
    const a = aim.current
    const c = at.current
    c.x += (a.x - c.x) * TILT_EASE
    c.y += (a.y - c.y) * TILT_EASE
    const done = Math.abs(a.x - c.x) < 0.0005 && Math.abs(a.y - c.y) < 0.0005
    if (done) Object.assign(c, a)
    if (done && a.x === 0 && a.y === 0) {
      // Back at rest: hand the layer back to the stylesheet.
      el.style.removeProperty("transform")
      el.style.removeProperty("transition")
    } else {
      el.style.transition = "none"
      el.style.transform = `rotateY(${(TILT_REST_Y + c.x * 24).toFixed(3)}deg) rotateX(${(TILT_REST_X - c.y * 14).toFixed(3)}deg)`
    }
    raf.current = done ? 0 : requestAnimationFrame(ease)
  }
  const steer = (x: number, y: number) => {
    aim.current = { x, y }
    if (!raf.current) raf.current = requestAnimationFrame(ease)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const tilt = (e: React.MouseEvent<HTMLElement>) => {
    if (still || !window.matchMedia("(min-width: 64rem) and (hover: hover) and (pointer: fine)").matches) return
    const r = e.currentTarget.getBoundingClientRect()
    steer((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5)
  }
  const untilt = () => steer(0, 0)

  // The section fills the screen under the sticky navbar (min-h-17 plus its
  // 1px rule) and centres the hero in it.
  return (
    <section
      ref={ref}
      id="top"
      data-phase={frame.phase}
      onMouseMove={tilt}
      onMouseLeave={untilt}
      className={cn("relative flex min-h-[calc(100svh-4.3125rem)] scroll-mt-17 items-center overflow-hidden [contain:paint]", className)}
    >
      {/* One glow: its colour follows data-phase (globals.css, .hero-glow). */}
      <div aria-hidden className="hero-glow" />
      <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
    </section>
  )
}

const STEPS: { phase: Phase; num: string; label: string; secs: number }[] = [
  { phase: "count", num: "01", label: "Go live", secs: COUNT_END_S },
  { phase: "live", num: "02", label: "You’re on", secs: LIVE_END_S - COUNT_END_S },
  { phase: "autodj", num: "03", label: "AutoDJ", secs: LOOP_S - LIVE_END_S },
]

/**
 * The three chips under the headline. The current one lights up and a bar
 * along its bottom edge fills as the step runs, so the loop shows how long
 * each part lasts.
 */
export function HandoverSteps({ className }: { className?: string }) {
  const { phase, step } = useContext(FrameContext)
  return (
    <TooltipProvider>
      <ol className={cn("flex flex-wrap gap-2 sm:gap-2.5", className)} aria-label="Go live, you’re on, AutoDJ">
        {STEPS.map((s) => {
          const on = phase === s.phase
          const dj = s.phase === "autodj"
          const chip = (
            <li
              key={s.phase}
              tabIndex={dj ? 0 : undefined}
              className={cn(
                "relative inline-flex h-8 items-center gap-2 overflow-hidden rounded-chip px-2.5 font-mono sm:px-3 text-caption font-semibold tracking-widest uppercase transition-colors duration-200",
                !on ? "bg-foreground/8 text-muted-foreground" : dj ? "bg-foreground text-background" : "bg-live text-live-ink",
              )}
            >
              <span>
                {/* Phones drop the numbers so the three chips fit one row at 390. */}
                <span className="hidden sm:inline">{s.num} </span>
                {s.label}
              </span>
              {dj && <ProTag />}
              {on && (
                <span aria-hidden className={cn("absolute inset-x-0 bottom-0 h-0.75", dj ? "bg-background/15" : "bg-live-ink/20")}>
                  <span
                    className={cn("block h-full transition-[width] duration-250 ease-linear", dj ? "bg-background/60" : "bg-live-ink/70")}
                    style={{ width: `${step * 100}%` }}
                  />
                </span>
              )}
            </li>
          )
          if (!dj) return chip
          return (
            <Tooltip key={s.phase}>
              <TooltipTrigger asChild>{chip}</TooltipTrigger>
              <TooltipContent sideOffset={6}>AutoDJ is a Pro feature</TooltipContent>
            </Tooltip>
          )
        })}
      </ol>
    </TooltipProvider>
  )
}

/**
 * What changes next, and when: "Your music’s playing — mic opens in 4s".
 * Sits by the cards, not the copy: that is where people are looking.
 * Says what is coming, so a visitor waits for it and the change makes sense
 * when it lands. Hidden from screen readers (it would announce every
 * second) and under reduced motion, where nothing changes.
 */
function NextLine({ className }: { className?: string }) {
  const { phase, mic, nextIn } = useContext(FrameContext)
  if (!nextIn) return null
  const [now, next] =
    phase === "count"
      ? ["", "Going live in"]
      : phase === "autodj"
        ? ["AutoDJ has it", "going live again in"]
        : mic
          ? ["You’re talking", "show ends in"]
          : ["Your music’s playing", "mic opens in"]
  return (
    <p aria-hidden className={cn("flex items-center gap-2 text-body-sm text-muted-foreground lg:text-body", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", phase === "autodj" ? "bg-on-air" : "bg-live")} />
      <span key={now || next} className="lamp-settle inline-block">
        {now && <span className="text-foreground">{now} — </span>}
        {next} <span className="font-mono tabular-nums text-foreground">{nextIn}s</span>
      </span>
    </p>
  )
}

/** The stack's layout box: the cards plus their overhang, at full size.
    Phones fit a wider box: their sway swings the front card further out. */
const STACK_W = 500
const STACK_W_PHONE = 560
/** The stack's unscaled height below lg (38rem: the cards spread further
    there, see the back layer) and the smallest it may get on a phone to fit
    the screen. */
const STACK_H_PHONE = 608
const MIN_PHONE_SCALE = 0.55

/**
 * The studio, pulled apart: the now-playing card, the talk pad and the
 * listener count: three layers at different depths, tilted (globals.css,
 * .hero-tilt), leaning toward the pointer from lg. Phones get the very same
 * composition, scaled down to fit the column — not a restacked one.
 * Decorative: the copy beside it says everything it shows.
 */
export function HandoverStack({ className }: { className?: string }) {
  const f = useContext(FrameContext)
  const live = f.phase === "live"
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)

  // Fit the desktop composition to the column. Until this runs, globals.css
  // supplies a phone-sized guess (.hero-scale), so nothing overflows first.
  // Below lg it also fits the height the section leaves under the button, so
  // the whole hero sits on one screen where the phone is tall enough; short
  // phones stop at MIN_PHONE_SCALE and let the cards run off the bottom
  // rather than shrink past readable.
  useEffect(() => {
    const el = box.current
    const grid = el?.closest<HTMLElement>(".grid")
    const section = el?.closest("section")
    if (!el || !grid || !section) return
    const fit = () => {
      const w = el.getBoundingClientRect().width
      if (window.matchMedia("(min-width: 64rem)").matches) return setScale(Math.min(1, w / STACK_W))
      // Measured from the top of the content, not the section, which centres
      // it: shrinking the stack would move it and change the answer.
      const above = el.getBoundingClientRect().top - grid.getBoundingClientRect().top
      const room = Number.parseFloat(getComputedStyle(section).minHeight) - above - Number.parseFloat(getComputedStyle(grid).paddingBottom)
      setScale(Math.min(1, w / STACK_W_PHONE, Math.max(MIN_PHONE_SCALE, room / STACK_H_PHONE)))
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener("resize", fit)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [])

  return (
    <div aria-hidden className={cn("flex flex-col items-center", className)}>
      {/* Phones: no step chips, just what's next — flat, outside the tilted layer. */}
      <NextLine className="mb-2 w-full lg:hidden" />
      <div
        ref={box}
        className="hero-scale relative h-[calc(38rem*var(--hero-scale))] w-full lg:h-[calc(35rem*var(--hero-scale))]"
        style={scale === null ? undefined : ({ "--hero-scale": scale } as React.CSSProperties)}
      >
        <div className="absolute top-0 left-1/2 flex h-140 w-125 -translate-x-1/2 origin-top scale-(--hero-scale) items-center justify-center perspective-distant">
          <div className="hero-tilt relative h-130 w-110">
            {/* Now playing — the back layer. Below lg the three layers are
                spaced evenly, 20px apart with no overlap (the front one moves
                down to match): at phone size the gaps are what read as depth.
                lg keeps its own spread. */}
            <div
              data-depth="back"
              className="absolute -top-2.5 -right-2.5 flex w-75 flex-col lg:-top-12.5 gap-3.5 rounded-card bg-surface-raised p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3">
                {/* Red from the countdown on, like the glow; violet only once AutoDJ has it. */}
                {f.phase === "count" ? (
                  <StatusLamp tone="live" variant="solid">
                    Going live
                  </StatusLamp>
                ) : live && f.mic ? (
                  <StatusLamp tone="mic" variant="solid" className="lamp-settle">
                    Mic live
                  </StatusLamp>
                ) : live ? (
                  <StatusLamp tone="live" variant="solid" className="lamp-settle">
                    Live
                  </StatusLamp>
                ) : (
                  <StatusLamp tone="onair" variant="solid" className="lamp-settle">
                    On air · AutoDJ
                  </StatusLamp>
                )}
                <span className="font-mono text-meter-sm tabular-nums">{clock(f.liveSecs)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="size-11 shrink-0 rounded-item bg-surface-control" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="truncate font-display text-base font-bold">
                    {live ? "Night Bus" : "Morning Coffee"}
                    {live && <span className="text-muted-foreground">{f.mic ? " · ducked" : " · from your laptop"}</span>}
                  </span>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-strong">
                    <div
                      className={cn("h-full transition-[width] duration-250 ease-linear", f.phase === "autodj" ? "bg-on-air" : "bg-live")}
                      style={{ width: `${f.track * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* The middle layer: the countdown, the studio while you're on (your
            files, and the pad under them), then AutoDJ's queue once the show
            ends — nobody is at the pad by then. */}
            <div className="absolute top-32.5 left-0 h-75 w-105 rounded-hero shadow-2xl">
              <div key={f.phase} className="hero-swap size-full">
                {f.phase === "count" ? (
                  <div className="flex size-full flex-col items-center justify-center gap-2.5 rounded-hero bg-live">
                    <span
                      key={f.count}
                      className="lamp-settle font-mono text-[9.375rem] leading-none font-bold tracking-tight text-live-ink"
                    >
                      {f.count}
                    </span>
                    <span className="eyebrow text-live-deep">Going live</span>
                  </div>
                ) : live ? (
                  <LiveStudio mic={f.mic} liveSecs={f.liveSecs} nudge={!f.mic && f.nextIn <= 2} />
                ) : (
                  <AutoDJQueue />
                )}
              </div>
            </div>

            {/* Listening now — the front layer. */}
            <div
              data-depth="front"
              className="absolute -bottom-15.5 -left-7.5 flex w-57.5 lg:-bottom-2.5 flex-col items-start gap-2.5 rounded-panel bg-surface-control p-4 shadow-2xl"
            >
              <span className="eyebrow text-muted-foreground">Listening now</span>
              <span className="font-mono text-meter-lg tabular-nums">{f.listeners}</span>
              <span className="text-body-sm text-muted-foreground">
                {live ? "Your link, in their browser." : f.phase === "autodj" ? "Still here, on AutoDJ." : "Waiting for you."}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Desktop's "what's next", flat under the tilted cards, on the right
          where the eye already is (phones get it with the chips, above). */}
      <NextLine className="mt-4 hidden self-end lg:flex" />
    </div>
  )
}

/** Your own queue: the studio plays files straight from your computer. The
    titles are the homepage studio demo's (StudioDeck), all fictional. */
const YOUR_FILES = [
  { title: "Night Bus", artist: "The Ember Set", len: 248 },
  { title: "Low Tide", artist: "Marisol", len: 203 },
] as const

function mmss(secs: number) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
}

/**
 * The middle card for all of step 02, as the real studio lays it out: your
 * files on top, the talk pad under them. The pad waits, grey, while your music
 * plays, then opens red when you talk over it. One card, so nothing jumps.
 */
function LiveStudio({ mic, liveSecs, nudge }: { mic: boolean; liveSecs: number; nudge: boolean }) {
  return (
    <div className="lamp-settle flex size-full flex-col gap-3 rounded-hero bg-card p-5">
      <span className="eyebrow inline-flex items-center gap-2 text-live-text">
        <span className="size-2 rounded-full bg-live" />
        Live · Your files
      </span>
      <ol className="flex flex-col">
        {YOUR_FILES.map((t, i) => {
          const playing = i === 0
          return (
            <li key={t.title} className="flex items-center gap-3 border-t border-line py-2">
              <span className={cn("w-3 font-mono text-caption", playing ? "text-live-text" : "text-text-faint")}>
                {playing ? "▶" : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-body">
                <span className={cn("font-semibold", playing && "text-live-text")}>{t.title}</span>
                <span className="text-muted-foreground"> — {t.artist}</span>
              </span>
              <span className="font-mono text-caption text-text-faint tabular-nums">{mmss(playing ? t.len - 56 - liveSecs : t.len)}</span>
            </li>
          )
        })}
      </ol>
      <div
        className={cn(
          "flex flex-1 flex-col justify-between gap-3 rounded-panel p-4 transition-colors duration-150",
          mic ? "bg-live text-live-ink grille-live" : "bg-surface-control text-foreground grille",
          // The last two seconds before the mic opens: the pad knocks, so the
          // eye is on it when it turns red.
          nudge && "pad-nudge",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-title">{mic ? "You’re on" : "Hold to talk"}</span>
            <span className={cn("text-body-sm", mic ? "text-live-deep" : "text-muted-foreground")}>
              {mic ? "Let go to close the mic" : "The music dips while you talk."}
            </span>
          </div>
          {!mic && (
            <span className="eyebrow mt-1 inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-live" />
              Live while held
            </span>
          )}
        </div>
        <PadMeter open={mic} className="h-6" />
      </div>
    </div>
  )
}

/** What AutoDJ plays after the show. Fictional, like everything here. */
const UP_NEXT = [
  { title: "Station ID", len: "0:12" },
  { title: "Drivetime set", len: "3:41" },
  { title: "Weekend Brunch", len: "4:12" },
] as const

/** The middle card once the show ends: AutoDJ has the station, here's what's next. */
function AutoDJQueue() {
  return (
    <div className="lamp-settle flex size-full flex-col justify-between gap-4 rounded-hero bg-card p-5">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow inline-flex items-center gap-2 text-on-air-text">
          <span className="size-2 rounded-full bg-on-air" />
          AutoDJ has the station
        </span>
        <span className="font-display text-display">Up next</span>
      </div>
      <ol className="flex flex-col">
        {UP_NEXT.map((t, i) => (
          <li key={t.title} className="flex items-center gap-3 border-t border-line py-2.5">
            <span className="font-mono text-caption text-text-faint">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{t.title}</span>
            <span className="font-mono text-caption text-text-faint tabular-nums">{t.len}</span>
          </li>
        ))}
      </ol>
      <span className="text-sm font-medium text-muted-foreground">Go live any time — it steps aside.</span>
    </div>
  )
}

const SEGMENTS = 30
const METER_TICK_MS = 90

/**
 * The pad's level meter, the studio's on red: dark ink segments, the top
 * three cream. Its own state, so only it re-renders at meter speed, and only
 * while the mic is open.
 */
export function PadMeter({ open, className }: { open: boolean; className?: string }) {
  const [moving, setLevel] = useState(0)
  const still = useReducedMotion()
  const level = still ? 0.6 : moving

  useEffect(() => {
    if (!open || still) return
    let current = 0.3
    const t = setInterval(() => {
      current = Math.max(0.15, Math.min(0.97, current * 0.45 + (0.35 + Math.random() * 0.6) * 0.55))
      setLevel(current)
    }, METER_TICK_MS)
    return () => {
      clearInterval(t)
      setLevel(0)
    }
  }, [open, still])

  return (
    <span className={cn("flex h-8.5 items-end gap-0.75", className)}>
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const lit = open && i / SEGMENTS < level
        return (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[2px]",
              !open ? "bg-foreground/8" : !lit ? "bg-live-ink/22" : i >= SEGMENTS - 3 ? "bg-foreground" : "bg-live-ink",
            )}
            style={{ height: `${40 + (i / (SEGMENTS - 1)) * 60}%` }}
          />
        )
      })}
    </span>
  )
}
