"use client"

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useParams, useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useStationBySlug } from "@/contexts/StationContext"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useBroadcastStats } from "@/hooks/useBroadcastStats"
import { env } from "@/lib/env"
import { Button } from "@/components/ds/Button"
import { cn } from "@/lib/utils"
import { taggedStationUrl } from "@/lib/share"
import { copyText } from "@/lib/clipboard"
import { toast } from "sonner"
import { IconCheck, IconCopy, IconExternalLink } from "@tabler/icons-react"
import { ASK_END_SHOW_EVENT, EndBroadcastButton, endShow, endShowFailed } from "@/components/studio/EndBroadcast"
import { FileQueue } from "@/components/studio/FileQueue"
import { NowPlaying } from "@/components/studio/NowPlaying"
import { PushToTalk, isOverlayTarget, isTypingTarget } from "@/components/studio/PushToTalk"
import { MicLatchButton, MonitorToggle, MusicOnlyStrip, StudioControls } from "@/components/studio/StudioControls"
import { StudioStats } from "@/components/studio/StudioStats"
import { FocusButton } from "@/components/studio/FocusButton"
import { MicSheet, TalkFab } from "@/components/studio/TalkFab"
import { useTransportHealth } from "@/components/studio/signal"
import { GoLiveChecks } from "@/components/studio/GoLiveChecks"
import { Skeleton } from "@/components/ui/skeleton"
import { Notice } from "@/components/ds/Notice"
import { useAutoDjLocked } from "@/contexts/AccountContext"

/** history.state key on the extra entry the live back-guard keeps on top. */
const LIVE_GUARD = "__gocastLiveGuard"

/**
 * The studio, while you're live: the talk pad and the mic on the left; what's
 * playing, the show's numbers, the running order, your link and End show on
 * the right. The state — live, mic open, silence, reconnecting — is the
 * status band's, above every page; the studio never draws a second copy.
 *
 * Shortcuts: Space talk (PushToTalk), K play/pause, N/P next/previous, R
 * repeat, M monitor, L keep the mic open. Listed for the host in
 * ShortcutsDialog (in StudioControls); keep the two in step.
 */
