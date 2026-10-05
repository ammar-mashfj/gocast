"use client"

import { useMemo, useState } from "react"
import {
  IconArrowsShuffle,
  IconLoader2,
  IconPencil,
  IconPlaylistAdd,
  IconStar,
  IconTrash,
} from "@tabler/icons-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Button } from "@/components/ds/Button"
import { DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ds/Menu"
import { Tag } from "@/components/ds/Tag"
import { formatAirtime } from "@/lib/format"
import type { Playlist } from "@/interfaces/Playlist"
import type { Track } from "@/interfaces/Track"
import { useTrackPreview } from "@/hooks/useTrackPreview"
import { TrackListHeader, TrackRow, type TrackEditFields } from "./TrackRow"
import { LibraryFooter, LibraryToolbar } from "./LibraryToolbar"

type SortKey = "order" | "title" | "length"

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "order", label: "Play order" },
  { value: "title", label: "Title" },
  { value: "length", label: "Longest" },
]

const INITIAL_LIMIT = 50

interface Props {
  playlist: Playlist
  /** Members in play order, or null while they load. */
  tracks: Track[] | null
  locked: boolean
  savingOrder: boolean
  nowPlayingId: string | null
  onAddFromLibrary: () => void
  /** The full new order, ids only. */
  onReorder: (ids: string[]) => void
  onRemove: (trackId: string) => void
  onEdit: (id: string, fields: TrackEditFields) => void
  onToggleOrder: () => void
  onRename: () => void
  onSetDefault: () => void
  onDelete: () => void
  belowToolbar?: React.ReactNode
  /** Library-wide items (Jingles, Fix tags) appended to this view's ⋯ menu. */
  menuItems?: React.ReactNode
}

/**
 * One rotation: what it is called, how it is walked, and the tracks in it in
 * the order they will air. The drag handles here are the only ones that
 * change what plays.
 */
