"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconCheck, IconCopy, IconGripVertical } from "@tabler/icons-react"
import { Segmented } from "@/components/ds/Segmented"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { PadMeter } from "./heroSection/HeroHandover"

/*
 * A working mock of the studio. Nothing is fetched and no audio plays: the
 * pad opens a pretend mic, the running order really reorders, the count
 * drifts. Everything is fictional, the URLs included.
 */

type Feat = "order" | "mic" | "room"

/** One capability each, the same three the section has always made. */
const FEATS: { id: Feat; tab: string; title: string; body: string }[] = [
  {
    id: "order",
    tab: "Order",
    title: "A running order, not a file picker",
    body: "Drag tracks in, reorder them while they play, repeat one or all. The deck counts down what’s left of the track on air, so you know when to talk.",
  },
  {
    id: "mic",
    tab: "Mic",
    title: "A mic that behaves like a mixer",
    body: "Hold Space and the bed ducks under your voice, then lifts when you let go. Monitor through headphones while you do it — the mic is never on unless you put it there.",
  },
  {
    id: "room",
    tab: "Room",
    title: "The room, while you’re in it",
    body: "Your listener count moves in real time next to the deck, with your link one click away to copy. Hand it out without coming off air.",
  },
]

type Item = { id: number; kind: "track" | "id" | "ad"; title: string; sub: string; len: string }

const QUEUE: Item[] = [
  { id: 1, kind: "track", title: "Harbour Lights", sub: "Sola", len: "3:41" },
  { id: 2, kind: "id", title: "Station ID", sub: "Night Bus, every hour", len: "0:08" },
  { id: 3, kind: "track", title: "Slow Return", sub: "Ama K", len: "4:12" },
  { id: 4, kind: "ad", title: "Sponsor read", sub: "Corner Records", len: "0:30" },
  { id: 5, kind: "track", title: "Paper Moon", sub: "The Fens", len: "3:05" },
]

const TRACK_LEN = 425
const START_LEFT = 161
const TICK_MS = 250
const START_LISTENERS = 23
const START_PEAK = 31
/** How long the pretend show has been on, in seconds. */
const START_ON_AIR = 42 * 60 + 18

const STRIPES = {
  backgroundImage: "repeating-linear-gradient(135deg, var(--color-surface-strong) 0 5px, var(--color-surface-control) 5px 10px)",
}

