"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { toast } from "sonner"
import {
  IconGripVertical,
  IconTrash,
  IconEdit,
  IconCheck,
  IconX,
  IconLoader2,
  IconMusic,
  IconMicrophone,
  IconSearch,
  IconPlus,
  IconSparkles,
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import api from "@/lib/axios"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatBytes, formatDate, formatDuration } from "@/lib/format"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { AutoDjUpsell } from "./AutoDjUpsell"
import { JinglesDialog } from "./JinglesDialog"
import { FixTagsDialog } from "./FixTagsDialog"
import { AUDIO_ACCEPT, batchFiles, isAudioFile, uploadErrorMessage } from "./upload"

type SortKey = "order" | "title" | "length"

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "order", label: "Play order" },
  { key: "title", label: "Title" },
  { key: "length", label: "Longest" },
]

/**
 * Rows rendered before "Show all" appears. This is a guard for a library that
 * has grown past what anyone wants to paint at once, not an editorial choice —
 * a rotation of any normal size never reaches it, so the button stays hidden
 * and the screen behaves as if there were no limit at all.
 */
const INITIAL_LIMIT = 50

/** Column track shared by the header row and every track row, so they line up. */
const ROW_GRID =
  "grid grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_auto] " +
  "md:grid-cols-[1.25rem_2rem_minmax(0,1fr)_minmax(0,0.7fr)_4rem_4.5rem_5rem_4.5rem] " +
  "gap-3 items-center px-4"

interface Props {
  station: Station
  initialTracks: Track[]
  initialMeta: LibraryMeta
}

