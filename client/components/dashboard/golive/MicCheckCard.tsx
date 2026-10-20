"use client"

import { useState } from "react"
import { IconChevronRight, IconLoader2, IconMicrophone, IconMicrophoneOff } from "@tabler/icons-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import type { useMicPreview } from "@/hooks/useMicPreview"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Select } from "@/components/ds/Select"
import { MicMeter } from "@/components/studio/MicMeter"
import { MicPermissionLink } from "./MicPermissionLink"
import { cn } from "@/lib/utils"

/**
 * One height for every state (off, opening, on with the picker): the music
 * card beside it is sized to this column, so a card that changes height as
 * the mic opens makes that one jump too. Only from lg, where they sit side
 * by side; stacked, the extra height was just blank space. Fits the tallest state — header,
 * device picker, meter.
 */
const CARD_HEIGHT = "lg:min-h-56"

/**
 * Pick the microphone and hear-check it before the show — the only time it
 * can be changed: the engine can't swap mics on air. The meter draws in its
 * grey "check" colour because none of this is going out.
 */
interface MicCheckProps {
  mic: ReturnType<typeof useMicPreview>
  /** False after MIC_TRIES refusals (counted by the page, lib/micFailures): Try again can't work. */
  canRetry: boolean
  onMusicOnly: () => void
  /** Switches back to Mic + music, from the disabled card. */
  onUseMic?: () => void
  /** Music only: the card stays, dimmed and closed, so the page keeps its shape. */
  disabled?: boolean
}

/**
 * The full card from lg; below lg a one-line row (MicRow) that keeps a slim
 * live meter in view and puts the picker in a bottom sheet, so a phone or
 * small tablet reaches the music list without scrolling past ~200px of
 * mic check. A blocked mic is a problem to read, so its notice shows in
 * full at every size.
 */
export function MicCheckCard(props: MicCheckProps) {
  const { canRetry } = props
  // Shown in Music only too: a blocked mic switches the page to Music only,
  // and this is what says why.
  if (props.mic.state === "blocked") {
    // Below lg, one row like every other mic state there: the full blocked
    // card plus the choice cards and the pinned Go live bar made the phone
    // scroll. Music only is the "What goes out" choice right above it.
    return (
      <>
        <div className="flex flex-col max-lg:hidden">
          <FullCard {...props} disabled={false} />
        </div>
        <div role="alert" className="flex min-h-16 items-center gap-3 rounded-panel bg-fault-tint px-4 py-3 text-fault-text lg:hidden">
          <IconMicrophoneOff size={18} className="shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">Mic blocked</span>
            <MicPermissionLink variant="inline" />
          </span>
          {canRetry && (
            <Button size="sm" onClick={() => void props.mic.open()}>
              Try again
            </Button>
          )}
        </div>
      </>
    )
  }
  return (
    <>
      <div className="flex flex-col max-lg:hidden">
        <FullCard {...props} />
      </div>
      <MicRow {...props} className="lg:hidden" />
    </>
  )
}

function FullCard({ mic, onUseMic, disabled = false, canRetry }: MicCheckProps) {
  if (disabled) {
    return (
      <Card aria-disabled className={cn(CARD_HEIGHT, "opacity-55")}>
        <CardHeader title="Your microphone" description="Off. This show is music only, so we won’t ask for the microphone." />
        <MicMeter stream={null} open={false} className="text-muted-foreground" />
        {onUseMic && (
          <Button variant="subtle" className="self-start" onClick={onUseMic}>
            Use the mic
          </Button>
        )}
      </Card>
    )
  }

  if (mic.state === "blocked") {
    return (
      // Compact: three stacked large buttons made the phone scroll. The lamp
      // sized to its word, one short sentence, one row of small buttons.
      <div role="alert" className="flex flex-col items-start gap-3 rounded-panel bg-fault-tint p-4 text-fault-text">
        <StatusLamp tone="warn" variant="solid" size="sm">
          Mic blocked
        </StatusLamp>
        <p className="text-body-sm leading-relaxed text-pretty">
          {canRetry
            ? "Allow the microphone for this site in your browser’s settings, then try again."
            : "Your mic is blocked. Allow it in your browser’s settings to use it; until then this show is music only."}
        </p>
        <div className="flex flex-wrap gap-2">
          {canRetry && (
            <Button size="sm" onClick={() => void mic.open()}>
              Try again
            </Button>
          )}
          <MicPermissionLink size="sm" />
        </div>
      </div>
    )
  }

  // Not checked yet (or no mic found): the card is tall on a desktop (it
  // matches the music column), so the invitation sits in the middle of it,
  // with a big mic and a full-size primary button, instead of a small grey
  // button stuck in the top corner over empty space.
  if (mic.state !== "on") {
    const none = mic.state === "none"
    return (
      <Card className={cn(CARD_HEIGHT, "items-center justify-center gap-4 py-8 text-center")}>
        <span
          aria-hidden
          className={cn(
            "grid size-16 place-items-center rounded-full",
            none ? "bg-fault-tint text-fault-text" : "bg-surface-inset text-muted-foreground",
          )}
        >
          {none ? <IconMicrophoneOff className="size-7" /> : <IconMicrophone className="size-7" />}
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h2 className="font-display text-heading">Your microphone</h2>
          <p className={cn("max-w-90 text-body-sm text-pretty", none ? "text-fault-text" : "text-muted-foreground")}>
            {none
              ? "No microphone found. Plug one in and try again, or go live with music only."
              : "Check it before you go on air. Nothing goes out yet."}
          </p>
        </div>
        <Button size="lg" className="w-full max-w-80" onClick={() => void mic.open()} disabled={mic.state === "opening"}>
          {mic.state === "opening" ? <IconLoader2 className="animate-spin" /> : <IconMicrophone />}
          {none ? "Try again" : "Check your mic"}
        </Button>
      </Card>
    )
  }

  return (
    <Card className={CARD_HEIGHT}>
      <CardHeader title="Your microphone" description="Say something. The bars should move." />
      {mic.devices.length > 1 && (
        <Select
          aria-label="Microphone"
          value={mic.current}
          onChange={(id) => void mic.choose(id)}
          options={mic.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))}
        />
      )}
      <MicMeter stream={mic.stream} open={false} className="text-muted-foreground" />
    </Card>
  )
}

