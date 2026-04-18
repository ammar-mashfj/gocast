"use client"

import { useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import {
  IconMicrophone,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
  IconRepeat,
  IconPlus,
  IconMinus,
  IconX,
  IconChevronUp,
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAudioLevels } from "@/lib/useAudioLevels"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/axios"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function ProgressBar() {
  const { studio } = useBroadcast()

  const elapsed = studio?.elapsed ?? 0
  const duration = studio?.duration ?? 0
  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">{formatTime(elapsed)}</span>
      <div className="flex-1 h-5 flex items-center">
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-8 shrink-0">{formatTime(duration)}</span>
    </div>
  )
}

export function MobileStudio() {
  const { slug } = useParams<{ slug: string }>()
  const { studio, state, sendCommand, micStream, micDisabled } = useBroadcast()
  const micLevels = useAudioLevels(micStream)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [holding, setHolding] = useState(false)
  const [uploading, setUploading] = useState(false)

  const isLive = state === "live"
  const queue = studio?.queue ?? []
  const currentIndex = studio?.currentIndex ?? -1
  const track = currentIndex >= 0 ? queue[currentIndex] ?? null : null
  const playing = studio?.playing ?? false
  const repeat = studio?.repeat ?? false
  const hasQueue = queue.length > 0
  const hasTrack = !!track
  const micLevel = holding ? Math.max(micLevels.left, micLevels.right) : 0

  const activate = useCallback(() => {
    if (micDisabled) return
    sendCommand({ type: 'ptt_down' })
    setHolding(true)
  }, [sendCommand, micDisabled])

  const deactivate = useCallback(() => {
    if (micDisabled) return
    sendCommand({ type: 'ptt_up' })
    setHolding(false)
  }, [sendCommand, micDisabled])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter((f) => f.type.startsWith("audio/"))
    if (audioFiles.length === 0) return

    setUploading(true)
    const newTrackIds: string[] = []
    for (const file of audioFiles) {
      const formData = new FormData()
      formData.append("file", file)
      try {
        const res = await api.post(`/stations/${slug}/tracks`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        newTrackIds.push(res.data.data.id)
      } catch {
        toast.error(`Failed to upload: ${file.name}`)
      }
    }
    if (newTrackIds.length > 0) {
      sendCommand({ type: "queue_add", trackIds: newTrackIds })
    }
    setUploading(false)
  }, [slug, sendCommand])

  const totalDuration = queue.reduce((sum, t) => sum + t.duration, 0)

  return (
    <div className="flex flex-col gap-2 p-3 min-h-0 flex-1 lg:hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files)
          e.target.value = ""
        }}
      />

      {/* Card 1: Now Playing + PTT */}
      <Card className="py-2.5 gap-0">
        <CardContent className="px-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {track ? (
                <>
                  <div className="text-sm font-medium truncate">{track.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{track.artist}</div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {isLive ? "Add files to start playing" : "Not broadcasting"}
                </div>
              )}
            </div>

            {!micDisabled && (
              <div className="flex flex-col items-center shrink-0">
                <button
                  onTouchStart={activate}
                  onTouchEnd={deactivate}
                  onMouseDown={activate}
                  onMouseUp={deactivate}
                  onMouseLeave={deactivate}
                  className={`size-10 rounded-full border-2 flex items-center justify-center select-none transition-all ${
                    holding
                      ? "bg-destructive/25 border-destructive/70"
                      : "bg-destructive/[0.08] border-destructive/30"
                  }`}
                >
                  <IconMicrophone
                    size={18}
                    className={holding ? "text-destructive" : "text-destructive/50"}
                  />
                </button>
                <span className={`text-[9px] mt-1 ${holding ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {holding ? "LIVE" : "Hold to talk"}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Transport + Queue */}
      <Card className="flex-1 flex flex-col min-h-0 py-2 gap-0 overflow-hidden">
        <CardContent className="px-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="flex-1" onClick={() => sendCommand({ type: 'prev' })} disabled={!hasQueue}>
              <IconPlayerSkipBackFilled size={14} />
            </Button>
            <Button
              variant={hasQueue ? "default" : "ghost"}
              size="icon"
              className="flex-1 h-10"
              onClick={() => sendCommand({ type: playing ? 'pause' : 'play' })}
              disabled={!hasQueue}
            >
              {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
            </Button>
            <Button variant="ghost" size="icon" className="flex-1" onClick={() => sendCommand({ type: 'next' })} disabled={!hasQueue}>
              <IconPlayerSkipForwardFilled size={14} />
            </Button>
            <Button variant={repeat ? "secondary" : "ghost"} size="icon" className="flex-1" onClick={() => sendCommand({ type: 'repeat', enabled: !repeat })}>
              <IconRepeat size={14} />
            </Button>
          </div>

          {hasTrack && <ProgressBar />}
        </CardContent>

        <div className="flex items-center justify-between px-3 py-1.5 border-t mt-1">
          <span className="text-[11px] tracking-widest uppercase text-muted-foreground">
            Queue · {queue.length} · {formatTime(totalDuration)}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlus size={12} />}
              {uploading ? "..." : "Add"}
            </Button>
            {queue.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5" onClick={() => sendCommand({ type: 'queue_set', trackIds: [] })}>
                <IconMinus size={12} />
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 px-3">
          {queue.map((qTrack, i) => {
            const isPlaying = i === currentIndex
            return (
              <div
                key={qTrack.id}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all ${
                  isPlaying ? "bg-primary/[0.04] border-primary/10" : "border-transparent"
                }`}
              >
                <div className="flex flex-col shrink-0">
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0 bg-transparent border-none"
                    disabled={i === 0}
                    onClick={() => sendCommand({ type: 'queue_reorder', from: i, to: i - 1 })}
                  >
                    <IconChevronUp size={12} />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0 bg-transparent border-none"
                    disabled={i === queue.length - 1}
                    onClick={() => sendCommand({ type: 'queue_reorder', from: i, to: i + 1 })}
                  >
                    <IconChevronDown size={12} />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs truncate ${isPlaying ? "font-medium" : ""}`}>{qTrack.title}</div>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatTime(qTrack.duration)}</span>
                <Button variant="ghost" size="icon" className="size-5" onClick={() => sendCommand({ type: 'queue_remove', trackId: qTrack.id })}>
                  <IconX size={10} />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="px-3 py-2 border-t mt-auto shrink-0">
          <Button
            className="w-full text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlus size={12} />}
            {uploading ? "Uploading..." : "Add More Files"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
