"use client"

import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react"
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
  IconRepeat,
  IconRepeatOnce,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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

  // Update progress bar via rAF for smooth movement
  useEffect(() => {
    let raf = 0
    function tick() {
      const track = engine.getCurrentTrack()
      const elapsed = engine.getElapsed()
      const duration = track?.duration ?? 0
      const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0

      if (barRef.current && !dragging) {
        barRef.current.style.width = `${pct}%`
      }
      if (elapsedRef.current) {
        elapsedRef.current.textContent = formatTime(elapsed)
      }
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
    if (track) {
      engine.seek(pct * track.duration)
    }
  }, [engine])

  const track = engine.getCurrentTrack()
  const duration = track?.duration ?? 0

  return (
    <div className="flex items-center gap-2 w-full">
      <span ref={elapsedRef} className="text-xs text-muted-foreground tabular-nums w-8 text-right shrink-0">
        0:00
      </span>
      <div
        ref={trackRef}
        className="flex-1 h-5 flex items-center cursor-pointer group"
        onClick={handleSeek}
        onMouseDown={(e) => {
          setDragging(true)
          handleSeek(e)
          const handleMove = (ev: globalThis.MouseEvent) => {
            if (!trackRef.current) return
            const rect = trackRef.current.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
            if (barRef.current) barRef.current.style.width = `${pct * 100}%`
          }
          const handleUp = (ev: globalThis.MouseEvent) => {
            if (!trackRef.current) return
            const rect = trackRef.current.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
            const t = engine.getCurrentTrack()
            if (t) engine.seek(pct * t.duration)
            setDragging(false)
            window.removeEventListener("mousemove", handleMove)
            window.removeEventListener("mouseup", handleUp)
          }
          window.addEventListener("mousemove", handleMove)
          window.addEventListener("mouseup", handleUp)
        }}
      >
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden group-hover:h-1.5 transition-all">
          <div
            ref={barRef}
            className="h-full rounded-full bg-primary"
            style={{ width: "0%" }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  )
}

export function TransportControls() {
  const { engine } = useBroadcast()
  useEngineVersion(engine)

  const playing = engine?.isPlaying() ?? false
  const repeatMode = engine?.getRepeatMode() ?? 'off'
  const hasQueue = (engine?.getQueue().length ?? 0) > 0
  const hasTrack = !!engine?.getCurrentTrack()

  return (
    <Card className="py-2 md:py-4 gap-0">
      <CardContent className="px-3 md:px-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => engine?.prev()}
            disabled={!hasQueue}
          >
            <IconPlayerSkipBackFilled size={14} />
          </Button>

          <Button
            variant={hasQueue ? "default" : "ghost"}
            size="icon"
            className="size-10"
            onClick={() => engine?.togglePlay()}
            disabled={!hasQueue}
          >
            {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => engine?.next()}
            disabled={!hasQueue}
          >
            <IconPlayerSkipForwardFilled size={14} />
          </Button>

          <Button
            variant={repeatMode === 'off' ? "ghost" : "secondary"}
            size="icon"
            onClick={() => engine?.cycleRepeatMode()}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <IconRepeatOnce size={14} /> : <IconRepeat size={14} />}
          </Button>
        </div>

        {hasTrack && engine && <ProgressBar engine={engine} />}
      </CardContent>
    </Card>
  )
}
