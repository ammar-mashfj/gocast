"use client"

import { useState, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import { IconPlus, IconMinus, IconX, IconGripVertical, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/axios"

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

const GRADIENTS = [
  "linear-gradient(135deg,#1a0533,#2d1b69)",
  "linear-gradient(135deg,#0f1a2b,#1a3355)",
  "linear-gradient(135deg,#1a1a0f,#33331a)",
  "linear-gradient(135deg,#0f2b1a,#1a5533)",
  "linear-gradient(135deg,#2b0f1a,#551a33)",
]
const ICONS = ["♫", "♬", "♩", "♪", "♫"]

export function FileQueue() {
  const { slug } = useParams<{ slug: string }>()
  const { studio, sendCommand } = useBroadcast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOverZone, setDragOverZone] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const queue = studio?.queue ?? []
  const currentIndex = studio?.currentIndex ?? -1

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

  const handleDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverZone(false)
    const files: File[] = []
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i]
        if (item.kind === "file") {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    } else if (e.dataTransfer.files.length > 0) {
      files.push(...Array.from(e.dataTransfer.files))
    }
    if (files.length > 0) uploadFiles(files)
  }, [uploadFiles])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(idx))
  }, [])

  const handleDragOverItem = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIdx(idx)
  }, [])

  const handleDropOnItem = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragIdx === null || dragIdx === toIdx) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }
    sendCommand({ type: "queue_reorder", from: dragIdx, to: toIdx })
    setDragIdx(null)
    setDragOverIdx(null)
  }, [dragIdx, sendCommand])

  const totalDuration = queue.reduce((sum, t) => sum + t.duration, 0)

  return (
    <Card className="flex-1 flex flex-col min-h-0 py-2 md:py-4 gap-0">
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

      <CardHeader className="flex-row items-center justify-between py-2 md:py-3">
        <CardTitle className="text-xs tracking-widest uppercase text-muted-foreground font-normal">
          Up next
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {queue.length} track{queue.length !== 1 ? "s" : ""} · {formatDuration(totalDuration)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : <IconPlus data-icon="inline-start" />}
            {uploading ? "Uploading..." : "Add files"}
          </Button>
          {queue.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => sendCommand({ type: "queue_set", trackIds: [] })}>
              <IconMinus data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-0.5 overflow-y-auto flex-1 pt-0">
        {queue.map((track, i) => {
          const isPlaying = i === currentIndex
          const isDragging = dragIdx === i
          const isDragOver = dragOverIdx === i
          return (
            <div
              key={track.id}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOverItem(e, i)}
              onDrop={(e) => handleDropOnItem(e, i)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              className={`grid grid-cols-[16px_32px_1fr_40px_24px] items-center gap-2 px-2.5 py-2 rounded-md border transition-all ${
                isDragging ? "opacity-30" : ""
              } ${isDragOver ? "border-primary bg-primary/5" : ""} ${
                isPlaying
                  ? "bg-primary/[0.04] border-primary/10"
                  : "border-transparent hover:bg-muted/50"
              }`}
            >
              <IconGripVertical size={12} className="text-muted-foreground cursor-grab" />
              <div
                className="size-8 rounded-md flex items-center justify-center text-xs shrink-0"
                style={{ background: GRADIENTS[i % GRADIENTS.length] }}
              >
                {ICONS[i % ICONS.length]}
              </div>
              <div className="min-w-0">
                <div className={`text-sm truncate ${isPlaying ? "font-medium" : ""}`}>
                  {track.title}
                </div>
                <div className="text-xs text-muted-foreground truncate">{track.artist}</div>
              </div>
              <div className="text-xs text-muted-foreground text-right tabular-nums">
                {formatDuration(track.duration)}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => sendCommand({ type: "queue_remove", trackId: track.id })}
              >
                <IconX size={12} />
              </Button>
            </div>
          )
        })}
      </CardContent>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOverZone(true) }}
        onDragLeave={() => setDragOverZone(false)}
        onDrop={handleDropZone}
        className={`border border-dashed rounded-lg py-3 md:py-4 text-center cursor-pointer mx-3 md:mx-4 mb-3 md:mb-4 transition-all ${
          dragOverZone
            ? "border-primary bg-primary/[0.04]"
            : "border-border hover:border-primary/40 hover:bg-primary/[0.02]"
        }`}
      >
        <div className="text-sm text-muted-foreground">
          Drop audio files here or <span className="text-primary">browse</span>
        </div>
      </div>
    </Card>
  )
}
