"use client"

import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { MicSettings } from "./MicSettings"

/**
 * The row under the talk pad, as the mobile studio has it
 * (mobile/src/components/studio/Console.tsx, `Controls`): Keep mic open,
 * Monitor, mic settings. Three cards, the latch taking the spare width.
 *
 * Web only: the monitor carries its volume, because a desktop's speakers
 * have no hardware rocker the way a phone does.
 *
 * The monitor taps the music bus post-duck and never the mic, so no routing
 * exists that could feed the microphone back into itself (see audioEngine).
 */
export function StudioControls() {
  const { engine, micDisabled } = useBroadcast()
  useEngineVersion(engine)

  const latched = engine?.isMicLatched() ?? false
  const monitor = engine?.isMonitorEnabled() ?? false
  const volume = engine?.getMonitorVolume() ?? 0

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={latched}
        aria-keyshortcuts="L"
        disabled={micDisabled}
        title="Leave the mic on without holding anything (L)"
        onClick={() => engine?.setMicLatched(!latched)}
        className="flex h-[52px] min-w-[15rem] flex-1 items-center gap-3 rounded-2xl bg-card px-3.5 text-left transition-opacity hover:opacity-90 disabled:hover:opacity-100"
      >
        {/* The design system's Switch, drawn inline: the whole card is the
            control, and a real switch inside a button would nest two. */}
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-10 shrink-0 items-center rounded-full px-[3px] transition-colors",
            latched ? "justify-end bg-live" : "justify-start bg-border-subtle",
            micDisabled && "opacity-45",
          )}
        >
          <span className={cn("size-[18px] rounded-full", latched ? "bg-live-ink" : "bg-text-faint")} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className={cn("truncate text-sm font-bold", micDisabled && "text-text-faint")}>Keep mic open</span>
          <span className="truncate text-[11px] font-medium text-text-faint">
            {micDisabled ? "No mic in this show" : latched ? "On · mic stays open" : "Off · hold the pad instead"}
          </span>
        </span>
      </button>

      <div className="flex h-[52px] items-center gap-3 rounded-2xl bg-card pr-3.5">
        <button
          type="button"
          aria-pressed={monitor}
          aria-keyshortcuts="M"
          title="Hear the music through your speakers (M). Never the stream."
          onClick={() => engine?.setMonitorEnabled(!monitor)}
          className={cn(
            "flex h-full flex-col items-center justify-center gap-0.5 rounded-2xl px-3.5 transition-colors",
            monitor ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="text-[13px] font-bold">Monitor</span>
          <span className="font-mono text-[10px] font-medium">{monitor ? "ON" : "OFF"}</span>
        </button>
        <Slider
          value={[Math.round(volume * 100)]}
          onValueChange={([v]) => engine?.setMonitorVolume(v / 100)}
          max={100}
          step={1}
          disabled={!monitor}
          aria-label="Monitor volume"
          className="w-28"
        />
      </div>

      {!micDisabled && <MicSettings />}
    </div>
  )
}
