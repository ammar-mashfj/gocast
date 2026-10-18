"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { usePreflightQueue } from "@/hooks/usePreflightQueue"
import { useMicPreview } from "@/hooks/useMicPreview"
import api from "@/lib/axios"
import type { Station } from "@/interfaces/Station"
import type { StationStatus } from "@/interfaces/StationStatus"
import { Button } from "@/components/ds/Button"
import { ChoiceCards } from "@/components/ds/ChoiceCards"
import { Notice } from "@/components/ds/Notice"
import { PageHeader } from "@/components/ds/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { MicCheckCard } from "@/components/dashboard/golive/MicCheckCard"
import { RunningOrderCard } from "@/components/dashboard/golive/RunningOrderCard"

type Mode = "mic" | "music"



/**
 * Going live: pre-flight, then the checks, then on air — one press.
 *
 * Pre-flight is where the show is set up while nothing is going out: what
 * goes out (mic + music, or music only), the mic (picked and hear-checked —
 * the only time it can be changed), and the running order (added to,
 * trimmed, picked up where the last show stopped). "Go live" releases
 * the mic check, starts the checks (connection, station, mic, audio engine)
 * and opens the studio straight away: they run there, in a dialog over the
 * studio, which goes on air the moment they pass (GoLiveChecks). A failed
 * check says why there, and nothing went out.
 *
 * Decisions: docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md (R5.2).
 */
