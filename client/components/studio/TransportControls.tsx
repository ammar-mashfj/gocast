"use client"

import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
  IconRepeat,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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
      <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">
        {formatTime(elapsed)}
      </span>
      <div className="flex-1 h-5 flex items-center">
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  )
}

export function TransportControls() {
  const { studio, sendCommand } = useBroadcast()

  const playing = studio?.playing ?? false
  const repeat = studio?.repeat ?? false
  const hasQueue = (studio?.queue.length ?? 0) > 0
  const hasTrack = studio ? studio.currentIndex >= 0 : false

  return (
    <Card className="py-2 md:py-4 gap-0">
      <CardContent className="px-3 md:px-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => sendCommand({ type: 'prev' })}
            disabled={!hasQueue}
          >
            <IconPlayerSkipBackFilled size={14} />
          </Button>

          <Button
            variant={hasQueue ? "default" : "ghost"}
            size="icon"
            className="size-10"
            onClick={() => sendCommand({ type: playing ? 'pause' : 'play' })}
            disabled={!hasQueue}
          >
            {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => sendCommand({ type: 'next' })}
            disabled={!hasQueue}
          >
            <IconPlayerSkipForwardFilled size={14} />
          </Button>

          <Button
            variant={repeat ? "secondary" : "ghost"}
            size="icon"
            onClick={() => sendCommand({ type: 'repeat', enabled: !repeat })}
          >
            <IconRepeat size={14} />
          </Button>
        </div>

        {hasTrack && <ProgressBar />}
      </CardContent>
    </Card>
  )
}
