"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useConfirm } from "@/components/ui/use-confirm"
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
import { Select } from "@/components/ui/select"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { formatBytes, formatDuration } from "@/lib/format"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { AUDIO_ACCEPT } from "./upload"
import { useTrackUpload } from "./useTrackUpload"
import { UploadProgressBar } from "./UploadProgressBar"

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

/**
 * Set times past the hour we offer, same reasoning as the lists above. The
 * API takes any minutes 0–59 (up to twelve), so this can grow without a
 * backend change.
 */
const TIME_PRESETS: number[][] = [[0], [0, 30], [0, 15, 30, 45], [30]]

function timesKey(minutes: number[]): string {
  return [...minutes].sort((a, b) => a - b).join(",")
}

function timesLabel(minutes: number[]): string {
  const marks = [...minutes].sort((a, b) => a - b).map((m) => `:${String(m).padStart(2, "0")}`)
  return marks.length === 1 ? marks[0] : `${marks.slice(0, -1).join(", ")} and ${marks[marks.length - 1]}`
}

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
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()
  const [enabled, setEnabled] = useState(station.jingles_enabled)
  const [mode, setMode] = useState(station.jingle_mode)
  const [intervalMinutes, setIntervalMinutes] = useState(
    Math.round(station.jingle_interval_seconds / 60),
  )
  const [everyTracks, setEveryTracks] = useState(station.jingle_every_tracks)
  const [times, setTimes] = useState(timesKey(station.jingle_times.length > 0 ? station.jingle_times : [0]))
  const [jingles, setJingles] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  // Inline rather than a toast alone: with the list empty, a failed load
  // looked exactly like "No jingles yet" once the toast had gone.
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const locked = useAutoDjLocked()

  // Fetched on open rather than with the page: most visits to the library are
  // about the rotation, and this list is behind a button.
  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setLoadError(false)
    api
      .get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${station.slug}/tracks`, {
        params: { kind: "jingle" },
      })
      .then(({ data }) => {
        if (!cancelled) setJingles(data.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, station.slug, reloadKey])

  // Re-sync when the dialog is reopened after a save elsewhere (router.refresh
  // gives us a fresh station prop, but this component stays mounted).
  useEffect(() => {
    if (!open) return
    setEnabled(station.jingles_enabled)
    setMode(station.jingle_mode)
    setIntervalMinutes(Math.round(station.jingle_interval_seconds / 60))
    setEveryTracks(station.jingle_every_tracks)
    setTimes(timesKey(station.jingle_times.length > 0 ? station.jingle_times : [0]))
  }, [
    open,
    station.jingles_enabled,
    station.jingle_mode,
    station.jingle_interval_seconds,
    station.jingle_every_tracks,
    station.jingle_times,
  ])

  const handleUploaded = useCallback(
    (added: Track[]) => {
      setJingles((prev) => [...prev, ...added])
      onStorageChange(added.reduce((sum, t) => sum + t.file_size_bytes, 0))
    },
    [onStorageChange],
  )

  // Same endpoint as the rotation — `kind` is the only difference, which is
  // what keeps quota, tag reading and storage identical across both.
  const { progress, uploading, upload } = useTrackUpload({
    slug: station.slug,
    kind: "jingle",
    noun: "jingle",
    onUploaded: handleUploaded,
  })

  const handleDelete = useCallback(
    async (track: Track) => {
      const ok = await confirm({
        title: `Delete “${track.title}”?`,
        description: "It stops playing between tracks straight away. This can't be undone.",
        confirmLabel: "Delete jingle",
        destructive: true,
      })
      if (!ok) return

      setJingles((prev) => prev.filter((t) => t.id !== track.id))
      onStorageChange(-track.file_size_bytes)

      try {
        await api.delete(`/tracks/${track.id}`)
      } catch {
        toast.error("Delete failed. Refreshing…")
        // Back to the server's list, through the same load as opening does,
        // so a refetch that also fails lands on the inline error rather than
        // an unhandled rejection.
        setReloadKey((k) => k + 1)
      }
    },
    [onStorageChange, confirm],
  )

  async function handleSave() {
    setSaving(true)
    try {
      // Every mode's setting is sent, not just the active one, so switching
      // back later restores what the owner last chose rather than a default.
      await api.patch(`/stations/${station.slug}`, {
        jingles_enabled: enabled,
        jingle_mode: mode,
        jingle_interval_seconds: intervalMinutes * 60,
        jingle_every_tracks: everyTracks,
        jingle_times: times.split(",").map((m) => parseInt(m, 10)),
      })
      // No restart involved: AutoDJ reads these settings each time it picks
      // the next track, so a live station picks the change up from there.
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
  const enabledButEmpty = enabled && !loading && !loadError && jingles.length === 0

  const settingsChanged =
    enabled !== station.jingles_enabled ||
    mode !== station.jingle_mode ||
    intervalMinutes * 60 !== station.jingle_interval_seconds ||
    everyTracks !== station.jingle_every_tracks ||
    times !== timesKey(station.jingle_times.length > 0 ? station.jingle_times : [0])

  // A station saved with times outside the presets keeps them on offer.
  const timeOptions = TIME_PRESETS.some((preset) => timesKey(preset) === times)
    ? TIME_PRESETS
    : [...TIME_PRESETS, times.split(",").map((m) => parseInt(m, 10))]

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jingles</DialogTitle>
          <DialogDescription>
            Short clips that play between AutoDJ songs, like &ldquo;You&apos;re
            listening to&hellip;&rdquo;. Radio calls them station IDs
            and liners.
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
                <Select
                  aria-label="Minutes between jingles"
                  value={intervalMinutes}
                  onChange={setIntervalMinutes}
                  disabled={!enabled || mode !== "interval"}
                  className="w-36"
                  options={INTERVALS.map((minutes) => ({
                    value: minutes,
                    label: intervalLabel(minutes),
                  }))}
                />
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
                <Select
                  aria-label="Tracks between jingles"
                  value={everyTracks}
                  onChange={setEveryTracks}
                  disabled={!enabled || mode !== "tracks"}
                  className="w-36"
                  options={TRACK_COUNTS.map((count) => ({
                    value: count,
                    label: `${count} tracks`,
                  }))}
                />
              </label>

              <label
                className={`flex items-center gap-2 text-sm ${enabled ? "" : "opacity-50"}`}
              >
                <input
                  type="radio"
                  name="jingle-mode"
                  value="times"
                  checked={mode === "times"}
                  onChange={() => setMode("times")}
                  disabled={!enabled}
                  className="accent-primary"
                />
                <span>At</span>
                <Select
                  aria-label="Times past the hour"
                  value={times}
                  onChange={setTimes}
                  disabled={!enabled || mode !== "times"}
                  className="w-48"
                  options={timeOptions.map((minutes) => ({
                    value: timesKey(minutes),
                    label: `${timesLabel(minutes)} past the hour`,
                  }))}
                />
              </label>
            </div>

            <FieldDescription>
              {mode === "interval"
                ? "Predictable in real time — good for legal IDs and sponsor reads. It’s a minimum, never a cut: the jingle waits for the current track to finish, so on a station with long tracks the gap can run past this."
                : mode === "tracks"
                  ? "Even spacing through your rotation. It never cuts a song: the jingle waits for the current track to finish."
                  : "On the clock. Before each time, AutoDJ picks songs that end in time for the jingle. If none fits, the song before it fades out."}
            </FieldDescription>
            <FieldDescription>
              Changes apply live — your station stays on air.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {enabledButEmpty && (
          <p role="status" className="text-xs text-fault-text">
            You haven&apos;t uploaded any jingles yet, so nothing will play.
          </p>
        )}

        {/* The library half, split from the settings by a hairline rather
            than boxed: the dialog is already the panel. */}
        <section aria-labelledby="jingles-list-heading" className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="jingles-list-heading" className="text-sm font-medium">
              Your jingles
            </h3>
            {!loading && !loadError && jingles.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {jingles.length} {jingles.length === 1 ? "jingle" : "jingles"}
              </span>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!locked) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center gap-2 rounded-lg border border-dashed py-5 text-center transition-colors ${
              dragOver ? "border-violet/60 bg-violet-full/[0.06]" : "border-white/[0.12]"
            }`}
          >
            {/* While files are moving the meter replaces the icon and the
                headline outright — the spinner said nothing the bar doesn't say
                better, and stacking both left the zone twice as tall. */}
            {progress ? (
              <UploadProgressBar progress={progress} className="w-full px-4 text-left" />
            ) : (
              <>
                <IconUpload size={22} className="text-muted-foreground" />
                <div className="text-sm font-medium">
                  {locked
                    ? "Jingles need Pro"
                    : dragOver
                      ? "Drop to upload"
                      : "Drag jingles here"}
                </div>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={uploading || locked}
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
              order, so an ordering control here would be a lie. The floor
              height is the empty state's, so the loading → loaded swap does
              not move the footer. */}
          <div className="max-h-56 min-h-24 overflow-y-auto">
            {loading ? (
              <div role="status" className="flex min-h-24 items-center justify-center">
                <IconLoader2 size={18} className="animate-spin text-muted-foreground" />
                <span className="sr-only">Loading jingles</span>
              </div>
            ) : loadError ? (
              <div role="alert" className="flex min-h-24 flex-col items-center justify-center gap-2 text-center">
                <p className="text-xs text-fault-text">Couldn&apos;t load your jingles.</p>
                <Button type="button" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Button>
              </div>
            ) : jingles.length === 0 ? (
              <div className="flex min-h-24 flex-col items-center justify-center gap-1 text-center">
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
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {jingle.duration_seconds > 0
                      ? formatDuration(Math.round(jingle.duration_seconds))
                      : "—"}
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:inline">
                    {formatBytes(jingle.file_size_bytes)}
                  </span>
                  {/* Neutral: it only opens a confirm. A red icon on every row
                      made a healthy list look like a list of faults. */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Delete ${jingle.title}`}
                    onClick={() => void handleDelete(jingle)}
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !settingsChanged}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  )
}
