"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  IconGripVertical,
  IconCheck,
  IconMinus,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconLoader2,
} from "@tabler/icons-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ds/Button"
import { Input } from "@/components/ds/Field"
import { Tag } from "@/components/ds/Tag"
import { cn } from "@/lib/utils"
import { formatBytes, formatDate, formatTrackTime } from "@/lib/format"
import type { Track } from "@/interfaces/Track"

/**
 * Column track shared by the header row and every track row, so they line
 * up: select / drag, #, title + artist, playlists (library) or date added
 * (playlist), length, actions. The fourth column hides below md.
 */
export const ROW_GRID =
  "grid grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] " +
  "md:grid-cols-[1.25rem_2rem_minmax(0,1fr)_minmax(0,0.8fr)_4rem_auto] " +
  "gap-3 items-center px-5.5"

/**
 * The checkbox used by both the rows and the header row.
 *
 * Hand-rolled rather than a ui/ primitive because the project has none, and
 * because this has to sit inside a 1.25rem grid column that the drag handle
 * otherwise occupies — a library row and a playlist row must keep the same
 * column track or the two lists stop lining up.
 *
 * `indeterminate` is the header's "some but not all" state. It is a real
 * `aria-checked="mixed"`, so a screen reader gets the same three states the
 * sighted user does.
 */
export function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        // The row itself is not a click target, but a playlist row's drag
        // listeners sit on the same grid — stop the event before it can be
        // read as the start of a drag.
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        "inline-flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-tag border-stroke transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked || indeterminate
          ? "border-foreground bg-foreground text-background"
          : "border-line-strong hover:border-muted-foreground",
      )}
    >
      {indeterminate ? <IconMinus size={11} /> : checked && <IconCheck size={12} />}
    </button>
  )
}

interface TrackListHeaderProps {
  /** Show the select-all box in the leading column. */
  selectable?: boolean
  allSelected?: boolean
  someSelected?: boolean
  onToggleAll?: (next: boolean) => void
  /** The fourth column: "In playlists" in the library, "Added" in a playlist. */
  fourth: string
}

export function TrackListHeader({ selectable = false, allSelected = false, someSelected = false, onToggleAll, fourth }: TrackListHeaderProps) {
  return (
    <div className={cn(ROW_GRID, "border-t border-line py-2.5 eyebrow text-text-faint")}>
      {selectable && onToggleAll ? (
        <SelectBox
          checked={allSelected}
          indeterminate={!allSelected && someSelected}
          onChange={onToggleAll}
          label={allSelected ? "Clear selection" : "Select all shown"}
        />
      ) : (
        <span />
      )}
      <span className="text-right">#</span>
      <span>Title</span>
      <span className="hidden md:block">{fourth}</span>
      <span className="hidden text-right md:block">Length</span>
      <span />
    </div>
  )
}

export interface TrackEditFields {
  title?: string
  artist?: string | null
}

interface TrackRowProps {
  track: Track
  /** What the # column shows — the row's place in whichever list this is. */
  number: number
  /** False while searching or sorting, in shuffle, or in the library — see each view. */
  reorderable: boolean
  onAir: boolean
  onEdit: (id: string, fields: TrackEditFields) => void
  /** Delete the FILE. Offered in the library only — a playlist row removes, it never deletes. */
  onDelete?: (id: string) => void
  /** Take the track out of the playlist being viewed. The file stays in the library. */
  onRemove?: (id: string) => void
  /**
   * Names of the playlists this track is in, for the library view; the
   * playlist view leaves it out and shows the date added there instead. An
   * empty array is the one state worth flagging: a track in no playlist
   * never plays.
   */
  chips?: string[]
  /**
   * Multi-select. When true the leading column carries a checkbox instead of
   * the drag handle or its spacer, so the grid is unchanged and the library
   * and playlist lists still line up column for column.
   */
  selectable?: boolean
  selected?: boolean
  onSelectChange?: (id: string, next: boolean) => void
  /**
   * Preview. When given, the # column becomes a play button on hover and the
   * row can be heard before it is put anywhere. Clarity showed owners
   * clicking rows expecting exactly this and getting nothing.
   */
  onPreview?: (id: string) => void
  previewing?: boolean
  previewBuffering?: boolean
  /**
   * What a click on the row body does, if anything. The library toggles the
   * row's selection with it; a playlist row has no click action and stays a
   * plain row. Clicks on the row's own controls never reach this.
   */
  onRowClick?: () => void
}

/**
 * One track, in either the library or a playlist. Same columns in both so the
 * eye does not have to relearn the screen when switching; the two differ only
 * in the trailing action and in whether the # can be dragged.
 */
