"use client"

import { useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { NowPlaying } from "@/components/studio/NowPlaying"
import { TransportControls } from "@/components/studio/TransportControls"
import { PushToTalk } from "@/components/studio/PushToTalk"
import { FileQueue } from "@/components/studio/FileQueue"
import { StreamPanel } from "@/components/studio/StreamPanel"

export default function StudioPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { state } = useBroadcast()
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
    <div className="w-full h-[calc(100vh-3.5rem)] flex flex-col lg:grid lg:grid-cols-[1fr_400px] min-h-0 -m-6">
      <div className="p-5 flex flex-col gap-3.5 overflow-y-auto">
        <NowPlaying />
        <TransportControls />
        <PushToTalk />
        <FileQueue />
      </div>
      <StreamPanel stationId={slug} />
    </div>
  )
}
