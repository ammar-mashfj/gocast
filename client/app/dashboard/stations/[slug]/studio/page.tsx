"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { IconLoader2 } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useBroadcastStats } from "@/hooks/useBroadcastStats"
import api from "@/lib/axios"
import { AudioEngine } from "@/lib/audioEngine"
import type { TransportStats } from "@/lib/broadcast"
import { cn } from "@/lib/utils"
import { OnAirDeck } from "@/components/studio/OnAirDeck"
import { MonitorBar } from "@/components/studio/MonitorBar"
import { FileQueue } from "@/components/studio/FileQueue"
import { StreamPanel } from "@/components/studio/StreamPanel"
import { MobileStreamBar } from "@/components/studio/MobileStreamBar"
import { MobileStudio } from "@/components/studio/MobileStudio"

/** How often the encoder-health readout samples the send path. */
const HEALTH_POLL_MS = 2000

/** A dropout counts as "just now" for this long after the last lost frame. */
const RECENT_DROP_MS = 5000

/**
 * Encoder health, read from the send path rather than the mixer.
 *
 * This is the readout that replaced the old program level meter. That meter
 * sat before the encoder, so it kept bouncing happily through a dropped
 * socket — frames are discarded when the WebSocket isn't open, and the
 * broadcaster had no way to know. These numbers only count bytes that
 * actually left.
 *
 * Lost time is shown as a duration rather than a share of the broadcast: a
 * percentage buries a real 30-second gap inside a long show, and it answers a
 * question nobody asks. "3.2s lost" is the number a broadcaster can act on.
 */
function EncoderHealth({
  stats,
  droppingNow,
  reconnecting,
}: {
  stats: TransportStats | null
  droppingNow: boolean
  reconnecting: boolean
}) {
  const connected = !reconnecting && (stats?.connected ?? false)
  const lostSeconds = stats ? stats.droppedMs / 1000 : 0

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          connected && !droppingNow ? "bg-emerald-400" : "bg-amber-400 animate-pulse",
        )}
      />
      {!connected
        ? "Encoder not sending"
        : droppingNow
          ? "Dropping frames"
          : "Encoder healthy"}
      {" · "}
      {AudioEngine.encoderInfo().bitrate} kbps
      {lostSeconds > 0 && (
        <>
          {" · "}
          <span className="text-amber-400">{lostSeconds.toFixed(1)}s lost</span>
        </>
      )}
    </div>
  )
}

export default function StudioPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state, engine, getTransportStats } = useBroadcast()
  const wasLive = useRef(false)
  const [stationName, setStationName] = useState<string | null>(null)
  const [transport, setTransport] = useState<{
    stats: TransportStats
    droppingNow: boolean
  } | null>(null)

  const isLive = state === "live" || state === "reconnecting"
  const stats = useBroadcastStats(slug, isLive)

  // Fetch the station name once for the tab title — independent of the
  // panels which already fetch their own copies.
  useEffect(() => {
    api.get(`/stations/${slug}`)
      .then((res) => setStationName(res.data?.data?.name ?? null))
      .catch(() => { /* tab title will fall back to default */ })
  }, [slug])

  // Pulsing red-dot prefix is universally recognized as "live recording".
  useDocumentTitle(isLive ? `● LIVE · ${stationName ?? slug} | GoCast` : null)

  // The send-path tally changes on every encoded frame. Sampling it on a timer
  // keeps the readout honest without re-rendering the studio at frame rate.
  useEffect(() => {
    if (!isLive) return
    const tick = () => {
      const sample = getTransportStats()
      setTransport(
        sample
          ? {
              stats: sample,
              droppingNow:
                sample.lastDropAt > 0 && Date.now() - sample.lastDropAt < RECENT_DROP_MS,
            }
          : null,
      )
    }
    tick()
    const timer = setInterval(tick, HEALTH_POLL_MS)
    return () => clearInterval(timer)
  }, [isLive, getTransportStats])

  useEffect(() => {
    if (state === "live") wasLive.current = true
    if (state === "idle" && wasLive.current) {
      router.replace(`/dashboard/stations/${slug}`)
    }
    if (state === "idle" && !wasLive.current) {
      router.replace(`/dashboard/stations/${slug}/live`)
    }
  }, [state, slug, router])

  useEffect(() => {
    if (!isLive) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isLive])

  useEffect(() => {
    if (!engine) return
    const resume = () => { engine.resume() }
    window.addEventListener("pointerdown", resume, { once: true })
    window.addEventListener("keydown", resume, { once: true })
    return () => {
      window.removeEventListener("pointerdown", resume)
      window.removeEventListener("keydown", resume)
    }
  }, [engine])

  // Transport shortcuts. Space (push-to-talk) is owned by OnAirDeck, which
  // needs the mic state these don't. Scoped to document.body so they can't
  // fire while the broadcaster is typing in a field.
  useEffect(() => {
    if (!engine) return
    function onKey(e: KeyboardEvent) {
      if (e.target !== document.body) return
      const queueLen = engine!.getQueue().length
      switch (e.code) {
        case "KeyK": engine!.togglePlay(); break
        // The queue always wraps, so anything longer than one track can step
        // in either direction.
        case "KeyN": if (queueLen > 1) engine!.next(); break
        case "KeyP": if (queueLen > 1) engine!.prev(); break
        case "KeyR": engine!.cycleRepeat(); break
        case "KeyM": engine!.setMonitorEnabled(!engine!.isMonitorEnabled()); break
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [engine])

  // Keep the layout mounted across `reconnecting` so the queue, now-playing,
  // and engine-bound UI don't tear down on a transient WS hiccup. The deck
  // shows the degraded state inline.
  if (!isLive) return null

  return (
    <div className="w-[calc(100%+3rem)] h-[calc(100vh-3.5rem)] flex flex-col lg:grid lg:grid-cols-[1fr_320px] min-h-0 -m-6 overflow-hidden">
      {state === "reconnecting" && (
        <div className="lg:col-span-2 flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500/10 text-amber-500 text-xs border-b border-amber-500/20">
          <IconLoader2 size={14} className="animate-spin" />
          Reconnecting to stream server…
        </div>
      )}

      {/* Mobile: compact bar + dedicated mobile layout */}
      <MobileStreamBar stationId={slug} />
      <MobileStudio />

      {/* Desktop */}
      <div className="hidden lg:flex lg:flex-col p-5 gap-3.5 overflow-y-auto min-h-0">
        <div className="flex items-center justify-end">
          <EncoderHealth
            stats={transport?.stats ?? null}
            droppingNow={transport?.droppingNow ?? false}
            reconnecting={state === "reconnecting"}
          />
        </div>
        <OnAirDeck elapsed={stats.elapsed} listeners={stats.listeners} />
        <MonitorBar />
        <FileQueue />
      </div>
      <div className="hidden lg:flex">
        <StreamPanel
          stationId={slug}
          stats={stats}
          bytesSent={transport?.stats.bytesSent ?? 0}
        />
      </div>
    </div>
  )
}
