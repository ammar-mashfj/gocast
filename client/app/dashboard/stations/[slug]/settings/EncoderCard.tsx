"use client"

import { useEffect, useRef, useState } from "react"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Disclosure } from "@/components/ds/Disclosure"
import { SettingsTile } from "./SettingsTile"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { ProTag } from "@/components/ds/Tag"
import { EncoderConnection } from "@/components/dashboard/EncoderConnection"
import { useProRequest } from "@/contexts/ProRequestContext"
import { useStationPower } from "@/hooks/useStationPower"
import { useStationStatus } from "@/hooks/useStationStatus"
import { StationEncoder } from "@/interfaces/Station"
import api from "@/lib/axios"

/**
 * How often the watcher below asks whether the encoder has turned up. A
 * person is sitting in front of BUTT with Connect pressed, watching; ten
 * seconds of "waiting" after their software says Connected reads as broken.
 * The route allows 120/min and answers from a short server-side cache.
 */
const WATCH_POLL_MS = 2000
/** A start the poll never sees come up is given up on after this; a normal one takes seconds. */
const START_GIVE_UP_MS = 30_000

interface EncoderCardProps {
  slug: string
  stationName: string
  /**
   * Undefined means the API withheld it, which is three different facts the
   * card has to tell apart: the plan does not include the encoder, the account
   * is not the owner (impossible on this page), or no ingest router is
   * deployed here. `encoderLocked` separates the first from the third.
   */
  encoder?: StationEncoder
  /** The plan does not include external encoders. */
  locked: boolean
}

/**
 * Everything a DJ types into BUTT, Mixxx or RadioDJ.
 *
 * A settings tile that opens in a dialog, so the two-column page stays in
 * line. It stays on the page rather than being a one-off because it is not
 * one: the same five values get retyped on a second machine, after a
 * reinstall, and whenever somebody's encoder forgets them. That is also why
 * the key is redisplayed rather than shown once — see the migration that
 * added the column.
 *
 * The prose here is not decoration. Every line of it is a support ticket that
 * has already been paid for somewhere: the wrong server type, a station that
 * is switched off, and a rotation that did not kick the person who was on air.
 */