export function TrackRow({
  track,
  number,
  reorderable,
  onAir,
  onEdit,
  onDelete,
  onRemove,
  chips,
  selectable = false,
  selected = false,
  onSelectChange,
  onPreview,
  previewing = false,
  previewBuffering = false,
  onRowClick,
}: TrackRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
    disabled: !reorderable,
  })
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(track.title)
  const [artist, setArtist] = useState(track.artist ?? "")

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function commit() {
    const trimmedTitle = title.trim()
    const trimmedArtist = artist.trim()
    if (trimmedTitle === "") {
      toast.error("Title can't be empty.")
      return
    }
    setEditing(false)
    if (trimmedTitle !== track.title || trimmedArtist !== (track.artist ?? "")) {
      onEdit(track.id, {
        title: trimmedTitle,
        artist: trimmedArtist === "" ? null : trimmedArtist,
      })
    }
  }

  function cancel() {
    setTitle(track.title)
    setArtist(track.artist ?? "")
    setEditing(false)
  }

  /**
   * Seed the inputs from the track as it is RIGHT NOW, not as it was when this
   * row first mounted.
   *
   * `useState(track.title)` runs its initialiser once; the row then survives
   * any number of external edits with the same key, so opening the editor
   * after a bulk tag fix used to show the pre-fix values and silently write
   * them back on save. Reading the prop at the moment editing starts is both
   * the fix and the only place the answer is knowable.
   */
  function startEditing() {
    setTitle(track.title)
    setArtist(track.artist ?? "")
    setEditing(true)
  }

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-raised px-5.5 py-2.5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Title"
          className="h-10 min-w-40 flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") cancel()
          }}
        />
        <Input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist (optional)"
          aria-label="Artist"
          className="h-10 min-w-36 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") cancel()
          }}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" onClick={commit}>Save</Button>
          <Button size="sm" variant="quiet" onClick={cancel}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={
        onRowClick
          ? (e) => {
              // Only the row body. Buttons, links and inputs inside the row
              // handle themselves, and a click on them must not also flip
              // the selection underneath.
              if ((e.target as HTMLElement).closest("button, a, input, [role=button]")) return
              onRowClick()
            }
          : undefined
      }
      className={cn(
        ROW_GRID,
        "group border-t border-line py-2.75 transition-colors",
        onRowClick && "cursor-pointer select-none",
        selected ? "bg-surface-raised" : "hover:bg-surface-raised",
      )}
    >
      {selectable && onSelectChange ? (
        <SelectBox
          checked={selected}
          onChange={(next) => onSelectChange(track.id, next)}
          label={`Select ${track.title}`}
        />
      ) : reorderable ? (
        <div
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          aria-label="Drag to reorder"
          className="inline-flex cursor-grab touch-none text-text-faint hover:text-foreground active:cursor-grabbing"
        >
          <IconGripVertical size={15} />
        </div>
      ) : (
        <span />
      )}

      {onPreview ? (
        // The number is the resting state; the play control takes its place
        // on hover, on focus, and for as long as the track is being heard,
        // so the column never has to grow to fit a second glyph.
        <button
          type="button"
          onClick={() => onPreview(track.id)}
          aria-label={previewing ? `Stop previewing ${track.title}` : `Preview ${track.title}`}
          aria-pressed={previewing}
          className={cn(
            "relative h-6 cursor-pointer rounded-tag text-right font-mono text-body-sm font-semibold tabular-nums",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            onAir ? "text-on-air" : "text-text-faint",
          )}
        >
          <span
            className={cn(
              "block",
              previewing ? "invisible" : "group-hover:invisible group-focus-within:invisible",
            )}
          >
            {number}
          </span>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-end text-foreground",
              previewing ? "" : "invisible group-hover:visible group-focus-within:visible",
            )}
            aria-hidden="true"
          >
            {previewing && previewBuffering ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : previewing ? (
              <IconPlayerPauseFilled size={14} />
            ) : (
              <IconPlayerPlayFilled size={14} />
            )}
          </span>
        </button>
      ) : (
        <span
          className={cn(
            "text-right font-mono text-body-sm font-semibold tabular-nums",
            onAir ? "text-on-air" : "text-text-faint",
          )}
        >
          {number}
        </span>
      )}

      <div className="flex min-w-0 flex-col gap-0.75">
        <span className={cn("truncate text-body font-semibold", onAir && "text-on-air-text")}>
          {track.title}
          {onAir && <span className="sr-only"> (playing now)</span>}
        </span>
        <span className={cn("truncate text-body-sm", track.artist ? "text-muted-foreground" : "text-text-faint italic")}>
          {track.artist ?? "Unknown artist"}
        </span>
        {/* Phones have no playlists column, so the chips sit under the
            title: "not in a playlist" is the one thing a row must say. */}
        {chips !== undefined && (
          <div className="mt-1 flex min-w-0 flex-wrap gap-1.25 md:hidden">
            <PlaylistChips chips={chips} />
          </div>
        )}
      </div>

      <div className="hidden min-w-0 flex-wrap gap-1.25 md:flex">
        {chips === undefined ? (
          <span className="text-body-sm text-muted-foreground">{formatDate(track.created_at)}</span>
        ) : (
          <PlaylistChips chips={chips} />
        )}
      </div>

      <span className="hidden text-right font-mono text-body-sm text-muted-foreground tabular-nums md:block" title={formatBytes(track.file_size_bytes)}>
        {track.duration_seconds > 0 ? formatTrackTime(Math.round(track.duration_seconds)) : "—"}
      </span>

      {/* Words, not icons you have to guess (prototype). */}
      <div className="flex items-center justify-end gap-0.5">
        <Button size="sm" variant="quiet" className="px-2.5" onClick={startEditing} aria-label={`Edit ${track.title}`}>
          Edit
        </Button>
        {onRemove && (
          <Button
            size="sm"
            variant="quiet"
            className="px-2.5"
            title="Remove from this playlist. The file stays in your library."
            aria-label={`Remove ${track.title} from this playlist`}
            onClick={() => onRemove(track.id)}
          >
            Remove
          </Button>
        )}
        {onDelete && (
          <Button size="sm" variant="quiet" className="px-2.5" aria-label={`Delete ${track.title}`} onClick={() => onDelete(track.id)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}

/** The playlists a track is in, or the warning that it is in none. */
function PlaylistChips({ chips }: { chips: string[] }) {
  // A track in no playlist never plays: the one state worth flagging.
  if (chips.length === 0) {
    return <Tag variant="warn" title="A track in no playlist never plays.">Not in a playlist</Tag>
  }
  return chips.map((name) => (
    <Tag key={name} className="max-w-40 truncate">{name}</Tag>
  ))
}
