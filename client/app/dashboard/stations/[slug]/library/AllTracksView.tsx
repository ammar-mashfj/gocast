"use client"

import { useMemo, useState } from "react"
import { IconMusic, IconPlaylistAdd, IconSearch, IconTrash, IconX } from "@tabler/icons-react"
import { DndContext } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Track } from "@/interfaces/Track"
import { cn } from "@/lib/utils"
import { TrackListHeader, TrackRow, type TrackEditFields } from "./TrackRow"

type SortKey = "added" | "title" | "length"

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "added", label: "Added" },
  { key: "title", label: "Title" },
  { key: "length", label: "Longest" },
]

/**
 * Rows rendered before "Show all" appears. A guard for a library that has
 * grown past what anyone wants to paint at once, not an editorial choice.
 */
const INITIAL_LIMIT = 50

interface Props {
  /** Every music file the station owns, with `playlist_ids`. */
  tracks: Track[]
  /** id → name, for the chips. */
  playlistNames: Map<string, string>
  locked: boolean
  uploading: boolean
  nowPlayingId: string | null
  onPickFiles: () => void
  onEdit: (id: string, fields: TrackEditFields) => void
  onDelete: (id: string) => void
  /** Delete every selected file. Resolves once the server has confirmed. */
  onBulkDelete: (ids: string[]) => Promise<void>
  /** Hand the selection to the shell, which asks which playlist. */
  onBulkAdd: (ids: string[]) => void
  /** Storage meter and the tag banner, owned by the shell, shown under the toolbar. */
  belowToolbar?: React.ReactNode
}

/**
 * The library: every file, whichever playlists it is in. Nothing here is
 * draggable, because the library's order is not what plays — a playlist's
 * order is, and that is edited in the playlist. What this view is for is
 * seeing everything at once, fixing tags, deleting files, and spotting the
 * track that is in no playlist and therefore never airs.
 */
