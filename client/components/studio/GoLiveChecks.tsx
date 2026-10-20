"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { MIC_TRIES, useMicFailures } from "@/lib/micFailures"
import { CheckList } from "@/components/dashboard/golive/CheckList"
import { MicPermissionLink } from "@/components/dashboard/golive/MicPermissionLink"

/** A step spinning this long gets a hint and a way out. */
const SLOW_STEP_MS = 5_000
/** How long "You're on air" stays up before the studio shows. */
const ON_AIR_MS = 1_200

/** No device at all, as opposed to a refused permission: different advice. */
const isNoMic = (message: string | null) => !!message && /no microphone found/i.test(message)
/** Another app holds the mic. */
const isMicBusy = (message: string | null) => !!message && /microphone in use/i.test(message)

/** What to say under a step that's taking a while. */
const SLOW_HINT: Record<string, string> = {
  network: "Taking longer than usual. Check your internet connection.",
  station: "Taking longer than usual. Your station is starting up.",
  mic: "Waiting for the microphone. Look for your browser’s permission prompt.",
  engine: "Taking longer than usual. Setting up audio in this tab.",
}

/**
 * The go-live checks, over the studio. Go live on the Go Live page starts
 * them and opens the studio straight away; this runs them where the show
 * will happen, then goes on air the moment they pass — no second press.
 *
 * Not dismissable while it runs (no ×, no swipe, Escape ignored): the way
 * out is Stop, which only appears once a step is slow, or Back to setup
 * after a failure. "Step n of N" and the step names are what a host would
 * screenshot to say where it got stuck.
 */
