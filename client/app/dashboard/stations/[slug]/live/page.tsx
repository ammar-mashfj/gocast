"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useParams, useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { usePreflightQueue } from "@/hooks/usePreflightQueue"
import { useMicPreview } from "@/hooks/useMicPreview"
import api from "@/lib/axios"
import { env } from "@/lib/env"
import { copyText } from "@/lib/clipboard"
import { taggedStationUrl } from "@/lib/share"
import type { Station } from "@/interfaces/Station"
import type { StationStatus } from "@/interfaces/StationStatus"
import { Button } from "@/components/ds/Button"
import { ChoiceCards } from "@/components/ds/ChoiceCards"
import { Notice } from "@/components/ds/Notice"
import { PageHeader } from "@/components/ds/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckList } from "@/components/dashboard/golive/CheckList"
import { MicCheckCard } from "@/components/dashboard/golive/MicCheckCard"
import { RunningOrderCard } from "@/components/dashboard/golive/RunningOrderCard"

type Mode = "mic" | "music"

const isMicError = (message: string | null) => !!message && /microphone access denied|no microphone found/i.test(message)

/**
 * Going live: pre-flight, then the checks, then on air — one press.
 *
 * Pre-flight is where the show is set up while nothing is going out: what
 * goes out (mic + music, or music only), the mic (picked and hear-checked —
 * the only time it can be changed), and the running order (added to,
 * trimmed, picked up where the last show stopped). "Go live on …" releases
 * the mic check, runs the checks (connection, station, mic, audio engine)
 * where the host can see them, and goes on air the moment they pass; the
 * studio takes over from there. A failed check says why, and nothing went
 * out.
 *
 * Decisions: docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md (R5.2).
 */
