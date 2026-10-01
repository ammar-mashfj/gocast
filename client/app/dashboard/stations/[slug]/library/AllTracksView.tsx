"use client"

import { useMemo, useState } from "react"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { DndContext } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Button } from "@/components/ds/Button"
import type { Track } from "@/interfaces/Track"
import { useTrackPreview } from "@/hooks/useTrackPreview"
import { TrackListHeader, TrackRow, type TrackEditFields } from "./TrackRow"
import { LibraryFooter, LibraryToolbar } from "./LibraryToolbar"

type SortKey = "added" | "title" | "length"

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "Title" },
  { value: "length", label: "Longest" },
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
  nowPlayingId: string | null
  onEdit: (id: string, fields: TrackEditFields) => void
  onDelete: (id: string) => void
  /** Delete every selected file. Resolves once the server has confirmed. */
  onBulkDelete: (ids: string[]) => Promise<void>
  /** Hand the selection to the shell, which asks which playlist. */
  onBulkAdd: (ids: string[]) => void
  /** Storage meter and the tag banner, owned by the shell, shown under the toolbar. */
  belowToolbar?: React.ReactNode
  /** Library-wide items (Jingles, Fix tags) for this view's ⋯ menu. */
  menuItems?: React.ReactNode
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
  nowPlayingId,
  onEdit,
  onDelete,
  onBulkDelete,
  onBulkAdd,
  belowToolbar,
  menuItems,
}: Props) {
  const [confirm, confirmDialog] = useConfirm()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("added")
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const preview = useTrackPreview()

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
    const ok = await confirm({
      title: ids.length === 1 ? "Delete this track?" : `Delete ${ids.length} tracks?`,
      description: `${ids.length === 1 ? "It leaves" : "They leave"} every playlist too. This can't be undone.`,
      confirmLabel: ids.length === 1 ? "Delete track" : `Delete ${ids.length} tracks`,
      keepLabel: ids.length === 1 ? "Keep it" : "Keep them",
    })
    if (!ok) return

    setDeleting(true)
    try {
      await onBulkDelete(ids)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1 px-5.5 pt-5 pb-3.5">
        <h2 className="font-display text-title-sm">All tracks</h2>
        <p className="text-body-sm text-text-faint">Every file you own. Upload, delete and fix tags here.</p>
      </div>

      <LibraryToolbar
        query={query}
        onQuery={(next) => {
          setQuery(next)
          setLimit(INITIAL_LIMIT)
        }}
        found={q !== "" ? visible.length : null}
        placeholder="Search title or artist"
        sort={sort}
        onSort={setSort}
        sorts={SORTS}
        menuLabel="Library actions"
        menu={menuItems}
      />

      {/* Only while something is selected, so the resting panel is unchanged. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-raised px-5.5 py-2.5">
          <span className="font-mono text-body-sm font-semibold tabular-nums">{selected.size} selected</span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="subtle"
            onClick={() => onBulkAdd(pickedInOrder())}
            disabled={locked || deleting}
            title={locked ? "Playlists are part of AutoDJ, which isn't in your plan." : undefined}
          >
            Add to playlist
          </Button>
          {/* Deleting stays on every plan: a downgrade never traps files. */}
          <Button size="sm" variant="subtle" onClick={() => void deletePicked()} disabled={deleting}>
            {deleting ? "Deleting…" : `Delete ${selected.size}`}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setPicked(new Set())} disabled={deleting}>
            Clear
          </Button>
        </div>
      )}

      {belowToolbar}

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 border-t border-line px-5.5 py-14 text-center">
          <p className="text-body font-semibold">No tracks yet</p>
          <p className="text-body-sm text-muted-foreground">
            {locked
              ? "This is where your music lives once Pro is on."
              : "Drop audio files anywhere on this card, or use Add tracks."}
          </p>
        </div>
      ) : (
        <>
          <TrackListHeader
            fourth="In playlists"
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
                  onRowClick={() => toggleOne(track.id, !selected.has(track.id))}
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
            {q !== "" ? `Showing ${shown.length} of ${visible.length} matches` : `Showing ${shown.length} of ${tracks.length}`}
            {orphans > 0 && (
              <span className="text-fault-text"> · {orphans} in no playlist — {orphans === 1 ? "it" : "they"} never play</span>
            )}
            {/* Select-all reaches past the painted rows, so say so. */}
            {selected.size > shown.length && <span> · {selected.size} selected, including rows below</span>}
          </LibraryFooter>
        </>
      )}
      {confirmDialog}
    </>
  )
}
