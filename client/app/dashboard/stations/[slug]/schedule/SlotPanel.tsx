"use client"

import { useEffect, useId, useRef, useState } from "react"
import { IconAlertTriangle, IconCheck, IconMinus, IconPlus, IconSearch } from "@tabler/icons-react"
import type { Playlist } from "@/interfaces/Playlist"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { DayToggle } from "@/components/ds/DayToggle"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"
import { SwitchRow } from "@/components/ds/Switch"
import { DAY_NAMES } from "./days"
import { DAY_SHORT, WEEK_ORDER, type Swatch } from "./WeekGrid"
import { DAY_MINUTES, SNAP, toClock, toMinutes, type Block } from "./weekModel"

/** Past this many playlists the list offers a name search. */
const SEARCH_FROM = 6

/** Monday-first names for the day picker; its indexes map through WEEK_ORDER. */
const WEEK_LABELS = WEEK_ORDER.map((d) => DAY_NAMES[d])

interface Props {
  block: Block
  /** Days the same slot (same playlist, name and times) runs on, the selected block's included. */
  days: number[]
  isNew: boolean
  overlapping: boolean
  /** Other slots this one overlaps, in week order; the first is named. */
  clashes: Block[]
  nameFor: (block: Block) => string
  playlists: Playlist[]
  swatchFor: (playlistId: string) => Swatch
  /** Applied to the block and its siblings on every ticked day. */
  onChange: (patch: Partial<Pick<Block, "label" | "playlistId" | "start" | "end" | "startMode">>) => void
  onToggleDay: (day: number) => void
  /** Done on an existing slot; "Add slot" on a new one (keeps it). */
  onDone: () => void
  /** A new slot only: drop it. */
  onCancel: () => void
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
export function SlotPanel({ block, days, isNew, overlapping, clashes, nameFor, playlists, swatchFor, onChange, onToggleDay, onDone, onCancel, onDelete }: Props) {
  const overnight = toMinutes(block.end) <= toMinutes(block.start)
  const picked = days.map((d) => WEEK_ORDER.indexOf(d))
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists
  const pickedRow = useRef<HTMLButtonElement>(null)

  // The list scrolls on its own; open it on the playlist the slot plays.
  useEffect(() => {
    pickedRow.current?.scrollIntoView({ block: "nearest" })
  }, [])

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "New slot" : "Edit slot"}</DialogTitle>
        <DialogDescription>What AutoDJ plays in this stretch. Press Save on the page to keep it.</DialogDescription>
      </DialogHeader>

