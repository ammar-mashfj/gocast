"use client"

import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { MicSettings } from "./MicSettings"
import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
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
 * The row under the mic check: Monitor (on/off, at full level — the
 * device's own volume turns it down), the mic settings and the keyboard
 * shortcuts.
 *
 * The monitor taps the music bus post-duck and never the mic, so no routing
 * exists that could feed the microphone back into itself (see audioEngine).
 */
export function StudioControls() {
  const { micDisabled } = useBroadcast()

  return (
    // Desktop (xl): one row of equal labelled buttons. Narrower: Mic settings
    // first on a full row (right under the meter), then the rest.
    <div className="flex flex-wrap gap-2 xl:grid xl:auto-cols-fr xl:grid-flow-col">
      <MonitorToggle />

      <div className="contents">
        {!micDisabled && (
          <div className="flex max-xl:order-first max-xl:basis-full">
            <MicSettings />
          </div>
        )}
        {/* Keyboard shortcuts mean nothing on a tablet or phone (below lg). */}
        <div className="flex max-lg:hidden">
          <ShortcutsDialog micDisabled={micDisabled} />
        </div>
      </div>
    </div>
  )
}

/** Monitor on/off — in the controls row, and in the phone's Mic & monitor sheet. */
export function MonitorToggle({ className }: { className?: string }) {
  const { engine } = useBroadcast()
  useEngineVersion(engine)
  const monitor = engine?.isMonitorEnabled() ?? false
  // On/off only, at full level: the device's volume turns it down. A
  // slider here cost a whole row for something set once.
  return (
    <button
      type="button"
      aria-pressed={monitor}
      aria-keyshortcuts="M"
      title="Hear the music through your speakers (M). Never the stream."
      onClick={() => engine?.setMonitorEnabled(!monitor)}
      className={cn(
        "flex h-13 flex-1 items-center justify-center gap-2.5 rounded-button px-4 transition-colors",
        monitor ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <IconHeadphones className="size-5" aria-hidden />
      <span className="text-body-sm font-bold">Monitor</span>
      <span className="eyebrow-sm font-medium">{monitor ? "ON" : "OFF"}</span>
    </button>
  )
}

/**
 * A music-only show on md and up: one slim row over the running order, in
 * place of the whole mic column (a full-height "Music only" card and a
 * controls row with nothing mic-related left in it), so Now playing and the
 * running order get the width. Monitor and the shortcuts stay reachable.
 * Phones never show it: they have no mic column, and the talk button just
 * isn't there.
 */
export function MusicOnlyStrip({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-2.5", className)}>
      <div className="flex h-13 min-w-0 flex-1 items-center gap-3 rounded-card bg-card px-5">
        <StatusLamp tone="off" variant="soft" className="shrink-0">
          Music only
        </StatusLamp>
        <span className="min-w-0 truncate text-body-sm text-muted-foreground">The mic stays closed for this show.</span>
      </div>
      <MonitorToggle className="flex-none px-5" />
      {/* Keyboard shortcuts mean nothing on a tablet (below lg). */}
      <div className="flex w-44 flex-none max-lg:hidden">
        <ShortcutsDialog micDisabled />
      </div>
    </div>
  )
}
