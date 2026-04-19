"use client"

import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react"
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
  IconGripVertical,
} from "@tabler/icons-react"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAudioLevels } from "@/lib/useAudioLevels"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { QueueTrack } from "@/lib/audioEngine"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}


function ProgressBar({ engine }: { engine: NonNullable<ReturnType<typeof useBroadcast>["engine"]> }) {
  const barRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let raf = 0
    function tick() {
      const track = engine.getCurrentTrack()
      const elapsed = engine.getElapsed()
      const duration = track?.duration ?? 0
      const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0
      if (barRef.current && !dragging) barRef.current.style.width = `${pct}%`
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(elapsed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine, dragging])

  const handleSeek = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const track = engine.getCurrentTrack()
    if (track) engine.seek(pct * track.duration)
  }, [engine])

  const track = engine.getCurrentTrack()
  const duration = track?.duration ?? 0

  return (
    <div className="flex items-center gap-2 w-full">
      <span ref={elapsedRef} className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">0:00</span>
      <div ref={trackRef} className="flex-1 h-5 flex items-center cursor-pointer group" onClick={handleSeek}>
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden group-hover:h-1.5 transition-all">
          <div ref={barRef} className="h-full rounded-full bg-primary" style={{ width: "0%" }} />
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-8 shrink-0">{formatTime(duration)}</span>
    </div>
  )
}

interface SortableMobileRowProps {
  track: QueueTrack
  isPlaying: boolean
  onRemove: () => void
}

function SortableMobileRow({ track, isPlaying, onRemove }: SortableMobileRowProps) {
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
      className={`flex items-center gap-1.5 px-1 py-1 rounded-md border transition-colors touch-none select-none ${
        isDragging ? "opacity-60 z-10 relative shadow-lg bg-card" : ""
      } ${isPlaying ? "bg-primary/[0.04] border-primary/10" : "border-transparent"}`}
    >
      <div className="flex items-center justify-center size-9 text-muted-foreground shrink-0">
        <IconGripVertical size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-xs truncate ${isPlaying ? "font-medium" : ""}`}>{track.title}</div>
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatTime(track.duration)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
      >
        <IconX size={14} />
      </Button>
    </div>
  )
}

export function MobileStudio() {
  const { engine, state, micStream, micDisabled } = useBroadcast()
  const micLevels = useAudioLevels(micStream)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [holding, setHolding] = useState(false)
  const [queue, setQueue] = useState<QueueTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [, forceUpdate] = useState(0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !engine) return
    const from = queue.findIndex((t) => t.id === active.id)
    const to = queue.findIndex((t) => t.id === over.id)
    if (from === -1 || to === -1) return
    setQueue((prev) => arrayMove(prev, from, to))
    engine.moveTrack(from, to)
  }, [engine, queue])

  const isLive = state === "live"
  const track = engine?.getCurrentTrack() ?? null
  const playing = engine?.isPlaying() ?? false
  const micActive = engine?.isMicActive() ?? false
  const repeat = engine?.isRepeat() ?? false
  const hasQueue = (engine?.getQueue().length ?? 0) > 0
  const hasTrack = !!track
  const micLevel = holding ? Math.max(micLevels.left, micLevels.right) : 0

  // Audio level meter
  const barRef = useRef<HTMLDivElement>(null)
  const analyser = engine?.getAnalyser() ?? null
  useEffect(() => {
    if (!analyser || !barRef.current) return
    const buf = new Uint8Array(analyser.fftSize)
    let raf = 0
    let smoothed = 0
    function tick() {
      analyser!.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const val = (buf[i] - 128) / 128
        sum += val * val
      }
      const raw = Math.min(1, Math.sqrt(sum / buf.length) * 3)
      smoothed = raw > smoothed ? raw * 0.05 + smoothed * 0.95 : raw * 0.01 + smoothed * 0.99
      const pct = Math.round(smoothed * 100)
      if (barRef.current) {
        barRef.current.style.width = `${pct}%`
        barRef.current.style.backgroundColor = pct > 85 ? "var(--destructive)" : "var(--primary)"
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [analyser])

  // PTT handlers
  const activate = useCallback(() => {
    if (micDisabled) return
    engine?.pttDown()
    setHolding(true)
  }, [engine, micDisabled])

  const deactivate = useCallback(() => {
    if (micDisabled) return
    engine?.pttUp()
    setHolding(false)
  }, [engine, micDisabled])

  // Queue sync
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
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ""
        }}
      />

      {/* Card 1: Now Playing + PTT */}
      <Card className="py-2.5 gap-0">
        <CardContent className="px-3">
          <div className="flex items-center gap-3">
            {/* Track info */}
            <div className="flex-1 min-w-0">
              {!micDisabled && micActive ? (
                <>
                  <Badge variant="destructive" className="mb-0.5 text-[10px]">Mic live</Badge>
                  <div className="text-sm font-medium">Speaking...</div>
                </>
              ) : track ? (
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

            {/* PTT button — hidden in files-only mode */}
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

          {/* Audio level meter */}
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div ref={barRef} className="h-full rounded-full" style={{ width: "0%" }} />
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Transport + Queue */}
      <Card className="flex-1 flex flex-col min-h-0 py-2 gap-0 overflow-hidden">
        <CardContent className="px-3 flex flex-col gap-2">
          {/* Transport controls */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="flex-1" onClick={() => engine?.prev()} disabled={!hasQueue}>
              <IconPlayerSkipBackFilled size={14} />
            </Button>
            <Button
              variant={hasQueue ? "default" : "ghost"}
              size="icon"
              className="flex-1 h-10"
              onClick={() => engine?.togglePlay()}
              disabled={!hasQueue}
            >
              {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
            </Button>
            <Button variant="ghost" size="icon" className="flex-1" onClick={() => engine?.next()} disabled={!hasQueue}>
              <IconPlayerSkipForwardFilled size={14} />
            </Button>
            <Button variant={repeat ? "secondary" : "ghost"} size="icon" className="flex-1" onClick={() => engine?.toggleRepeat()}>
              <IconRepeat size={14} />
            </Button>
          </div>

          {/* Progress bar */}
          {hasTrack && engine && <ProgressBar engine={engine} />}
        </CardContent>

        {/* Queue header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t mt-1">
          <span className="text-[11px] tracking-widest uppercase text-muted-foreground">
            Queue · {queue.length} · {formatTime(totalDuration)}
            {queue.length > 1 && <span className="normal-case tracking-normal"> · hold to reorder</span>}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5" onClick={() => fileInputRef.current?.click()}>
              <IconPlus size={12} />
              Add
            </Button>
            {queue.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5" onClick={() => engine?.clearQueue()}>
                <IconMinus size={12} />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Queue list */}
        <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 px-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={queue.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {queue.map((qTrack, i) => (
                <SortableMobileRow
                  key={qTrack.id}
                  track={qTrack}
                  isPlaying={i === currentIndex}
                  onRemove={() => engine?.removeTrack(qTrack.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="px-3 py-2 border-t mt-auto shrink-0">
          <Button
            className="w-full text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <IconPlus size={12} />
            Add More Files
          </Button>
        </div>
      </Card>
    </div>
  )
}
