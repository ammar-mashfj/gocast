"use client"

import { useId } from "react"
import { IconAdjustmentsHorizontal } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { DEFAULT_MIC_PREFS, type DuckLevel, type FadeSpeed } from "@/lib/micPrefs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
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
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.04] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 rounded-md text-xs font-medium transition-colors",
              value === o.value
                ? "bg-white/[0.12] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
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
export function MicSettings() {
  const { engine } = useBroadcast()
  useEngineVersion(engine)
  const switchId = useId()

  const prefs = engine?.getMicPrefs() ?? DEFAULT_MIC_PREFS

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-11 self-center"
          aria-label="Mic settings"
          title="Mic settings"
          disabled={!engine}
        >
          <IconAdjustmentsHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-5 p-4">
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
        <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-4">
          <label htmlFor={switchId} className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Broadcast voice</span>
            <span className="text-xs text-muted-foreground">
              Cuts rumble and evens out your level so you sit clearly over the music.
            </span>
          </label>
          <Switch
            id={switchId}
            checked={prefs.broadcastVoice}
            onCheckedChange={(broadcastVoice) => engine?.setMicPrefs({ broadcastVoice })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
