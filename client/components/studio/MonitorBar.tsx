"use client"

import { IconHeadphones, IconHeadphonesOff } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

/**
 * Speaker monitor for the file bus.
 *
 * The studio has never made a sound: `createMediaElementSource` pulls each
 * track out of the default output, and the mixer is deliberately never
 * connected to `ctx.destination`. That was the right call for the mic — a
 * broadcaster monitoring their own voice through speakers builds a feedback
 * loop — but it left them with no way to hear their own show except the
 * public stream, which runs seconds behind.
 *
 * So the monitor taps `fileGain` only, post-duck. Music is audible, the mic
 * never is, and no routing exists that could feed the microphone back into
 * itself. Off by default; the broadcaster opts in.
 */
export function MonitorBar() {
  const { engine } = useBroadcast()
  useEngineVersion(engine)

  const enabled = engine?.isMonitorEnabled() ?? false
  const volume = engine?.getMonitorVolume() ?? 0

  return (
    <div className="flex items-center gap-3.5 flex-wrap rounded-xl border bg-card px-4 py-2.5">
      <Button
        variant={enabled ? "secondary" : "outline"}
        size="sm"
        onClick={() => engine?.setMonitorEnabled(!enabled)}
        className={cn(enabled && "text-primary")}
      >
        {enabled ? (
          <IconHeadphones data-icon="inline-start" />
        ) : (
          <IconHeadphonesOff data-icon="inline-start" />
        )}
        {enabled ? "Monitoring on" : "Monitor off"}
      </Button>

      <div className="flex items-center gap-2.5 flex-1 min-w-[180px]">
        <span className="text-xs text-muted-foreground shrink-0">Monitor volume</span>
        <Slider
          value={[Math.round(volume * 100)]}
          onValueChange={([v]) => engine?.setMonitorVolume(v / 100)}
          max={100}
          step={1}
          disabled={!enabled}
          aria-label="Monitor volume"
          className="flex-1 min-w-[80px]"
        />
      </div>

      <span className="text-xs text-muted-foreground shrink-0">
        Affects your speakers only — never the stream
      </span>
    </div>
  )
}
