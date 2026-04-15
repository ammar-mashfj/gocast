"use client"

import { useState, useEffect, useCallback } from "react"
import { IconMicrophone } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAudioLevels } from "@/lib/useAudioLevels"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function PushToTalk() {
  const { engine, micStream, micDisabled } = useBroadcast()
  const micLevels = useAudioLevels(micStream)
  const [holding, setHolding] = useState(false)

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

  useEffect(() => {
    if (micDisabled) return
    function onDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat && (e.target === document.body || e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        activate()
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === "Space") deactivate()
    }
    document.addEventListener("keydown", onDown)
    document.addEventListener("keyup", onUp)
    return () => {
      document.removeEventListener("keydown", onDown)
      document.removeEventListener("keyup", onUp)
    }
  }, [activate, deactivate, micDisabled])

  const micLevel = holding ? Math.max(micLevels.left, micLevels.right) : 0

  return (
    <Card className={micDisabled ? "opacity-50" : ""}>
      <CardContent className="flex items-center gap-4 p-4">
        <button
          onMouseDown={activate}
          onMouseUp={deactivate}
          onMouseLeave={deactivate}
          disabled={micDisabled}
          className={`size-16 rounded-full border-2 flex items-center justify-center shrink-0 select-none transition-all ${
            micDisabled
              ? "bg-muted border-border cursor-not-allowed"
              : holding
                ? "bg-destructive/25 border-destructive/70 cursor-pointer"
                : "bg-destructive/[0.08] border-destructive/30 hover:bg-destructive/15 hover:border-destructive/50 cursor-pointer"
          }`}
        >
          <IconMicrophone
            size={24}
            className={micDisabled ? "text-muted-foreground" : holding ? "text-destructive" : "text-destructive/50"}
          />
        </button>

        <div className="flex-1">
          <div className={`text-sm font-medium mb-0.5 ${micDisabled ? "text-muted-foreground" : holding ? "text-destructive" : ""}`}>
            {micDisabled ? "Microphone unavailable" : holding ? "Mic is LIVE" : "Hold to talk"}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {micDisabled
              ? "Microphone access was not granted. You can only stream files."
              : "Music ducks while you speak. Release to resume full volume."}
          </div>
          {!micDisabled && (
            <Badge variant="secondary" className="mt-1.5 text-[10px]">Hold SPACE</Badge>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-muted-foreground tracking-wide uppercase">Mic</span>
          <div className="w-1.5 h-10 bg-muted rounded-sm overflow-hidden flex flex-col-reverse">
            <div
              className="w-full rounded-sm transition-[height] duration-75"
              style={{
                height: `${micLevel * 100}%`,
                background: micLevel > 0.8 ? "hsl(var(--destructive))" : micLevel > 0.5 ? "#fbbf24" : "#34d399",
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