/** One line: the mic, a slim live meter, and "Change" for the picker sheet. */
function MicRow({ mic, onUseMic, disabled = false, className }: MicCheckProps & { className?: string }) {
  const [open, setOpen] = useState(false)
  const row = "flex min-h-16 items-center gap-3 rounded-panel bg-card px-4 py-3"
  const label = mic.devices.find((d) => d.deviceId === mic.current)?.label || "Microphone"

  let rowEl: React.ReactNode
  if (disabled) {
    rowEl = (
      <div aria-disabled className={cn(row, "text-muted-foreground", className)}>
        <IconMicrophoneOff size={18} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">Mic off</span>
        {onUseMic && (
          <Button size="sm" variant="quiet" onClick={onUseMic}>
            Use the mic
          </Button>
        )}
      </div>
    )
  } else if (mic.state === "on" || (open && mic.state === "opening")) {
    // "opening" while the sheet is up is a mic switch: the row keeps its
    // shape rather than flashing the "Check your mic" state.
    // Two lines: the mic and Change, then the meter across the full width —
    // big enough to read at a glance, which is the point of keeping it here.
    rowEl = (
      <div className={cn("flex flex-col gap-3 rounded-panel bg-card px-4 pt-2.5 pb-4", className)}>
        <div className="flex items-center gap-3">
          <IconMicrophone size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
          <Button size="sm" variant="quiet" className="-mr-2" onClick={() => setOpen(true)}>
            Change
            <IconChevronRight />
          </Button>
        </div>
        <MicMeter stream={mic.stream} open={false} compact />
      </div>
    )
  } else {
    rowEl = (
      <div className={cn(row, className)}>
        <IconMicrophone size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn("min-w-0 flex-1 text-sm", mic.state === "none" ? "text-fault-text" : "text-muted-foreground")}>
          {mic.state === "none" ? "No microphone found." : "Check your mic before you go on air."}
        </span>
        <Button size="sm" variant="subtle" onClick={() => void mic.open()} disabled={mic.state === "opening"}>
          {mic.state === "opening" && <IconLoader2 className="animate-spin" />}
          {mic.state === "none" ? "Try again" : "Check"}
        </Button>
      </div>
    )
  }

  return (
    <>
      {rowEl}
      {/* Always mounted, whatever the row shows: picking a mic re-opens it
          ("opening" for a moment), and a sheet rendered only in the "on"
          branch unmounted and slid back in on every change. */}
      <Dialog open={open && !disabled} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Your microphone</DialogTitle>
            <DialogDescription>
              {mic.state === "opening" ? "Switching…" : mic.state === "none" ? "No microphone found." : "Say something. The bars should move."}
            </DialogDescription>
          </DialogHeader>
          {mic.devices.length > 1 && (
            <Select
              aria-label="Microphone"
              value={mic.current}
              onChange={(id) => void mic.choose(id)}
              options={mic.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))}
            />
          )}
          <MicMeter stream={mic.state === "on" ? mic.stream : null} open={false} className="text-muted-foreground" />
          <Button size="lg" full onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