export default function GoLivePage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state, start, stationSlug } = useBroadcast()

  const [station, setStation] = useState<Station | null>(null)
  // Only read to explain a refusal, so fetched once rather than polled.
  const [liveSource, setLiveSource] = useState<StationStatus["live_source"] | null>(null)
  const [mode, setMode] = useState<Mode>(() => readMode(slug))
  const [resumeFromStart, setResumeFromStart] = useState(readResumeFromStart)
  const [pressed, setPressed] = useState(false)

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

  // Go live hands over to the studio as soon as the checks are running:
  // they run there, in a dialog over the studio, and go on air from it
  // (components/studio/GoLiveChecks). Waiting for `connecting` rather than
  // pushing on the press: the studio sends an idle tab straight back here.
  // Already live in this tab (back from the studio, say): this page's Go
  // live would restart the show, so it isn't offered — back to the studio.
  useEffect(() => {
    if (stationSlug === slug && (state === "live" || state === "reconnecting")) {
      router.replace(`/dashboard/stations/${slug}/studio`)
    }
  }, [state, stationSlug, slug, router])

  // This tab's broadcast belongs to another station: Go live here would
  // end that show without asking (start() stops the running manager), so
  // the page offers the way back to it instead.
  const busyElsewhere = !!stationSlug && stationSlug !== slug && state !== "idle" && state !== "error"

  useEffect(() => {
    if (!pressed || stationSlug !== slug) return
    if (state === "connecting" || state === "ready" || state === "live" || state === "reconnecting") {
      router.replace(`/dashboard/stations/${slug}/studio`)
    }
  }, [pressed, state, stationSlug, router, slug])

  function chooseMode(next: Mode) {
    setMode(next)
    try {
      localStorage.setItem(`broadcast:micDisabled:${slug}`, String(next === "music"))
    } catch {}
  }

  function begin(skipMic = mode === "music") {
    // Tracks still being read aren't saved yet, and the engine loads the
    // saved queue: going live now would start the show without them.
    if (queue.adding) return
    mic.release()
    setPressed(true)
    // Another start still holds the provider: nothing ran, so give the host
    // their mic preview and this page's panels back rather than a dead page.
    void start(slug, { skipMic, resumeFromStart }).then((ran) => {
      if (!ran) setPressed(false)
    })
  }

  if (!station) {
    return (
      // The pre-flight's own grid (below), block for block — change one,
      // change the other, or the page jumps when the station lands.
      // minmax(0,1fr): a grid's implicit column sizes to its content, so a
      // fixed-width placeholder could push the page wider than a phone.
      <div
        className="mx-auto grid w-full max-w-190 grid-cols-[minmax(0,1fr)] gap-5.5 overflow-x-clip lg:max-w-page lg:grid-cols-2 lg:grid-rows-[auto_1fr_auto] lg:items-start motion-reduce:[&_[data-slot=skeleton]]:animate-none"
        aria-busy
      >
        <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>

        <div className="flex min-w-0 flex-col gap-5.5">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-5 w-32" />
            {/* Phones: two small cards in a row; from sm, the full cards. */}
            <div className="grid grid-cols-2 gap-2.5 sm:hidden">
              <Skeleton className="h-20 rounded-well" />
              <Skeleton className="h-20 rounded-well" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 max-sm:hidden">
              <Skeleton className="h-24 rounded-card" />
              <Skeleton className="h-24 rounded-card" />
            </div>
          </div>
          <Skeleton className="h-22 rounded-panel lg:h-56 lg:rounded-card" />
        </div>

        <Skeleton className="h-16 rounded-panel lg:h-80 lg:rounded-card lg:col-start-2 lg:row-start-2 lg:self-stretch" />

        {/* Below lg the buttons are the pinned bar, not part of the page. */}
        <div className="flex w-full items-center gap-2.5 max-lg:hidden lg:col-span-2 lg:mx-auto lg:max-w-160">
          <Skeleton className="h-16 flex-1 rounded-button-xl" />
          <Skeleton className="h-16 w-32 rounded-button-xl" />
        </div>
      </div>
    )
  }

  if (busyElsewhere && !pressed) {
    return (
      <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5">
        <PageHeader title="You’re already broadcasting" />
        <Notice
          label="On air"
          actions={
            <Button size="lg" asChild>
              <Link href={`/dashboard/stations/${stationSlug}/studio`}>Back to that show</Link>
            </Button>
          }
        >
          This tab is on air with another station. End that show from its studio, then go live here.
        </Notice>
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

  const autoDjOnAir = station.is_on_air && !station.is_live
  // From lg (1024): the heading across the top, the setup on the left, the music on
  // the right, the button underneath. The two columns end level; the page
  // grows to the window's height and no further, so a long list scrolls
  // inside its card instead of the page. One column (heading, setup, music,
  // button) below that.
  return (
    <div className="mx-auto grid w-full max-w-190 grid-cols-[minmax(0,1fr)] gap-5.5 max-lg:pb-[4.5rem] lg:max-w-page lg:grid-cols-2 lg:max-h-[calc(100svh-var(--chrome-h,0px)-2.5rem)] lg:grid-rows-[auto_1fr_auto] lg:items-start">
      <PageHeader
        className="lg:col-span-2"
        title="Ready when you are."
        description={autoDjOnAir ? "AutoDJ hands over when you start, and takes back when you end." : "Nothing goes out until you press the button."}
        // Phones: the title alone, so the page fits above the pinned Go live.
        descriptionClassName="max-sm:hidden"
      />

      <div className="flex min-w-0 flex-col gap-5.5">
        <section className="flex flex-col gap-2.5" aria-labelledby="mode-label">
          <h2 id="mode-label" className="font-display text-body font-bold">What goes out</h2>
          {/* Phones, and wide screens short on height: two small cards side
              by side with a short line each — the full cards stacked cost
              ~230px; these fit in one row. */}
          <ChoiceCards
            className="hidden grid-cols-2 max-sm:grid desk-short:grid"
            size="sm"
            aria-label="What goes out"
            eyebrow={false}
            value={mode}
            onChange={chooseMode}
            options={[
              { value: "mic", title: "Mic + music", description: "Talk over your tracks." },
              { value: "music", title: "Music only", description: "No microphone." },
            ]}
          />
          <ChoiceCards
            className="max-sm:hidden desk-short:hidden"
            aria-label="What goes out"
            eyebrow={false}
            value={mode}
            onChange={chooseMode}
            options={[
              { value: "mic", title: "Mic + music", description: MODE_TEXT.mic },
              { value: "music", title: "Music only", description: MODE_TEXT.music },
            ]}
          />
        </section>

        {/* Kept in Music only, dimmed: removing it shrank the column and the
            music card beside it, which is sized to this column. */}
        <MicCheckCard mic={mic} disabled={mode !== "mic"} onMusicOnly={() => chooseMode("music")} onUseMic={() => chooseMode("mic")} />
      </div>

      <RunningOrderCard
        // h-0 + min-h-full: the left column alone sets the row's height and
        // this card fills it, so adding tracks scrolls the list instead of
        // growing the card.
        className="lg:col-start-2 lg:row-start-2 lg:h-0 lg:min-h-full"
        queue={queue}
        resumeFromStart={resumeFromStart}
        // A new order is a new show: start it from the top. On screen only —
        // not saved, and the saved spot is untouched, so backing out of the
        // page loses nothing.
        onReorder={() => setResumeFromStart(true)}
        onResumeFromStartChange={(next) => {
          setResumeFromStart(next)
          try {
            localStorage.setItem("broadcast:resumeFromStart", String(next))
          } catch {}
        }}
      />

      <div className="flex w-full min-w-0 flex-col gap-2.5 lg:col-span-2 lg:mx-auto lg:max-w-160">
        {/* Cancel is a quiet way back: nothing has gone out yet, so it is
            not a destructive action and must not outshout Go live. */}
        {/* Below lg both live in the pinned bar at the end of the page. */}
        <div className="flex items-center gap-2.5 max-lg:hidden">
          <Button size="xl" dot="live" className="min-w-0 flex-1" onClick={() => begin()} disabled={queue.adding}>
            {queue.adding ? "Adding tracks…" : "Go live"}
          </Button>
          <Button asChild size="xl" variant="ghost">
            <Link href={`/dashboard/stations/${station.slug}`}>Cancel</Link>
          </Button>
        </div>
        {/* The other way on air: BUTT or Mixxx connect to the station
            itself. Its address, key and "Put it on air" are in settings.
            (The listener link used to sit here too; it's on the overview's
            Your link card, which is where sharing happens.) */}
        {station.encoder && (
          <Link
            href={`/dashboard/stations/${station.slug}/settings#encoder`}
            className="self-center text-body-sm text-muted-foreground hover:text-foreground"
          >
            Using DJ software instead?
          </Link>
        )}
      </div>

      {/* Phones and tablets: Go live pinned to the bottom (above the home indicator),
          so it's never below the fold, with Cancel beside it. A solid
          background with a soft shadow above it, not a fade: content fading
          out reads as the end of the page. */}
      {/* Tablets too: below lg is the touch layout (tab bar, drawer sidebar,
          one column), so the bar is pinned at every size. */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-background px-gutter pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-bar-up lg:hidden">
        <div className="mx-auto flex w-full max-w-190 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button size="xl" dot="live" className="min-w-0 flex-1" onClick={() => begin()} disabled={queue.adding}>
            {queue.adding ? "Adding tracks…" : "Go live"}
          </Button>
          <Button asChild size="md" variant="quiet">
            <Link href={`/dashboard/stations/${station.slug}`}>Cancel</Link>
          </Button>
        </div>
        </div>
      </div>
    </div>
  )
}

const MODE_TEXT: Record<Mode, string> = {
  mic: "Talk over your tracks. The music dips while you hold to talk.",
  music: "Play your running order. We won’t ask for the microphone.",
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