export function LibraryView({ station, initialTracks, initialMeta }: Props) {
  const slug = station.slug
  const [tracks, setTracks] = useState<Track[]>(initialTracks)
  const [meta, setMeta] = useState<LibraryMeta>(initialMeta)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [jinglesOpen, setJinglesOpen] = useState(false)
  const [fixTagsOpen, setFixTagsOpen] = useState(false)
  const [tagBannerDismissed, setTagBannerDismissed] = useState(false)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("order")
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * AutoDJ is not on this plan. Uploading is the only thing this locks —
   * listing, reordering, editing and deleting all stay live, matching
   * TrackController exactly. A downgrade must never trap someone's files
   * behind a paywall, and a library someone can still curate is a much better
   * argument for upgrading than one they've been locked out of.
   */
  const locked = useAutoDjLocked()

  // The dashboard's single request dialog, mounted by the layout. Every CTA
  // on this screen opens that one rather than its own, so they settle
  // together — and so does the sidebar's.
  const proRequest = useProRequest()

  // Which row is on air. Polled at the hook's own pace — 10s while the station
  // is up, 30s when it is off — which is cheap enough to leave running on a
  // screen someone keeps open while they reorganise a rotation.
  const { status } = useStationStatus(slug)

  // The storage cap covers the whole station, so a jingle upload or delete
  // has to move this meter too.
  const applyStorageDelta = useCallback((deltaBytes: number) => {
    setMeta((prev) => ({
      ...prev,
      storage_used_bytes: prev.storage_used_bytes + deltaBytes,
    }))
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const upload = useCallback(async (files: FileList | File[]) => {
    // The server answers 403 here anyway; catching it before the request
    // turns a failed upload into an explanation, and stops a drag-and-drop of
    // 40 files from spending the user's bandwidth to learn the same thing.
    if (locked) {
      toast.error("AutoDJ isn't included in your plan yet.")
      return
    }

    const list = Array.from(files).filter(isAudioFile)
    if (list.length === 0) {
      toast.error("No audio files in selection.")
      return
    }

    setUploading(true)
    try {
      // A drop too large for one multipart body goes up as several requests,
      // each committed on its own — a batch that landed stays landed even if
      // a later one trips the quota.
      const batches = batchFiles(list)
      let added = 0
      let failure: string | null = null

      for (const batch of batches) {
        const form = new FormData()
        for (const file of batch) form.append("files[]", file)

        const { data } = await api.post<{
          data: Track[]
          errors: { index: number; message: string }[]
        }>(`/stations/${slug}/tracks`, form, {
          // FormData → axios sets the multipart boundary automatically; this
          // override removes the json default the axios instance applies.
          headers: { "Content-Type": "multipart/form-data" },
        })

        // Append uploaded tracks to the local list. Server-assigned positions
        // are already correct (max+1, max+2, …). Applied per batch so a long
        // drop fills the list as it goes instead of jumping at the end.
        setTracks((prev) => [...prev, ...data.data])
        applyStorageDelta(data.data.reduce((sum, t) => sum + t.file_size_bytes, 0))
        added += data.data.length

        if (data.errors.length > 0) {
          // The quota tripped mid-batch; every later batch would trip it too.
          failure = data.errors[0].message
          break
        }
      }

      if (failure !== null) {
        toast.error(failure)
      } else {
        toast.success(`Added ${added} track${added === 1 ? "" : "s"}.`)
      }
    } catch (err: unknown) {
      toast.error(uploadErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }, [slug, applyStorageDelta, locked])

  const handleReorder = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Functional setter snapshots the current array on render — using the
    // `tracks` closure caused stale-order PATCHes when reorders fired back
    // to back. We compute `next` inside the setter and stash it for the
    // network call.
    let next: Track[] | null = null
    setTracks((prev) => {
      const oldIdx = prev.findIndex((t) => t.id === active.id)
      const newIdx = prev.findIndex((t) => t.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      next = arrayMove(prev, oldIdx, newIdx).map((t, i) => ({ ...t, position: i + 1 }))
      return next
    })
    if (!next) return

    try {
      await api.patch(`/stations/${slug}/tracks/reorder`, { ids: (next as Track[]).map((t) => t.id) })
    } catch {
      toast.error("Couldn't save order. Refreshing…")
      const { data } = await api.get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`)
      setTracks(data.data)
      setMeta(data.meta)
    }
  }, [slug])

  const handleDelete = useCallback(async (id: string) => {
    let target: Track | undefined
    setTracks((prev) => {
      target = prev.find((t) => t.id === id)
      return prev
    })
    if (!target) return
    // TODO: replace with shadcn AlertDialog
    if (!window.confirm(`Delete "${target.title}"? This can't be undone.`)) return

    const removed = target
    setTracks((prev) => prev.filter((t) => t.id !== id))
    applyStorageDelta(-removed.file_size_bytes)

    try {
      await api.delete(`/tracks/${id}`)
      toast.success("Track deleted.")
    } catch {
      toast.error("Delete failed. Refreshing…")
      const { data } = await api.get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`)
      setTracks(data.data)
      setMeta(data.meta)
    }
  }, [slug, applyStorageDelta])

  const handleEdit = useCallback(async (id: string, fields: { title?: string; artist?: string | null }) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } as Track : t)))
    try {
      await api.patch(`/tracks/${id}`, fields)
    } catch {
      toast.error("Save failed. Refreshing…")
      const { data } = await api.get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`)
      setTracks(data.data)
    }
  }, [slug])

  const applyTagFixes = useCallback((updates: Array<{ id: string; artist: string }>) => {
    const byId = new Map(updates.map((u) => [u.id, u.artist]))
    setTracks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, artist: byId.get(t.id)! } : t)))
  }, [])

  const totalSeconds = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0),
    [tracks],
  )

  const untagged = useMemo(() => tracks.filter((t) => !t.artist), [tracks])

  /**
   * The row that is on air.
   *
   * `now_playing` carries no track id, so this matches on title + artist —
   * exactly what StationStatusController::upNext() already does server-side to
   * anchor the queue. Same logic, same single limitation: two tracks with an
   * identical title AND artist highlight the first. Restricted to the AutoDJ
   * source, since a live broadcaster's metadata has nothing to do with the
   * rotation.
   */
  const nowPlayingId = useMemo(() => {
    const np = status?.now_playing
    if (!np || status?.source !== "autodj") return null
    const match = tracks.find(
      (t) => t.title === np.title && (t.artist ?? null) === (np.artist ?? null),
    )
    return match?.id ?? null
  }, [status, tracks])

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

  /**
   * Dragging only makes sense against the real rotation.
   *
   * `reorder` takes a full ordered `ids[]` array, so a drag inside a filtered
   * or title-sorted view would either write a wrong order or silently drop the
   * rows that aren't on screen. The handles disappear instead of pretending,
   * and the toolbar says why.
   */
  const canReorder = sort === "order" && q === "" && shown.length === tracks.length

  const usagePct = Math.min(100, (meta.storage_used_bytes / meta.storage_cap_bytes) * 100)

  function pickFiles() {
    if (locked) return
    fileInputRef.current?.click()
  }

  const stats = [
    `${tracks.length} track${tracks.length === 1 ? "" : "s"}`,
    totalSeconds > 0 ? `${formatDuration(Math.round(totalSeconds))} of rotation` : null,
    // The middle clause describes what the rotation DOES, which is a promise
    // a free account's rotation does not keep — it never airs.
    locked ? "rotation plays only on Pro" : "plays in order, then loops",
    `${formatBytes(meta.storage_used_bytes)} of ${formatBytes(meta.storage_cap_bytes)} used`,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[280px] flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-medium">AutoDJ library</h1>
            {locked && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-[10px] tracking-wider text-primary uppercase"
              >
                Pro feature
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {stats.map((part, i) => (
              <span key={part} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-border">•</span>}
                <span className={i === 0 ? "text-primary" : undefined}>{part}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {/* Jingles are AutoDJ: they only ever play between rotation
              tracks, so on a plan without it there is nothing behind this
              dialog that could work — uploads are refused and the settings
              are refused. Disabled outright rather than opened onto a screen
              of dead controls. */}
          <Button
            variant="outline"
            onClick={() => setJinglesOpen(true)}
            disabled={locked}
            title={locked ? "Jingles are part of AutoDJ, which isn't in your plan." : undefined}
          >
            <IconMicrophone size={16} data-icon="inline-start" />
            Jingles
            {locked ? (
              <Badge
                variant="outline"
                className="ml-1 border-primary/30 bg-primary/10 px-1.5 text-[9px] tracking-wider text-primary uppercase"
              >
                Pro
              </Badge>
            ) : (
              station.jingles_enabled && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  on
                </span>
              )
            )}
          </Button>
          {/* Locked, the primary action is the upgrade rather than a dead
              "Add tracks" — a disabled button in the position people reach
              for first says "broken" more loudly than it says "paid". */}
          {locked ? (
            <Button onClick={proRequest.open} disabled={proRequest.requested}>
              {proRequest.requested ? (
                <IconCheck size={16} data-icon="inline-start" />
              ) : (
                <IconSparkles size={16} data-icon="inline-start" />
              )}
              {proRequest.requested ? "Request sent" : "Upgrade to enable AutoDJ"}
            </Button>
          ) : (
            <Button onClick={pickFiles} disabled={uploading}>
              {uploading ? (
                <IconLoader2 size={16} className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconPlus size={16} data-icon="inline-start" />
              )}
              {uploading ? "Uploading…" : "Add tracks"}
            </Button>
          )}
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files)
          e.target.value = ""
        }}
      />

      {locked && (
        <>
          <AutoDjUpsell stationName={station.name} />
          {/* Names the panel below for what it is. Without it the read-only
              editor reads as the feature working, and the upsell above it as
              an ad for something the user apparently already has. */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
              Preview of the rotation editor
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {/* The whole panel is the drop target. A dedicated dropzone card used to
          own the top of the screen while the library it fed sat below the
          fold; dragging anywhere over the list now does the same job and costs
          no vertical space. */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragOver && !locked) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
        }}
        className={cn(
          "rounded-xl border overflow-hidden transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card",
        )}
      >
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
            onClick={pickFiles}
            disabled={uploading || locked}
            title={locked ? "AutoDJ is not included in your plan." : undefined}
          >
            {locked ? "Uploading needs Pro" : "Drop files or browse"}
          </Button>
        </div>

        {/* Storage, reduced to the one pixel row it earns. It used to be a
            whole card rendering a bar at 0.2%. */}
        <div
          className="h-[3px] bg-muted"
          title={`${formatBytes(meta.storage_used_bytes)} of ${formatBytes(meta.storage_cap_bytes)} used`}
        >
          <div
            className={cn("h-full transition-all", usagePct >= 90 ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.max(usagePct, usagePct > 0 ? 0.4 : 0)}%` }}
          />
        </div>

        {untagged.length > 0 && !tagBannerDismissed && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/15 text-sm">
            <span className="flex-1 min-w-[220px] text-primary/90">
              {untagged.length} track{untagged.length === 1 ? " has" : "s have"} no artist tag —
              listeners see “Unknown artist” in the player.
            </span>
            <Button size="sm" onClick={() => setFixTagsOpen(true)}>
              Fix tags
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setTagBannerDismissed(true)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {tracks.length === 0 ? (
          <div className="flex flex-col items-center text-center py-14 gap-2">
            <IconMusic size={28} className="text-muted-foreground" />
            <div className="text-sm font-medium">No tracks yet</div>
            <p className="text-xs text-muted-foreground">
              {locked
                ? "This is where your rotation lives. Upgrade to start filling it."
                : "Drag audio files anywhere onto this panel to start the AutoDJ."}
            </p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                ROW_GRID,
                "py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground",
              )}
            >
              <span />
              <span className="text-right">#</span>
              <span>Title</span>
              <span className="hidden md:block">Artist</span>
              <span className="hidden md:block text-right">Length</span>
              <span className="hidden md:block text-right">Size</span>
              <span className="hidden md:block">Added</span>
              <span />
            </div>

            {/* `id` is not cosmetic — without it this tree fails to hydrate.
                dnd-kit derives the `aria-describedby` it puts on every drag
                handle from useUniqueId(), which is backed by a MODULE-SCOPED
                counter (@dnd-kit/utilities). That counter lives as long as the
                process: the Node server keeps incrementing it across requests,
                so the Nth render of this page emits "DndDescribedBy-(N-1)"
                while the browser, starting from a fresh module, always emits
                "DndDescribedBy-0". Every request after the first mismatches.
                Passing an explicit id short-circuits the counter entirely —
                useUniqueId returns the value it is given. */}
            <DndContext
              id="library-track-list"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReorder}
            >
              <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {shown.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    reorderable={canReorder}
                    onAir={track.id === nowPlayingId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <span>
                {q !== ""
                  ? `Showing ${shown.length} of ${visible.length} matches`
                  : `Showing ${shown.length} of ${tracks.length}`}
                {!canReorder && tracks.length > 1 && (
                  <span className="ml-2 text-muted-foreground/70">
                    · switch to Play order with search cleared to reorder
                  </span>
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
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
        {locked && "On Pro: "}
        MP3, M4A, AAC, FLAC, OGG and WAV up to 300 MB per file. Station IDs and liners
        belong under{" "}
        {locked ? (
          <span className="text-foreground">Jingles</span>
        ) : (
          <button
            type="button"
            onClick={() => setJinglesOpen(true)}
            className="text-primary hover:underline cursor-pointer"
          >
            Jingles
          </button>
        )}{" "}
        so they interleave between tracks instead of joining the rotation.
      </p>

      <JinglesDialog
        open={jinglesOpen}
        onClose={() => setJinglesOpen(false)}
        station={station}
        onStorageChange={applyStorageDelta}
      />

      <FixTagsDialog
        open={fixTagsOpen}
        onClose={() => setFixTagsOpen(false)}
        tracks={untagged}
        onSaved={applyTagFixes}
      />
    </div>
  )
}

interface TrackRowProps {
  track: Track
  /** False while searching or sorting — see `canReorder`. */
  reorderable: boolean
  onAir: boolean
  onEdit: (id: string, fields: { title?: string; artist?: string | null }) => void
  onDelete: (id: string) => void
}

function TrackRow({ track, reorderable, onAir, onEdit, onDelete }: TrackRowProps) {
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
        onAir ? "bg-primary/10" : "hover:bg-muted/40",
      )}
    >
      {reorderable ? (
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
        {track.position}
      </span>

      <div className="min-w-0">
        <div className="text-sm truncate">{track.title}</div>
        {/* Artist gets its own column from md up; below that it rides under
            the title rather than being dropped. */}
        <div className="md:hidden text-xs text-muted-foreground truncate">
          {track.artist ?? "Unknown artist"}
        </div>
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
        <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => onDelete(track.id)}>
          <IconTrash size={15} className="text-destructive" />
        </Button>
      </div>
    </div>
  )
}
