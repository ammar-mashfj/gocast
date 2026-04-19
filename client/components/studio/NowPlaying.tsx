"use client"

import { useEffect, useRef } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/** Updates the level bar DOM element directly via rAF — bypasses React renders for smooth 60fps animation. */
function useAudioLevel(analyser: AnalyserNode | null, barRef: React.RefObject<HTMLDivElement | null>) {
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
      // Very heavy smoothing — bar glides slowly, reacting to overall energy not individual beats
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
  }, [analyser, barRef])
}

export function NowPlaying() {
  const { engine, state } = useBroadcast()
  useEngineVersion(engine)
  const analyser = engine?.getAnalyser() ?? null
  const barRef = useRef<HTMLDivElement>(null)
  const isLive = state === "live"

  useAudioLevel(analyser, barRef)

  const track = engine?.getCurrentTrack() ?? null
  const playing = engine?.isPlaying() ?? false
  const micActive = engine?.isMicActive() ?? false

  return (
    <Card className="py-2.5 md:py-4 gap-0">
      <CardContent className="px-3 md:px-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-12 rounded-[10px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center shrink-0 relative">
            {track ? (
              <span className="text-xl">♫</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="1.5">
                <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {micActive ? (
              <>
                <Badge variant="destructive" className="mb-0.5 text-[10px]">Mic live</Badge>
                <div className="text-base font-medium truncate">Speaking...</div>
              </>
            ) : track ? (
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

        {/* Audio level meter — updated directly via rAF for smooth animation */}
        <div className="h-[6px] bg-muted rounded-full overflow-hidden">
          <div ref={barRef} className="h-full rounded-full" style={{ width: "0%" }} />
        </div>
      </CardContent>
    </Card>
  )
}