      {/* Phones: one column, playlists after the name. From md: the fields
          on the left and the playlists on the right, filling the left
          column's height and scrolling inside it, so the dialog itself
          never needs to scroll. */}
      <div className="flex flex-col gap-4.5 md:grid md:grid-cols-2 md:gap-6">
        <div className="contents md:flex md:flex-col md:gap-4.5">
          <TextField className="order-1" label="Name" value={block.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="e.g. Breakfast" maxLength={60} />
          <div className="order-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2.5">
              <TimeStepper label="From" value={block.start} onChange={(start) => onChange({ start })} warn={overlapping} />
              <TimeStepper label={overnight ? "To (next day)" : "To"} value={block.end} onChange={(end) => onChange({ end })} warn={overlapping} />
            </div>
            {/* Right under the times, where the eyes are while stepping
                them, and naming what it hits. */}
            {overlapping && (
              <p role="alert" className="flex items-start gap-2 rounded-control bg-fault-tint px-3 py-2.5 text-body-sm text-fault-text">
                <IconAlertTriangle aria-hidden size={16} className="mt-0.5 shrink-0" />
                <span>
                  {clashes.length > 0 ? (
                    <>
                      Overlaps <strong className="font-bold">{nameFor(clashes[0])}</strong> on{" "}
                      <span className="whitespace-nowrap">{DAY_SHORT[clashes[0].day]}, {clashes[0].start}–{clashes[0].end}</span>
                      {clashes.length > 1 ? `, and ${clashes.length - 1} more.` : "."}
                    </>
                  ) : (
                    "This overlaps another slot."
                  )}{" "}
                  Slots can touch but not overlap.
                </span>
              </p>
            )}
          </div>

          <div className="order-3">
            <SwitchRow
              title="Start exactly on time"
              description={
                block.startMode === "hard"
                  ? `Starts at ${block.start} on the dot. AutoDJ picks a song that ends in time, or fades out the one playing.`
                  : `Starts after the song playing at ${block.start} ends.`
              }
              checked={block.startMode === "hard"}
              onCheckedChange={(on) => onChange({ startMode: on ? "hard" : "soft" })}
            />
          </div>

          <div className="order-3 flex flex-col gap-2">
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

        </div>
        <div className="order-2 md:relative md:min-h-72">
          <fieldset className="flex min-w-0 flex-col gap-1.5 md:absolute md:inset-0">
            <legend className="mb-1.5 text-body-sm font-semibold text-muted-foreground">Plays</legend>
            {/* Filters as you type, by name only. A short list fits without it. */}
            {playlists.length >= SEARCH_FROM && (
              <div className="flex items-center gap-2 rounded-control bg-surface-inset px-3 focus-within:ring-2 focus-within:ring-ring">
                <IconSearch aria-hidden size={15} className="shrink-0 text-text-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // With text in it, Escape clears the search, not the dialog.
                    if (e.key === "Escape" && query !== "") {
                      e.preventDefault()
                      e.stopPropagation()
                      setQuery("")
                    }
                  }}
                  placeholder="Search playlists"
                  aria-label="Search playlists by name"
                  className="h-10 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-faint"
                />
              </div>
            )}
            {/* Its own scroll, so a long list doesn't make the whole dialog scroll. */}
            <div className="-mx-1 flex max-h-56 min-h-0 flex-col gap-1 overflow-y-auto md:max-h-none md:flex-1 overscroll-contain px-1 py-0.5" role="radiogroup" aria-label="Playlist">
              {shown.length === 0 && (
                <p className="px-3.5 py-3 text-body-sm text-text-faint">No playlist name matches “{query.trim()}”.</p>
              )}
              {shown.map((p) => {
                const on = p.id === block.playlistId
                return (
                  <button
                    key={p.id}
                    ref={on ? pickedRow : undefined}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ playlistId: p.id })}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-control px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      // The pick is a ring and a check, not just a tint.
                      on ? "bg-surface-control text-foreground ring-1 ring-inset ring-foreground/50" : "text-muted-foreground hover:bg-card hover:text-foreground",
                    )}
                  >
                    <span aria-hidden className={cn("size-3 shrink-0 rounded-swatch", swatchFor(p.id).dot)} style={swatchFor(p.id).dotStyle} />
                    <span className="min-w-0 flex-1 truncate text-body font-semibold">
                      {p.name}
                      {p.is_default && <span className="font-medium text-text-faint"> · default</span>}
                    </span>
                    {p.track_count !== undefined && (
                      <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">
                        {p.track_count} {p.track_count === 1 ? "track" : "tracks"}
                      </span>
                    )}
                    <IconCheck aria-hidden size={18} stroke={2.5} className={cn("shrink-0", on ? "text-foreground" : "invisible")} />
                  </button>
                )
              })}
            </div>
            {playlists.find((p) => p.id === block.playlistId)?.track_count === 0 && (
              // Amber: listeners won't hear what this slot says it plays.
              <p role="status" className="flex items-start gap-2 rounded-control bg-fault-tint px-3 py-2.5 text-body-sm text-fault-text">
                <IconAlertTriangle aria-hidden size={16} className="mt-0.5 shrink-0" />
                This playlist is empty, so the default plays during this slot until you add tracks.
              </p>
            )}
          </fieldset>
        </div>
      </div>

      {isNew ? (
        // Adding: nothing exists until "Add slot"; Cancel (or ×, Escape, a
        // tap outside) takes it away again.
        <DialogFooter className="sm:*:flex-none">
          <Button size="lg" variant="quiet" onClick={onCancel}>Cancel</Button>
          <Button size="lg" className="sm:flex-1!" onClick={onDone}>
            {days.length > 1 ? `Add slot on ${days.length} days` : "Add slot"}
          </Button>
        </DialogFooter>
      ) : (
        <DialogFooter className="sm:*:flex-none">
          {/* Delete takes every ticked day with it, so the label counts them. */}
          <Button size="lg" variant="quiet" className="text-error hover:text-error" onClick={onDelete}>
            {days.length > 1 ? `Delete on all ${days.length} days` : "Delete slot"}
          </Button>
          <Button size="lg" className="sm:flex-1!" onClick={onDone}>Done</Button>
        </DialogFooter>
      )}
    </>
  )
}


function TimeStepper({ label, value, onChange, warn = false }: { label: string; value: string; onChange: (value: string) => void; warn?: boolean }) {
  const step = (by: number) => onChange(toClock(Math.round((toMinutes(value) + by) / SNAP) * SNAP + DAY_MINUTES))
  const id = useId()
  // A div with a label for the input, not a <label> around the row: a
  // wrapping label's control is its first labelable child, the "earlier"
  // button, so a click on the caption moved the time back 15 minutes.
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body-sm font-semibold text-muted-foreground">{label}</label>
      <div className={cn("flex h-13 items-center rounded-button bg-surface-inset", warn && "ring-2 ring-fault")}>
        <button
          type="button"
          onClick={() => step(-SNAP)}
          aria-label={`${label} 15 minutes earlier`}
          className="flex h-full w-9 shrink-0 sm:w-11.5 cursor-pointer items-center justify-center rounded-button text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconMinus className="size-4" />
        </button>
        <input
          id={id}
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
    </div>
  )
}