export default function StudioPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state, engine, micDisabled, liveSince } = useBroadcast()
  const station = useStationBySlug(slug)
  const leavingGuard = useRef(false)
  // This show reached the air: a later `error` is the show going off air for
  // good (reconnects spent), not a check that failed. The checks dialog stays
  // closed for that, so the studio has to say it. Adjusted while rendering,
  // as GoLiveChecks does; a new run (`connecting`) is a new show.
  // Seeded from the provider: opened mid-show (back from Library, say) the
  // studio never sees the switch to live, and a show lost after that would
  // otherwise show no ShowLost.
  /**
   * The running order expanded (its Expand button): it takes the room of
   * Now playing above it and, with a mic, of the mic column beside it (talk
   * pad, Keep mic open, controls) or, music only, of the Music only row,
   * all hidden until Collapse. The stats strip (on air for, listeners,
   * connection) stays. The
   * studio still fits the screen; the list scrolls inside its card. Space
   * still talks while the pad is hidden; phones keep the floating button.
   */
  const [queueExpanded, setQueueExpanded] = useState(false)
  // Animated with a view transition: the running order's box grows into
  // (or gives back) the room, and the hidden cards fade. Instant where the
  // browser has no view transitions or the user asked for reduced motion.
  function toggleQueueExpanded() {
    const flip = () => setQueueExpanded((x) => !x)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (typeof document.startViewTransition !== "function" || reduce) {
      flip()
      return
    }
    document.startViewTransition(() => flushSync(flip))
  }
  const [aired, setAired] = useState(() => liveSince !== null || state === "live" || state === "reconnecting")
  if (state === "live" && !aired) setAired(true)
  if (state === "connecting" && aired) setAired(false)

  const isLive = state === "live" || state === "reconnecting"
  const stats = useBroadcastStats(slug, isLive)
  const transport = useTransportHealth(isLive)
  const stationName = station?.name ?? slug

  // Live, the studio is the whole screen on a phone or tablet: no top bar,
  // no tab bar (app/dashboard.css, below lg). The way out is End show.
  useEffect(() => {
    if (!isLive) return
    const root = document.documentElement
    root.setAttribute("data-studio-live", "")
    return () => root.removeAttribute("data-studio-live")
  }, [isLive])

  // Back while live — the system gesture, or the browser's button — asks
  // "End the show?", exactly as End show does, instead of leaving. A page
  // can't disable back, so it keeps one extra history entry on top and,
  // when back lands under it, puts it back and asks. Best effort: a very
  // fast double back can still get through (the Go Live page then sends a
  // live tab straight back here).
  useEffect(() => {
    if (!isLive) return
    const guard = () => window.history.pushState({ ...window.history.state, [LIVE_GUARD]: true }, "")
    if (!window.history.state?.[LIVE_GUARD]) guard()
    const onPop = () => {
      if (window.history.state?.[LIVE_GUARD]) return
      guard()
      window.dispatchEvent(new Event(ASK_END_SHOW_EVENT))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [isLive])

  // The red-dot prefix is the tab's own on-air lamp, visible from any tab.
  useDocumentTitle(isLive ? `● LIVE · ${stationName} | GoCast` : null)

  // Not live: a show that just ended goes to its wrap screen; a studio
  // opened without a show goes to pre-flight.
  // The back-guard's extra entry is still on top when the show ends (its
  // effect only stops listening). Replacing it would leave the studio's own
  // entry under the wrap screen, and Back from there would land on a studio
  // that bounces to Go Live. So step off the guard first, then replace.
  useEffect(() => {
    if (state !== "idle") return
    // The only navigation off the studio when a show ends: End show leaves it
    // to this effect. Its own replace raced the step off the guard below and,
    // landing first, left Back to reach a studio that bounced to Go Live.
    // `aired` is reset by a new run (Go back on air), so checks that fail
    // there go back to Go Live, not to a wrap screen with no summary.
    const target = `/dashboard/stations/${slug}/${aired ? "studio/wrap" : "live"}`
    if (!window.history.state?.[LIVE_GUARD]) {
      router.replace(target)
      return
    }
    const onPop = () => {
      window.removeEventListener("popstate", onPop)
      leavingGuard.current = false
      router.replace(target)
    }
    window.addEventListener("popstate", onPop)
    // back() is async: an effect re-run before it lands (StrictMode, a new
    // router) must wait for that one, not step back a second entry.
    if (!leavingGuard.current) {
      leavingGuard.current = true
      window.history.back()
    }
    return () => window.removeEventListener("popstate", onPop)
  }, [state, slug, router, aired])

  // Transport shortcuts. Only a text field, an open dialog, or a modifier
  // held for a browser shortcut keeps them out.
  useEffect(() => {
    if (!engine) return
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || isOverlayTarget(e.target)) return
      const queueLen = engine!.getQueue().length
      switch (e.code) {
        case "KeyK": engine!.togglePlay(); break
        // The queue always wraps, so anything longer than one track can step
        // either way. With one track, Previous takes it back to the start
        // (the same as the Previous button); Next has nowhere to go.
        case "KeyN": if (queueLen > 1) engine!.next(); break
        case "KeyP": if (queueLen > 0) engine!.prev(); break
        case "KeyR": engine!.cycleRepeat(); break
        case "KeyM": engine!.setMonitorEnabled(!engine!.isMonitorEnabled()); break
        case "KeyL": if (!micDisabled) engine!.setMicLatched(!engine!.isMicLatched()); break
        default: return
      }
      e.preventDefault()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [engine, micDisabled])

  // Going live: Go Live opens the studio as soon as the checks start, and
  // they run here, in a dialog over a still picture of the studio's layout
  // (the real controls need a live engine). Idle is handled above.
  // One GoLiveChecks, first in the fragment either way: React keeps the
  // same instance across the switch to live, so it can show "You're on
  // air" and its leave-cleanup never sees a stale "ready" and stops the
  // show it just started.
  const checks = <GoLiveChecks stationName={stationName} />

  if (!isLive) {
    return (
      <>
        {checks}
        {state === "error" && aired && <ShowLost slug={slug} />}
        <Skeleton aria-hidden className="mb-5 h-26 rounded-card opacity-40 animate-none" />
        <div
          aria-hidden
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,23.75rem),1fr))] items-start gap-5 opacity-40 [&_[data-slot=skeleton]]:animate-none"
        >
          <div className="flex min-w-0 flex-col gap-3.5">
            <Skeleton className="h-64 rounded-hero" />
            <Skeleton className="h-14 rounded-panel" />
            <Skeleton className="h-16 rounded-panel" />
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-72 rounded-card" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
    {checks}
    <h1 className="sr-only">Studio — {stationName}</h1>
    {/* The show's numbers first, above the two columns; under it the mic on
        the left and the music (what's playing, then what's next) on the
        right, together. Outside the columns' grid on purpose: that grid
        auto-fits its column count, and a full-width child inside it kept a
        third, empty column alive on wide screens. */}
    {/* From md (two columns side by side: a tablet held upright and up) the
        studio fits the window: the strip on top, the columns filling the
        rest at one height, the pad and the running order taking up the
        slack, and the running order scrolling inside its card instead of
        the page. Below lg the tab bar is under it: the shell pads 7.5rem for
        it, -mb-12 gives most of that back and the height takes the rest
        (5.75rem = 1.25rem top + 4.5rem left of the bottom pad). Phones
        stack and scroll as before. */}
    {/* Phones too now: the talk pad is a floating button (TalkFab) and the
        running order takes the screen, scrolling inside its card. */}
    {/* Below lg, live, the top bar and tab bar are gone (data-studio-live,
        app/dashboard.css): the studio runs from the LIVE band to 1.25rem
        above the bottom edge and the home indicator (the shell pads 1.25rem). */}
    <div className="flex flex-col gap-5 max-lg:h-[calc(100svh-var(--chrome-h,0px)-2.5rem-env(safe-area-inset-bottom))] max-md:gap-3.5 lg:h-[calc(100svh-var(--chrome-h,0px)-2.5rem)]">
      {/* Focus mode sits at the strip's end: the top of the studio, where a
          screen-level control is looked for. Desktop only for now. */}
      {/* Not on a phone: the running order needs the room, and the
          listener count is on the LIVE band already. */}
      <div className="flex gap-2.5 max-md:hidden">
        <div className="min-w-0 flex-1">
          <StudioStats stats={stats} transport={transport} />
        </div>
        <FocusButton className="h-auto self-stretch rounded-card px-5 max-lg:hidden" />
      </div>
      {/* Music only (md and up): a slim row instead of the mic column, and
          the running order takes the full width. */}
      {/* Hidden (not unmounted) while the running order is expanded, so the
          list gets its room too; Monitor comes back with Collapse (M works
          meanwhile). */}
      {micDisabled && (
        <div className={cn("max-md:hidden", queueExpanded && "hidden")} style={{ viewTransitionName: "studio-music-only" }}>
          <MusicOnlyStrip />
        </div>
      )}
      {/* 21rem columns: two fit from ~700px, which an upright iPad mini has.
          On a tablet (md to xl) the music gets the wider share, a third to
          two-thirds: the
          talk pad is one big target that works at any width, the running
          order is rows of names that need it. */}
      <div
        className={
          micDisabled || queueExpanded
            ? "flex min-h-0 flex-1 flex-col"
            : "grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] items-stretch gap-5 md:max-xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
        }
      >
        {/* The mic column: not on a phone, where the floating button and the
            Mic & monitor sheet stand in for it; not in a music-only show. */}
        {!micDisabled && (
          <div
            className={cn("flex min-w-0 flex-col gap-3.5 max-md:hidden md:min-h-0", queueExpanded && "hidden")}
            style={{ viewTransitionName: "studio-mic" }}
          >
            {/* No hint line under it: the pad says how to talk, the LIVE band
                says how late listeners hear you, and L is in the shortcuts.
                Keep mic open sits right under the pad it holds open. */}
            <PushToTalk className="md:min-h-0 md:flex-1" underPad={<MicLatchButton />} />
            <StudioControls />
          </div>
        )}

        {/* flex-1: when the row is a single column (expanded, or music only)
            the parent is a flex column, and without it this sat at its
            content's height, leaving the screen below the list empty. In the
            two-column grid it does nothing. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5">
          {/* Hidden, not unmounted, while the running order is expanded. */}
          <div className={queueExpanded ? "hidden" : undefined} style={{ viewTransitionName: "studio-now-playing" }}>
            <NowPlaying />
          </div>
          <FileQueue className="max-h-none min-h-0 flex-1" expanded={queueExpanded} onToggleExpand={toggleQueueExpanded} />
          {/* The listener link as two buttons beside End show, not a card:
              mid-show nobody reads the address, and the card's height is the
              running order's. Sharing in full is on the overview. */}
          <div className="flex gap-2.5">
            {/* Not on a tablet or phone (below lg): opening another tab or
                app there pauses this page, and a paused page ends the show. */}
            <Button size="lg" variant="subtle" className="max-lg:hidden" asChild>
              <a
                href={`${env.appUrl}/station/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open your player page"
                className="max-xl:px-3.5 max-lg:hidden"
              >
                {/* Icon only where the columns are narrow (below xl). */}
                <span className="max-xl:sr-only">Open</span>
                <IconExternalLink />
                <span className="sr-only"> your player page (opens in a new tab)</span>
              </a>
            </Button>
            {/* Same reason (below lg): copying is fine, but sending the link
                means leaving this page, and that ends the show there. */}
            <CopyLinkButton url={taggedStationUrl(env.appUrl, slug, "owner")} className="max-lg:hidden" />
            {/* Phones: Monitor as a one-tap toggle, then Mic (its sheet). */}
            <MonitorToggle className="gap-1.5 px-3 md:hidden" />
            <MicSheet className="md:hidden" />
            <EndBroadcastButton className="min-w-0 flex-1" />
          </div>
          <TalkFab className="md:hidden" />
        </div>
      </div>
    </div>
    </>
  )
}

/**
 * A show that went off air for good: the reconnects ran out, the manager has
 * torn down, and nothing else on the page would say so or offer a way out.
 * Try again goes through the checks again and carries on where the running
 * order was; End show is End show, wrap screen and all.
 */
function ShowLost({ slug }: { slug: string }) {
  const { error, retry, stop, liveSince, getTransportStats, engine } = useBroadcast()
  const autoDjLocked = useAutoDjLocked()
  const [ending, setEnding] = useState(false)

  async function end() {
    setEnding(true)
    try {
      await endShow({
        slug,
        liveSince,
        getTransportStats,
        engine,
        // The rotation's length isn't polled here; AutoDJ wording, as End show
        // uses while it's unknown.
        after: autoDjLocked ? "off_air" : "autodj",
        stop,
        autoDjLocked,
      })
      // Idle takes the studio to the wrap screen (StudioPage).
    } catch {
      endShowFailed()
    } finally {
      setEnding(false)
    }
  }

  return (
    <Notice
      className="mb-5"
      label="Off air"
      title="Your show went off air"
      actions={
        <>
          {/* Not from the top, whatever the Go Live page chose: this is the
              same show, picking up where the running order was. */}
          <Button size="lg" onClick={() => void retry({ resumeFromStart: false })} disabled={ending}>
            Go back on air
          </Button>
          <Button size="lg" variant="ghost" onClick={() => void end()} disabled={ending}>
            End show
          </Button>
        </>
      }
    >
      {error || "The connection to your station was lost and couldn’t be brought back."}
    </Notice>
  )
}

/** Copies the listener link; says "Copied" for a moment. */
function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <Button
      size="lg"
      variant="subtle"
      title="Copy your listener link"
      className={cn("max-xl:px-3.5", className)}
      onClick={async () => {
        if (await copyText(url)) setCopied(true)
        else toast.error(`Couldn’t copy. The link is ${url}`)
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
      {/* Icon only where the columns are narrow (below xl). */}
      <span className="max-xl:sr-only">{copied ? "Copied" : "Copy link"}</span>
      <span className="sr-only" aria-live="polite">{copied ? "Listener link copied" : ""}</span>
    </Button>
  )
}