export function GoLiveChecks({ stationName }: { stationName: string }) {
  const { state, steps, error, goLive, retry, stop, micDisabled, liveSince, stationSlug } = useBroadcast()
  const autoDjLocked = useAutoDjLocked()
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const checking = state === "connecting" || state === "ready"
  const failed = state === "error"

  // Ready → on air, without a second press.
  const wentLive = useRef(false)
  useEffect(() => {
    if (state !== "ready" || wentLive.current) return
    wentLive.current = true
    void goLive()
  }, [state, goLive])
  useEffect(() => {
    if (state === "connecting" || state === "error") wentLive.current = false
  }, [state])

  // Derived from changes of `state` and of the running step, adjusted while
  // rendering (React's pattern for state that follows a prop) rather than
  // in effects: "You're on air" for a moment after the switch to live, and
  // whether this is still about getting on air — a show that was live and
  // later failed for good is the studio's and the band's to report, not
  // "Couldn't go live".
  const active = steps.find((s) => s.status === "active")
  const activeId = active?.id ?? null
  const [seen, setSeen] = useState({ state, activeId })
  const [onAirShown, setOnAirShown] = useState(false)
  // From the provider when this mounts mid-show: back in the studio after a
  // trip to Library, a show that then fails for good is a lost show, not a
  // failed start. liveSince outlives `error`; a new run clears it.
  const [everLive, setEverLive] = useState(() => liveSince !== null || state === "live" || state === "reconnecting")
  const [slow, setSlow] = useState(false)
  const everLiveRef = useRef(everLive)
  useEffect(() => {
    everLiveRef.current = everLive
  }, [everLive])
  if (seen.state !== state || seen.activeId !== activeId) {
    if (seen.state !== state) {
      if (state === "live" && (seen.state === "ready" || seen.state === "connecting")) setOnAirShown(true)
      if (state === "live") setEverLive(true)
      if (state === "connecting") setEverLive(false)
    }
    if (seen.activeId !== activeId) setSlow(false)
    setSeen({ state, activeId })
  }

  // Timers only set state from their callbacks.
  useEffect(() => {
    if (!onAirShown) return
    const t = setTimeout(() => setOnAirShown(false), ON_AIR_MS)
    return () => clearTimeout(t)
  }, [onAirShown])
  useEffect(() => {
    if (!activeId) return
    const t = setTimeout(() => setSlow(true), SLOW_STEP_MS)
    return () => clearTimeout(t)
  }, [activeId])

  // Leaving the studio mid-checks: nothing is out yet, so let it all go.
  // Deferred a tick and only if still unmounted: this mounts while the
  // checks are already running, and React's development double-mount (mount,
  // unmount, mount) would otherwise stop them on the fake unmount and send
  // the host straight back to the Go Live page.
  // A station the checks turned on is handed back, as Stop does (back()):
  // read through a ref, so the plan loading doesn't re-run this effect.
  const mounted = useRef(false)
  const autoDjLockedRef = useRef(autoDjLocked)
  useEffect(() => {
    autoDjLockedRef.current = autoDjLocked
  }, [autoDjLocked])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setTimeout(() => {
        // `error` too: a check that failed after POST /start (a blocked mic)
        // left a station on that only Back to setup handed back; leaving by
        // the sidebar instead kept it airing silence until the sweep.
        // Not an `error` that aired, though: that is a lost show, and coming
        // back to the studio must still offer Go back on air and End show.
        const s = stateRef.current
        if (mounted.current || (s !== "ready" && s !== "connecting" && s !== "error")) return
        if (s === "error" && everLiveRef.current) return
        void stop({ releaseStation: autoDjLockedRef.current ? "if-started-here" : false })
      }, 0)
    }
  }, [stop])

  // Stop / Back to setup: hands back a station the checks turned on — only
  // without AutoDJ, the same rule as End (EndBroadcast). The studio sends an
  // idle tab back to the Go Live page by itself.
  function back() {
    void stop({ releaseStation: autoDjLocked ? "if-started-here" : false })
  }

  const open = (!everLive && (checking || failed)) || onAirShown
  const doneCount = steps.filter((s) => s.status === "done").length
  const stepNo = Math.min(steps.length, doneCount + 1)
  // By the step that failed, not the wording: any failure asking for the mic
  // (denied, dismissed, auto-blocked, busy) offers music only.
  const micBlocked = failed && !micDisabled && steps.some((s) => s.id === "mic" && s.status === "error")
  const noMic = micBlocked && isNoMic(error)
  const micBusy = micBlocked && isMicBusy(error)
  // Counted once per failure; cleared when the mic opens.
  const micDone = steps.some((s) => s.id === "mic" && s.status === "done")
  // Shared with the Go live page's mic check, per station: refusals add up.
  const micFailures = useMicFailures(stationSlug, micBlocked && !noMic && !micBusy, micDone)
  // Refused (not missing or busy) too often: the browser has stopped asking.
  const micGivenUp = micBlocked && !noMic && !micBusy && micFailures >= MIC_TRIES

  // Every check passed but not on air yet: a blink. Never "You're on air"
  // until it is.
  const passed = state === "ready" && doneCount === steps.length
  const title = failed ? "Couldn’t go live" : onAirShown ? "You’re on air" : passed ? "Checks passed" : "Going live"
  const description = failed
    ? "Nobody heard anything."
    : onAirShown
      ? stationName
      : passed
        ? `${stationName} · Going on air…`
        : `${stationName} · Step ${stepNo} of ${steps.length}`

  return (
    // Closable (×, Escape, swiping the phone sheet down): with no way out a
    // phone was stuck on a failure. Closing during the checks or after a
    // failure is Back to setup (which hands back a station the run turned
    // on); closing "You're on air" just dismisses it. A tap outside still
    // does nothing, so a stray tap can't cancel a show starting.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (onAirShown) setOnAirShown(false)
        else back()
      }}
    >
      <DialogContent
        size="sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="truncate">{description}</DialogDescription>
        </DialogHeader>

        {/* After a failure, only the checks that ran: the ones never reached
            pushed the options (music only, Try again, Back) below the fold
            on a phone. A refused mic, first in line, leaves just that row. */}
        <CheckList steps={failed ? steps.filter((s) => s.status !== "pending") : steps} />


        {checking && slow && active && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-sm text-muted-foreground">{SLOW_HINT[active.id] ?? "Taking longer than usual."}</p>
            <Button variant="quiet" size="sm" onClick={back}>
              Stop
            </Button>
          </div>
        )}

        {micBlocked ? (
          // Stacked for this narrow dialog: the lamp over the sentence (side
          // by side it squeezed the text into a thin column), then the way
          // forward full width, then the two other options as equal halves.
          <div className="flex flex-col gap-3">
            <div role="alert" className="flex flex-col items-start gap-2.5 rounded-panel bg-fault-tint p-4.5 text-fault-text">
              <StatusLamp tone="warn" variant="solid">
                {noMic ? "No microphone" : micBusy ? "Mic in use" : "Mic blocked"}
              </StatusLamp>
              <p className="text-body leading-relaxed text-pretty">
                {noMic
                  ? "This device has no microphone. Plug one in and try again, or go live with music only."
                  : micBusy
                    ? "Another app is using your microphone. Close it and try again, or go live with music only."
                    : micGivenUp
                      ? "Your mic is blocked. Allow it in your browser’s settings, or go live with music only."
                      : "Allow the microphone for this site in your browser’s settings and try again, or go live with music only."}
              </p>
            </div>
            <Button size="lg" full onClick={() => void retry({ skipMic: true })}>
              Go live with music only
            </Button>
            {/* Try again goes once the browser has stopped asking; How to
                allow it only applies to a permission (not a missing or busy mic). */}
            <div className={micGivenUp || noMic || micBusy ? "grid" : "grid grid-cols-2 gap-2.5"}>
              {!micGivenUp && (
                <Button size="lg" variant="ghost" onClick={() => void retry()}>
                  Try again
                </Button>
              )}
              {!noMic && !micBusy && <MicPermissionLink variant="ghost" />}
            </div>
            {/* The way out this box lacked. The mic is checked first, so
                nothing was started; back() would hand back anything that was. */}
            <Button size="lg" variant="quiet" onClick={back}>
              Back to setup
            </Button>
          </div>
        ) : failed ? (
          <>
            <p className="text-body-sm text-fault-text">{error || "Something stopped the broadcast from starting."}</p>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button size="lg" className="sm:flex-1" onClick={() => void retry()}>Try again</Button>
              <Button size="lg" variant="ghost" className="sm:flex-1" onClick={back}>Back to setup</Button>
            </div>
          </>
        ) : null}

        {failed && (
          <Link
            href="/help/go-live-from-your-browser"
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-body-sm text-muted-foreground hover:text-foreground"
          >
            What going live from a browser needs →
          </Link>
        )}
      </DialogContent>
    </Dialog>
  )
}