export function EncoderCard({ slug, stationName, encoder, locked }: EncoderCardProps) {
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()
  const proRequest = useProRequest()
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [rotating, setRotating] = useState(false)
  /**
   * The key the rotate endpoint just handed back, held only until the
   * server-rendered `encoder` prop catches up.
   *
   * Without it the card shows the OLD key for as long as router.refresh()
   * takes — and that is the one moment somebody is looking straight at the
   * field to copy it, having just been told a new one exists. Pasting the old
   * value into BUTT fails at the next reconnect with no clue why.
   *
   * Carries the server's `rotated_at` alongside the key, because the override
   * needs to know whether an arriving prop is NEWER than it or older. See the
   * effect below.
   */
  const [rotated, setRotated] = useState<{ key: string | null; at: string | null } | null>(null)

  // Lift the override once the props have caught up — otherwise this component
  // would pin one value forever and never show a key rotated somewhere else.
  //
  // Compared by `rotated_at` rather than by the key itself, because "caught up"
  // is a question about ORDER and the key is just an opaque string. Two
  // rotations in quick succession put two router.refresh() calls in flight and
  // they can land out of order: clearing on any prop change would drop back to
  // the first refresh's now-dead key, while clearing only on an exact key match
  // would ignore a rotation from another tab forever. A timestamp answers both
  // — anything at or after ours supersedes it, anything before it is a stale
  // refresh still in flight.
  useEffect(() => {
    if (
      rotated !== null &&
      encoder?.rotated_at &&
      (rotated.at === null || encoder.rotated_at >= rotated.at)
    ) {
      setRotated(null)
    }
  }, [encoder?.rotated_at, rotated])

  async function rotate() {
    if (rotating) return
    const ok = await confirm({
      title: "Generate a new stream key?",
      description: "Your encoders keep working until they next reconnect, and then they need the new key.",
      confirmLabel: "Generate new key",
      keepLabel: "Keep current key",
    })
    if (!ok) return

    setRotating(true)
    try {
      // The response already carries the new station payload, so the key is
      // in hand before router.refresh() has even been issued. Reading it here
      // rather than waiting for the refetch is what keeps the field from
      // showing the old value while the toast says there is a new one.
      const res = await api.post<{
        data?: { encoder?: { password?: string | null; rotated_at?: string | null } }
      }>(`/stations/${slug}/stream-key`)
      setRotated({
        key: res.data?.data?.encoder?.password ?? null,
        at: res.data?.data?.encoder?.rotated_at ?? null,
      })
      // Reveal it: the only reason to rotate is to go and paste the new one.
      setRevealed(true)
      toast.success("New stream key generated")
      router.refresh()
    } catch {
      toast.error("Couldn't generate a new key")
    } finally {
      setRotating(false)
    }
  }

  const password = rotated ? rotated.key : encoder?.password ?? null

  // Free plans get the fold LOCKED, not hidden: it's a Pro selling point, and
  // a feature nobody can see sells nothing.
  if (locked) {
    return (
      <SettingsTile
        id="encoder"
        title={
          <span className="inline-flex items-center gap-2">
            Use your own DJ software <ProTag />
          </span>
        }
        description="Go live from BUTT, Mixxx or RadioDJ instead of the browser."
        open={open}
        onOpenChange={setOpen}
      >
        <div className="flex flex-col items-start gap-4 text-body-sm text-muted-foreground">
          <p>
            Any software that can send to an Icecast server can go live on {stationName}, with its own server address and stream key, so you keep
            broadcasting with the tools you already know.
          </p>
          {/* Opens the request form — payment is arranged by email. */}
          {/* Closed first: the request form is a dialog of its own. */}
          <Button
            variant="pro"
            size="lg"
            className="w-full"
            onClick={() => {
              setOpen(false)
              proRequest.open()
            }}
            disabled={proRequest.requested}
          >
            {proRequest.requested ? "Request sent" : "Get Pro"}
          </Button>
        </div>
      </SettingsTile>
    )
  }

  return (
    // The id is the pre-flight page's "Using DJ software instead?" anchor.
    <SettingsTile
      id="encoder"
      title="Use your own DJ software"
      description="Optional. Skip this if you go live from the browser."
      open={open}
      onOpenChange={setOpen}
    >
      <div className="text-body-sm text-muted-foreground">
      {!encoder ? (
        // The plan allows it, but this deployment has no ingest router
        // published, so there is no honest address to print.
        <p>Own-software broadcasting isn’t available on this server yet. The browser studio still works for {stationName}.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p>
            Pick <span className="font-semibold text-foreground">Icecast 2</span> as the server type and fill in these five values. Works with BUTT,
            Mixxx, RadioDJ, Audio Hijack and ffmpeg.
          </p>

          <EncoderConnection encoder={encoder} password={password} revealed={revealed} onToggleReveal={() => setRevealed((r) => !r)} />

          {/* Mounted only while the dialog is open (its content unmounts
              when closed), so the 2s poll runs only while someone is
              looking at the values and waiting for their software. */}
          <ConnectionWatcher slug={slug} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body-sm text-text-faint">Pasted your key somewhere public? Make a new one.</span>
            <Button size="sm" variant="ghost" onClick={rotate} disabled={rotating}>
              {rotating ? "Making a new key…" : "New key"}
            </Button>
          </div>

          {/* Each of these is a support conversation that happens without it. */}
          <div className="flex flex-col gap-1.5">
            {TIPS.map((tip) => (
              <Disclosure key={tip.q} title={tip.q}>
                {tip.a}
              </Disclosure>
            ))}
          </div>

          {/* New tab, like every help link — see HelpLink. */}
          <Link
            href="/help/my-encoder-wont-connect"
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Still not connecting? Five things cause nearly all of it →
          </Link>
        </div>
      )}
      </div>
      {confirmDialog}
    </SettingsTile>
  )
}

const TIPS = [
  {
    q: "Turn the station on first?",
    a: "Yes. Press Put it on air above (or Start AutoDJ on the Overview), then connect. Your software connects to the station itself, so there’s nothing to connect to while it’s off air.",
  },
  {
    q: "Shoutcast doesn’t work?",
    a: "Shoutcast can’t send the Mount value, so it never reaches your station. Choose Icecast 2 even if your software defaults to Shoutcast.",
  },
  {
    q: "Does a new key kick me off?",
    a: "No. A show already on air keeps running; the new key applies the next time your software connects. To cut someone off now, turn the station off on the Overview, then make a new key here so they can’t reconnect.",
  },
  {
    q: "Is this connection private?",
    a: "It isn’t encrypted. Your software sends the key as plain text, so treat it like a password on a shared network, and make a new one if you ever paste it somewhere public.",
  },
]

/**
 * Is anybody there?
 *
 * The values above are five things to type, and then the card would go
 * quiet, leaving the one question a DJ has ("did that work?") to be answered
 * by opening the player page and listening. Worse, the two ways it can
 * silently fail look the same from the encoder's side: a station that is off
 * air and a mount someone else holds both show up in BUTT as a connection
 * that fails or carries nothing.
 *
 * So this watches `live_source` on its own 2s poll and says which state the
 * station is in: off (with the button that turns it on), starting, waiting,
 * taken by another source, or connected. Guarded on the station running: a
 * session row can outlive its container when a `live_disconnected` is lost,
 * and a stopped station cannot have anyone on air whatever its rows claim.
 */
