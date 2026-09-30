"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  IconCheck,
  IconX,
  IconLoader2,
  IconPlaylist,
  IconMicrophoneOff,
  IconMicrophone,
  IconMusic,
  IconBroadcast,
  IconLink,
  IconRefresh,
  IconPlayerPlay,
  IconPlayerTrackPrev,
  IconTrash,
  IconCopy,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import api from "@/lib/axios"
import type { Station } from "@/interfaces/Station"
import type { StationStatus } from "@/interfaces/StationStatus"
import type { BroadcastStepInfo, StepStatus } from "@/lib/broadcast"
import { env } from "@/lib/env"
import { useCoarsePointer } from "@/lib/useCoarsePointer"
import { SIGNAL_TONE } from "@/components/studio/signal"
import { MicMeter } from "@/components/studio/MicMeter"
import { Select } from "@/components/ui/select"
import { DEFAULT_BITRATE, QUEUE_BYTE_LIMIT } from "@/lib/audioEngine"
import { toast } from "sonner"
import { clearQueue, loadQueueSummary, type SavedQueueSummary } from "@/lib/queueStore"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatBytes, formatTrackTime } from "@/lib/format"

type LampPhase = "starting" | "reconnecting" | "live" | "fault"

/**
 * The studio lamp's language, brought forward to the moment before the
 * studio exists. Unlit while the connection is being made ("Starting" pulses
 * neutral — never amber, never violet), emerald with the LIVE chip once a
 * person is actually on air, and a red edge with the honest reason when it
 * fails. Same chips, same tints, same near-black chip text as OnAirLamp, so
 * the lamp the host sees next in the studio is the one they just watched
 * light up.
 */
const LAMP: Record<LampPhase, { tone: keyof typeof SIGNAL_TONE; label: string }> = {
  starting: { tone: "idle", label: "Starting" },
  reconnecting: { tone: "idle", label: "Reconnecting" },
  live: { tone: "live", label: "Live" },
  fault: { tone: "fault", label: "Not live" },
}

