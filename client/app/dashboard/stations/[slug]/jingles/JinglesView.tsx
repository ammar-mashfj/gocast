"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useResyncOnHistoryNav } from "@/hooks/useResyncOnHistoryNav"
import { toast } from "sonner"
import { IconLoader2, IconPlus } from "@tabler/icons-react"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import { formatBytes, formatTrackTime } from "@/lib/format"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { List, ListRow } from "@/components/ds/List"
import { Notice } from "@/components/ds/Notice"
import { PageHeader } from "@/components/ds/PageHeader"
import { Segmented } from "@/components/ds/Segmented"
import { Select } from "@/components/ds/Select"
import { SwitchRow } from "@/components/ds/Switch"
import { ProTag } from "@/components/ds/Tag"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { AutoDjUpsell } from "../library/AutoDjUpsell"
import { AUDIO_ACCEPT } from "../library/upload"
import { useTrackUpload } from "../library/useTrackUpload"
import { UploadProgressBar } from "../library/UploadProgressBar"
import { CUSTOM, JINGLE_PRESETS, presetFor } from "./jinglePresets"

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

const savedTimes = (station: Station) => timesKey(station.jingle_times.length > 0 ? station.jingle_times : [0])

/**
 * The Jingles page, one of the AutoDJ sections: the clips on one side and
 * when they play on the other (stacked below lg). It was a dialog behind a
 * button on Library; it has two halves that both want room, and a page can
 * be linked to.
 *
 * Jingles are uploaded through the same endpoint as music (kind "jingle"),
 * so they share the station's one storage cap, shown under the header.
 */
