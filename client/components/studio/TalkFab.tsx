"use client"

import { useRef, useState } from "react"
import { IconAdjustmentsHorizontal, IconChevronUp, IconLock, IconMicrophone } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ds/Dialog"
import { MicMeter } from "@/components/studio/MicMeter"
import { MicSettingsFields } from "@/components/studio/MicSettings"

/** How far up a held press must travel to lock the mic open. */
const LOCK_PX = 72

/**
 * The phone studio's talk button: floating over the running order, which
 * has the screen, because most shows are music and the pad took half of it.
 *
 * Hold to talk; slide up while holding to lock the mic open (the voice-note
 * gesture); tap to close a locked mic. Only a press that starts on the
 * button counts, and the button doesn't move, so scrolling the list under
 * it can't put anyone on air. While the mic is open a level meter shows
 * above it — the one on the page is gone on a phone.
 */
export function TalkFab({ className }: { className?: string }) {
  const { engine, micStream, micDisabled } = useBroadcast()
  useEngineVersion(engine)
  const hold = useRef<{ id: number; y: number } | null>(null)
  const [holding, setHolding] = useState(false)
  const [pull, setPull] = useState(0)

  if (micDisabled || !engine) return null
  const micOpen = engine.isMicActive()
  const latched = engine.isMicLatched()

  function release() {
    hold.current = null
    setHolding(false)
    setPull(0)
  }


  return (
    <>
    {/* While the mic is open, held or locked: the screen dims to half so the button,
        its level and the lock target stand out — not black, because a host
        reads track names off the screen while talking. Over the tab bar, not
        the band, and it swallows taps, so a stray touch while
        holding does nothing. Same z as the button, which comes later. (75%:
        dimmer than half, still legible.) */}
    {/* Starts under the top bar and the LIVE band (--chrome-h, measured
        by the shell): the band says you are live, and it stays readable. */}
    <div
      aria-hidden
      style={{ top: "var(--chrome-h, 0px)" }}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 bg-background/75 transition-opacity duration-200",
        // Held or locked: it swallows taps, so the dimmed page really is
        // out of reach. Only this button (to unlock) and the band above stay live.
        holding || latched ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
    />
    <div className={cn("pointer-events-none fixed right-gutter bottom-talk-fab z-40 flex flex-col items-end gap-2.5", className)}>
      {micOpen && (
        <div className="flex w-44 items-center gap-2.5 rounded-full bg-popover py-2 pr-3.5 pl-3 shadow-panel">
          <span className="font-mono text-micro font-semibold text-live-text uppercase">{latched ? "Locked" : "Live"}</span>
          <MicMeter stream={micStream} open compact className="min-w-0 flex-1" />
        </div>
      )}

      {/* The lock target, while held: it rises with the finger. */}
      {holding && !latched && (
        <div
          aria-hidden
          className="mr-2 flex flex-col items-center gap-1 rounded-full bg-popover px-2.5 py-3 text-muted-foreground shadow-panel transition-transform"
          style={{ transform: `translateY(${-pull * 20}px)` }}
        >
          <IconLock className={cn("size-4.5", pull > 0.6 && "text-foreground")} />
          <IconChevronUp className="size-4" />
        </div>
      )}

      <button
        type="button"
        aria-pressed={micOpen}
        aria-label={latched ? "Close the mic" : "Hold to talk. Slide up to keep the mic open."}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          if (latched) {
            engine.setMicLatched(false)
            return
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          hold.current = { id: e.pointerId, y: e.clientY }
          setHolding(true)
          setPull(0)
          engine.pttDown()
        }}
        onPointerMove={(e) => {
          const h = hold.current
          if (!h || h.id !== e.pointerId) return
          const dy = h.y - e.clientY
          if (dy >= LOCK_PX) {
            release()
            engine.setMicLatched(true)
            return
          }
          setPull(Math.max(0, dy / LOCK_PX))
        }}
        onPointerUp={(e) => {
          if (hold.current?.id !== e.pointerId) return
          release()
          engine.pttUp()
        }}
        onPointerCancel={(e) => {
          if (hold.current?.id !== e.pointerId) return
          release()
          engine.pttUp()
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          // 56px. No halo of its own: while the mic is open the whole
          // screen dims behind it, which does that job better.
          "pointer-events-auto flex size-14 touch-none select-none items-center justify-center rounded-full shadow-panel transition-[background-color,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          micOpen ? "scale-110 bg-live text-live-ink" : "bg-foreground text-background",
        )}
      >
        {latched ? <IconLock className="size-6" /> : <IconMicrophone className="size-6" />}
      </button>
      {latched && <span className="mr-1 font-mono text-micro font-semibold text-muted-foreground uppercase">Tap to close</span>}
    </div>
    </>
  )
}

/**
 * The phone's Mic button: the level check and the mic settings in a sheet,
 * so none of it takes the running order's room. Monitor is its own button
 * beside it (a one-tap toggle). Nothing in Music only.
 */
export function MicSheet({ className }: { className?: string }) {
  const { engine, micStream, micDisabled } = useBroadcast()
  useEngineVersion(engine)
  if (micDisabled) return null
  const device = micStream?.getAudioTracks()[0]?.label || "Default microphone"

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="quiet"
          className={cn("h-13 gap-2 rounded-button bg-card px-3.5 text-foreground hover:bg-card/80", className)}
          disabled={!engine}
        >
          <IconAdjustmentsHorizontal className="size-5" aria-hidden />
          Mic
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" className="gap-5">
        <DialogHeader>
          <DialogTitle>Mic</DialogTitle>
          <DialogDescription>Changes apply straight away and stay in this browser.</DialogDescription>
        </DialogHeader>
        {/* Just the level and which mic: a slim meter, no scale or label. */}
        <div className="flex flex-col gap-1.5">
          <MicMeter stream={micStream} open={false} compact />
          <span className="truncate text-xs text-text-faint">{device}</span>
        </div>
        <MicSettingsFields />
      </DialogContent>
    </Dialog>
  )
}
