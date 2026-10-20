"use client"

import { useId } from "react"
import { IconAdjustmentsHorizontal } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { DEFAULT_MIC_PREFS, type DuckLevel, type FadeSpeed } from "@/lib/micPrefs"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ds/Dialog"
import { Switch } from "@/components/ds/Switch"
import { cn } from "@/lib/utils"

const DUCK_OPTIONS: { value: DuckLevel; label: string }[] = [
  { value: "under", label: "Under you" },
  { value: "low", label: "Low" },
  { value: "silence", label: "Silent" },
]

const FADE_OPTIONS: { value: FadeSpeed; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "smooth", label: "Smooth" },
  { value: "slow", label: "Slow" },
]

/** A row of three mutually exclusive choices, announced as a radio group. */
function Choice<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span id={id} className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-3 gap-0.75 rounded-control bg-background p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              // The design system's Segmented: the choice is off-white with
              // dark ink, the others muted on the track.
              "h-9 rounded-item text-body-sm font-semibold transition-colors",
              value === o.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * How the mic sits against the music: how far the bed drops, how fast it
 * moves, and whether the voice is cleaned up. Changes apply at once — even
 * mid-sentence — and stay in this browser for the next show.
 */
/** The settings themselves, for the dialog here and the phone's Mic & monitor sheet. */
export function MicSettingsFields() {
  const { engine } = useBroadcast()
  useEngineVersion(engine)
  const switchId = useId()
  const prefs = engine?.getMicPrefs() ?? DEFAULT_MIC_PREFS

  return (
    <>
      <Choice
        label="Music while you talk"
        hint={
          prefs.duck === "silence"
            ? "The music fades out completely and keeps playing underneath."
            : "How far the music drops under your voice."
        }
        options={DUCK_OPTIONS}
        value={prefs.duck}
        onChange={(duck) => engine?.setMicPrefs({ duck })}
      />
      <Choice
        label="Fade"
        hint="How quickly the music goes down and comes back."
        options={FADE_OPTIONS}
        value={prefs.fade}
        onChange={(fade) => engine?.setMicPrefs({ fade })}
      />
      <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
        <label htmlFor={switchId} className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Broadcast voice</span>
          <span className="text-xs text-muted-foreground">
            Cuts rumble and evens out your level so you sit clearly over the music.
          </span>
        </label>
        <Switch
          tone="live"
          id={switchId}
          checked={prefs.broadcastVoice}
          onCheckedChange={(broadcastVoice) => engine?.setMicPrefs({ broadcastVoice })}
        />
      </div>
    </>
  )
}

export function MicSettings() {
  const { engine } = useBroadcast()

  // A labelled button opening a dialog (a bottom sheet on a phone), at
  // every size: an icon alone told nobody what it was, and a popover off a
  // button at the foot of the fit-to-screen studio had nowhere good to go.
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="quiet" className="h-13 w-full gap-2 rounded-button bg-card px-4 text-foreground hover:bg-card/80" disabled={!engine}>
          <IconAdjustmentsHorizontal className="size-5" aria-hidden />
          Mic settings
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" className="gap-5">
        <DialogHeader>
          <DialogTitle>Mic settings</DialogTitle>
          <DialogDescription>Changes apply straight away and stay in this browser.</DialogDescription>
        </DialogHeader>
        <MicSettingsFields />
      </DialogContent>
    </Dialog>
  )
}
