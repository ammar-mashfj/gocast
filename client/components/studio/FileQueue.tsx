"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { IconPlus, IconMinus, IconX, IconGripVertical } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { QueueTrack } from "@/lib/audioEngine"

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
  const { engine } = useBroadcast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueueTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [, forceUpdate] = useState(0)
  const [dragOverZone, setDragOverZone] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!engine) return
    const timer = setInterval(() => {
      setQueue([...engine.getQueue()])
      setCurrentIndex(engine.getCurrentIndex())
      forceUpdate((n) => n + 1)
    }, 300)
    return () => clearInterval(timer)
  }, [engine])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!engine) return
    await engine.addFiles(files)
  }, [engine])

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
    if (files.length > 0) handleFiles(files)
  }, [handleFiles])

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
    if (dragIdx === null || dragIdx === toIdx || !engine) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }
    const q = engine.getQueue()
    const [moved] = q.splice(dragIdx, 1)
    q.splice(toIdx, 0, moved)
    setDragIdx(null)
    setDragOverIdx(null)
  }, [dragIdx, engine])

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
          if (e.target.files) handleFiles(e.target.files)
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
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            <IconPlus data-icon="inline-start" />
            Add files
          </Button>
          {queue.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => engine?.clearQueue()}>
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
                onClick={() => engine?.removeTrack(track.id)}
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
