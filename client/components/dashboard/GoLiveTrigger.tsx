"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  IconMusic,
  IconPlugConnected,
  IconArrowLeft,
  IconSparkles,
  IconLoader2,
  IconSettings,
  IconCircleCheck,
} from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EncoderConnection } from "@/components/dashboard/EncoderConnection"
import { useEncoderLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { useStationStatus } from "@/hooks/useStationStatus"
import { Station } from "@/interfaces/Station"
import { StationStatus } from "@/interfaces/StationStatus"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"

/**
 * How often the encoder panel asks whether a broadcaster has turned up.
 *
 * Faster than the hook's own pacing, which tops out at ten seconds for a
 * station that is merely on air — the state this panel spends all its time
 * watching. Ten seconds of "waiting…" after BUTT already says Connected reads
 * as a broken dialog. The route allows 120/min and the answer is served from a
 * short server-side cache, so 2s costs 30/min against a budget that the
 * overview's own poll barely touches.
 */
const WATCH_POLL_MS = 2000

interface GoLiveTriggerProps {
  /**
   * The full station, not just its slug: the encoder option below needs
   * `encoder` (the connection details the API composed) and the station's
   * power state, and both arrive on the same payload the callers already hold.
   */
  station: Station
  /**
   * A fresher answer than `station.desired_state`, from a caller that is
   * already polling status. StationPower has one; nothing else does.
   *
   * It matters because of what the encoder panel does with it: the server
   * payload was rendered when the page was, so a station switched on thirty
   * seconds ago still reads as stopped there, and the panel would tell someone
   * to put a station on air that is already running.
   */
  isRunning?: boolean
  /**
   * Re-read the caller's own status poll, because this dialog has just learnt
   * something it does not know.
   *
   * WITHOUT THIS THE CARD UNDERNEATH GOES STALE, and visibly: the encoder
   * panel polls at WATCH_POLL_MS to catch a connection within a couple of
   * seconds, while StationPower's poll paces an on-air station at up to ten.
   * So the dialog would say "Connected", you would close it, and the card
   * behind it would keep saying "Silence" — the last thing its own poll saw —
   * for up to ten seconds. Nothing was wrong with the audio; two polls of one
   * endpoint simply disagreed, and the newer one was thrown away on close.
   *
   * Optional: a caller with no status of its own (StationActions) has nothing
   * to refresh and passes nothing.
   */
  onStatusChanged?: () => void
  /** Trigger element(s). Wrapped in a span that catches the click. */
  children: ReactNode
}

/**
 * Wraps any clickable element to ask which ROUTE a broadcast takes before
 * navigating to `/dashboard/stations/{slug}/live`. Used by every "Go live"
 * affordance — primary button, station-card hover link, last-broadcast
 * "Go live again".
 *
 * THE MICROPHONE IS NOT ASKED ABOUT HERE, and its absence is the point. This
 * dialog used to offer "Files and microphone" and "Files only" as sibling
 * options, which made a single boolean look like two ways of going on air —
 * and then asked it again one click later, because the live page's
 * PreflightView already carries a live mic toggle and calls itself "the last
 * chance to swap between mic+music and music-only".
 *
 * Preflight is the better place for it: it names the station, shows the URL
 * listeners will use, explains what the browser will and will not prompt for,
 * and has a Cancel. It also persists the choice, so a DJ who always broadcasts
 * without a mic keeps that setting between shows.
 *
 * What is left here is the one question preflight CANNOT answer, because by
 * then the answer is already assumed: whether this broadcast comes from the
 * browser at all, or from BUTT, Mixxx or anything else speaking Icecast 2.
 * Two options that are genuinely different in kind, and no settings.
 */
export function GoLiveTrigger({
  station,
  isRunning,
  onStatusChanged,
  children,
}: GoLiveTriggerProps) {
  const router = useRouter()
  const proRequest = useProRequest()
  const encoderLocked = useEncoderLocked()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"pick" | "encoder">("pick")

  function start() {
    setOpen(false)
    // Nothing written to `broadcast:micDisabled:{slug}` on the way. The live
    // page reads that key on mount and PreflightView writes it, so leaving it
    // alone is what lets the last choice survive to the next broadcast —
    // where this used to reset it on every single go-live.
    router.push(`/dashboard/stations/${station.slug}/live`)
  }

  // Shown when the plan allows it, and shown LOCKED when it does not — the
  // same call the settings card makes, and for the same reason: a feature
  // nobody can see sells nothing.
  //
  // Hidden in exactly one case, which is neither of those: a plan that allows
  // it on a deployment with no ingest router published. There is no honest
  // address to print and nothing to sell, so the option is absent rather than
  // present and apologetic.
  const showEncoder = encoderLocked || station.encoder !== undefined

  return (
    <>
      <span
        className="contents"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setView("pick")
          setOpen(true)
        }}
      >
        {children}
      </span>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            // Reset on close rather than on open, so the picker never flashes
            // behind a closing dialog.
            setView("pick")
            // Hand over whatever happened in here — a station put on air, an
            // encoder connected — rather than leaving the page to notice on
            // its own schedule. Unconditional: cheap, and it also covers the
            // close paths that did something without connecting anything.
            onStatusChanged?.()
          }
        }}
      >
        {/* No height cap here: DialogContent already caps itself at
            `100dvh - 2rem` and scrolls, which is the right behaviour for the
            taller encoder panel (five values, a setup accordion and a power
            banner) and handles mobile browser chrome that a vh unit does
            not. */}
        <DialogContent className="sm:max-w-md md:max-w-lg">
          {view === "encoder" ? (
            <EncoderView
              station={station}
              isRunning={isRunning ?? station.desired_state === "running"}
              locked={encoderLocked}
              onBack={() => setView("pick")}
              onRequestPro={proRequest.open}
              proRequested={proRequest.requested}
              onStatusChanged={onStatusChanged}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>How do you want to broadcast?</DialogTitle>
                <DialogDescription className="mt-2 text-sm">
                  Pick how you want to go on air for {station.name}.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <ModeButton
                  icon={<IconMusic size={18} className="text-primary" />}
                  iconClass="bg-primary/10"
                  title="Go live from this browser"
                  // The second sentence is doing real work: it is the answer
                  // to "where did the files-only option go?", asked before
                  // anyone has to wonder it.
                  description="Play audio files from this tab and talk over them with push-to-talk. You can turn the microphone off on the next screen."
                  onClick={start}
                />

                {showEncoder && (
                  <ModeButton
                    className="mt-2"
                    icon={<IconPlugConnected size={18} className="text-muted-foreground" />}
                    iconClass="bg-muted"
                    title={
                      <>
                        From a broadcast app
                        {encoderLocked && (
                          <Badge variant="secondary" className="ml-2 text-[9px] align-middle">
                            PRO
                          </Badge>
                        )}
                      </>
                    }
                    description="BUTT, Mixxx, RadioDJ, Audio Hijack — anything that speaks Icecast 2. Connect it to this station instead of using the browser."
                    onClick={() => setView("encoder")}
                  />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** One choice in the picker. */
function ModeButton({
  icon,
  iconClass,
  title,
  description,
  onClick,
  className,
}: {
  icon: ReactNode
  iconClass: string
  title: ReactNode
  description: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent bg-transparent cursor-pointer", className)}
    >
      <div
        className={cn(
          "size-11 rounded-lg flex items-center justify-center shrink-0 mt-0.5 self-center",
          iconClass,
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold">{title}</div>
        <div className="text-sm text-muted-foreground mt-2">{description}</div>
      </div>
    </button>
  )
}

/**
 * The connection details, in the dialog.
 *
 * Deliberately NOT the settings card in a modal. It leaves out the things that
 * want a durable page — rotating the key, the note about what a rotation does
 * and does not interrupt, the plaintext-protocol warning — and links to them
 * instead. What it adds is the thing settings cannot know: whether the station
 * is actually on air right now.
 */
function EncoderView({
  station,
  isRunning,
  locked,
  onBack,
  onRequestPro,
  proRequested,
  onStatusChanged,
}: {
  station: Station
  isRunning: boolean
  locked: boolean
  onBack: () => void
  onRequestPro: () => void
  proRequested: boolean
  onStatusChanged?: () => void
}) {
  const router = useRouter()
  const [revealed, setRevealed] = useState(false)
  const [starting, setStarting] = useState(false)
  /**
   * Watch for the broadcaster turning up.
   *
   * Scoped to this component's lifetime, which is exactly right: Radix
   * unmounts dialog content on close, so the poll starts when the panel opens
   * and stops when it closes. No `enabled` flag needed, and no poll running
   * behind a dialog nobody has opened.
   *
   * `live_source` is what makes this possible at all — it reads the open
   * StreamSession, whose `source_type` harbor's connect callback set from the
   * request headers. Before external ingest shipped every session was
   * hardcoded 'browser', so "has my encoder connected?" was not a question the
   * API could answer.
   */
  const { status } = useStationStatus(station.slug, true, WATCH_POLL_MS)
  // Set once a start has been accepted. The station payload behind this dialog
  // was rendered before that, so it is the only thing that knows.
  const [startRequested, setStartRequested] = useState(false)

  async function powerOn() {
    if (starting) return
    setStarting(true)
    try {
      await api.post(`/stations/${station.slug}/start`)
      setStartRequested(true)
      // The page underneath still shows the station off air, including the
      // power card this dialog was very likely opened from.
      //
      // Through onStatusChanged where there is one, because `router.refresh()`
      // alone only fixes the SERVER-rendered half. The card's badge comes from
      // a client poll that paces an offline station at thirty seconds — so a
      // bare refresh here left it reading "Off air" for half a minute after
      // the station had visibly started.
      if (onStatusChanged) {
        onStatusChanged()
      } else {
        router.refresh()
      }
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(message ?? "Couldn't put the station on air")
    } finally {
      setStarting(false)
    }
  }

  const back = (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
      <IconArrowLeft size={14} data-icon="inline-start" />
      Back
    </Button>
  )

  if (locked) {
    return (
      <>
        <DialogHeader>
          {back}
          <DialogTitle>
            Broadcast from your own software
            <Badge variant="secondary" className="ml-2 text-[9px] align-middle">PRO</Badge>
          </DialogTitle>
          <DialogDescription>
            Go live from BUTT, Mixxx, RadioDJ, Audio Hijack — anything that speaks
            the Icecast 2 source protocol — instead of the browser studio.
            {station.name} gets its own server address and stream key, and you can
            keep broadcasting with the tools you already know.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Button variant="outline" onClick={onRequestPro}>
            <IconSparkles size={16} data-icon="inline-start" />
            {proRequested ? "Request sent" : "Request access"}
          </Button>
        </div>
      </>
    )
  }

  // Unreachable: the option that opens this view is hidden when the plan
  // allows the encoder and no `encoder` block came back. Narrowing for the
  // compiler, and a visible answer rather than a blank dialog if that ever
  // stops being true.
  if (!station.encoder) {
    return (
      <>
        <DialogHeader>
          {back}
          <DialogTitle>Broadcast from your own software</DialogTitle>
          <DialogDescription>
            External encoder ingest isn&apos;t available on this server yet. The
            browser studio still works for {station.name}.
          </DialogDescription>
        </DialogHeader>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        {back}
        <DialogTitle>Connect your broadcast app</DialogTitle>
        <DialogDescription>
          Set the server type to{" "}
          <span className="text-foreground font-medium">Icecast 2</span> — not
          Shoutcast — and fill in these five values.
        </DialogDescription>
      </DialogHeader>

      {/* THE STEP THE BROWSER PATH DOES FOR YOU, and then the answer to the
          question everybody asks next.

          Going live from the studio posts /start on the way, so nobody has to
          think about the station's power state. An encoder connects to the
          station's own container, so there is nothing listening while it is
          off air — and the router cannot say so: it answers a connection it
          cannot route by closing it, which surfaces in BUTT as a socket error
          indistinguishable from a wrong stream key.

          Never blocks the values. Copying them into an encoder is worth doing
          before the station is on, and hiding them behind a power button would
          be one more thing between someone and a working setup. */}
      <ConnectionWatcher
        stationName={station.name}
        status={status}
        isRunning={isRunning}
        startRequested={startRequested}
        starting={starting}
        onPowerOn={powerOn}
        onConnected={onStatusChanged}
      />

      <div className="flex flex-col gap-4">
        <EncoderConnection
          encoder={station.encoder}
          password={station.encoder.password}
          revealed={revealed}
          onToggleReveal={() => setRevealed((r) => !r)}
        />
      </div>

      {/* Rotation lives on the settings card, not here. It is the one action
          in this feature that can break a broadcast someone else is running,
          and it belongs on a page that can be linked to and returned to —
          not behind a dialog that has to be opened from a button labelled
          "Go live". */}
      <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
        <Link href={`/dashboard/stations/${station.slug}/settings#encoder`}>
          <IconSettings size={14} data-icon="inline-start" />
          Manage your stream key
        </Link>
      </Button>
    </>
  )
}

/**
 * Is anybody there?
 *
 * The panel above hands over five values and then, without this, goes quiet —
 * leaving the one question a DJ actually has ("did that work?") to be answered
 * by alt-tabbing to the player page and listening. Worse, the two ways it can
 * silently not work are indistinguishable from the encoder's side: a station
 * that is off air and a mount someone else is already holding both surface in
 * BUTT as a connection that fails or a connection that carries nothing.
 *
 * So this watches `live_source` on the status poll and says which of the four
 * states the station is actually in. It is the only part of this dialog that
 * knows something the DJ cannot see from their own software.
 */
function ConnectionWatcher({
  stationName,
  status,
  isRunning,
  startRequested,
  starting,
  onPowerOn,
  onConnected,
}: {
  stationName: string
  status: StationStatus | null
  /** The caller's answer, used until the first poll of our own lands. */
  isRunning: boolean
  startRequested: boolean
  starting: boolean
  onPowerOn: () => void
  /** Fired once per connection, so the page behind can catch up immediately. */
  onConnected?: () => void
}) {
  // Our own poll wins once it has said anything: the prop came from a payload
  // rendered before this dialog opened, and "Put it on air" may have happened
  // since.
  const running = status ? status.state !== "offline" : isRunning
  const live = status?.live_source ?? null

  // Guarded on `running`, and not only for tidiness. A session row outlives
  // the container that opened it when a `live_disconnected` is lost — an
  // OOM-killed encoder container, a network partition — and an unguarded read
  // would cheerfully report a months-dead broadcast as connected. A stopped
  // station cannot have anyone on air whatever its rows claim.
  const connected = running && live?.type === "external"
  const otherLive = running && live !== null && live.type !== "external"

  // Tell the page the moment we know, rather than at close. Someone who
  // connects their encoder and then leaves this dialog open — reading the
  // setup steps, say — would otherwise sit in front of a card still claiming
  // the station is silent.
  //
  // Latched, because this polls every two seconds and `refresh()` is a
  // request: fire once on the transition into connected, and re-arm only when
  // the broadcaster actually goes away.
  const announced = useRef(false)

  useEffect(() => {
    if (!connected) {
      announced.current = false

      return
    }

    if (announced.current) return

    announced.current = true
    onConnected?.()
  }, [connected, onConnected])

  if (connected) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
        <IconCircleCheck size={15} className="text-emerald-400 shrink-0 mt-px" />
        <div className="text-xs leading-relaxed">
          <span className="text-foreground font-medium">
            {/* Naming the software is the difference between "something
                connected" and "MY encoder connected". Null for a client that
                sends no user-agent, and for any container not yet relaunched
                since the template started reporting it. */}
            {live?.client ? `${live.client} is connected` : "Your encoder is connected"}
          </span>{" "}
          <span className="text-muted-foreground">
            — {stationName} is live. You can close this.
          </span>
        </div>
      </div>
    )
  }

  if (otherLive) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3 text-xs leading-relaxed">
        <span className="text-foreground font-medium">
          Something else is already broadcasting.
        </span>
        <span className="text-muted-foreground">
          {/* Harbor takes one source per mount. Said here because the encoder
              will simply be refused, and a DJ reading that refusal has no way
              to know it was about a browser tab they left open. */}
          {stationName} takes one source at a time, so your encoder will be
          turned away until that broadcast ends.
        </span>
      </div>
    )
  }

  if (!running) {
    // `startRequested` covers the gap between a start being accepted and the
    // poll noticing: /start answers 202 and the container takes a moment, so
    // without it the panel snaps back to "off air" right after the click.
    return startRequested ? (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
        Starting {stationName} — give it a few seconds, then connect.
      </div>
    ) : (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3">
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{stationName} is off air.</span>{" "}
          Your encoder connects to the station itself, so there is nothing
          listening until it is on.
        </div>
        <Button size="sm" className="w-fit" disabled={starting} onClick={onPowerOn}>
          {starting && (
            <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
          )}
          Put it on air
        </Button>
      </div>
    )
  }

  // Requires a status we actually have. Written as `!status?.reachable` it was
  // true before the first poll landed, so a station that had been on air for
  // hours opened this panel claiming to be starting up.
  const settling = status !== null && (status.state === "starting" || !status.reachable)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
        {settling
          ? `Starting ${stationName} — give it a few seconds, then connect.`
          : `${stationName} is on air. Waiting for your encoder…`}
      </div>
      {/* Indeterminate, because the wait is: it ends when a person presses
          Connect in another application, which could be two seconds or two
          minutes away. A bar that filled to 100% and stopped would say this
          failed, and one that pretended to know a duration would be inventing
          it. See --animate-indeterminate in globals.css. */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`Waiting for an encoder to connect to ${stationName}`}
      >
        <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
      </div>
    </div>
  )
}