function mmss(secs: number) {
  const s = Math.max(0, Math.round(secs))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Desktop: the three capabilities as a list beside a browser window holding
 * the studio; picking one lights its part of the desk. Phones: a switcher
 * that shows just that part.
 *
 * It only runs while on screen, and Space only opens the mic then — on a
 * marketing page Space must keep scrolling until the studio is in front of
 * you (same rule as StudioDeck).
 */
export function StudioDemo() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [feat, setFeat] = useState<Feat>("order")
  /** Which way the phone tabs last moved, so the new one slides in from that side. */
  const [dir, setDir] = useState<1 | -1>(1)
  const pickTab = useCallback(
    (next: Feat) => {
      const at = (f: Feat) => FEATS.findIndex((x) => x.id === f)
      setDir(at(next) < at(feat) ? -1 : 1)
      setFeat(next)
    },
    [feat],
  )
  const [held, setHeld] = useState(false)
  const [queue, setQueue] = useState(QUEUE)
  const [copied, setCopied] = useState(false)
  const [left, setLeft] = useState(START_LEFT)
  const [onAir, setOnAir] = useState(START_ON_AIR)
  const [room, setRoom] = useState({ now: START_LISTENERS, peak: START_PEAK })
  const [inView, setInView] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const press = useCallback(() => {
    setHeld(true)
    setFeat("mic")
  }, [])
  const release = useCallback(() => setHeld(false), [])
  const copy = useCallback(() => {
    setCopied(true)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 1600)
  }, [])
  useEffect(() => () => void (copyTimer.current && clearTimeout(copyTimer.current)), [])

  // On screen? Half of it, or half the screen filled by it.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        const seen = entry.isIntersecting && (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5)
        setInView(seen)
        // Scrolled away with the mic held: let go.
        if (!seen) release()
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [release])

  // The deck counts down; the room drifts on its own, mic or not.
  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => {
      setLeft((l) => (l - TICK_MS / 1000 <= 0 ? TRACK_LEN : l - TICK_MS / 1000))
      setOnAir((s) => s + TICK_MS / 1000)
    }, TICK_MS)
    const r = setInterval(() => {
      setRoom((s) => {
        const now = Math.min(30, Math.max(18, s.now + Math.round(Math.random() * 4 - 1.6)))
        return { now, peak: Math.max(s.peak, now) }
      })
    }, 2400)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [inView])

  // Space, while on screen and nothing else owns it.
  useEffect(() => {
    if (!inView) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return
      const active = document.activeElement as HTMLElement | null
      if (/INPUT|TEXTAREA|SELECT/.test(active?.tagName ?? "")) return
      if (active?.closest("button, a[href], [role=button], [role=radio], [contenteditable=''], [contenteditable=true], [role=dialog]"))
        return
      e.preventDefault()
      if (e.type === "keydown" && !e.repeat) press()
      if (e.type === "keyup") release()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [inView, press, release])

  const move = useCallback((from: number, to: number) => {
    setQueue((q) => {
      const next = q.slice()
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
  }, [])

  const deck = <Deck held={held} left={left} />
  const order = <RunningOrder queue={queue} move={move} onStart={() => setFeat("order")} />
  const roomCard = <Room now={room.now} peak={room.peak} copied={copied} onCopy={copy} />

  return (
    <div ref={rootRef}>
      {/* Desktop */}
      {/* The feature list narrows below xl so the studio picture keeps enough
          width for the pad and the room card at 1024. */}
      <div className="hidden grid-cols-[15rem_minmax(0,1fr)] items-start gap-6 lg:grid xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-8">
        <div className="flex flex-col gap-2">
          {FEATS.map((x) => {
            const on = x.id === feat
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={on}
                onMouseEnter={() => setFeat(x.id)}
                onFocus={() => setFeat(x.id)}
                onClick={() => setFeat(x.id)}
                className={cn(
                  "flex flex-col gap-2 rounded-well px-5 py-4.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-surface-raised" : "bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "font-display text-lg font-bold tracking-tight transition-colors duration-200",
                    on ? "text-foreground" : "text-text-faint",
                  )}
                >
                  {x.title}
                </span>
                {on && <span className="text-body-sm text-muted-foreground text-pretty">{x.body}</span>}
              </button>
            )
          })}
        </div>

        {/* The studio, in a browser window. Decorative to assistive tech: the
            list beside it says everything; its controls take no focus. */}
        <div aria-hidden className="overflow-hidden rounded-well bg-black shadow-[inset_0_0_0_1.5px_rgb(244_241_236/0.14)]">
          <div className="flex h-11 items-center gap-3 bg-card px-3.5">
            <span className="flex h-7.5 items-center gap-2 rounded-[0.625rem] bg-surface-control px-3 text-body-sm font-semibold">
              <span className="size-2 rounded-full bg-live" />
              Studio · Night Bus
            </span>
            <span className="flex h-7.5 flex-1 items-center rounded-[0.625rem] bg-background px-3 font-mono text-body-sm text-muted-foreground">
              gocast.fm/studio
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 bg-background p-3.5">
            <Region on={feat === "order"} onPick={() => setFeat("order")} className="flex flex-col gap-2.5">
              {deck}
              {order}
            </Region>
            <div className="flex flex-col gap-3">
              <Region on={feat === "mic"} onPick={() => setFeat("mic")} className="rounded-panel">
                <Pad
                  held={held}
                  press={press}
                  release={release}
                  hint="Press and hold, or hold Space. The music dips while you talk."
                  className="h-62.5"
                />
              </Region>
              <Region on={feat === "room"} onPick={() => setFeat("room")}>{roomCard}</Region>
            </div>
          </div>
        </div>
      </div>

      {/* Phones and tablets */}
      <div className="flex flex-col gap-6 lg:hidden">
        <Segmented
          aria-label="Inside the studio"
          options={FEATS.map((x) => ({ value: x.id, label: x.tab }))}
          value={feat}
          onChange={pickTab}
          className="h-12"
        />
        {/* The whole tab moves as one: words, deck and cards slide in together
            from the side you moved toward. Clipped so the slide never scrolls
            the page sideways. */}
        <div className="overflow-x-clip">
          <div
            key={feat}
            className={cn(
              "flex flex-col gap-6 motion-safe:animate-in motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fade-in",
              dir === 1 ? "motion-safe:slide-in-from-right-8" : "motion-safe:slide-in-from-left-8",
            )}
          >
            {/* All three texts share one cell, so it is as tall as the longest
                and the studio below never jumps up or down between tabs. */}
            <div className="grid px-1">
              {FEATS.map((x) => (
                <div
                  key={x.id}
                  aria-hidden={x.id !== feat}
                  className={cn("col-start-1 row-start-1 flex flex-col gap-2", x.id !== feat && "invisible")}
                >
                  <span className="font-display text-xl font-bold tracking-tight">{x.title}</span>
                  <p className="text-body text-muted-foreground text-pretty">{x.body}</p>
                </div>
              ))}
            </div>
            {/* One fixed height for all three tabs: the pad and the show stats
                stretch to fill it. */}
            <div aria-hidden className="flex h-107 flex-col gap-2.5">
              {deck}
              {feat === "order" && order}
              {feat === "mic" && (
                <Pad held={held} press={press} release={release} hint="Press and hold. The music dips while you talk." className="flex-1" />
              )}
              {feat === "room" && (
                <>
                  {roomCard}
                  <ShowStats onAir={onAir} className="flex-1" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One part of the desk on desktop: lit when its capability is picked, and
 * picking it when the pointer moves onto it, the mirror of hovering the list.
 */
function Region({ on, onPick, className, children }: { on: boolean; onPick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <div
      onMouseEnter={onPick}
      className={cn(
        // The outline takes the radius of the card it wraps (rounded-well by
        // default), so it hugs the corners instead of floating off them.
        "rounded-well transition-[opacity,box-shadow] duration-200",
        on ? "opacity-100 shadow-[0_0_0_1.5px_var(--color-live)]" : "opacity-40",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The track on air: lamp, bed level, countdown. */
function Deck({ held, left }: { held: boolean; left: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-well bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        {held ? (
          <StatusLamp tone="mic" variant="solid" className="lamp-settle">
            Mic live
          </StatusLamp>
        ) : (
          <StatusLamp tone="live" variant="solid">
            Live
          </StatusLamp>
        )}
        <span className={cn("eyebrow-sm", held ? "text-live-text" : "text-text-faint")}>{held ? "Bed −12 dB · Ducked" : "Bed 0 dB"}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="size-12 shrink-0 rounded-[0.625rem]" style={STRIPES} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-display text-base font-bold">Night Bus</span>
          <span className="truncate text-body-sm text-muted-foreground">Lumen Drive</span>
        </div>
        <span className="font-mono text-meter tabular-nums">−{mmss(left)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-strong">
        <div
          className="h-full bg-live transition-[width] duration-250 ease-linear"
          style={{ width: `${((TRACK_LEN - left) / TRACK_LEN) * 100}%` }}
        />
      </div>
    </div>
  )
}

/**
 * The running order, reorderable with a pointer: a mouse drags the whole
 * row, a finger drags the grip (so the rest of the list still scrolls the
 * page). Rows move as you drag, not only on drop.
 */
function RunningOrder({ queue, move, onStart }: { queue: Item[]; move: (from: number, to: number) => void; onStart: () => void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const draggingRef = useRef<number | null>(null)

  const down = (e: React.PointerEvent<HTMLLIElement>, i: number) => {
    if (e.button !== 0) return
    if (e.pointerType !== "mouse" && !(e.target as HTMLElement).closest("[data-grip]")) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = queue[i].id
    setDragging(queue[i].id)
    onStart()
  }
  const over = (e: React.PointerEvent<HTMLLIElement>) => {
    const id = draggingRef.current
    if (id === null) return
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-row]")
    if (!row) return
    const to = Number(row.dataset.row)
    const from = queue.findIndex((q) => q.id === id)
    if (from !== to) move(from, to)
  }
  const up = () => {
    draggingRef.current = null
    setDragging(null)
  }

  return (
    <div className="flex flex-col rounded-well bg-card p-1.5">
      <div className="flex justify-between px-2.5 pt-2.5 pb-2 eyebrow-sm text-text-faint">
        <span>Running order</span>
        <span>Drag to reorder</span>
      </div>
      <ol className="flex flex-col">
        {queue.map((q, i) => (
          <li
            key={q.id}
            data-row={i}
            onPointerDown={(e) => down(e, i)}
            onPointerMove={over}
            onPointerUp={up}
            onPointerCancel={up}
            className={cn(
              "group flex min-h-12 cursor-grab items-center gap-3 rounded-item px-2.5 transition-colors duration-100 select-none hover:bg-surface-control",
              dragging === q.id && "cursor-grabbing bg-surface-strong hover:bg-surface-strong",
            )}
          >
            {/* The real studio's handle (FileQueue): the same grip icon. */}
            <span
              data-grip
              className="-my-2 -ml-2 flex h-12 w-8 shrink-0 touch-none items-center justify-center text-text-faint transition-colors group-hover:text-foreground"
            >
              <IconGripVertical size={20} />
            </span>
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong font-mono text-[0.625rem] font-semibold text-muted-foreground"
              style={q.kind === "track" ? STRIPES : undefined}
            >
              {q.kind === "id" ? "ID" : q.kind === "ad" ? "AD" : ""}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{q.title}</span>
              <span className="truncate text-xs text-text-faint">{q.sub}</span>
            </span>
            <span className="font-mono text-caption text-muted-foreground">{q.len}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The talk pad: the hero's, but yours to hold. */
function Pad({
  held,
  press,
  release,
  hint,
  className,
}: {
  held: boolean
  press: () => void
  release: () => void
  hint: string
  className?: string
}) {
  return (
    <div
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        press()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "flex cursor-pointer touch-none flex-col justify-between gap-3 rounded-panel p-4 transition-colors duration-150 select-none [-webkit-touch-callout:none]",
        held ? "grille-live bg-live text-live-ink" : "grille bg-surface-control text-foreground",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-title">{held ? "You’re on" : "Hold to talk"}</span>
          <span className={cn("text-body-sm", held ? "text-live-deep" : "text-muted-foreground")}>
            {held ? "Let go to close the mic" : hint}
          </span>
        </div>
        {!held && (
          <span className="eyebrow mt-1 inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full bg-live" />
            Live while held
          </span>
        )}
      </div>
      <PadMeter open={held} className="h-8" />
    </div>
  )
}

/** The rest of the real studio's stats strip: how long you've been on, and
    whether any audio has been lost on the way out. */
function ShowStats({ onAir, className }: { onAir: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-well bg-line", className)}>
      <div className="flex flex-col justify-center gap-1 bg-surface-raised p-4">
        <span className="eyebrow-sm text-text-faint">On air</span>
        <span className="font-mono text-meter-sm tabular-nums">{mmss(onAir)}</span>
        <span className="text-caption text-text-faint">heard 15–20 s later</span>
      </div>
      <div className="flex flex-col justify-center gap-1 bg-surface-raised p-4">
        <span className="eyebrow-sm text-text-faint">Audio lost</span>
        <span className="font-mono text-meter-sm text-ok tabular-nums">0 s</span>
        <span className="text-caption text-text-faint">128 kbps</span>
      </div>
    </div>
  )
}

/** Who's listening, and the link to hand out. */
function Room({ now, peak, copied, onCopy }: { now: number; peak: number; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-well bg-surface-raised p-4">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <span className="eyebrow-sm text-muted-foreground">Listening now</span>
          <span className="font-mono text-meter-lg tabular-nums">{now}</span>
        </div>
        <span className="eyebrow-sm text-text-faint">Peak {peak}</span>
      </div>
      {/* Never truncated: Copy is an icon to leave the link its room. */}
      <div className="flex min-h-12 items-center justify-between gap-2.5 rounded-item bg-background py-1 pr-1 pl-3.5">
        <span className="min-w-0 font-mono text-sm [overflow-wrap:anywhere]">gocast.fm/night-bus</span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={copied ? "Copied" : "Copy link"}
          onClick={onCopy}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[0.625rem] text-background transition-colors duration-150",
            copied ? "bg-ok" : "bg-foreground",
          )}
        >
          {copied ? <IconCheck size={18} stroke={2.5} /> : <IconCopy size={18} />}
        </button>
      </div>
    </div>
  )
}