export default function GoLivePage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state, steps, error, start, goLive, stop } = useBroadcast()
  // Cancel hands back a station the checks turned on — only without AutoDJ,
  // the same rule as End (components/studio/EndBroadcast): with a rotation,
  // on air is the station's normal state and there is nothing to hand back.
  const autoDjLocked = useAutoDjLocked()

  const [station, setStation] = useState<Station | null>(null)
  // Only read to explain a refusal, so fetched once rather than polled.
  const [liveSource, setLiveSource] = useState<StationStatus["live_source"] | null>(null)
  const [mode, setMode] = useState<Mode>(() => readMode(slug))
  const [resumeFromStart, setResumeFromStart] = useState(readResumeFromStart)
  const [pressed, setPressed] = useState(false)
  const wentLive = useRef(false)

  const queue = usePreflightQueue(slug)
  const mic = useMicPreview(mode === "mic" && !pressed)

  useEffect(() => {
    api.get(`/stations/${slug}`)
      .then((res) => setStation(res.data.data))
      .catch(() => router.push("/dashboard"))
    api.get(`/stations/${slug}/status`)
      .then((res) => setLiveSource(res.data.data.live_source ?? null))
      .catch(() => {})
  }, [slug, router])

  // One press: the checks end in `ready`, and the show goes on air from
  // there without a second button.
  useEffect(() => {
    if (state !== "ready" || !pressed || wentLive.current) return
    wentLive.current = true
    void goLive()
  }, [state, pressed, goLive])

  const onAir = state === "live" || state === "reconnecting"
  useEffect(() => {
    if (onAir) router.replace(`/dashboard/stations/${slug}/studio`)
  }, [onAir, router, slug])

  // Leaving between checks and air: nothing is out yet, so let the mic go.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => () => {
    if (stateRef.current === "ready" || stateRef.current === "connecting") void stop()
  }, [stop])

  function chooseMode(next: Mode) {
    setMode(next)
    try {
      localStorage.setItem(`broadcast:micDisabled:${slug}`, String(next === "music"))
    } catch {}
  }

  function begin(skipMic = mode === "music") {
    mic.release()
    wentLive.current = false
    setPressed(true)
    void start(slug, { skipMic, resumeFromStart })
  }

  // Cancel. Leaving the page instead (the unmount above) hands nothing back:
  // the sweep takes a station nobody connected to off air by itself.
  function back() {
    if (state === "ready" || state === "connecting") {
      void stop({ releaseStation: autoDjLocked ? "if-started-here" : false })
    }
    setPressed(false)
  }

  if (!station) {
    return (
      <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5" aria-busy>
        <Skeleton className="h-11 w-80" />
        <Skeleton className="h-36 rounded-panel" />
        <Skeleton className="h-60 rounded-card" />
      </div>
    )
  }

  // Someone else holds the mount: harbor takes one source at a time.
  if (station.is_live && state === "idle" && !pressed) {
    const encoder = liveSource?.type === "external"
    return (
      <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5">
        <PageHeader title={`${station.name} is already live`} />
        <Notice
          label="Already live"
          actions={
            <>
              <Button size="lg" asChild>
                <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">Hear your stream ↗</a>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link href={`/dashboard/stations/${station.slug}`}>Back to station</Link>
              </Button>
            </>
          }
        >
          {encoder
            ? `${liveSource?.client || "Your DJ software"} is broadcasting to this station. Only one source can be on at a time, so disconnect it there first.`
            : "Someone is live from another browser or computer. End the show from the studio there, then go live here."}
        </Notice>
      </div>
    )
  }

  const failed = pressed && state === "error"
  const micBlocked = failed && mode === "mic" && isMicError(error)
  const playerUrl = `${env.appUrl}/station/${station.slug}`

  if (pressed) {
    return (
      <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5">
        <PageHeader title={failed ? "Couldn’t go live." : `Going live on ${station.name}…`} />
        {micBlocked ? (
          <Notice
            label="Mic blocked"
            actions={
              <>
                <Button size="lg" onClick={() => { chooseMode("music"); begin(true) }}>Go live with music only</Button>
                <Button size="lg" variant="ghost" onClick={() => begin(false)}>Try again</Button>
              </>
            }
          >
            Allow the microphone for this site in your browser’s settings and try again, or go live with music only. Nobody heard anything.
          </Notice>
        ) : failed ? (
          <Notice
            label="Not live"
            actions={
              <>
                <Button size="lg" onClick={() => begin()}>Try again</Button>
                <Button size="lg" variant="ghost" onClick={back}>Back</Button>
              </>
            }
          >
            {error || "Something stopped the broadcast from starting."} Nobody heard anything.
          </Notice>
        ) : null}
        <CheckList steps={steps} />
        {failed ? (
          <Link href="/help/go-live-from-your-browser" target="_blank" rel="noopener noreferrer" className="self-start text-body-sm text-muted-foreground hover:text-foreground">
            What going live from a browser needs →
          </Link>
        ) : (
          <Button variant="quiet" className="self-start" onClick={back}>Cancel</Button>
        )}
      </div>
    )
  }

  const autoDjOnAir = station.is_on_air && !station.is_live
  return (
    <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5">
      <PageHeader
        title="Ready when you are."
        description={autoDjOnAir ? "AutoDJ hands over when you start, and takes back when you end." : "Nothing goes out until you press the button."}
      />

      <section className="flex flex-col gap-2.5" aria-labelledby="mode-label">
        <h2 id="mode-label" className="font-display text-body font-bold">What goes out</h2>
        <ChoiceCards
          aria-label="What goes out"
          value={mode}
          onChange={chooseMode}
          options={[
            { value: "mic", title: "Mic + music", description: "Talk over your tracks. The music dips while you hold to talk." },
            { value: "music", title: "Music only", description: "Play your running order. We won’t ask for the microphone." },
          ]}
        />
      </section>

      {mode === "mic" && <MicCheckCard mic={mic} onMusicOnly={() => chooseMode("music")} />}

      <RunningOrderCard
        queue={queue}
        resumeFromStart={resumeFromStart}
        onResumeFromStartChange={(next) => {
          setResumeFromStart(next)
          try {
            localStorage.setItem("broadcast:resumeFromStart", String(next))
          } catch {}
        }}
      />

      <div className="flex flex-col gap-2.5">
        <Button size="xl" full dot="live" onClick={() => begin()}>
          Go live on {station.name}
        </Button>
        <div className="flex flex-wrap justify-between gap-3 text-body-sm text-text-faint">
          <span>
            Listeners tune in at <span className="font-mono text-muted-foreground">{playerUrl.replace(/^https?:\/\//, "")}</span>{" "}
            <CopyLink url={taggedStationUrl(env.appUrl, station.slug, "owner")} />
          </span>
          <Link href={`/dashboard/stations/${station.slug}`} className="text-muted-foreground hover:text-foreground">
            Not now
          </Link>
        </div>
      </div>
    </div>
  )
}

/** The mode last used for this station, in this browser. A client page: storage is readable on first render. */
function readMode(slug: string): Mode {
  try {
    return typeof window !== "undefined" && localStorage.getItem(`broadcast:micDisabled:${slug}`) === "true" ? "music" : "mic"
  } catch {
    return "mic"
  }
}

function readResumeFromStart(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem("broadcast:resumeFromStart") === "true"
  } catch {
    return false
  }
}

/** "Copy" after the listener link, to paste it out before going on air. */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    if (await copyText(url)) setCopied(true)
    else toast.error(`Couldn’t copy. The link is ${url}`)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="cursor-pointer font-semibold text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? "Copied" : "Copy"}
      <span className="sr-only"> listener link</span>
      <span className="sr-only" aria-live="polite">{copied ? "Listener link copied" : ""}</span>
    </button>
  )
}
