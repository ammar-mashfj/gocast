"use client"

import { useState, useRef, useCallback } from "react"
import { toast } from "sonner"
import {
  IconUpload,
  IconGripVertical,
  IconTrash,
  IconEdit,
  IconCheck,
  IconX,
  IconLoader2,
  IconMusic,
  IconMicrophone,
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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatBytes, formatDuration } from "@/lib/format"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { JinglesDialog } from "./JinglesDialog"
import { AUDIO_ACCEPT, isAudioFile, uploadErrorMessage } from "./upload"

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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const list = Array.from(files).filter(isAudioFile)
    if (list.length === 0) {
      toast.error("No audio files in selection.")
      return
    }

    setUploading(true)
    try {
      const form = new FormData()
      for (const file of list) form.append("files[]", file)

      const { data } = await api.post<{
        data: Track[]
        errors: { index: number; message: string }[]
      }>(`/stations/${slug}/tracks`, form, {
        // FormData → axios sets the multipart boundary automatically; this
        // override removes the json default the axios instance applies.
        headers: { "Content-Type": "multipart/form-data" },
      })

      // Append uploaded tracks to the local list. Server-assigned positions
      // are already correct (max+1, max+2, …).
      setTracks((prev) => [...prev, ...data.data])
      applyStorageDelta(data.data.reduce((sum, t) => sum + t.file_size_bytes, 0))

      if (data.errors.length > 0) {
        toast.error(data.errors[0].message)
      } else {
        toast.success(`Added ${data.data.length} track${data.data.length === 1 ? "" : "s"}.`)
      }
    } catch (err: unknown) {
      toast.error(uploadErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }, [slug, applyStorageDelta])

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

  const usagePct = Math.min(100, (meta.storage_used_bytes / meta.storage_cap_bytes) * 100)

  return (
    <div className="flex flex-col gap-4">
      {/* Jingles live behind a button rather than a second list on the page:
          most visits here are about the rotation, and the two lists behave
          differently enough (no ordering, no editing, a schedule) that showing
          them side by side invites the wrong mental model. */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setJinglesOpen(true)}>
          <IconMicrophone size={16} />
          Jingles
          {station.jingles_enabled && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              on
            </span>
          )}
        </Button>
      </div>

      <JinglesDialog
        open={jinglesOpen}
        onClose={() => setJinglesOpen(false)}
        station={station}
        onStorageChange={applyStorageDelta}
      />

      {/* Storage meter */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">Storage</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatBytes(meta.storage_used_bytes)} / {formatBytes(meta.storage_cap_bytes)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${usagePct >= 90 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Drop zone */}
      <Card
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
        }}
        className={`border-dashed transition-colors ${dragOver ? "border-primary bg-primary/5" : ""}`}
      >
        <CardContent className="flex flex-col items-center text-center py-10 gap-3">
          {uploading ? (
            <IconLoader2 size={28} className="animate-spin text-primary" />
          ) : (
            <IconUpload size={28} className="text-muted-foreground" />
          )}
          <div>
            <div className="text-sm font-medium mb-1">
              {uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag audio files here"}
            </div>
            <p className="text-xs text-muted-foreground">
              MP3, M4A, AAC, FLAC, OGG, WAV · 50 MB per file · {formatBytes(meta.storage_cap_bytes)} per station
            </p>
            <p className="text-xs text-muted-foreground">
              Station IDs and liners go under <span className="font-medium">Jingles</span>, not here.
            </p>
          </div>
          <Button variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            Browse files
          </Button>
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
        </CardContent>
      </Card>

      {/* Track list */}
      {tracks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center text-center py-10 gap-2">
            <IconMusic size={28} className="text-muted-foreground" />
            <div className="text-sm font-medium">No tracks yet</div>
            <p className="text-xs text-muted-foreground">Upload your first audio files to start the AutoDJ.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0 py-2">
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
              <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface TrackRowProps {
  track: Track
  onEdit: (id: string, fields: { title?: string; artist?: string | null }) => void
  onDelete: (id: string) => void
}

function TrackRow({ track, onEdit, onDelete }: TrackRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-b-0 group"
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        aria-label="Drag to reorder"
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none p-1 inline-flex"
      >
        <IconGripVertical size={16} />
      </div>

      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{track.position}</span>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="h-8 text-sm"
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
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") commit()
                if (e.key === "Escape") cancel()
              }}
            />
          </div>
        ) : (
          <>
            <div className="text-sm truncate">{track.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {track.artist ?? "Unknown artist"}
            </div>
          </>
        )}
      </div>

      <div className="hidden md:flex flex-col items-end shrink-0 text-xs text-muted-foreground tabular-nums w-20">
        <span>{track.duration_seconds > 0 ? formatDuration(Math.round(track.duration_seconds)) : "—"}</span>
        <span>{formatBytes(track.file_size_bytes)}</span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <Button size="icon-sm" variant="ghost" aria-label="Save" onClick={commit}>
              <IconCheck size={16} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={cancel}>
              <IconX size={16} />
            </Button>
          </>
        ) : (
          <>
            <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(true)}>
              <IconEdit size={16} />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => onDelete(track.id)}>
              <IconTrash size={16} className="text-destructive" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
