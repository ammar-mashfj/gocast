"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconUpload,
  IconTrash,
  IconLoader2,
  IconMicrophone,
} from "@tabler/icons-react"
import api from "@/lib/axios"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { formatBytes, formatDuration } from "@/lib/format"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { AUDIO_ACCEPT, isAudioFile, uploadErrorMessage } from "./upload"

/**
 * Intervals we offer, in minutes. Deliberately a fixed list rather than a
 * free number field: the useful range is "a few times an hour" to "twice a
 * shift", and every value in between is a judgement call the owner has no
 * way to evaluate by ear. The API accepts anything from 60s to 4h, so this
 * can grow without a backend change.
 */
const INTERVALS = [5, 10, 15, 30, 60, 120]

/** Track counts, same reasoning. The API accepts 1–100. */
const TRACK_COUNTS = [2, 3, 5, 8, 10, 15, 20]

function intervalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  return minutes === 60 ? "hour" : `${minutes / 60} hours`
}

interface Props {
  open: boolean
  onClose: () => void
  station: Station
  /** Bubble storage changes back so the library meter stays honest — one cap covers both lists. */
  onStorageChange: (deltaBytes: number) => void
}

export function JinglesDialog({ open, onClose, station, onStorageChange }: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(station.jingles_enabled)
  const [mode, setMode] = useState(station.jingle_mode)
  const [intervalMinutes, setIntervalMinutes] = useState(
    Math.round(station.jingle_interval_seconds / 60),
  )
  const [everyTracks, setEveryTracks] = useState(station.jingle_every_tracks)
  const [jingles, setJingles] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetched on open rather than with the page: most visits to the library are
  // about the rotation, and this list is behind a button.
  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    api
      .get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${station.slug}/tracks`, {
        params: { kind: "jingle" },
      })
      .then(({ data }) => {
        if (!cancelled) setJingles(data.data)
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load your jingles.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, station.slug])

  // Re-sync when the dialog is reopened after a save elsewhere (router.refresh
  // gives us a fresh station prop, but this component stays mounted).
  useEffect(() => {
    if (!open) return
    setEnabled(station.jingles_enabled)
    setMode(station.jingle_mode)
    setIntervalMinutes(Math.round(station.jingle_interval_seconds / 60))
    setEveryTracks(station.jingle_every_tracks)
  }, [
    open,
    station.jingles_enabled,
    station.jingle_mode,
    station.jingle_interval_seconds,
    station.jingle_every_tracks,
  ])

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(isAudioFile)
      if (list.length === 0) {
        toast.error("No audio files in selection.")
        return
      }

      setUploading(true)
      try {
        const form = new FormData()
        // Same endpoint as the rotation — `kind` is the only difference, which
        // is what keeps quota, tag reading and storage identical across both.
        form.append("kind", "jingle")
        for (const file of list) form.append("files[]", file)

        const { data } = await api.post<{
          data: Track[]
          errors: { index: number; message: string }[]
        }>(`/stations/${station.slug}/tracks`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        })

        setJingles((prev) => [...prev, ...data.data])
        onStorageChange(data.data.reduce((sum, t) => sum + t.file_size_bytes, 0))

        if (data.errors.length > 0) {
          toast.error(data.errors[0].message)
        } else {
          toast.success(`Added ${data.data.length} jingle${data.data.length === 1 ? "" : "s"}.`)
        }
      } catch (err: unknown) {
        toast.error(uploadErrorMessage(err))
      } finally {
        setUploading(false)
      }
    },
    [station.slug, onStorageChange],
  )

  const handleDelete = useCallback(
    async (track: Track) => {
      // TODO: replace with shadcn AlertDialog (same as the rotation list)
      if (!window.confirm(`Delete "${track.title}"? This can't be undone.`)) return

      setJingles((prev) => prev.filter((t) => t.id !== track.id))
      onStorageChange(-track.file_size_bytes)

      try {
        await api.delete(`/tracks/${track.id}`)
      } catch {
        toast.error("Delete failed. Refreshing…")
        const { data } = await api.get<{ data: Track[] }>(`/stations/${station.slug}/tracks`, {
          params: { kind: "jingle" },
        })
        setJingles(data.data)
      }
    },
    [station.slug, onStorageChange],
  )

  async function handleSave() {
    setSaving(true)
    try {
      // Both modes' settings are sent, not just the active one, so switching
      // back later restores what the owner last chose rather than a default.
      await api.patch(`/stations/${station.slug}`, {
        jingles_enabled: enabled,
        jingle_mode: mode,
        jingle_interval_seconds: intervalMinutes * 60,
        jingle_every_tracks: everyTracks,
      })
      // No restart involved: these two settings are interactive variables in
      // the station's Liquidsoap script, pushed over telnet. A live station
      // picks the change up at its next track boundary without dropping
      // anyone.
      toast.success(
        enabled
          ? "Jingles on — takes effect after the current track."
          : "Jingles turned off.",
      )
      // The station arrives as a prop from the server component, so without
      // this the dialog reopens showing the values we just replaced.
      router.refresh()
      onClose()
    } catch {
      toast.error("Couldn't save jingle settings.")
    } finally {
      setSaving(false)
    }
  }

  // Turning jingles on with an empty list is a setting that does nothing, and
  // the station gets restarted for it. Say so rather than letting the owner
  // discover the silence.
  const enabledButEmpty = enabled && !loading && jingles.length === 0

  const settingsChanged =
    enabled !== station.jingles_enabled ||
    mode !== station.jingle_mode ||
    intervalMinutes * 60 !== station.jingle_interval_seconds ||
    everyTracks !== station.jingle_every_tracks

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jingles</DialogTitle>
          <DialogDescription>
            Station IDs and liners, played between AutoDJ tracks. They never cut into a
            song — the next one waits for the current track to finish.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="jingles-enabled">Play jingles</FieldLabel>
            <Switch
              id="jingles-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </Field>

          <Field>
            <FieldLabel>How often</FieldLabel>

            {/* Two radio rows rather than a mode dropdown plus a value
                dropdown: the choice and its value read as one sentence
                ("every 30 minutes"), and seeing both sentences at once is
                what makes the trade-off legible. */}
            <div className="flex flex-col gap-2">
              <label
                className={`flex items-center gap-2 text-sm ${enabled ? "" : "opacity-50"}`}
              >
                <input
                  type="radio"
                  name="jingle-mode"
                  value="interval"
                  checked={mode === "interval"}
                  onChange={() => setMode("interval")}
                  disabled={!enabled}
                  className="accent-primary"
                />
                <span>Every</span>
                <select
                  aria-label="Minutes between jingles"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  disabled={!enabled || mode !== "interval"}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {INTERVALS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {intervalLabel(minutes)}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className={`flex items-center gap-2 text-sm ${enabled ? "" : "opacity-50"}`}
              >
                <input
                  type="radio"
                  name="jingle-mode"
                  value="tracks"
                  checked={mode === "tracks"}
                  onChange={() => setMode("tracks")}
                  disabled={!enabled}
                  className="accent-primary"
                />
                <span>Every</span>
                <select
                  aria-label="Tracks between jingles"
                  value={everyTracks}
                  onChange={(e) => setEveryTracks(Number(e.target.value))}
                  disabled={!enabled || mode !== "tracks"}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {TRACK_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count} tracks
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <FieldDescription>
              {mode === "interval"
                ? "Predictable in real time — good for legal IDs and sponsor reads. On a station with long tracks the actual gap can run past this, because the jingle still waits for the current track to end."
                : "Even spacing through your rotation. How often that lands in real time depends on how long your tracks are."}
            </FieldDescription>
            <FieldDescription>
              Either way it&apos;s a minimum, never a cut: the jingle waits for the
              current track to finish. Changes apply live — your station stays on air.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {enabledButEmpty && (
          <p className="text-xs text-destructive">
            You haven&apos;t uploaded any jingles yet, so nothing will play.
          </p>
        )}

        {/* Drop zone */}
        <div
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
          className={`flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          {uploading ? (
            <IconLoader2 size={22} className="animate-spin text-primary" />
          ) : (
            <IconUpload size={22} className="text-muted-foreground" />
          )}
          <div className="text-sm font-medium">
            {uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag jingles here"}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
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
        </div>

        {/* Jingle list. No drag handles: Liquidsoap plays these in random
            order, so an ordering control here would be a lie. */}
        <div className="max-h-56 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6">
              <IconLoader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : jingles.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-6 text-center">
              <IconMicrophone size={22} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                No jingles yet. A station ID is usually 5–15 seconds.
              </p>
            </div>
          ) : (
            jingles.map((jingle) => (
              <div
                key={jingle.id}
                className="flex items-center gap-2 border-b border-border px-1 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{jingle.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {jingle.original_filename}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {jingle.duration_seconds > 0
                    ? formatDuration(Math.round(jingle.duration_seconds))
                    : "—"}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                  {formatBytes(jingle.file_size_bytes)}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${jingle.title}`}
                  onClick={() => void handleDelete(jingle)}
                >
                  <IconTrash size={16} className="text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !settingsChanged}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
