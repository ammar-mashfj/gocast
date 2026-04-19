"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { IconPlus, IconMinus, IconX, IconGripVertical } from "@tabler/icons-react"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
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

interface SortableRowProps {
  track: QueueTrack
  index: number
  isPlaying: boolean
  onRemove: () => void
}

function SortableRow({ track, index, isPlaying, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`grid grid-cols-[24px_32px_1fr_40px_24px] items-center gap-2 px-2.5 py-2 rounded-md border transition-colors cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? "opacity-50 z-10 relative shadow-lg" : ""
      } ${
        isPlaying
          ? "bg-primary/[0.04] border-primary/10"
          : "border-transparent hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center justify-center size-6 text-muted-foreground">
        <IconGripVertical size={14} />
      </div>
      <div
        className="size-8 rounded-md flex items-center justify-center text-xs shrink-0"
        style={{ background: GRADIENTS[index % GRADIENTS.length] }}
      >
        {ICONS[index % ICONS.length]}
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
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
      >
        <IconX size={12} />
      </Button>
    </div>
  )
}

export function FileQueue() {
  const { engine } = useBroadcast()
  const version = useEngineVersion(engine)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOverZone, setDragOverZone] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // `version` is the real dependency — engine mutates its queue array in place,
  // so we rely on the version bump from useEngineVersion to force a new memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => engine?.getQueue() ?? [], [engine, version])
  const currentIndex = engine?.getCurrentIndex() ?? -1

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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !engine) return
    const from = queue.findIndex((t) => t.id === active.id)
    const to = queue.findIndex((t) => t.id === over.id)
    if (from === -1 || to === -1) return
    engine.moveTrack(from, to)
  }, [engine, queue])

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
            {queue.length > 1 && " · hold to reorder"}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={queue.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {queue.map((track, i) => (
              <SortableRow
                key={track.id}
                track={track}
                index={i}
                isPlaying={i === currentIndex}
                onRemove={() => engine?.removeTrack(track.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
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
