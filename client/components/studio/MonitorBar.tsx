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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={enabled}
        aria-keyshortcuts="M"
        title="Hear the music through your speakers (M)"
        onClick={() => engine?.setMonitorEnabled(!enabled)}
        className={cn("h-9 -ml-2", enabled ? "text-foreground" : "text-muted-foreground")}
      >
        {enabled ? (
          <IconHeadphones data-icon="inline-start" />
        ) : (
          <IconHeadphonesOff data-icon="inline-start" />
        )}
        {enabled ? "Monitor on" : "Monitor off"}
      </Button>

      <Slider
        value={[Math.round(volume * 100)]}
        onValueChange={([v]) => engine?.setMonitorVolume(v / 100)}
        max={100}
        step={1}
        disabled={!enabled}
        aria-label="Monitor volume"
        className="w-40 min-w-[96px] flex-1 sm:flex-none"
      />

      <span className="text-xs text-muted-foreground">
        Your speakers only — never the stream
      </span>
    </div>
  )
}
