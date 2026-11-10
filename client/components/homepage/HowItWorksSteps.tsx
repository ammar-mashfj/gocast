"use client"

import { useEffect, useRef, useState } from "react"
import { IconCheck, IconChevronLeft, IconChevronRight, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { ProTag } from "@/components/ds/Tag"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "./heroSection/HeroHandover"

/**
 * One loop through the three cards, seven seconds each: the active card
 * lifts and its little screen acts the step out. Everything is fictional,
 * including the URL — it is a demo, not a link.
 */
const STEP_S = 7
const LOOP_S = STEP_S * 3
const TICK_MS = 100
const SLUG = "night-bus"
const BARS = 16
const MAX_LISTENERS = 12

/** Step 0 means no card is acting: every screen shows its finished state. */
type Frame = { step: number; l: number; t: number }
const STILL: Frame = { step: 0, l: 0, t: 0 }

function frameAt(ms: number): Frame {
  const q = (ms / 1000) % LOOP_S
  return { step: Math.floor(q / STEP_S) + 1, l: q % STEP_S, t: ms }
}

function clock(secs: number) {
  const s = Math.floor(secs)
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

const STEPS = 3
const NARROW = "(max-width: 63.999rem)"

/**
 * The three steps under the intro. The loop pauses off screen and in a
 * background tab, like the hero's; under reduced motion it never starts.
 *
 * Below lg the cards are a swipeable row (native scroll snap, the next card
 * peeking in) with prev/next and dots. It follows the loop like a slideshow
 * until the visitor swipes or taps; from then on they drive, the loop stops
 * moving it, and whichever card is in view acts its step out from the start.
 */
export function HowItWorksSteps() {
  const ref = useRef<HTMLOListElement>(null)
  const [loopFrame, setFrame] = useState<Frame>(() => frameAt(0))
  const still = useReducedMotion()
  // Set once the visitor takes the carousel: the card they chose, and the
  // loop time it came into view (its screen plays from there).
  const [pin, setPin] = useState<{ i: number; at: number } | null>(null)
  const [shown, setShown] = useState(0)
  const took = useRef(false)
  const f = still ? STILL : pin ? { step: pin.i + 1, l: (loopFrame.t - pin.at) / 1000, t: loopFrame.t } : loopFrame

  useEffect(() => {
    const el = ref.current
    if (!el || still) return

    let inView = false
    let elapsed = 0
    let last = performance.now()
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
    })
    io.observe(el)

    const t = setInterval(() => {
      const now = performance.now()
      if (inView && !document.hidden) elapsed += Math.min(now - last, 1000)
      last = now
      setFrame((prev) => (prev.t === elapsed ? prev : frameAt(elapsed)))
    }, TICK_MS)

    return () => {
      clearInterval(t)
      io.disconnect()
    }
  }, [still])

  const narrow = () => window.matchMedia(NARROW).matches

  // Scrolls the row itself (never scrollIntoView, which would also move the
  // page), to the card's snap point.
  const scrollTo = (i: number, smooth = true) => {
    const ol = ref.current
    const li = ol?.children[i] as HTMLElement | undefined
    if (!ol || !li) return
    const pad = Number.parseFloat(getComputedStyle(ol).scrollPaddingLeft) || 0
    const left = li.getBoundingClientRect().left - ol.getBoundingClientRect().left + ol.scrollLeft - pad
    ol.scrollTo({ left, behavior: smooth ? "smooth" : "instant" })
  }

  // Slideshow: follow the loop until the visitor takes over.
  const autoStep = pin || still ? 0 : loopFrame.step
  useEffect(() => {
    if (autoStep && narrow()) scrollTo(autoStep - 1)
  }, [autoStep])

  const take = () => {
    if (narrow()) took.current = true
  }
  const go = (i: number) => {
    const next = Math.max(0, Math.min(STEPS - 1, i))
    took.current = true
    setPin({ i: next, at: loopFrame.t })
    scrollTo(next)
  }
  const onScroll = () => {
    const ol = ref.current
    if (!ol || !narrow()) return
    const mid = ol.getBoundingClientRect().left + ol.clientWidth * 0.4
    let i = 0
    for (let k = 0; k < ol.children.length; k++) if ((ol.children[k] as HTMLElement).getBoundingClientRect().left <= mid) i = k
    setShown(i)
    if (took.current) setPin((p) => (p?.i === i ? p : { i, at: loopFrame.t }))
  }

  return (
    <div className="flex flex-col gap-5">
      {/* From lg each card is a subgrid of the row's four tracks (step row,
        screen, title, body), so the titles line up even when one body wraps
        longer. Below lg a third of the width is narrower than the URLs, so
        the row scrolls instead, bleeding to the screen edges. */}
      <ol
        ref={ref}
        id="how-steps"
        onScroll={onScroll}
        onPointerDown={take}
        onTouchStart={take}
        onWheel={take}
        className="-mx-gutter flex snap-x snap-mandatory scroll-px-gutter gap-3 overflow-x-auto px-gutter [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <Step
          n={1}
          f={f}
          time="15 seconds"
          title="Create your station"
          body="Pick a name, choose a genre, and claim your URL. Your player page goes live instantly."
          screen={<CreateScreen f={f} />}
        />
        <Step
          n={2}
          f={f}
          time="1 click"
          title="Go on air"
          body={
            <>
              Hit broadcast and your browser streams you in real time — or upload a library and let AutoDJ{" "}
              <ProTag className="align-[0.125em]" /> run the station for you.
            </>
          }
          screen={<LiveScreen f={f} />}
        />
        <Step
          n={3}
          f={f}
          time="Instant"
          title="Share your link"
          body="Send your player page to anyone. They click, they listen. No app download required."
          screen={<ShareScreen f={f} />}
        />
      </ol>
      <div className="flex items-center justify-center gap-3 lg:hidden">
        <Button
          variant="subtle"
          size="icon"
          aria-label="Previous step"
          aria-controls="how-steps"
          disabled={shown === 0}
          onClick={() => go(shown - 1)}
        >
          <IconChevronLeft />
        </Button>
        <div className="flex items-center">
          {Array.from({ length: STEPS }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Step ${i + 1}`}
              aria-current={shown === i ? "step" : undefined}
              aria-controls="how-steps"
              onClick={() => go(i)}
              className="flex h-10 items-center px-3"
            >
              <span
                className={cn("h-2 rounded-full transition-all duration-300", shown === i ? "w-5 bg-foreground" : "w-2 bg-surface-strong")}
              />
            </button>
          ))}
        </div>
        <Button
          variant="subtle"
          size="icon"
          aria-label="Next step"
          aria-controls="how-steps"
          disabled={shown === STEPS - 1}
          onClick={() => go(shown + 1)}
        >
          <IconChevronRight />
        </Button>
      </div>
    </div>
  )
}

function Step({
  n,
  f,
  time,
  title,
  body,
  screen,
}: {
  n: number
  f: Frame
  time: string
  title: string
  body: React.ReactNode
  screen: React.ReactNode
}) {
  return (
    <li
      className={cn(
        // From lg the acting card lifts and takes the studio section's red
        // outline. In the carousel one card fills the view, so the dots say
        // which step it is instead.
        "flex w-[min(85%,26rem)] min-w-0 shrink-0 snap-start flex-col gap-4.5 rounded-card bg-card p-4 transition-[background-color,box-shadow] duration-300 lg:row-span-4 lg:grid lg:w-auto lg:grid-rows-subgrid lg:p-5 lg:shadow-[0_0_0_1.5px_transparent]",
        f.step === n && "lg:bg-surface-raised lg:shadow-[0_0_0_1.5px_var(--color-live)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-foreground">Step 0{n}</span>
        <span className="eyebrow text-text-faint">{time}</span>
      </div>
      <div aria-hidden>{screen}</div>
      <h3 className="px-1 font-display text-card-title">{title}</h3>
      <p className="px-1 pb-1 text-body text-muted-foreground">{body}</p>
    </li>
  )
}

/** The screen every step draws on: a dark well, a little shorter below lg. */
function Screen({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex h-37.5 flex-col gap-3 rounded-well p-4.5 lg:h-45", className)}>{children}</div>
}

/** Step 01: the URL types itself out, then the page is live. */
function CreateScreen({ f }: { f: Frame }) {
  const on = f.step === 1
  const typed = on ? SLUG.slice(0, Math.max(0, Math.floor((f.l - 0.6) / 0.35))) : SLUG
  const ok = !on || f.l > 4.4
  const caret = on && !ok && Math.floor(f.t / 400) % 2 === 1
  return (
    <Screen className="justify-center bg-background">
      <span className="eyebrow-sm text-text-faint">Your URL</span>
      <div className="flex h-13 items-center overflow-hidden rounded-item bg-surface-raised px-3.5 font-mono text-base whitespace-nowrap text-muted-foreground">
        gocast.fm/<span className="text-foreground">{typed}</span>
        <span className={cn("ml-0.5 h-5 w-0.5", caret ? "bg-foreground" : "bg-transparent")} />
      </div>
      <span className={cn("eyebrow inline-flex items-center gap-2", ok ? "text-ok" : "text-text-faint")}>
        <span className={cn("size-2 rounded-full", ok ? "bg-ok" : "bg-surface-strong")} />
        {ok ? "Your player page is live" : "Checking…"}
      </span>
    </Screen>
  )
}

/** Step 02: off air, then the mic opens and the meter moves. */
function LiveScreen({ f }: { f: Frame }) {
  const on = f.step === 2
  const live = !on || f.l > 2
  const secs = on ? (live ? f.l - 2 : 0) : 754
  return (
    <Screen className={cn("justify-between transition-colors duration-150", live && on ? "bg-live-tint" : "bg-background")}>
      <div className="flex items-center justify-between">
        {live ? (
          <StatusLamp tone="mic" variant="solid">
            Mic live
          </StatusLamp>
        ) : (
          <StatusLamp tone="off" variant="solid">
            Off air
          </StatusLamp>
        )}
        <span className="font-mono text-meter-sm tabular-nums">{clock(secs)}</span>
      </div>
      <div className="flex h-11 items-center gap-1">
        {Array.from({ length: BARS }, (_, i) => {
          const h = !live
            ? 4
            : on
              ? Math.round(6 + Math.abs(Math.sin(f.t / 420 + i * 0.9)) * 28)
              : Math.round(8 + Math.abs(Math.sin(i * 0.9)) * 20)
          return <span key={i} className={cn("flex-1 rounded-xs", live ? "bg-live" : "bg-surface-strong")} style={{ height: h }} />
        })}
      </div>
    </Screen>
  )
}

/** Step 03: copy the link, then people arrive. */
function ShareScreen({ f }: { f: Frame }) {
  const on = f.step === 3
  const copied = on && f.l > 1.5 && f.l < 3.5
  const listeners = on ? Math.min(MAX_LISTENERS, Math.max(0, Math.floor((f.l - 3.5) * 3.5))) : MAX_LISTENERS
  return (
    <Screen className="justify-center bg-background">
      {/* Never truncated: the link is the point. The copy button is an icon
          to leave it the room, and the link breaks at its slash if it must. */}
      <div className="flex min-h-13 items-center justify-between gap-2.5 rounded-item bg-surface-raised py-1.5 pr-1.5 pl-3">
        <span className="min-w-0 font-mono text-body-sm [overflow-wrap:anywhere]">
          gocast.fm/<wbr />
          {SLUG}
        </span>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[0.625rem] text-background transition-colors duration-150",
            copied ? "bg-ok" : "bg-foreground",
          )}
        >
          {copied ? <IconCheck size={18} stroke={2.5} /> : <IconCopy size={18} />}
        </span>
      </div>
      <div className="flex items-baseline justify-between px-1">
        <span className="eyebrow-sm text-text-faint">Listening now</span>
        <span className="font-mono text-meter tabular-nums">{listeners}</span>
      </div>
    </Screen>
  )
}
