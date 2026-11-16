"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useIdleTimer, type EventsType } from "react-idle-timer"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { usePlan } from "@/contexts/AccountContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { endShow, endShowFailed } from "@/components/studio/EndBroadcast"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { IDLE_MS, WARN_MS, describeDuration, formatCountdown, idleEndedKey, idleTimings, reportIdleCheck } from "@/lib/idleShow"

/**
 * What counts as someone at the desk: any pointer, key, wheel or touch
 * anywhere in the dashboard. Push-to-talk is Space or a press on the pad, the
 * mic latch and the queue are clicks, so they are all in here already.
 *
 * Not the library's defaults: those include `visibilitychange` and `focus`,
 * and switching AWAY from the tab fires both, so leaving the studio for
 * another tab would count as being there. Coming back to the tab is handled
 * separately below (visible again = present).
 */
const ACTIVITY_EVENTS: EventsType[] = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "touchmove"]

/**
 * Activity in another dashboard tab of this browser counts too: each tab has
 * its own broadcast and its own guard, and only the tab on air is armed, so
 * a host working in the Library in a second tab would otherwise be asked
 * after an hour. Every tab announces its activity here, at most once per
 * ACTIVITY_SHARE_MS; the armed tab takes it as presence.
 */
const ACTIVITY_CHANNEL = "gocast-studio-activity"
const ACTIVITY_SHARE_MS = 5_000

/** Tab title prefix while the question is waiting, so the countdown shows from any tab. */
const TITLE_PREFIX = "⚠ Still on air?"

/**
 * The idle check on Free live shows (see lib/idleShow.ts for the rule).
 *
 * Mounted once in the dashboard layout, beside the broadcast it watches, so a
 * host who leaves the studio for the library mid-show is still covered, and
 * activity on any dashboard page counts, in this tab or another dashboard
 * tab of the same browser (ACTIVITY_CHANNEL). Armed only while a Free show is on
 * air; Pro, idle, and a plan not yet known are never checked.
 *
 * react-idle-timer does the timing from timestamps, so a background tab's
 * slowed timers make the question late by at most about a minute, never
 * skipped: activity that arrives after the deadline triggers it instead of
 * resetting it. While the question is up, activity is ignored on purpose; only
 * an answer (Yes, I'm still here, closing the dialog, Get AutoDJ, or End show)
 * settles it. A host in another tab sees the countdown in the tab title; there
 * is no desktop notification, by choice (asking for one at Go live was more
 * friction than it was worth).
 */