export function AllTracksView({
  tracks,
  playlistNames,
  locked,
  uploading,
  nowPlayingId,
  onPickFiles,
  onEdit,
  onDelete,
  onBulkDelete,
  onBulkAdd,
  belowToolbar,
}: Props) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("added")
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = useState(false)

  const q = query.trim().toLowerCase()

  const visible = useMemo(() => {
    const filtered = q
      ? tracks.filter((t) => `${t.title} ${t.artist ?? ""}`.toLowerCase().includes(q))
      : tracks

    const ordered = [...filtered]
    if (sort === "title") ordered.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === "length") ordered.sort((a, b) => b.duration_seconds - a.duration_seconds)
    else ordered.sort((a, b) => a.position - b.position)

    return ordered
  }, [tracks, q, sort])

  const shown = visible.slice(0, limit)
  const orphans = useMemo(
    () => tracks.filter((t) => (t.playlist_ids ?? []).length === 0).length,
    [tracks],
  )

  /**
   * The selection, less anything that no longer exists.
   *
   * Derived rather than reconciled in an effect. This is what empties the bar
   * after a bulk delete, and it also covers every other way a row can vanish —
   * a single-row delete, a refetch, a failed edit that reloaded the list. A
   * state update would have to be remembered at each of those call sites;
   * deriving cannot miss one, and it costs a set walk per render.
   */
  const selected = useMemo(() => {
    if (picked.size === 0) return picked
    const live = new Set(tracks.map((t) => t.id))
    const next = new Set([...picked].filter((id) => live.has(id)))
    return next.size === picked.size ? picked : next
  }, [picked, tracks])

  /** Select-all covers everything the filter matches, not just the painted rows. */
  const allShownPicked = visible.length > 0 && visible.every((t) => selected.has(t.id))

  function toggleOne(id: string, next: boolean) {
    setPicked((prev) => {
      const updated = new Set(prev)
      if (next) updated.add(id)
      else updated.delete(id)
      return updated
    })
  }

  function toggleAll(next: boolean) {
    setPicked((prev) => {
      const updated = new Set(prev)
      for (const track of visible) {
        if (next) updated.add(track.id)
        else updated.delete(track.id)
      }
      return updated
    })
  }

  /** In list order, so a batch is applied the way the screen reads. */
  function pickedInOrder(): string[] {
    return visible.filter((t) => selected.has(t.id)).map((t) => t.id)
  }

  async function deletePicked() {
    const ids = pickedInOrder()
    if (ids.length === 0 || deleting) return
    // TODO: replace with shadcn AlertDialog, as the single-row delete does.
    const question =
      ids.length === 1
        ? "Delete this track? It leaves every playlist too. This can't be undone."
        : `Delete ${ids.length} tracks? They leave every playlist too. This can't be undone.`
    if (!window.confirm(question)) return

    setDeleting(true)
    try {
      await onBulkDelete(ids)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
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
            placeholder="Search title or artist"
            className="h-9 pl-9 pr-16 text-sm"
          />
          {q !== "" && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
              {visible.length} found
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {SORTS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={sort === s.key ? "secondary" : "ghost"}
              onClick={() => setSort(s.key)}
              className={sort === s.key ? undefined : "text-muted-foreground"}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={onPickFiles}
          disabled={uploading || locked}
          title={locked ? "AutoDJ is not included in your plan." : "Uploads from here join the default playlist."}
        >
          {locked ? "Uploading needs Pro" : "Drop files or browse"}
        </Button>
      </div>

      {/* The selection bar. It replaces nothing and pushes nothing around —
          it appears between the toolbar and the storage meter only while
          something is selected, so the resting state of the panel is exactly
          what it was before multi-select existed. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
          <span className="text-xs tabular-nums font-medium">
            {selected.size} selected
          </span>

          <span className="flex-1" />

          <Button
            size="sm"
            variant="outline"
            onClick={() => onBulkAdd(pickedInOrder())}
            disabled={locked || deleting}
            title={locked ? "Playlists are part of AutoDJ, which isn't in your plan." : undefined}
          >
            <IconPlaylistAdd size={15} data-icon="inline-start" />
            Add to playlist
          </Button>

          {/* Deleting stays available on every plan — the same rule the
              per-row button and the API already follow. A downgrade must
              never trap someone's files behind a paywall. */}
          <Button size="sm" variant="outline" onClick={() => void deletePicked()} disabled={deleting}>
            <IconTrash size={15} data-icon="inline-start" className="text-destructive" />
            {deleting ? "Deleting…" : `Delete ${selected.size}`}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setPicked(new Set())}
            disabled={deleting}
            aria-label="Clear selection"
          >
            <IconX size={15} />
          </Button>
        </div>
      )}

      {belowToolbar}

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center text-center py-14 gap-2">
          <IconMusic size={28} className="text-muted-foreground" />
          <div className="text-sm font-medium">No tracks yet</div>
          <p className="text-xs text-muted-foreground">
            {locked
              ? "This is where your music lives. Upgrade to start filling it."
              : "Drag audio files anywhere onto this panel to start the AutoDJ."}
          </p>
        </div>
      ) : (
        <>
          <TrackListHeader
            selectable
            allSelected={allShownPicked}
            someSelected={selected.size > 0}
            onToggleAll={toggleAll}
          />

          {/* Never draggable here, but the rows are built for a sortable
              context and expect one to exist — an inert one costs nothing. */}
          <DndContext id="library-all-tracks">
            <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {shown.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  number={i + 1}
                  reorderable={false}
                  onAir={track.id === nowPlayingId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  chips={(track.playlist_ids ?? []).map((id) => playlistNames.get(id) ?? "…")}
                  selectable
                  selected={selected.has(track.id)}
                  onSelectChange={toggleOne}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-xs text-muted-foreground">
            <span>
              {q !== ""
                ? `Showing ${shown.length} of ${visible.length} matches`
                : `Showing ${shown.length} of ${tracks.length}`}
              {orphans > 0 && (
                <span className="ml-2 text-destructive/80">
                  · {orphans} in no playlist — {orphans === 1 ? "it" : "they"} never play
                </span>
              )}
            </span>
            <span className="flex items-center gap-3">
              {/* Select-all reaches past the painted rows, so say so rather
                  than letting the bar's count look wrong. */}
              {selected.size > shown.length && (
                <span className={cn("tabular-nums", "text-muted-foreground")}>
                  {selected.size} selected, including rows below
                </span>
              )}
              {shown.length < visible.length && (
                <Button variant="outline" size="sm" onClick={() => setLimit(visible.length)}>
                  Show all {visible.length}
                </Button>
              )}
            </span>
          </div>
        </>
      )}
    </>
  )
}
