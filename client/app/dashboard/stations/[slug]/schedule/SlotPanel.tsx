"use client"

import { IconMinus, IconPlus } from "@tabler/icons-react"
import type { Playlist } from "@/interfaces/Playlist"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { DayToggle } from "@/components/ds/DayToggle"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"
import { DAY_NAMES } from "./days"
import { WEEK_ORDER, type Swatch } from "./WeekGrid"
import { DAY_MINUTES, SNAP, toClock, toMinutes, type Block } from "./weekModel"

/** Monday-first names for the day picker; its indexes map through WEEK_ORDER. */
const WEEK_LABELS = WEEK_ORDER.map((d) => DAY_NAMES[d])

interface Props {
  block: Block
  /** Days the same slot (same playlist, name and times) runs on, the selected block's included. */
  days: number[]
  isNew: boolean
  overlapping: boolean
  playlists: Playlist[]
  swatchFor: (playlistId: string) => Swatch
  /** Applied to the block and its siblings on every ticked day. */
  onChange: (patch: Partial<Pick<Block, "label" | "playlistId" | "start" | "end">>) => void
  onToggleDay: (day: number) => void
  onDone: () => void
  onDelete: () => void
}

/**
 * The selected slot, as the body of a dialog (the planner owns the Dialog):
 * a name, which playlist plays, from / to in 15-minute steps, and the days.
 * Edits apply to every ticked day at once, while a drag on the grid changes
 * one day only. Ticking a day copies the slot onto it; unticking removes that
 * copy (the last day goes through Delete). Nothing is sent until the page's
 * Save.
 */
export function SlotPanel({ block, days, isNew, overlapping, playlists, swatchFor, onChange, onToggleDay, onDone, onDelete }: Props) {
  const overnight = toMinutes(block.end) <= toMinutes(block.start)
  const picked = days.map((d) => WEEK_ORDER.indexOf(d))

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "New slot" : "Edit slot"}</DialogTitle>
        <DialogDescription>What AutoDJ plays in this stretch. Press Save on the page to keep it.</DialogDescription>
      </DialogHeader>

      <TextField label="Name" value={block.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="e.g. Breakfast" maxLength={60} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-body-sm font-semibold text-muted-foreground">Plays</legend>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Playlist">
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
                  "flex cursor-pointer items-center gap-3 rounded-control px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-surface-control" : "hover:bg-card",
                )}
              >
                <span aria-hidden className={cn("size-3 shrink-0 rounded-swatch", swatchFor(p.id).dot)} />
                <span className="min-w-0 flex-1 truncate text-body font-semibold">
                  {p.name}
                  {p.is_default && <span className="font-medium text-text-faint"> · default</span>}
                </span>
                {p.track_count !== undefined && (
                  <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">
                    {p.track_count} {p.track_count === 1 ? "track" : "tracks"}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {playlists.find((p) => p.id === block.playlistId)?.track_count === 0 && (
          <p className="text-body-sm text-text-faint">This playlist is empty, so the default plays during this slot until you add tracks.</p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-2.5">
        <TimeStepper label="From" value={block.start} onChange={(start) => onChange({ start })} />
        <TimeStepper label={overnight ? "To (next day)" : "To"} value={block.end} onChange={(end) => onChange({ end })} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-body-sm font-semibold text-muted-foreground">Every</span>
        <DayToggle
          aria-label="Days this slot runs"
          labels={WEEK_LABELS}
          value={picked}
          onChange={(next) => {
            // One chip changed: find which, and tick or untick that day.
            const changed = next.find((i) => !picked.includes(i)) ?? picked.find((i) => !next.includes(i))
            if (changed !== undefined) onToggleDay(WEEK_ORDER[changed])
          }}
        />
        <p className="text-body-sm text-text-faint">
          Changes here apply to every ticked day.
          {/* Edge drags exist only on the grid, which a phone never shows. */}
          <span className="hidden md:inline"> Dragging an edge on the week changes one day only.</span>
        </p>
      </div>

      {overlapping && (
        <p role="alert" className="text-body-sm text-fault-text">
          This overlaps another slot. Slots can touch but not overlap, so nothing is saved until it’s fixed.
        </p>
      )}

      <DialogFooter className="sm:*:flex-none">
        {/* Delete takes every ticked day with it, so the label counts them. */}
        <Button size="lg" variant="quiet" className="text-error hover:text-error" onClick={onDelete}>
          {days.length > 1 ? `Delete on all ${days.length} days` : "Delete slot"}
        </Button>
        <Button size="lg" className="sm:flex-1!" onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  )
}

function TimeStepper({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const step = (by: number) => onChange(toClock(Math.round((toMinutes(value) + by) / SNAP) * SNAP + DAY_MINUTES))
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-sm font-semibold text-muted-foreground">{label}</span>
      <div className="flex h-13 items-center rounded-button bg-surface-inset">
        <button
          type="button"
          onClick={() => step(-SNAP)}
          aria-label={`${label} 15 minutes earlier`}
          className="flex h-full w-9 shrink-0 sm:w-11.5 cursor-pointer items-center justify-center rounded-button text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconMinus className="size-4" />
        </button>
        <input
          type="time"
          step={SNAP * 60}
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-center font-mono text-base tabular-nums sm:text-meter-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <button
          type="button"
          onClick={() => step(SNAP)}
          aria-label={`${label} 15 minutes later`}
          className="flex h-full w-9 shrink-0 sm:w-11.5 cursor-pointer items-center justify-center rounded-button text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconPlus className="size-4" />
        </button>
      </div>
    </label>
  )
}
