"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  IconGripVertical,
  IconTrash,
  IconEdit,
  IconCheck,
  IconX,
  IconPlaylistX,
  IconMinus,
} from "@tabler/icons-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatBytes, formatDate, formatDuration } from "@/lib/format"
import type { Track } from "@/interfaces/Track"

/** Column track shared by the header row and every track row, so they line up. */
export const ROW_GRID =
  "grid grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_auto] " +
  "md:grid-cols-[1.25rem_2rem_minmax(0,1fr)_minmax(0,0.7fr)_4rem_4.5rem_5rem_4.5rem] " +
  "gap-3 items-center px-4"

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
        "size-4 rounded border inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors",
        checked || indeterminate
          ? "bg-primary border-primary text-primary-foreground"
          : "border-border hover:border-muted-foreground",
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
}

export function TrackListHeader({
  selectable = false,
  allSelected = false,
  someSelected = false,
  onToggleAll,
}: TrackListHeaderProps = {}) {
  return (
    <div
      className={cn(
        ROW_GRID,
        "py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground",
      )}
    >
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
      <span className="hidden md:block">Artist</span>
      <span className="hidden md:block text-right">Length</span>
      <span className="hidden md:block text-right">Size</span>
      <span className="hidden md:block">Added</span>
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
   * Names of the playlists this track is in, for the library view. An empty
   * array is not "no chips": it is the one state worth shouting about, because
   * a track in no playlist never plays.
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
      <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="h-8 flex-1 min-w-[160px] text-sm"
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
          className="h-8 flex-1 min-w-[140px] text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") cancel()
          }}
        />
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon-sm" variant="ghost" aria-label="Save" onClick={commit}>
            <IconCheck size={16} />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={cancel}>
            <IconX size={16} />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        ROW_GRID,
        "py-2 border-b border-border last:border-b-0 group",
        // On air wins: it is the one fact about a row that is not the user's
        // own doing, and losing it under a selection tint would be worse.
        onAir ? "bg-primary/10" : selected ? "bg-primary/5" : "hover:bg-muted/40",
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
          className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none inline-flex"
        >
          <IconGripVertical size={15} />
        </div>
      ) : (
        <span />
      )}

      <span
        className={cn(
          "text-xs tabular-nums text-right",
          onAir ? "text-primary font-medium" : "text-muted-foreground",
        )}
      >
        {number}
      </span>

      <div className="min-w-0">
        <div className="text-sm truncate">{track.title}</div>
        {/* Artist gets its own column from md up; below that it rides under
            the title rather than being dropped. */}
        <div className="md:hidden text-xs text-muted-foreground truncate">
          {track.artist ?? "Unknown artist"}
        </div>
        {chips !== undefined && (
          <div className="flex flex-wrap gap-1 mt-1">
            {chips.length === 0 ? (
              <span
                className="rounded-full border border-dashed border-destructive/40 px-1.5 py-px text-[10px] text-destructive/80"
                title="A track in no playlist never plays."
              >
                not in any playlist
              </span>
            ) : (
              chips.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground truncate max-w-[10rem]"
                >
                  {name}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          "hidden md:block text-xs truncate",
          track.artist ? "text-muted-foreground" : "text-muted-foreground/60 italic",
        )}
      >
        {track.artist ?? "Unknown artist"}
      </div>

      <span className="hidden md:block text-xs text-muted-foreground tabular-nums text-right">
        {track.duration_seconds > 0 ? formatDuration(Math.round(track.duration_seconds)) : "—"}
      </span>

      <span className="hidden md:block text-xs text-muted-foreground tabular-nums text-right">
        {formatBytes(track.file_size_bytes)}
      </span>

      <span className="hidden md:block text-xs text-muted-foreground truncate">
        {formatDate(track.created_at)}
      </span>

      <div className="flex items-center justify-end gap-0.5">
        <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={startEditing}>
          <IconEdit size={15} />
        </Button>
        {onRemove && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove from playlist"
            title="Remove from this playlist. The file stays in your library."
            onClick={() => onRemove(track.id)}
          >
            <IconPlaylistX size={15} />
          </Button>
        )}
        {onDelete && (
          <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => onDelete(track.id)}>
            <IconTrash size={15} className="text-destructive" />
          </Button>
        )}
      </div>
    </div>
  )
}