function GoLiveLamp({ phase, detail, announce }: { phase: LampPhase; detail: string; announce: string }) {
  const tone = SIGNAL_TONE[LAMP[phase].tone]
  const fault = phase === "fault"
  return (
    <div
      className={cn(
        // Inline flow, not flex: the chip leads the sentence and the detail
        // runs on after it, wrapping under the chip at the left edge when a
        // phone runs out of width. As a flex row the detail was a two-line
        // sliver beside the chip; stacked in two rows the chip sat alone with
        // the width empty beside it.
        // Smaller chip and type below sm so the step line fits beside the
        // chip on a 375px screen instead of dropping its last word.
        "rounded-[14px] border px-3.5 py-3 text-xs leading-snug transition-colors sm:px-4 sm:text-sm duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        tone.strip,
      )}
    >
      {/* Keyed so each step and each change of state is announced once:
          progress politely, a failure as an alert. */}
      <p key={announce} className="sr-only" role={fault ? "alert" : "status"}>
        {announce}
      </p>
      <span
        key={phase}
        aria-hidden
        className={cn(
          "mr-2.5 inline-flex h-7 items-center gap-1.5 rounded-md px-2 align-middle text-[11px] font-bold uppercase tracking-[0.06em] sm:mr-3 sm:h-8 sm:gap-2 sm:px-3 sm:text-[13px] sm:tracking-[0.08em]",
          tone.chip,
          fault ? "animate-[pulse_0.7s_ease-in-out_3] motion-reduce:animate-none" : "lamp-settle",
        )}
      >
        <span className={cn("size-2 rounded-full bg-current", !fault && "animate-pulse motion-reduce:animate-none")} />
        {LAMP[phase].label}
      </span>
      <span aria-hidden className={cn("align-middle", tone.text)}>
        {detail}
      </span>
    </div>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  const base = "size-5 rounded-full flex items-center justify-center shrink-0"
  // Done is neutral on purpose: emerald means a person is live, and nobody is
  // yet. The lamp is what lights up.
  if (status === "done") return <span className={cn(base, "bg-white/[0.08] text-foreground")}><IconCheck size={13} /></span>
  if (status === "active") return <span className={cn(base, "text-foreground")}><IconLoader2 size={15} className="animate-spin motion-reduce:animate-none" /></span>
  if (status === "error") return <span className={cn(base, "bg-fault/15 text-fault-text")}><IconX size={13} /></span>
  return <span className={cn(base, "border border-white/[0.08]")} />
}

function StepList({ steps }: { steps: BroadcastStepInfo[] }) {
  return (
    <ol className="flex flex-col gap-2.5 text-sm" aria-label="Steps">
      {steps.map((step) => (
        <li
          key={step.id}
          className={cn(
            "flex items-center gap-2.5",
            step.status === "done" ? "text-muted-foreground"
              : step.status === "active" ? "text-foreground"
              : step.status === "error" ? "text-fault-text"
              : "text-text-faint",
          )}
        >
          <StepIcon status={step.status} />
          {/* The lamp carries the reason; the list says which step it was. */}
          <span>
            {step.label}
            <span className="sr-only">
              {step.status === "done" ? " — done" : step.status === "active" ? " — in progress" : step.status === "error" ? " — failed" : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

interface Choice<T> {
  value: T
  icon: typeof IconMicrophone
  title: string
  note: string
}

/** Two big radio cards, the pre-flight screen's one control shape. */
function ChoiceGroup<T>({ labelledBy, options, value, onChange }: {
  labelledBy: string
  options: readonly Choice<T>[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.title}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors min-[480px]:min-h-[64px] ${
              selected
                ? "border-violet/60 bg-primary/10"
                : "border-white/10 hover:border-white/20"
            }`}
          >
            <opt.icon size={18} className={cn("shrink-0", selected ? "text-violet" : "text-muted-foreground")} />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{opt.title}</span>
              <span className="text-xs text-muted-foreground">{opt.note}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * What the studio opens with. The running order lives in this browser's
 * storage, not on the server, so it follows the browser rather than the
 * station — and the studio used to drop the host straight back into the
 * middle of whatever song was playing when they last went off air, unasked.
 * Saying it here, with a choice, means the first sound of the show is one
 * they picked.
 *
 * Under a second in, "pick up where it stopped" and "from the top" are the
 * same thing, so the choice is only offered once there is a difference.
 */
function QueueStatus({ summary, resumeFromStart, onResumeFromStartChange }: {
  summary: SavedQueueSummary | null | undefined
  resumeFromStart: boolean
  onResumeFromStartChange: (fromStart: boolean) => void
}) {
  // Still reading storage — hold the row's height so the buttons don't jump.
  if (summary === undefined) return <Skeleton className="h-[52px] w-full rounded-xl" />

  // Storage unreadable (private window, blocked site data). The studio still
  // works; it just opens with an empty running order, which is what it says.
  if (summary === null || summary.trackCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Empty. Add music files in the studio once you&rsquo;re live.
      </p>
    )
  }

  const { trackCount, bytes, lastTrack } = summary
  const stoppedAt = lastTrack ? formatTrackTime(lastTrack.offset) : null
  const offerChoice = lastTrack !== null && lastTrack.offset >= 1

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1 rounded-lg border border-white/[0.09] bg-[#08080d]/60 px-3 py-2.5">
        <span className="text-xs text-muted-foreground tabular-nums">
          {trackCount} track{trackCount !== 1 ? "s" : ""} saved in this browser · {formatBytes(bytes)} of {formatBytes(QUEUE_BYTE_LIMIT)}
        </span>
        {lastTrack ? (
          <span className="min-w-0 line-clamp-2 text-sm">
            <span className="text-muted-foreground">Last played: </span>
            <span className="font-medium">{lastTrack.title}</span>
            {lastTrack.artist && lastTrack.artist !== "Unknown" && (
              <span className="text-muted-foreground"> · {lastTrack.artist}</span>
            )}
            {offerChoice && <span className="text-muted-foreground tabular-nums">, stopped at {stoppedAt}</span>}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            Nothing was playing last time, so the music waits until you press play.
          </span>
        )}
      </div>
      {offerChoice && (
        <ChoiceGroup
          labelledBy="queue-label"
          value={resumeFromStart}
          onChange={onResumeFromStartChange}
          options={[
            { value: false, icon: IconPlayerPlay, title: `Pick up at ${stoppedAt}`, note: "Right where it stopped" },
            { value: true, icon: IconPlayerTrackPrev, title: "Start it over", note: "Same song, from 0:00" },
          ] as const}
        />
      )}
    </div>
  )
}

/**
 * Clear the saved running order, after a confirm. The stored tracks are the
 * only copies this browser has — once cleared, getting them back means finding
 * and re-adding every file from disk — so the button only opens the question.
 * The one red button is the answer, after the consequence has been read.
 */
function ClearQueueDialog({ trackCount, onClear }: { trackCount: number; onClear: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const tracks = `${trackCount} track${trackCount !== 1 ? "s" : ""}`

  async function handleClear() {
    if (clearing) return
    setClearing(true)
    await onClear()
    setClearing(false)
    setOpen(false)
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => setOpen(true)}>
        <IconTrash size={14} data-icon="inline-start" />
        Clear queue
      </Button>
      <Dialog open={open} onOpenChange={(next) => !clearing && setOpen(next)}>
        <DialogContent className="sm:max-w-sm" showCloseButton={!clearing}>
          <DialogHeader>
            <DialogTitle>Clear your running order?</DialogTitle>
            <DialogDescription>
              All {tracks} and the saved spot in the last song are removed from
              this browser, and you start the show with an empty queue. The
              files on your computer aren&apos;t touched, but you&apos;ll need
              to add them again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={clearing} onClick={() => setOpen(false)}>
              Keep queue
            </Button>
            <Button variant="destructive" disabled={clearing} onClick={handleClear}>
              {clearing && <IconLoader2 className="animate-spin" data-icon="inline-start" />}
              <span>Clear {tracks}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Copy, not share: this is the moment before a show, when the link is on its
 * way into a post or a group chat the host already has open — a share sheet
 * would be one more step in the way. Labelled rather than icon-only so the
 * confirmation reads as words.
 */
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually")
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-[34px] shrink-0" onClick={copy}>
      {copied ? <IconCheck data-icon="inline-start" /> : <IconCopy data-icon="inline-start" />}
      <span>{copied ? "Copied" : "Copy"}</span>
      <span className="sr-only"> listener link</span>
    </Button>
  )
}

interface PreflightViewProps {
  station: Station
  micDisabled: boolean
  onMicDisabledChange: (disabled: boolean) => void
  queueSummary: SavedQueueSummary | null | undefined
  resumeFromStart: boolean
  onResumeFromStartChange: (fromStart: boolean) => void
  onClearQueue: () => Promise<void>
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Shown before the broadcast starts. Gives the user a calm, explicit checklist
 * of what's about to happen (which station, whether the mic will be captured,
 * where listeners will tune in) so the first broadcast doesn't feel like "one
 * accidental click and I'm on air."
 *
 * The mic toggle is live here — it's the last chance to swap between
 * mic+music and music-only without going back to the station page.
 */
function PreflightView({
  station,
  micDisabled,
  onMicDisabledChange,
  queueSummary,
  resumeFromStart,
  onResumeFromStartChange,
  onClearQueue,
  onConfirm,
  onCancel,
}: PreflightViewProps) {
  const touch = useCoarsePointer()
  const playerUrl = `${env.appUrl}/station/${station.slug}`
  // On air without a person means AutoDJ is playing. Going live takes over
  // from it, and saying so here stops the first show opening with "where did
  // my music go?".
  const autoDjOnAir = station.is_on_air && !station.is_live

  return (
    // A card on wider screens; on a phone the frame and its padding cost more
    // width than they give, so the checklist sits straight on the page.
    <Card className="max-sm:bg-transparent max-sm:py-0 max-sm:ring-0">
      <CardContent className="flex flex-col gap-6 max-sm:px-0 sm:py-3">
        <ul className="flex flex-col gap-5 text-sm" role="list">
          <li className="flex flex-col gap-2.5">
            <span id="source-label" className="font-medium text-foreground">What goes out</span>
            <ChoiceGroup
              labelledBy="source-label"
              value={micDisabled}
              onChange={onMicDisabledChange}
              options={[
                { value: false, icon: IconMicrophone, title: "Mic + music", note: "Talk over your files" },
                { value: true, icon: IconMusic, title: "Music only", note: "No mic permission asked" },
              ] as const}
            />
            {!micDisabled && (
              <p className="text-xs text-muted-foreground">
                Your browser asks for the microphone once you start. The mic stays closed until you hold the talk button{touch ? "" : " or Space"}.
              </p>
            )}
          </li>

          <li className="flex flex-col gap-2.5">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <span id="queue-label" className="font-medium text-foreground">Your running order</span>
              {!!queueSummary?.trackCount && (
                <ClearQueueDialog trackCount={queueSummary.trackCount} onClear={onClearQueue} />
              )}
            </div>
            <QueueStatus
              summary={queueSummary}
              resumeFromStart={resumeFromStart}
              onResumeFromStartChange={onResumeFromStartChange}
            />
          </li>

          {autoDjOnAir && (
            <li className="flex items-start gap-3 rounded-xl border border-on-air/25 bg-on-air/[0.06] px-3.5 py-3">
              <IconPlaylist size={16} className="mt-0.5 shrink-0 text-on-air" />
              <p className="text-sm leading-relaxed">
                AutoDJ is on air right now. Going live takes over from it, and AutoDJ picks back up when you end your show.
              </p>
            </li>
          )}

          <li className="flex flex-col gap-1.5">
            <span className="font-medium text-foreground">Listeners tune in at</span>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.09] bg-[#08080d]/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                {playerUrl.replace(/^https?:\/\//, "")}
              </span>
              <CopyLinkButton url={playerUrl} />
            </div>
          </li>
        </ul>

        <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
          <Button className="h-12 w-full text-base sm:flex-1" onClick={onConfirm}>
            Continue
          </Button>
          <Button className="h-10 w-full text-muted-foreground sm:h-12 sm:w-auto sm:text-foreground" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * @param liveSource How the person on air connected, when we know. An encoder
 *   is worth naming: "another browser or device" is simply untrue of a BUTT
 *   broadcast, and it sends the owner looking for a tab to close instead of
 *   the one application that can actually end the show.
 */
function AlreadyLiveView({
  station,
  liveSource,
}: {
  station: Station
  liveSource: StationStatus["live_source"] | null
}) {
  const fromEncoder = liveSource?.type === "external"
  const client = liveSource?.client

  return (
    <Card className="border-live/25 bg-live/[0.04]">
      <CardContent className="flex flex-col items-center text-center py-10">
        <div className="size-12 rounded-full bg-live/10 flex items-center justify-center mb-4">
          <IconBroadcast size={18} className="text-live-text" />
        </div>
        <h2 className="text-base font-medium mb-2">This station is already live</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          {fromEncoder
            ? `${client || "An external encoder"} is broadcasting to this station. Only one source can be connected at a time, so disconnect it there before broadcasting from the studio.`
            : "Someone is live from another browser or computer, and a station takes one broadcast at a time. Press End broadcast in the studio there, then come back and go live here."}
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
          <Button className="w-full sm:w-auto" asChild>
            <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
              <IconLink size={15} data-icon="inline-start" />
              Hear your stream
            </a>
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" asChild>
            <Link href={`/dashboard/stations/${station.slug}`}>Back to station</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Which microphone the Ready screen's check is hearing, and a way to change
 * it. Names only exist once the page holds mic permission, which by `ready`
 * it does. Hidden with a single mic: there is nothing to choose.
 */
function MicPicker({ micStream, onChange }: { micStream: MediaStream; onChange: (deviceId: string) => Promise<void> }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [switching, setSwitching] = useState(false)
  const current = micStream.getAudioTracks()[0]?.getSettings().deviceId ?? ""

  useEffect(() => {
    let cancelled = false
    const load = () => {
      navigator.mediaDevices.enumerateDevices()
        .then((all) => {
          if (cancelled) return
          // Windows lists its "communications" role as a second copy of a
          // mic that is already there.
          setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "communications"))
        })
        .catch(() => {})
    }
    load()
    // Plugging a mic in (or pulling one out) should show up without a reload.
    navigator.mediaDevices.addEventListener("devicechange", load)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener("devicechange", load)
    }
  }, [])

  if (devices.length < 2) return null

  return (
    <Select
      aria-label="Microphone"
      className="w-full sm:w-56"
      value={current}
      disabled={switching}
      options={devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))}
      onChange={(deviceId) => {
        if (deviceId === current) return
        setSwitching(true)
        onChange(deviceId)
          .catch(() => toast.error("Couldn't switch to that microphone"))
          .finally(() => setSwitching(false))
      }}
    />
  )
}

interface ReadyViewProps {
  station: Station
  micStream: MediaStream | null
  /** The bitrate the connection check chose. */
  bitrate: number
  /** Start has been pressed and the connection is being made. */
  goingLive: boolean
  onGoLive: () => void
  onCancel: () => void
  onMicChange: (deviceId: string) => Promise<void>
}

/**
 * Every check has passed and nothing is on air. The checks read as results
 * here, not as the progress they were a moment ago, and the mic gets a level
 * check: the one thing worth confirming by ear before the audience hears it.
 * The meter draws in its grey "check" colour because none of it is going out.
 */
function ReadyView({ station, micStream, bitrate, goingLive, onGoLive, onCancel, onMicChange }: ReadyViewProps) {
  const slow = bitrate < DEFAULT_BITRATE
  const results: { label: string; status: string; highlight?: boolean }[] = [
    { label: "Connection", status: `${slow ? "Slow" : "Good"} · ${bitrate} kbps`, highlight: slow },
    { label: "Station reachable", status: "Yes" },
    ...(micStream ? [{ label: "Microphone access", status: "Allowed" }] : []),
    { label: "Audio engine", status: "Ready" },
  ]

  return (
    <div className="mx-auto w-full max-w-xl flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Going live on {station.name}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Ready when you are.</h1>
        <p className="text-muted-foreground">Nothing goes out until you press the button.</p>
      </div>

      {micStream && (
        // Visible overflow: the card clips by default, and the mic list
        // drops down past its bottom edge.
        <Card className="overflow-visible">
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">Mic check</h2>
                <p className="text-sm text-muted-foreground">Say something. The bars should move.</p>
              </div>
              <MicPicker micStream={micStream} onChange={onMicChange} />
            </div>
            <MicMeter stream={micStream} open={false} />
          </CardContent>
        </Card>
      )}

      <ul className="flex flex-col text-sm" aria-label="Checks">
        {results.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 border-b border-white/[0.07] py-3">
            <StepIcon status="done" />
            <span className="flex-1">{r.label}</span>
            <span
              className={cn(
                "font-mono text-xs uppercase tracking-[0.08em]",
                r.highlight ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <Button className="h-12 w-full text-base" onClick={onGoLive} disabled={goingLive}>
          {goingLive
            ? <IconLoader2 size={17} className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            : <IconBroadcast size={17} data-icon="inline-start" />}
          {goingLive ? "Going live…" : "Go live now"}
        </Button>
        <Button variant="ghost" className="self-end text-muted-foreground" onClick={onCancel} disabled={goingLive}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function isMicPermissionError(message: string | null): boolean {
  if (!message) return false
  return /microphone access denied|no microphone found/i.test(message)
}

export default function GoLivePage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const { state, steps, error, start, goLive, switchMic, stop, engine, micStream, getTransportStats } = useBroadcast()
  const [station, setStation] = useState<Station | null>(null)
  /**
   * Only read to explain a refusal, so it is fetched once rather than polled:
   * this page either starts a broadcast within seconds or shows why it cannot.
   */
  const [liveSource, setLiveSource] = useState<StationStatus["live_source"] | null>(null)
  const [micDisabled, setMicDisabled] = useState(false)
  // undefined while reading, null when this browser's storage can't be read.
  const [queueSummary, setQueueSummary] = useState<SavedQueueSummary | null | undefined>(undefined)
  const [resumeFromStart, setResumeFromStart] = useState(false)
  // Explicit user confirmation from the pre-flight screen. Keeps "I landed on
  // this page" from ever meaning "mic is now hot."
  const [preflightApproved, setPreflightApproved] = useState(false)
  const startedRef = useRef(false)
  // Start was pressed: the Ready screen stays up, button busy, until the
  // studio opens or the attempt fails.
  const [goingLive, setGoingLive] = useState(false)

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage; can't be a lazy initialiser because the server has no localStorage
      setMicDisabled(localStorage.getItem(`broadcast:micDisabled:${slug}`) === "true")
      // Not per station: the running order it applies to isn't either.
      setResumeFromStart(localStorage.getItem("broadcast:resumeFromStart") === "true")
    } catch {
      // localStorage blocked (private mode, quota) — default to mic enabled.
    }
  }, [slug])

  const refreshQueueSummary = () =>
    loadQueueSummary(slug)
      .then(setQueueSummary)
      .catch(() => setQueueSummary(null))

  /** Starts the show on an empty running order. Confirmed in ClearQueueDialog. */
  const clearSavedQueue = async () => {
    try {
      await clearQueue(slug)
      setQueueSummary({ trackCount: 0, bytes: 0, lastTrack: null })
    } catch {
      toast.error("Couldn't clear the queue in this browser")
      void refreshQueueSummary()
    }
  }

  useEffect(() => {
    let cancelled = false
    loadQueueSummary(slug)
      .then((summary) => { if (!cancelled) setQueueSummary(summary) })
      .catch(() => { if (!cancelled) setQueueSummary(null) })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    api.get(`/stations/${slug}`)
      .then((res) => setStation(res.data.data))
      .catch(() => router.push("/dashboard"))

    // Failure is fine and deliberately silent — the refusal below still reads
    // correctly without it, just less specifically.
    api.get(`/stations/${slug}/status`)
      .then((res) => setLiveSource(res.data.data.live_source ?? null))
      .catch(() => {})
  }, [slug, router])

  useEffect(() => {
    // Pre-flight gate: only start the broadcast once the user has explicitly
    // approved on the pre-flight screen. startedRef keeps this effect from
    // firing twice for one approval.
    if (!station || state !== "idle" || startedRef.current || !preflightApproved) return
    startedRef.current = true
    start(station.slug, { skipMic: micDisabled, resumeFromStart })
  }, [station, state, start, micDisabled, resumeFromStart, preflightApproved])

  // The resume is best-effort — if the browser holds the audio context
  // suspended, the studio says so and wakes it on the next click or key.
  useEffect(() => {
    if (state !== "live") return
    void engine?.resume().catch(() => {})
  }, [state, engine])

  // Into the studio as soon as the socket is up. The host chose the moment
  // by pressing Start, and on air is where the controls have to be: a
  // success screen held here kept them on air with none. The studio's lamp
  // says LIVE and carries the listener link.
  const onAir = state === "live" || state === "reconnecting"
  useEffect(() => {
    if (onAir) router.replace(`/dashboard/stations/${slug}/studio`)
  }, [onAir, router, slug])

  // Leaving at `ready` drops the checks: the mic would otherwise stay open
  // on every other dashboard page, for a show that never started.
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => () => {
    if (stateRef.current === "ready") void stop()
  }, [stop])

  // Skeleton while we fetch the station — the same shape as the connecting
  // view (heading, lamp, steps) so the swap is barely perceptible.
  if (!station) {
    return (
      <div className="mx-auto w-full max-w-xl flex flex-col gap-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-14 w-full rounded-[14px]" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-52" />
        </div>
      </div>
    )
  }

  if (station.is_live && state === "idle") {
    return (
      <div className="mx-auto w-full max-w-xl flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{station.name} is already live</h1>
        <AlreadyLiveView station={station} liveSource={liveSource} />
      </div>
    )
  }

  // Mic-blocked recovery view (#11) — surface explicit options when the OS/browser denies mic.
  const micBlocked = state === "error" && isMicPermissionError(error) && !micDisabled

  const inPreflight = !preflightApproved && state === "idle"

  if (state === "ready" || (goingLive && state === "connecting")) {
    return (
      <ReadyView
        station={station}
        micStream={micDisabled ? null : micStream}
        bitrate={getTransportStats()?.bitrate ?? DEFAULT_BITRATE}
        goingLive={goingLive}
        onGoLive={() => {
          setGoingLive(true)
          void goLive()
        }}
        onCancel={() => {
          void stop()
          router.push(`/dashboard/stations/${slug}`)
        }}
        onMicChange={switchMic}
      />
    )
  }

  const phase: LampPhase =
    state === "live" ? "live"
      : state === "reconnecting" ? "reconnecting"
      : state === "error" ? "fault"
      : "starting"

  // The heading tracks the actual phase: a question while the user is still
  // deciding, "Going live…" while the connection is in flight, and a plain
  // statement once it has either worked or not.
  const heading = inPreflight
    ? <>Go live on <span className="text-violet">{station.name}</span></>
    : phase === "live" ? <>{station.name} is live</>
    : phase === "fault" ? <>{station.name} didn&rsquo;t go live</>
    : <>Going live on {station.name}…</>

  const activeStep = steps.find((s) => s.status === "active")
  const lampDetail =
    // The heading above already says "<station> is live" and the chip says
    // LIVE, so the line only carries what neither does.
    phase === "live" ? "Opening the studio…"
      : phase === "reconnecting" ? "The connection dropped. Reconnecting…"
      : phase === "fault" ? (error || "Something stopped the broadcast from starting.")
      : activeStep ? `${activeStep.label}…`
      : "Going live…"
  const announce = phase === "fault"
    ? `Couldn't go live. ${lampDetail}`
    : phase === "live"
      ? "Live. You're live. Opening the studio."
      : `${LAMP[phase].label}. ${lampDetail}`

  const retry = (skipMic: boolean) => {
    startedRef.current = false
    setGoingLive(false)
    start(station.slug, { skipMic, resumeFromStart })
  }

  return (
    <div className="mx-auto w-full max-w-xl flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{heading}</h1>

      {inPreflight ? (
        <PreflightView
          station={station}
          micDisabled={micDisabled}
          onMicDisabledChange={(next) => {
            setMicDisabled(next)
            try { localStorage.setItem(`broadcast:micDisabled:${slug}`, String(next)) } catch {}
          }}
          queueSummary={queueSummary}
          resumeFromStart={resumeFromStart}
          onResumeFromStartChange={(next) => {
            setResumeFromStart(next)
            try { localStorage.setItem("broadcast:resumeFromStart", String(next)) } catch {}
          }}
          onClearQueue={clearSavedQueue}
          onConfirm={() => setPreflightApproved(true)}
          onCancel={() => router.push(`/dashboard/stations/${slug}`)}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <GoLiveLamp phase={phase} detail={lampDetail} announce={announce} />
          <StepList steps={steps} />
        </div>
      )}

      {micBlocked && (
        <section aria-labelledby="mic-blocked-title" className="flex flex-col gap-4 border-t border-white/[0.07] pt-5">
          <div className="flex items-start gap-3">
            <IconMicrophoneOff size={18} className="mt-0.5 shrink-0 text-fault-text" aria-hidden />
            <div className="flex flex-col gap-1">
              <h2 id="mic-blocked-title" className="text-sm font-medium">Microphone access blocked</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Allow the microphone for this site in your browser&rsquo;s settings and try again, or go live with music only.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                try { localStorage.setItem(`broadcast:micDisabled:${slug}`, "true") } catch {}
                setMicDisabled(true)
                retry(true)
              }}
            >
              <IconMicrophoneOff size={14} data-icon="inline-start" />
              Continue without mic
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => retry(false)}>
              <IconRefresh size={14} data-icon="inline-start" />
              Try again
            </Button>
          </div>
        </section>
      )}

      {state === "error" && !micBlocked && (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Button className="w-full sm:w-auto" onClick={() => retry(micDisabled)}>
            <IconRefresh size={14} data-icon="inline-start" />
            Try again
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" asChild>
            <Link href={`/dashboard/stations/${slug}`}>Back to station</Link>
          </Button>
        </div>
      )}

      {state === "error" && (
        // New tab, like every help link: see HelpLink. Worded rather than a
        // bare `?` because the person reading it is stuck right now and
        // already has the question.
        <Link
          href="/help/go-live-from-your-browser"
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          What going live from a browser needs →
        </Link>
      )}
    </div>
  )
}
