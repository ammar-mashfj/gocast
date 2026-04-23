"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { IconLoader2 } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import api from "@/lib/axios"
import { NowPlaying } from "@/components/studio/NowPlaying"
import { TransportControls } from "@/components/studio/TransportControls"
import { PushToTalk } from "@/components/studio/PushToTalk"
import { FileQueue } from "@/components/studio/FileQueue"
import { StreamPanel } from "@/components/studio/StreamPanel"
import { MobileStreamBar } from "@/components/studio/MobileStreamBar"
import { MobileStudio } from "@/components/studio/MobileStudio"

export default function StudioPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state, micDisabled, engine } = useBroadcast()
  const wasLive = useRef(false)
  const [stationName, setStationName] = useState<string | null>(null)

  // Fetch the station name once for the tab title — independent of the
  // panels which already fetch their own copies.
  useEffect(() => {
    api.get(`/stations/${slug}`)
      .then((res) => setStationName(res.data?.data?.name ?? null))
      .catch(() => { /* tab title will fall back to default */ })
  }, [slug])

  // Pulsing red-dot prefix is universally recognized as "live recording".
  useDocumentTitle(
    state === "live" || state === "reconnecting"
      ? `● LIVE · ${stationName ?? slug} | GoCast`
      : null,
  )

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
    if (state !== "live" && state !== "reconnecting") return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [state])

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

  // Keep the layout mounted across `reconnecting` so the queue, now-playing,
  // and engine-bound UI don't tear down on a transient WS hiccup. We show a
  // thin banner instead.
  if (state !== "live" && state !== "reconnecting") return null

  return (
    <div className="w-[calc(100%+3rem)] h-[calc(100vh-3.5rem)] flex flex-col lg:grid lg:grid-cols-[1fr_400px] min-h-0 -m-6 overflow-hidden">
      {state === "reconnecting" && (
        <div className="lg:col-span-2 flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500/10 text-amber-500 text-xs border-b border-amber-500/20">
          <IconLoader2 size={14} className="animate-spin" />
          Reconnecting to stream relay…
        </div>
      )}

      {/* Mobile: compact bar + dedicated mobile layout */}
      <MobileStreamBar stationId={slug} />
      <MobileStudio />

      {/* Desktop: standard multi-card layout + side panel */}
      <div className="hidden lg:flex lg:flex-col p-5 gap-3.5 overflow-y-auto min-h-0">
        <NowPlaying />
        <TransportControls />
        {!micDisabled && <PushToTalk />}
        <FileQueue />
      </div>
      <div className="hidden lg:flex">
        <StreamPanel stationId={slug} />
      </div>
    </div>
  )
}
