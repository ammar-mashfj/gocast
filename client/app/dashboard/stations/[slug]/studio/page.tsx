"use client"

import { useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useStationBySlug } from "@/contexts/StationContext"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useBroadcastStats } from "@/hooks/useBroadcastStats"
import { useCoarsePointer } from "@/lib/useCoarsePointer"
import { env } from "@/lib/env"
import { YourLinkCard } from "@/components/dashboard/overview/YourLinkCard"
import { EndBroadcastButton } from "@/components/studio/EndBroadcast"
import { FileQueue } from "@/components/studio/FileQueue"
import { MusicOnlyPad, NowPlaying } from "@/components/studio/NowPlaying"
import { PushToTalk, isOverlayTarget, isTypingTarget } from "@/components/studio/PushToTalk"
import { MicLatchButton, StudioControls } from "@/components/studio/StudioControls"
import { StudioStats } from "@/components/studio/StudioStats"
import { useTransportHealth } from "@/components/studio/signal"

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
  const { state, engine, micDisabled } = useBroadcast()
  const station = useStationBySlug(slug)
  const touch = useCoarsePointer()
  const wasLive = useRef(false)

  const isLive = state === "live" || state === "reconnecting"
  const stats = useBroadcastStats(slug, isLive)
  const transport = useTransportHealth(isLive)
  const stationName = station?.name ?? slug

  // The red-dot prefix is the tab's own on-air lamp, visible from any tab.
  useDocumentTitle(isLive ? `● LIVE · ${stationName} | GoCast` : null)

  // Not live: a show that just ended goes to its wrap screen; a studio
  // opened without a show goes to pre-flight.
  useEffect(() => {
    if (state === "live") wasLive.current = true
    if (state === "idle") router.replace(`/dashboard/stations/${slug}/${wasLive.current ? "studio/wrap" : "live"}`)
  }, [state, slug, router])

  // Transport shortcuts. Only a text field, an open dialog, or a modifier
  // held for a browser shortcut keeps them out.
  useEffect(() => {
    if (!engine) return
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || isOverlayTarget(e.target)) return
      const queueLen = engine!.getQueue().length
      switch (e.code) {
        case "KeyK": engine!.togglePlay(); break
        // The queue always wraps, so anything longer than one track can step either way.
        case "KeyN": if (queueLen > 1) engine!.next(); break
        case "KeyP": if (queueLen > 1) engine!.prev(); break
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

  // Mounted across `reconnecting`, so the queue and engine-bound controls
  // don't tear down on a passing socket drop. The band shows it.
  if (!isLive) return null

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,23.75rem),1fr))] items-start gap-5">
      <h1 className="sr-only">Studio — {stationName}</h1>

      <div className="flex min-w-0 flex-col gap-3.5">
        {micDisabled ? <MusicOnlyPad /> : <PushToTalk />}
        <div className="flex flex-wrap justify-between gap-3 text-body-sm text-text-faint">
          <span>
            {micDisabled
              ? "Music only — the mic stays closed."
              : touch
                ? "Hold the pad to talk."
                : "Hold the pad or Space to talk. Press L to keep it open."}
          </span>
          <span>Listeners hear you about 15–20 s late.</span>
        </div>
        <MicLatchButton />
        <StudioControls />
      </div>

      <div className="flex min-w-0 flex-col gap-3.5">
        <NowPlaying />
        <StudioStats stats={stats} transport={transport} timeZone={station?.timezone ?? null} />
        <FileQueue />
        <YourLinkCard url={`${env.appUrl}/station/${slug}`} appUrl={env.appUrl} slug={slug} stationName={stationName} />
        <EndBroadcastButton />
      </div>
    </div>
  )
}