function ConnectionWatcher({ slug }: { slug: string }) {
  const router = useRouter()
  const { status } = useStationStatus(slug, true, WATCH_POLL_MS)
  // The dashboard's shared poll feeds the band and the overview; nudged when
  // the encoder lands so they say "live" at once rather than at their own
  // pace (thirty seconds for an idle station).
  const { refresh: refreshShared } = useStationStatus(slug)
  const power = useStationPower(slug)
  // Covers the gap between a start being accepted and the poll noticing:
  // /start answers before the container is up, and without this the card
  // would snap back to "off air" right after the click.
  // Cleared once a read sees the station running, so a stop later (another
  // tab, the sweep) shows OFF AIR and its button again; and after
  // START_GIVE_UP_MS if it never comes up, which says so.
  const [startRequested, setStartRequested] = useState(false)
  const [startFailed, setStartFailed] = useState(false)

  const running = status !== null && status.state !== "offline"
  if (startRequested && running) setStartRequested(false)
  if (startFailed && running) setStartFailed(false)

  useEffect(() => {
    if (!startRequested) return
    const t = setTimeout(() => {
      setStartRequested(false)
      setStartFailed(true)
    }, START_GIVE_UP_MS)
    return () => clearTimeout(t)
  }, [startRequested])
  const live = status?.live_source ?? null
  const connected = running && live?.type === "external"
  const otherLive = running && live !== null && live.type !== "external"
  const settling = status !== null && (status.state === "starting" || !status.reachable)

  // Fire once per connection, not on every 2s sample: refresh() is a request.
  const announced = useRef(false)
  useEffect(() => {
    if (!connected) {
      announced.current = false
      return
    }
    if (announced.current) return
    announced.current = true
    void refreshShared()
    router.refresh()
  }, [connected, refreshShared, router])

  async function putOnAir() {
    setStartFailed(false)
    if (await power.start()) setStartRequested(true)
  }

  if (status === null) return null

  if (connected) {
    return (
      <Watch tone="live" label="CONNECTED">
        <span className="font-semibold text-foreground">{live?.client ? `${live.client} is connected.` : "Your encoder is connected."}</span>{" "}
        This station is live.
      </Watch>
    )
  }

  if (otherLive) {
    return (
      <Watch tone="warn" label="TAKEN">
        <span className="font-semibold text-foreground">Something else is already broadcasting.</span>{" "}
        This station takes one source at a time, so your software is turned away until that show ends.
      </Watch>
    )
  }

  if (!running && !startRequested) {
    return (
      <Watch
        tone="off"
        label="OFF AIR"
        action={
          <Button size="sm" variant="subtle" onClick={putOnAir} disabled={power.pending !== null}>
            {power.pending === "start" && <IconLoader2 className="animate-spin" />}
            Put it on air
          </Button>
        }
      >
        {startFailed ? (
          <>
            <span className="font-semibold text-foreground">The station didn’t start.</span>{" "}
            Try again.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">This station is off air.</span>{" "}
            Your software connects to the station itself, so there is nothing listening until it is on.
          </>
        )}
      </Watch>
    )
  }

  const starting = !running || settling
  return (
    <Watch tone="onair" label={starting ? "STARTING" : "WAITING"} bar={!starting}>
      {starting ? "Starting the station. Give it a few seconds, then connect." : "This station is on air. Waiting for your software to connect."}
    </Watch>
  )
}

/** One state of the watcher: a lamp, a sentence, and a button or a waiting bar. */
function Watch({
  tone,
  label,
  children,
  action,
  bar = false,
}: {
  tone: "off" | "onair" | "live" | "warn"
  label: string
  children: React.ReactNode
  action?: React.ReactNode
  /** Indeterminate, because the wait is: it ends when someone presses Connect elsewhere. */
  bar?: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-panel bg-surface-inset p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3.5">
        <StatusLamp tone={tone} variant="soft" pulse={tone === "onair"} className="shrink-0">
          {label}
        </StatusLamp>
        <p className="text-body-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
      {action}
      {bar && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-strong" role="progressbar" aria-label="Waiting for your software to connect">
          {/* Reduced motion: a still, dimmed full bar reads as waiting, not as a third done. */}
          <div className="h-full w-1/3 rounded-full bg-on-air animate-indeterminate motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-on-air/40" />
        </div>
      )}
    </div>
  )
}
