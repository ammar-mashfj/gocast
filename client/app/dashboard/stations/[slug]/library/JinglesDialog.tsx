"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconLoader2 } from "@tabler/icons-react"
import api from "@/lib/axios"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ds/Dialog"
import { Button } from "@/components/ds/Button"
import { Segmented } from "@/components/ds/Segmented"
import { Select } from "@/components/ds/Select"
import { SwitchRow } from "@/components/ds/Switch"
import { List, ListRow } from "@/components/ds/List"
import { CUSTOM, JINGLE_PRESETS, presetFor } from "./jinglePresets"
import { formatTrackTime } from "@/lib/format"
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
  /** Custom chosen explicitly, even while the values still match a preset. */
  const [customOpen, setCustomOpen] = useState(false)

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
    setCustomOpen(presetFor(station.jingle_mode, Math.round(station.jingle_interval_seconds / 60), station.jingle_every_tracks) === CUSTOM)
  }, [
    open,
    station.jingles_enabled,
    station.jingle_mode,
    station.jingle_interval_seconds,
    station.jingle_every_tracks,
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
        keepLabel: "Keep it",
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
  const enabledButEmpty = enabled && !loading && !loadError && jingles.length === 0

  const settingsChanged =
    enabled !== station.jingles_enabled ||
    mode !== station.jingle_mode ||
    intervalMinutes * 60 !== station.jingle_interval_seconds ||
    everyTracks !== station.jingle_every_tracks

  const choice = customOpen ? CUSTOM : presetFor(mode, intervalMinutes, everyTracks)

  function choose(key: string) {
    if (key === CUSTOM) {
      setCustomOpen(true)
      return
    }
    const preset = JINGLE_PRESETS.find((p) => p.key === key)
    if (!preset) return
    setCustomOpen(false)
    setMode(preset.mode)
    if (preset.mode === "interval") setIntervalMinutes(preset.value)
    else setEveryTracks(preset.value)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Jingles</DialogTitle>
          <DialogDescription>
            Short clips that play between AutoDJ songs, like “You’re listening to…”. They never cut
            into a song: each waits for the current track to finish.
          </DialogDescription>
        </DialogHeader>

        <SwitchRow
          title="Play jingles"
          description="Changes apply live — you stay on air."
          checked={enabled}
          onCheckedChange={setEnabled}
        />

        <div className={`flex flex-col gap-2 ${enabled ? "" : "opacity-45"}`}>
          <span className="text-body-sm font-semibold text-muted-foreground">At most once every</span>
          <Segmented
            aria-label="How often jingles play"
            value={choice}
            onChange={choose}
            options={[...JINGLE_PRESETS.map((p) => ({ value: p.key, label: p.label, disabled: !enabled })), { value: CUSTOM, label: "Custom", disabled: !enabled }]}
          />
          {choice === CUSTOM && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-well bg-card p-3">
              <Segmented
                aria-label="Count by"
                size="sm"
                className="w-48"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "interval", label: "Time", disabled: !enabled },
                  { value: "tracks", label: "Tracks", disabled: !enabled },
                ]}
              />
              {mode === "interval" ? (
                <Select
                  aria-label="Minutes between jingles"
                  className="w-40"
                  value={String(intervalMinutes)}
                  onChange={(v) => setIntervalMinutes(Number(v))}
                  disabled={!enabled}
                  options={INTERVALS.map((m) => ({ value: String(m), label: `Every ${intervalLabel(m)}` }))}
                />
              ) : (
                <Select
                  aria-label="Tracks between jingles"
                  className="w-40"
                  value={String(everyTracks)}
                  onChange={(v) => setEveryTracks(Number(v))}
                  disabled={!enabled}
                  options={TRACK_COUNTS.map((n) => ({ value: String(n), label: `Every ${n} tracks` }))}
                />
              )}
            </div>
          )}
          <p className="text-body-sm text-pretty text-text-faint">
            {mode === "interval"
              ? "Predictable on the clock — good for station IDs. With long tracks the gap can run a little over, because the jingle waits for the song to end."
              : "Even spacing between songs, whatever their length."}
          </p>
        </div>

        {enabledButEmpty && (
          <p role="status" className="text-body-sm text-fault-text">
            You haven’t uploaded any jingles yet, so nothing will play.
          </p>
        )}

        <section aria-labelledby="jingles-list-heading" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="jingles-list-heading" className="font-display text-body font-bold">Your jingles</h3>
            {!loading && !loadError && jingles.length > 0 && (
              <span className="font-mono text-caption text-text-faint">{jingles.length}</span>
            )}
          </div>

          {/* No reorder: Liquidsoap plays these in random order. The floor
              height is the empty state's, so loading doesn't move the footer. */}
          <div className="max-h-56 min-h-16 overflow-y-auto">
            {loading ? (
              <div role="status" className="flex min-h-16 items-center justify-center">
                <IconLoader2 className="size-4.5 animate-spin text-muted-foreground" />
                <span className="sr-only">Loading jingles</span>
              </div>
            ) : loadError ? (
              <div role="alert" className="flex min-h-16 flex-col items-center justify-center gap-2 text-center">
                <p className="text-body-sm text-fault-text">Couldn’t load your jingles.</p>
                <Button size="sm" variant="subtle" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>
              </div>
            ) : jingles.length === 0 ? (
              <p className="py-4 text-body-sm text-muted-foreground">No jingles yet. A station ID is usually 5–15 seconds.</p>
            ) : (
              <List>
                {jingles.map((jingle) => (
                  <ListRow
                    key={jingle.id}
                    title={jingle.title}
                    meta={jingle.original_filename}
                    trailing={
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="font-mono text-caption text-muted-foreground tabular-nums">
                          {jingle.duration_seconds > 0 ? formatTrackTime(Math.round(jingle.duration_seconds)) : "\u2014"}
                        </span>
                        <Button size="sm" variant="quiet" aria-label={`Delete ${jingle.title}`} onClick={() => void handleDelete(jingle)}>
                          Delete
                        </Button>
                      </span>
                    }
                  />
                ))}
              </List>
            )}
          </div>

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
            className={`flex flex-col items-center gap-2 rounded-well border-stroke border-dashed p-4.5 text-center transition-colors ${
              dragOver ? "border-foreground/40 bg-foreground/[0.04]" : "border-line-strong"
            }`}
          >
            {progress ? (
              <UploadProgressBar progress={progress} className="w-full text-left" />
            ) : (
              <button
                type="button"
                disabled={uploading || locked}
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-45"
              >
                {locked ? "Jingles need Pro" : dragOver ? "Drop to upload" : "Drop a clip here, or browse"}
              </button>
            )}
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
        </section>

        <DialogFooter>
          <Button size="lg" type="button" onClick={handleSave} disabled={saving || !settingsChanged}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  )
}