export function PlaylistView({
  playlist,
  tracks,
  locked,
  savingOrder,
  nowPlayingId,
  onAddFromLibrary,
  onReorder,
  onRemove,
  onEdit,
  onToggleOrder,
  onRename,
  onSetDefault,
  onDelete,
  belowToolbar,
  menuItems,
}: Props) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("order")
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const preview = useTrackPreview()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const q = query.trim().toLowerCase()
  const members = useMemo(() => tracks ?? [], [tracks])

  const visible = useMemo(() => {
    const filtered = q
      ? members.filter((t) => `${t.title} ${t.artist ?? ""}`.toLowerCase().includes(q))
      : members

    const ordered = [...filtered]
    if (sort === "title") ordered.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === "length") ordered.sort((a, b) => b.duration_seconds - a.duration_seconds)
    else ordered.sort((a, b) => a.position - b.position)

    return ordered
  }, [members, q, sort])

  const shown = visible.slice(0, limit)

  /**
   * Dragging only makes sense against the real order.
   *
   * `reorder` takes a full ordered `ids[]` array, so a drag inside a filtered
   * or title-sorted view would either write a wrong order or silently drop the
   * rows that aren't on screen. The handles disappear instead of pretending,
   * and the footer says why.
   *
   * Shuffle is the same argument from the other end: the order would save
   * correctly and then never be played, which is a worse lie than a missing
   * handle. The deck holds track IDs, so dragging genuinely changes nothing.
   */
  const canReorder =
    sort === "order" && q === "" && shown.length === members.length && playlist.order === "sequential"

  const reorderHint =
    playlist.order === "shuffle"
      ? "· shuffle ignores manual order — switch it off to reorder"
      : "· switch to Play order with search cleared to reorder"

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = members.findIndex((t) => t.id === active.id)
    const newIdx = members.findIndex((t) => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(members, oldIdx, newIdx).map((t) => t.id))
  }

  const totalSeconds = members.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0)

  const summary = [
    `${members.length} track${members.length === 1 ? "" : "s"}`,
    totalSeconds > 0 ? formatAirtime(totalSeconds) : null,
    locked
      ? "plays only on Pro"
      : playlist.order === "shuffle"
        ? "shuffled, every track once per pass"
        : "plays in order, then loops",
  ].filter(Boolean) as string[]

  const menu = (
    <>
      {/* Shuffle's state is still on screen without opening this: the
          summary under the playlist name says "shuffled" or "plays in
          order". The check here is for changing it. */}
      <DropdownMenuCheckboxItem
        checked={playlist.order === "shuffle"}
        disabled={locked || savingOrder}
        onCheckedChange={() => onToggleOrder()}
      >
        <IconArrowsShuffle size={15} />
        Shuffle
      </DropdownMenuCheckboxItem>
      <DropdownMenuItem onClick={onAddFromLibrary} disabled={tracks === null}>
        <IconPlaylistAdd size={15} />
        Add from library
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onRename}>
        <IconPencil size={15} />
        Rename
      </DropdownMenuItem>
      {!playlist.is_default && (
        <DropdownMenuItem onClick={onSetDefault}>
          <IconStar size={15} />
          Make default
        </DropdownMenuItem>
      )}
      {!playlist.is_default && (
        <DropdownMenuItem onClick={onDelete}>
          <IconTrash size={15} />
          Delete playlist
        </DropdownMenuItem>
      )}
      {menuItems && (
        <>
          <DropdownMenuSeparator />
          {menuItems}
        </>
      )}
    </>
  )

  return (
    <>
      <div className="flex flex-col gap-1.5 px-5.5 pt-5 pb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate font-display text-title-sm">{playlist.name}</h2>
          {/* Neutral: "default" is a role the playlist has, not a station state. */}
          {playlist.is_default && <Tag title="New uploads land in it too.">Plays when nothing’s scheduled</Tag>}
        </div>
        <p className="font-mono text-caption text-text-faint">{tracks === null ? "Loading…" : summary.join(" \u00b7 ")}</p>
      </div>

      <LibraryToolbar
        query={query}
        onQuery={(next) => {
          setQuery(next)
          setLimit(INITIAL_LIMIT)
        }}
        found={q !== "" ? visible.length : null}
        placeholder="Search this playlist"
        sort={sort}
        onSort={setSort}
        sorts={SORTS}
        menuLabel="Playlist actions"
        menu={menu}
      />

      {belowToolbar}

      {tracks === null ? (
        <div className="flex items-center justify-center gap-2 border-t border-line py-14 text-body-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          Loading playlist…
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 border-t border-line px-5.5 py-14 text-center">
          <p className="text-body font-semibold">Nothing in {playlist.name} yet</p>
          <p className="max-w-sm text-body-sm text-muted-foreground">
            {playlist.is_default
              ? "This is what plays when nothing else is scheduled — empty, the station goes on air to silence."
              : "Add tracks from your library, or drop files here to upload straight into it."}
          </p>
          {/* In the ⋯ menu once there are rows; here it is what's needed. */}
          <Button variant="subtle" className="mt-3" onClick={onAddFromLibrary}>
            Add from library
          </Button>
        </div>
      ) : (
        <>
          <TrackListHeader fourth="Added" />

          {/* `id` is not cosmetic: dnd-kit derives aria ids from a
              module-scoped counter, and without it this tree fails to hydrate. */}
          <DndContext
            id={`playlist-${playlist.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {shown.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  number={track.position}
                  reorderable={canReorder}
                  onAir={track.id === nowPlayingId}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onPreview={preview.toggle}
                  previewing={preview.previewingId === track.id}
                  previewBuffering={preview.buffering}
                />
              ))}
            </SortableContext>
          </DndContext>

          {q !== "" && visible.length === 0 && (
            <p className="border-t border-line px-5.5 py-8 text-body text-muted-foreground">Nothing matches “{query.trim()}”.</p>
          )}

          <LibraryFooter showAll={shown.length < visible.length ? { count: visible.length, onClick: () => setLimit(visible.length) } : undefined}>
            {q !== "" ? `Showing ${shown.length} of ${visible.length} matches` : `Showing ${shown.length} of ${members.length}`}
            {!canReorder && members.length > 1 && <span> {reorderHint}</span>}
          </LibraryFooter>
        </>
      )}
    </>
  )
}
