"use client"

import { useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
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
  const { state, micDisabled } = useBroadcast()
  const wasLive = useRef(false)

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
    if (state !== "live") return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [state])

  if (state !== "live") return null

  return (
    <div className="w-[calc(100%+3rem)] h-[calc(100vh-3.5rem)] flex flex-col lg:grid lg:grid-cols-[1fr_400px] min-h-0 -m-6 overflow-hidden">
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
