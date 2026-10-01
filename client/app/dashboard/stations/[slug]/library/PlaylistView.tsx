"use client"

import { useMemo, useState } from "react"
import {
  IconArrowsShuffle,
  IconDotsVertical,
  IconLoader2,
  IconPencil,
  IconPlaylist,
  IconPlaylistAdd,
  IconSearch,
  IconStar,
  IconStarFilled,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatAirtime } from "@/lib/format"
import type { Playlist } from "@/interfaces/Playlist"
import type { Track } from "@/interfaces/Track"
import { useTrackPreview } from "@/hooks/useTrackPreview"
import { TrackListHeader, TrackRow, type TrackEditFields } from "./TrackRow"

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            {playlist.is_default ? (
              <IconStarFilled size={15} className="text-violet-muted" />
            ) : (
              <IconPlaylist size={16} className="text-muted-foreground" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base font-bold truncate">{playlist.name}</h2>
              {/* Neutral: "default" is a role the playlist has, not a
                  station state, so it gets none of the state colours. */}
              {playlist.is_default && (
                <Badge
                  variant="outline"
                  className="border-input bg-transparent px-1.5 text-[11px] text-muted-foreground shrink-0"
                  title="Plays whenever nothing else is scheduled, and where uploads land by default."
                >
                  Default
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {tracks === null ? "Loading…" : summary.join(" • ")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-border">
        <div className="relative flex-1 min-w-[220px]">
          <IconSearch
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(INITIAL_LIMIT)
            }}
            placeholder="Search this playlist"
            className="h-9 pl-9 pr-16 text-sm"
          />
          {q !== "" && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
              {visible.length} found
            </span>
          )}
        </div>

        {/* One sort control, not three chips. The toolbar used to carry ten
            always-visible controls between this row and the page header;
            what remains is search, sort, the page's one primary action
            (Add tracks, up in the header) and this ⋯ for everything else. */}
        <Select
          aria-label="Sort tracks"
          value={sort}
          onChange={setSort}
          options={SORTS}
          className="w-36 [&>button]:h-9"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Playlist actions">
              <IconDotsVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
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
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {belowToolbar}

      {tracks === null ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
          <IconLoader2 size={16} className="animate-spin" />
          Loading playlist…
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center text-center py-14 gap-2">
          <IconPlaylist size={28} className="text-muted-foreground" />
          <div className="text-sm font-medium">Nothing in {playlist.name} yet</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            {playlist.is_default
              ? "This is what plays when nothing else is scheduled — empty, the station goes on air to silence."
              : "Add tracks from your library, or drop files here to upload straight into it."}
          </p>
          {/* "Add from library" lives in the ⋯ menu once the playlist has
              rows; an empty playlist is exactly when it is needed, so it is
              on the surface here. */}
          <Button variant="outline" className="mt-2" onClick={onAddFromLibrary}>
            <IconPlaylistAdd size={15} data-icon="inline-start" />
            Add from library
          </Button>
        </div>
      ) : (
        <>
          <TrackListHeader />

          {/* `id` is not cosmetic — without it this tree fails to hydrate; see
              the note on the library's previous single list: dnd-kit derives
              aria ids from a module-scoped counter the server keeps
              incrementing across requests. */}
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

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-xs text-muted-foreground">
            <span>
              {q !== ""
                ? `Showing ${shown.length} of ${visible.length} matches`
                : `Showing ${shown.length} of ${members.length}`}
              {!canReorder && members.length > 1 && (
                <span className="ml-2 text-text-faint">{reorderHint}</span>
              )}
            </span>
            {shown.length < visible.length && (
              <Button variant="outline" size="sm" onClick={() => setLimit(visible.length)}>
                Show all {visible.length}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}
