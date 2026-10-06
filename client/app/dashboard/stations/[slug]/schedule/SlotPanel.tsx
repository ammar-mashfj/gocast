"use client"

import { IconMinus, IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/interfaces/Playlist"
import { DayChip } from "./DayChip"
import { DAY_INITIALS, DAY_NAMES } from "./days"
import { WEEK_ORDER, type Swatch } from "./WeekGrid"
import { DAY_MINUTES, SNAP, toClock, toMinutes, type Block } from "./weekModel"

interface Props {
  block: Block
  /** Days the same slot (same playlist, name and times) runs on, the selected block's included. */
  days: number[]
  isNew: boolean
  overlapping: boolean
  playlists: Playlist[]
  swatchFor: (playlistId: string) => Swatch
  /** Applied to the block and its siblings on every ticked day. */
  onChange: (patch: Partial<Pick<Block, "label" | "playlistId" | "start" | "end" | "startMode">>) => void
  onToggleDay: (day: number) => void
  onDone: () => void
  onDelete: () => void
}

/**
 * The selected slot, as the body of a dialog (the planner owns the Dialog).
 * Edits here apply to every ticked day at once — the Days chips say which —
 * while a drag on the grid changes one day only. Ticking a day copies the
 * slot onto it; unticking removes that copy. Nothing is sent to the server:
 * edits land on the page and go out with its Save button.
 */
export function SlotPanel({
  block,
  days,
  isNew,
  overlapping,
  playlists,
  swatchFor,
  onChange,
  onToggleDay,
  onDone,
  onDelete,
}: Props) {
  const overnight = toMinutes(block.end) <= toMinutes(block.start)

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{isNew ? "New slot" : "Edit slot"}</DialogTitle>
        <DialogDescription>What AutoDJ plays in this stretch. Press Save on the page to keep it.</DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Name</span>
        <Input
          value={block.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. Breakfast"
          maxLength={60}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs text-muted-foreground">Plays</legend>
        <div className="flex flex-col gap-1" role="radiogroup">
          {playlists.map((p) => {
            const on = p.id === block.playlistId
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ playlistId: p.id })}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none",
                  on ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <span className={cn("size-3 shrink-0 rounded-[3px]", swatchFor(p.id).dot)} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.name}
                  {p.is_default && <span className="font-normal text-muted-foreground"> (default)</span>}
                </span>
                {p.track_count !== undefined && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                    {p.track_count} {p.track_count === 1 ? "track" : "tracks"}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {playlists.find((p) => p.id === block.playlistId)?.track_count === 0 && (
          <p className="text-xs text-muted-foreground">
            This playlist is empty, so the default plays during this slot until you add tracks.
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <TimeStepper label="From" value={block.start} onChange={(start) => onChange({ start })} />
        <TimeStepper
          label={overnight ? "To (next day)" : "To"}
          value={block.end}
          onChange={(end) => onChange({ end })}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs text-muted-foreground">When it starts</legend>
        <div className="flex flex-col gap-1" role="radiogroup">
          {START_MODES.map((mode) => {
            const on = block.startMode === mode.value
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ startMode: mode.value })}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors motion-reduce:transition-none",
                  on ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <span className="text-sm font-medium">{mode.label}</span>
                <span className="text-xs text-muted-foreground">{mode.hint}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Days</span>
        <div role="group" aria-label="Days this slot runs" className="flex flex-wrap gap-2">
          {WEEK_ORDER.map((day) => (
            <DayChip
              key={day}
              tone="autodj"
              on={days.includes(day)}
              label={DAY_NAMES[day]}
              onToggle={() => onToggleDay(day)}
            >
              {DAY_INITIALS[day]}
            </DayChip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Changes here apply to every ticked day.
          {/* Edge drags exist only on the grid, which a phone never shows. */}
          <span className="hidden md:inline"> Dragging an edge on the week changes one day only.</span>
        </p>
      </div>

      {overlapping && (
        <p role="alert" className="text-sm text-fault-text">
          This overlaps another slot. Slots can touch but not overlap, so nothing is saved until it&apos;s fixed.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" className="flex-1" onClick={onDone}>
          Done
        </Button>
        {/* Delete takes every ticked day with it, so the label counts them. */}
        <Button type="button" variant="ghost" onClick={onDelete}>
          {days.length > 1 ? `Delete on all ${days.length} days` : "Delete"}
        </Button>
      </div>
    </div>
  )
}

const START_MODES: { value: Block["startMode"]; label: string; hint: string }[] = [
  {
    value: "soft",
    label: "After the current song",
    hint: "The song playing at the start time finishes first.",
  },
  {
    value: "hard",
    label: "Exactly on time",
    hint: "AutoDJ picks songs that end in time. If none fits, the last one fades out.",
  },
]

function TimeStepper({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const step = (by: number) => onChange(toClock(Math.round((toMinutes(value) + by) / SNAP) * SNAP + DAY_MINUTES))
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex h-11 items-center rounded-lg border border-white/[0.09] bg-white/[0.03]">
        <button
          type="button"
          onClick={() => step(-SNAP)}
          aria-label={`${label} 15 minutes earlier`}
          className="flex h-full w-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <IconMinus size={14} />
        </button>
        <input
          type="time"
          step={SNAP * 60}
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-center font-mono text-sm font-semibold tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <button
          type="button"
          onClick={() => step(SNAP)}
          aria-label={`${label} 15 minutes later`}
          className="flex h-full w-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <IconPlus size={14} />
        </button>
      </div>
    </label>
  )
}
