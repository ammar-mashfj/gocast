"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconPlayerStopFilled,
  IconShare,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import api from "@/lib/axios"
import { shareOrCopy } from "@/lib/share"
import type { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"

const SHORTCUTS = [
  { action: "Push to talk", key: "Space", micOnly: true },
  { action: "Play / pause", key: "K" },
  { action: "Next track", key: "N" },
  { action: "Previous track", key: "P" },
  { action: "Toggle repeat", key: "R" },
]

function formatDuration(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0")
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")
  const s = String(seconds % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

interface StreamPanelProps {
  stationId: string
}

export function StreamPanel({ stationId }: StreamPanelProps) {
  const router = useRouter()
  const { state, stop, studio, sendCommand, micDisabled } = useBroadcast()
  const [elapsed, setElapsed] = useState(0)
  const [station, setStation] = useState<Station | null>(null)
  const [copied, setCopied] = useState(false)
  const startTimeRef = useRef(Date.now())

  useEffect(() => {
    api.get(`/stations/${stationId}`).then((res) => setStation(res.data.data))
  }, [stationId])

  const playerUrl = station ? `${env.appUrl}/station/${station.slug}` : ""

  async function handleShare() {
    if (!playerUrl) return
    await shareOrCopy(playerUrl, station?.name)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (state !== "live") return
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [state])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target !== document.body) return
      const queueLen = studio?.queue.length ?? 0
      const currentIdx = studio?.currentIndex ?? -1
      switch (e.code) {
        case "KeyK": sendCommand({ type: studio?.playing ? 'pause' : 'play' }); break
        case "KeyN":
          if (queueLen > 1 && currentIdx < queueLen - 1) sendCommand({ type: 'next' })
          else toast.info(queueLen <= 1 ? "Add more tracks to the queue" : "Already on the last track")
          break
        case "KeyP":
          if (queueLen > 1 && currentIdx > 0) sendCommand({ type: 'prev' })
          else toast.info(queueLen <= 1 ? "Add more tracks to the queue" : "Already on the first track")
          break
        case "KeyR": sendCommand({ type: 'repeat', enabled: !(studio?.repeat ?? true) }); break
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [studio, sendCommand])

  const isLive = state === "live"
  const queueLen = studio?.queue.length ?? 0

  return (
    <div className="border-l p-5 flex flex-col gap-4 overflow-y-auto h-full w-full">
      <div>
        <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Stream info</div>
        <div className="flex flex-col">
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="secondary" className={isLive ? "text-emerald-400" : ""}>
              {isLive ? "On air" : "Offline"}
            </Badge>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">Duration</span>
            <span className="text-sm tabular-nums">{formatDuration(elapsed)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">Queue</span>
            <span className="text-sm">{queueLen} track{queueLen !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {playerUrl && (
        <div>
          <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Player URL</div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground truncate">{playerUrl}</span>
            <Button variant="ghost" size="sm" onClick={handleShare}>
              <IconShare data-icon="inline-start" />
              {copied ? "Done!" : "Share"}
            </Button>
          </div>
        </div>
      )}

      <Separator />

      <div>
        <div className="text-xs tracking-widest uppercase text-muted-foreground mb-3">Keyboard shortcuts</div>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.filter((s) => !s.micOnly || !micDisabled).map((s) => (
            <div key={s.action} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{s.action}</span>
              <Badge variant="secondary" className="text-[10px]">{s.key}</Badge>
            </div>
          ))}
        </div>
      </div>

      <Button
        variant="destructive"
        className="mt-auto"
        onClick={async () => {
          await stop()
          router.push(`/dashboard/stations/${stationId}`)
        }}
      >
        <IconPlayerStopFilled data-icon="inline-start" />
        End broadcast
      </Button>
    </div>
  )
}