export function IdleShowGuard() {
  const { state, stationSlug, liveSince, getTransportStats, engine, stop } = useBroadcast()
  // The timings come with the plan (the API's config/studio.php); null is a
  // plan that isn't checked: AutoDJ, the check switched off, or not known yet.
  const timings = idleTimings(usePlan())
  const checkout = useProCheckout()
  const router = useRouter()
  const pathname = usePathname()

  const live = state === "live" || state === "reconnecting"
  const armed = live && timings !== null && !!stationSlug
  const idleMs = timings?.idleMs ?? IDLE_MS
  const warnMs = timings?.warnMs ?? WARN_MS

  const [asking, setAsking] = useState(false)
  const [remaining, setRemaining] = useState(warnMs)

  // Read from timer callbacks, which outlive the render that created them.
  const latest = useRef({ stationSlug, liveSince, getTransportStats, engine, stop, pathname })
  useEffect(() => {
    latest.current = { stationSlug, liveSince, getTransportStats, engine, stop, pathname }
  })
  const ending = useRef(false)

  function onAirSeconds() {
    const since = latest.current.liveSince
    return since ? Math.round((Date.now() - since) / 1000) : null
  }

  const timer = useIdleTimer({
    timeout: idleMs + warnMs,
    promptBeforeIdle: warnMs,
    events: ACTIVITY_EVENTS,
    eventsThrottle: 500,
    disabled: !armed,
    onPrompt: () => {
      if (!latest.current.stationSlug) return
      setRemaining(warnMs)
      setAsking(true)
    },
    onIdle: () => void finish(false),
  })

  // Each show starts its own hour; a show ending (or the plan becoming
  // Pro) takes the question down.
  useEffect(() => {
    if (armed) {
      ending.current = false
      timer.start()
      return
    }
    setAsking(false)
    // `timer` is a new object every render; `armed` is what this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed])

  // Coming back to the tab is being there. Leaving it isn't (see ACTIVITY_EVENTS).
  useEffect(() => {
    if (!armed) return
    const onVisible = () => {
      if (document.visibilityState === "visible" && !timer.isPrompted()) timer.activate()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed])

  // Tell the other dashboard tabs someone is here (every tab, armed or not:
  // the one that needs to hear it is the one on air)...
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(ACTIVITY_CHANNEL)
    let last = 0
    const share = () => {
      const now = Date.now()
      if (now - last < ACTIVITY_SHARE_MS) return
      last = now
      channel.postMessage(now)
    }
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, share, { passive: true }))
    return () => {
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, share))
      channel.close()
    }
  }, [])

  // ...and, on air, take theirs as presence. Like activity here, it doesn't
  // answer a question already up: only the dialog's buttons do.
  useEffect(() => {
    if (!armed || typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(ACTIVITY_CHANNEL)
    channel.onmessage = () => {
      if (!timer.isPrompted()) timer.activate()
    }
    return () => channel.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed])

  // The countdown, in the dialog and, from another tab, in the tab title.
  // Read from the timer each tick: a background tab's interval may run once a
  // minute, and the number it shows must still be right when it does. The
  // title goes back in the cleanup, which runs after the last tick: put back
  // anywhere earlier, a tick landing in the same moment wrote it over again.
  useEffect(() => {
    if (!asking) return
    const before = document.title
    const tick = () => {
      const left = timer.getRemainingTime()
      setRemaining(left)
      document.title = `${TITLE_PREFIX} ${formatCountdown(left)}`
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(id)
      if (document.title.startsWith(TITLE_PREFIX)) document.title = before
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking])

  function keep() {
    if (!timer.isPrompted() && !asking) return
    timer.activate()
    setAsking(false)
    const slug = latest.current.stationSlug
    if (slug) reportIdleCheck(slug, "kept", { onAirSeconds: onAirSeconds(), hidden: document.hidden })
  }

  function getAutoDj() {
    keep()
    checkout.open()
  }

  /**
   * Ends the show: unanswered (`byHost` false), or the host pressing End show
   * in the question. Only the unanswered one leaves the wrap screen its
   * "nobody was at the desk" card; a host who chose to end gets the usual wrap.
   */
  async function finish(byHost: boolean) {
    const { stationSlug: slug, liveSince: since, getTransportStats: stats, engine: eng, stop: stopShow } = latest.current
    if (!slug || ending.current) return
    ending.current = true
    setAsking(false)
    reportIdleCheck(slug, byHost ? "ended_by_host" : "ended", { onAirSeconds: onAirSeconds(), hidden: document.hidden })
    if (!byHost) {
      try {
        sessionStorage.setItem(idleEndedKey(slug), String(Date.now()))
      } catch {
        // Storage blocked: the wrap screen just doesn't say why.
      }
    }
    try {
      // Free, so no AutoDJ to hand over to: ending the show takes the station
      // off air, as End show does there.
      await endShow({ slug, liveSince: since, getTransportStats: stats, engine: eng, after: "off_air", stop: stopShow, autoDjLocked: true })
    } catch {
      ending.current = false
      endShowFailed()
      return
    }
    // The studio sends itself to the wrap screen when the show goes idle. A
    // host who wandered to another dashboard page gets taken there too, or
    // they'd never learn why the show stopped.
    const studio = `/dashboard/stations/${slug}/studio`
    if (!latest.current.pathname?.startsWith(studio)) router.push(`${studio}/wrap`)
  }

  return (
    <Dialog open={asking} onOpenChange={(open) => !open && keep()}>
      <DialogContent size="sm" showCloseButton={false} swipeToClose>
        <DialogHeader className="pr-0">
          <DialogTitle>Still at the desk?</DialogTitle>
          <DialogDescription>
            Nobody has touched the studio for {describeDuration(idleMs)}. Free shows need someone at the desk, so this one ends in{" "}
            <span className="font-semibold text-foreground tabular-nums">{formatCountdown(remaining)}</span>.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Want your station to keep playing while you’re away? Pro’s AutoDJ plays your music 24/7, no laptop needed.
        </p>
        {/* The answer most hosts want on a row of its own, full width; the
            other two under it, side by side. Same at every width. */}
        <DialogFooter className="flex-col sm:flex-col sm:*:flex-none">
          <Button size="lg" onClick={keep}>
            Yes, I’m still here
          </Button>
          <div className="flex gap-2.5 *:flex-1">
            <Button size="lg" variant="ghost" onClick={() => void finish(true)}>
              End show
            </Button>
            <Button size="lg" variant="subtle" onClick={getAutoDj}>
              Get AutoDJ
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
