"use client"

import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { MicSettings } from "./MicSettings"
import { ShortcutsDialog } from "./ShortcutsDialog"

/**
 * Keep mic open: the big latch under the talk pad (the prototype's). Off, a
 * quiet "Keep mic open"; on, the red "Close mic" — red because the mic is
 * open and everyone hears it. L does the same from the keyboard.
 */
export function MicLatchButton() {
  const { engine, micDisabled } = useBroadcast()
  useEngineVersion(engine)
  if (micDisabled) return null
  const latched = engine?.isMicLatched() ?? false
  return (
    <Button
      size="lg"
      full
      variant={latched ? "live" : "ghost"}
      dot={latched ? "current" : undefined}
      aria-pressed={latched}
      aria-keyshortcuts="L"
      title={latched ? "Close the mic (L)" : "Leave the mic on without holding anything (L)"}
      onClick={() => engine?.setMicLatched(!latched)}
    >
      {latched ? "Close mic" : "Keep mic open"}
    </Button>
  )
}

/**
 * The row under the latch: Monitor (with its volume — a desktop's speakers
 * have no hardware rocker), the mic settings and the keyboard shortcuts.
 *
 * The monitor taps the music bus post-duck and never the mic, so no routing
 * exists that could feed the microphone back into itself (see audioEngine).
 */
export function StudioControls() {
  const { engine, micDisabled } = useBroadcast()
  useEngineVersion(engine)

  const monitor = engine?.isMonitorEnabled() ?? false
  const volume = engine?.getMonitorVolume() ?? 0

  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex h-13 flex-1 items-center gap-3 rounded-button bg-card pr-3.5">
        <button
          type="button"
          aria-pressed={monitor}
          aria-keyshortcuts="M"
          title="Hear the music through your speakers (M). Never the stream."
          onClick={() => engine?.setMonitorEnabled(!monitor)}
          className={cn(
            "flex h-full flex-col items-center justify-center gap-0.5 rounded-button px-3.5 transition-colors",
            monitor ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="text-body-sm font-bold">Monitor</span>
          <span className="eyebrow-sm font-medium">{monitor ? "ON" : "OFF"}</span>
        </button>
        <Slider
          value={[Math.round(volume * 100)]}
          onValueChange={([v]) => engine?.setMonitorVolume(v / 100)}
          max={100}
          step={1}
          disabled={!monitor}
          aria-label="Monitor volume"
          className="min-w-24 flex-1"
        />
      </div>

      <div className="flex gap-2">
        {!micDisabled && <MicSettings />}
        <ShortcutsDialog micDisabled={micDisabled} />
      </div>
    </div>
  )
}
