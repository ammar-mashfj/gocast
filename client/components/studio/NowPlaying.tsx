"use client"

import { useBroadcast } from "@/contexts/BroadcastContext"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function NowPlaying() {
  const { studio, state } = useBroadcast()
  const isLive = state === "live"

  const track = studio && studio.currentIndex >= 0
    ? studio.queue[studio.currentIndex] ?? null
    : null
  const playing = studio?.playing ?? false

  return (
    <Card className="py-2.5 md:py-4 gap-0">
      <CardContent className="px-3 md:px-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-[10px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center shrink-0">
            <span className="text-xl">♫</span>
          </div>

          <div className="flex-1 min-w-0">
            {track ? (
              <>
                <Badge variant="secondary" className="mb-0.5 text-[10px]">
                  {playing ? "Now playing" : "Paused"}
                </Badge>
                <div className="text-base font-medium truncate">{track.title}</div>
                <div className="text-sm text-muted-foreground">{track.artist}</div>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="mb-0.5 text-[10px]">
                  {isLive ? "On air" : "Offline"}
                </Badge>
                <div className="text-base font-medium text-muted-foreground truncate">
                  {isLive ? "Add files to queue to start playing" : "Not broadcasting"}
                </div>
              </>
            )}
          </div>

          {isLive && (
            <Badge variant="secondary" className="text-emerald-400 gap-1 shrink-0">
              <span className="size-1.5 bg-emerald-400 rounded-full" />
              On air
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
