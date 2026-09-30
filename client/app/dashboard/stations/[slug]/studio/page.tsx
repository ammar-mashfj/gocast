"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { IconShare } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useStationBySlug } from "@/contexts/StationContext"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useBroadcastStats } from "@/hooks/useBroadcastStats"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"
import { shareOrCopy } from "@/lib/share"
import { OnAirDeck } from "@/components/studio/OnAirDeck"
import { OnAirLamp } from "@/components/studio/OnAirLamp"
import { FileQueue } from "@/components/studio/FileQueue"
import { StreamPanel } from "@/components/studio/StreamPanel"
import { EndBroadcastButton } from "@/components/studio/EndBroadcast"
import { isOverlayTarget, isTypingTarget } from "@/components/studio/PushToTalk"
import { useStudioSignal, useTransportHealth } from "@/components/studio/signal"

export default function StudioPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state, engine, micDisabled } = useBroadcast()
  const station = useStationBySlug(slug)
  const wasLive = useRef(false)
  const [compact, setCompact] = useState(false)

  const isLive = state === "live" || state === "reconnecting"
  const stats = useBroadcastStats(slug, isLive)
  const transport = useTransportHealth(isLive)
  const signal = useStudioSignal(transport, { inStudio: true })
  const stationName = station?.name ?? slug

  // The red-dot prefix is the tab's own on-air lamp, visible from any tab.
  useDocumentTitle(isLive ? `● LIVE · ${stationName} | GoCast` : null)

  // One console, two densities. Measured rather than left to CSS alone
  // because the deck lays out its clock and transport differently, not just
  // smaller — a tablet in portrait gets the full instrument set, stacked.
  // The split is 1280, not the dashboard's 1024: with the sidebar open, the
  // 340px rail left a 1024–1279 window under 430px for the deck, narrower
  // than a phone, and the track title collapsed while the transport clipped.
  // Keep in step with the xl: classes on the layout below.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)")
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (state === "live") wasLive.current = true
    if (state === "idle" && wasLive.current) {
      router.replace(`/dashboard/stations/${slug}`)
    }
    if (state === "idle" && !wasLive.current) {
      router.replace(`/dashboard/stations/${slug}/live`)
    }
  }, [state, slug, router])

  // Transport shortcuts. Space (push-to-talk) lives in PushToTalk. These used
  // to fire only with focus on the page body, so they silently died the
  // moment the broadcaster clicked any button; now only a text field, or a
  // modifier held for a browser shortcut, keeps them out.
  useEffect(() => {
    if (!engine) return
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || isOverlayTarget(e.target)) return
      const queueLen = engine!.getQueue().length
      switch (e.code) {
        case "KeyK": engine!.togglePlay(); break
        // The queue always wraps, so anything longer than one track can step
        // in either direction.
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

  // Keep the layout mounted across `reconnecting` so the queue, now-playing,
  // and engine-bound UI don't tear down on a transient WS hiccup. The lamp
  // shows the degraded state.
  if (!isLive || !signal) return null

  const playerUrl = `${env.appUrl}/station/${slug}`

  return (
    // Bleeds to the edges of the dashboard's padded <main>; dvh, not vh, so
    // mobile browser chrome can't push the running order off screen.
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] w-[calc(100%+3rem)] min-h-0 flex-col overflow-hidden xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_minmax(0,1fr)]">
      <h1 className="sr-only">Studio — {stationName}</h1>

      <div className="xl:col-span-2">
        <OnAirLamp
          signal={signal}
          transport={transport}
          uptime={stats.elapsed}
          listeners={stats.listeners}
          compact={compact}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 xl:p-5">
        {compact && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => shareOrCopy(playerUrl, stationName)}
            >
              <IconShare data-icon="inline-start" />
              Share player link
            </Button>
            <EndBroadcastButton compact className="px-5" />
          </div>
        )}
        <OnAirDeck compact={compact} />
        <FileQueue />
      </div>

      <div className="hidden min-h-0 xl:flex">
        <StreamPanel
          slug={slug}
          stationName={stationName}
          stats={stats}
          bytesSent={transport.stats?.bytesSent ?? 0}
        />
      </div>
    </div>
  )
}