export function JinglesView({
  station,
  initialJingles,
  initialMeta,
}: {
  station: Station
  initialJingles: Track[]
  initialMeta: LibraryMeta
}) {
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()
  const locked = useAutoDjLocked()
  const [enabled, setEnabled] = useState(station.jingles_enabled)
  const [mode, setMode] = useState(station.jingle_mode)
  const [intervalMinutes, setIntervalMinutes] = useState(Math.round(station.jingle_interval_seconds / 60))
  const [everyTracks, setEveryTracks] = useState(station.jingle_every_tracks)
  const [times, setTimes] = useState(savedTimes(station))
  /** Custom chosen explicitly, even while the values still match a preset. */
  const [customOpen, setCustomOpen] = useState(
    () => presetFor(station.jingle_mode, Math.round(station.jingle_interval_seconds / 60), station.jingle_every_tracks) === CUSTOM,
  )
  const [jingles, setJingles] = useState(initialJingles)
  const [storageUsed, setStorageUsed] = useState(initialMeta.storage_used_bytes)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploaded = useCallback((added: Track[]) => {
    setJingles((prev) => [...prev, ...added])
    setStorageUsed((used) => used + added.reduce((sum, t) => sum + t.file_size_bytes, 0))
  }, [])

  // Same endpoint as the rotation — `kind` is the only difference, which is
  // what keeps quota, tag reading and storage identical across both.
  const { progress, uploading, upload } = useTrackUpload({
    slug: station.slug,
    kind: "jingle",
    noun: "jingle",
    onUploaded: handleUploaded,
  })

  async function refetch() {
    try {
      const { data } = await api.get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${station.slug}/tracks`, { params: { kind: "jingle" } })
      setJingles(data.data)
      setStorageUsed(data.meta.storage_used_bytes)
    } catch {
      toast.error("Couldn’t reload your jingles. Refresh the page.")
    }
  }

  // Back/forward re-seeds this page from its first props: a jingle deleted
  // before leaving would be listed again.
  useResyncOnHistoryNav(() => void refetch())

  async function handleDelete(track: Track) {
    const ok = await confirm({
      title: `Delete “${track.title}”?`,
      description: "It stops playing between tracks straight away. This can't be undone.",
      confirmLabel: "Delete jingle",
      keepLabel: "Keep it",
      tone: "danger",
    })
    if (!ok) return

    setJingles((prev) => prev.filter((t) => t.id !== track.id))
    setStorageUsed((used) => used - track.file_size_bytes)

    try {
      await api.delete(`/tracks/${track.id}`)
      toast.success("Jingle deleted.")
    } catch {
      toast.error("Delete failed. Refreshing…")
      void refetch()
    }
  }

  const settingsChanged =
    enabled !== station.jingles_enabled ||
    mode !== station.jingle_mode ||
    intervalMinutes * 60 !== station.jingle_interval_seconds ||
    everyTracks !== station.jingle_every_tracks ||
    times !== savedTimes(station)

  useEffect(() => {
    if (!settingsChanged) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [settingsChanged])

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
      toast.success(enabled ? "Jingles on. Starts after the next song." : "Jingles turned off.")
      // The saved values arrive back as the station prop, which is what
      // "changed" is measured against.
      router.refresh()
    } catch {
      toast.error("Couldn't save jingle settings.")
    } finally {
      setSaving(false)
    }
  }

  // Turning jingles on with an empty list is a setting that does nothing.
  // Say so rather than letting the owner discover the silence.
  const enabledButEmpty = enabled && jingles.length === 0

  // A station saved with times outside the presets keeps them on offer.
  const timeOptions = TIME_PRESETS.some((preset) => timesKey(preset) === times)
    ? TIME_PRESETS
    : [...TIME_PRESETS, times.split(",").map((m) => parseInt(m, 10))]

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

  const stats = [
    `${jingles.length} ${jingles.length === 1 ? "jingle" : "jingles"}`,
    locked ? "plays only on Pro" : null,
    // One cap covers music and jingles.
    `${formatBytes(storageUsed)} of ${formatBytes(initialMeta.storage_cap_bytes)}`,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-5.5">
      <PageHeader
        title="Jingles"
        aside={locked ? <ProTag /> : <HelpLink article="upload-your-music" label="jingles and uploading clips" />}
        description="Short clips that play between AutoDJ songs, like “You’re listening to…”. Radio calls them station IDs and liners."
        // Phones: the one action spans the row, like Library's Add tracks.
        actionsClassName="max-sm:w-full max-sm:*:flex-1"
        actions={
          !locked && (
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
              {uploading ? "Uploading…" : "Add jingles"}
            </Button>
          )
        }
      />
      <p className="-mt-3.5 font-mono text-body-sm tracking-wider text-text-faint uppercase">{stats.join(" · ")}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files)
          e.target.value = ""
        }}
      />

      {locked && <AutoDjUpsell stationName={station.name} />}

      {/* Set times run on the station clock, and with no timezone that
          clock is UTC (JingleClock's fallback). */}
      {!locked && enabled && mode === "times" && !station.timezone && (
        <Notice tone="warn" label="No timezone">
          Set times follow UTC until your station has a timezone.{" "}
          <Link href={`/dashboard/stations/${station.slug}/schedule`} className="underline underline-offset-2">
            Set it on Schedule
          </Link>
          .
        </Notice>
      )}

      {/* lg: the row is as tall as "When they play"; the jingles card fills
          it (h-0 + min-h-full keeps its own content out of the sizing) and
          its list scrolls inside rather than stretching the page. */}
      <div className="grid items-start gap-5 lg:grid-cols-2 lg:items-stretch">
        {/* The drop target is the whole card. */}
        <Card
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragOver && !locked) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!locked && e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
          }}
          className={cn(
            "outline-offset-4 transition-[outline-color] lg:h-0 lg:min-h-full",
            dragOver ? "outline-2 outline-dashed outline-line-strong" : "outline-transparent",
          )}
        >
          <CardHeader title="Your jingles" aside="Played in random order" />
          {progress && <UploadProgressBar progress={progress} />}
          {jingles.length === 0 ? (
            // Dashed drop box with a mouse; on a touch screen there's no
            // dragging files, so a plain empty state and a Choose button.
            <div className="flex flex-col items-center gap-3 rounded-well px-4 py-8 text-center pointer-fine:border-stroke pointer-fine:border-dashed pointer-fine:border-line-strong pointer-coarse:bg-surface-inset">
              <p className="text-body-sm text-muted-foreground">No jingles yet. A station ID is usually 5–15 seconds.</p>
              {!locked && (
                <Button size="sm" variant="subtle" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <span className="pointer-coarse:hidden">Drop clips here, or browse</span>
                  <span className="pointer-fine:hidden">Choose clips</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <List>
              {jingles.map((jingle) => (
                <ListRow
                  key={jingle.id}
                  title={jingle.title}
                  meta={jingle.original_filename}
                  trailing={
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-caption text-muted-foreground tabular-nums">
                        {jingle.duration_seconds > 0 ? formatTrackTime(Math.round(jingle.duration_seconds)) : "—"}
                      </span>
                      <Button size="sm" variant="quiet" aria-label={`Delete ${jingle.title}`} onClick={() => void handleDelete(jingle)}>
                        Delete
                      </Button>
                    </span>
                  }
                />
              ))}
            </List>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="When they play" />
          <SwitchRow
            title="Play jingles"
            description="Changes apply live — you stay on air."
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={locked}
          />

          <div className={cn("flex flex-col gap-2", !enabled && "opacity-45")}>
            <span className="text-body-sm font-semibold text-muted-foreground">
              {mode === "times" ? "On the clock" : "At most once every"}
            </span>
            {/* Phones: five choices in one row were slivers, so two rows
                of three, Custom taking the last two places. */}
            <Segmented
              aria-label="How often jingles play"
              className="max-sm:grid-flow-row max-sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2"
              value={choice}
              onChange={choose}
              options={[...JINGLE_PRESETS.map((p) => ({ value: p.key, label: p.label, disabled: !enabled })), { value: CUSTOM, label: "Custom", disabled: !enabled }]}
            />
            {choice === CUSTOM && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-well bg-surface-inset p-3">
                <Segmented
                  aria-label="Count by"
                  size="sm"
                  className="w-full sm:w-48"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "interval", label: "Time", disabled: !enabled },
                    { value: "tracks", label: "Tracks", disabled: !enabled },
                    { value: "times", label: "Clock", disabled: !enabled },
                  ]}
                />
                {mode === "times" ? (
                  <Select
                    aria-label="Times past the hour"
                    className="w-full sm:w-48"
                    value={times}
                    onChange={setTimes}
                    disabled={!enabled}
                    options={timeOptions.map((minutes) => ({
                      value: timesKey(minutes),
                      label: `At ${timesLabel(minutes)} past the hour`,
                    }))}
                  />
                ) : mode === "interval" ? (
                  <Select
                    aria-label="Minutes between jingles"
                    className="w-full sm:w-auto sm:min-w-48 sm:flex-1"
                    value={String(intervalMinutes)}
                    onChange={(v) => setIntervalMinutes(Number(v))}
                    disabled={!enabled}
                    options={INTERVALS.map((m) => ({ value: String(m), label: `Every ${intervalLabel(m)}` }))}
                  />
                ) : (
                  <Select
                    aria-label="Tracks between jingles"
                    className="w-full sm:w-auto sm:min-w-48 sm:flex-1"
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
                : mode === "tracks"
                  ? "Even spacing between songs, whatever their length."
                  : "On the clock. Before each time, AutoDJ picks songs that end in time for the jingle. If none fits, the song before it fades out."}
            </p>
          </div>

          {enabledButEmpty && (
            <p role="status" className="text-body-sm text-fault-text">
              You haven’t uploaded any jingles yet, so nothing will play.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {settingsChanged && !saving && <span role="status" className="text-body-sm text-fault-text">Unsaved changes</span>}
            <Button onClick={handleSave} disabled={locked || saving || !settingsChanged}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      </div>

      {!locked && (
        <p className="max-w-[34rem] text-body-sm text-pretty text-text-faint">
          <span className="pointer-coarse:hidden">Drop MP3, M4A, AAC, FLAC, OGG or WAV clips anywhere on the list.</span>
          <span className="pointer-fine:hidden">MP3, M4A, AAC, FLAC, OGG or WAV clips.</span>{" "}
          They count toward the same storage as your library.
        </p>
      )}

      {confirmDialog}
    </div>
  )
}
