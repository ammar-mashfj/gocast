"use client"

import { useRef, useState } from "react"
import { IconLoader2, IconPlus } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { formatAirtime, formatBytes } from "@/lib/format"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { Button } from "@/components/ds/Button"
import { DropdownMenuItem } from "@/components/ds/Menu"
import { PageHeader } from "@/components/ds/PageHeader"
import { ProgressBar } from "@/components/ds/Progress"
import { ProTag } from "@/components/ds/Tag"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { AddToPlaylistDialog } from "./AddToPlaylistDialog"
import { AllTracksView } from "./AllTracksView"
import { AutoDjStrip } from "./AutoDjStrip"
import { AutoDjUpsell } from "./AutoDjUpsell"
import { FixTagsDialog } from "./FixTagsDialog"
import { JinglesDialog } from "./JinglesDialog"
import { PlaylistNameDialog, type NameDialog } from "./PlaylistNameDialog"
import { PlaylistRail } from "./PlaylistRail"
import { PlaylistView } from "./PlaylistView"
import { TrackPicker } from "./TrackPicker"
import { AUDIO_ACCEPT } from "./upload"
import { UploadProgressBar } from "./UploadProgressBar"
import { useLibrary } from "./useLibrary"

/**
 * The AutoDJ page: what AutoDJ is doing (with its switch), the library and
 * the playlists built from it, side by side. All state and every edit is in
 * `useLibrary`; this lays it out and owns which dialog is open.
 *
 * On a plan without AutoDJ the editor still renders, read-only for uploads
 * and new playlists, under the upsell — the tracks are the clearest
 * explanation of what AutoDJ would do with them, and a downgrade never traps
 * anyone's files.
 */
export function LibraryView({
  station,
  initialTracks,
  initialMeta,
  initialPlaylists,
}: {
  station: Station
  initialTracks: Track[]
  initialMeta: LibraryMeta
  initialPlaylists: Playlist[]
}) {
  const lib = useLibrary(station, initialTracks, initialMeta, initialPlaylists)
  const { locked, currentPlaylist, defaultPlaylist } = lib

  const [dragOver, setDragOver] = useState(false)
  const [jinglesOpen, setJinglesOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [nameDialog, setNameDialog] = useState<NameDialog>(null)
  /** The library selection waiting for a playlist to be chosen; null = closed. */
  const [bulkAddIds, setBulkAddIds] = useState<string[] | null>(null)
  const [fixTagsOpen, setFixTagsOpen] = useState(false)
  const [tagNoteDismissed, setTagNoteDismissed] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const stats = [
    `${lib.tracks.length} ${lib.tracks.length === 1 ? "track" : "tracks"}`,
    lib.totalSeconds > 0 ? formatAirtime(Math.round(lib.totalSeconds)) : null,
    `${lib.playlists.length} ${lib.playlists.length === 1 ? "playlist" : "playlists"}`,
    // Free can hold a library but AutoDJ won't play it: said where the counts are.
    locked ? "plays only on Pro" : null,
    `${formatBytes(lib.meta.storage_used_bytes)} of ${formatBytes(lib.meta.storage_cap_bytes)}`,
  ].filter(Boolean)

  const untagged = lib.untaggedInView.length

  // Under each view's toolbar: an upload in flight, storage, and untagged
  // tracks — in that order, nearest the files they're about.
  const belowToolbar = (
    <>
      {lib.progress && <UploadProgressBar progress={lib.progress} className="border-t border-line bg-surface-raised px-5.5 py-3" />}
      <ProgressBar
        value={lib.usagePct / 100}
        tone={lib.usagePct >= 95 ? "live" : "onair"}
        label={`Storage: ${formatBytes(lib.meta.storage_used_bytes)} of ${formatBytes(lib.meta.storage_cap_bytes)} used`}
        className="h-0.75 rounded-none"
      />
      {untagged > 0 && !tagNoteDismissed && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5.5 py-3 text-body-sm">
          <span className="min-w-55 flex-1 text-muted-foreground">
            {untagged} {untagged === 1 ? "track" : "tracks"}
            {currentPlaylist ? " in this playlist" : ""} {untagged === 1 ? "has" : "have"} no artist. Listeners see “Unknown artist”.
          </span>
          <Button size="sm" variant="subtle" onClick={() => setFixTagsOpen(true)}>Fix tags</Button>
          <Button size="sm" variant="quiet" onClick={() => setTagNoteDismissed(true)}>Dismiss</Button>
        </div>
      )}
    </>
  )

  // Library-wide actions, in each view's ⋯ menu.
  const menuItems = (
    <>
      <DropdownMenuItem onClick={() => setJinglesOpen(true)} disabled={locked}>
        Jingles
        <span className="ml-auto">{locked ? <ProTag /> : station.jingles_enabled && <span className="text-caption text-text-faint">On</span>}</span>
      </DropdownMenuItem>
      {untagged > 0 && (
        <DropdownMenuItem onClick={() => setFixTagsOpen(true)}>
          Fix artist tags
          <span className="ml-auto font-mono text-caption text-text-faint tabular-nums">{untagged}</span>
        </DropdownMenuItem>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-5.5">
      <PageHeader
        title="AutoDJ"
        aside={
          <>
            {locked && <ProTag />}
            <HelpLink article="playlists-and-the-rotation" label="how AutoDJ and playlists work" />
          </>
        }
        description="Plays your music whenever you’re not live, so the station keeps going when you step away."
        actions={
          !locked && (
            <>
              <Button variant="ghost" onClick={() => setJinglesOpen(true)}>Jingles</Button>
              <Button
                onClick={() => fileInput.current?.click()}
                disabled={lib.uploading}
                title={`Uploads join ${currentPlaylist?.name ?? defaultPlaylist?.name ?? "the default playlist"}.`}
              >
                {lib.uploading ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
                {lib.uploading ? "Uploading…" : "Add tracks"}
              </Button>
            </>
          )
        }
      />
      <p className="-mt-3.5 font-mono text-body-sm tracking-wider text-text-faint uppercase">{stats.join(" · ")}</p>

      <input
        ref={fileInput}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void lib.upload(e.target.files)
          e.target.value = ""
        }}
      />

      {locked ? (
        <>
          <AutoDjUpsell stationName={station.name} />
          {/* Names the editor below for what it is, so it doesn't read as the feature working. */}
          <div className="flex items-center gap-3">
            <span className="shrink-0 eyebrow text-text-faint">Preview of the playlist editor</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : (
        <AutoDjStrip station={station} status={lib.status} loading={lib.statusLoading} />
      )}

      <div className="flex min-w-0 flex-col items-stretch gap-5 md:flex-row md:items-start">
        <PlaylistRail
          playlists={lib.playlists}
          libraryCount={lib.tracks.length}
          selected={lib.selected}
          onSelect={lib.setSelected}
          onCreate={() => setNameDialog({ mode: "create" })}
          locked={locked}
        />

        {/* The whole card is the drop target: files dropped anywhere on it
            upload into whatever is open. */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragOver && !locked) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files.length > 0) void lib.upload(e.dataTransfer.files)
          }}
          className={cn(
            "w-full min-w-0 flex-1 rounded-card bg-card outline-offset-4 transition-[outline-color]",
            dragOver ? "outline-2 outline-dashed outline-line-strong" : "outline-transparent",
          )}
        >
          {currentPlaylist ? (
            <PlaylistView
              key={currentPlaylist.id}
              playlist={currentPlaylist}
              tracks={lib.members[currentPlaylist.id] ?? null}
              locked={locked}
              savingOrder={lib.savingOrder}
              nowPlayingId={lib.nowPlayingId}
              onAddFromLibrary={() => setPickerOpen(true)}
              onReorder={lib.handleReorder}
              onRemove={lib.handleRemove}
              onEdit={lib.handleEdit}
              onToggleOrder={lib.toggleOrder}
              onRename={() => setNameDialog({ mode: "rename", playlist: currentPlaylist })}
              onSetDefault={lib.setDefault}
              onDelete={lib.deletePlaylist}
              belowToolbar={belowToolbar}
              menuItems={menuItems}
            />
          ) : (
            <AllTracksView
              tracks={lib.tracks}
              playlistNames={lib.playlistNames}
              locked={locked}
              nowPlayingId={lib.nowPlayingId}
              onEdit={lib.handleEdit}
              onDelete={lib.handleDelete}
              onBulkDelete={lib.handleBulkDelete}
              onBulkAdd={setBulkAddIds}
              belowToolbar={belowToolbar}
              menuItems={menuItems}
            />
          )}
        </div>
      </div>

      <p className="max-w-[34rem] text-body-sm text-pretty text-text-faint">
        {locked ? "On Pro, drop" : "Drop"} MP3, M4A, AAC, FLAC, OGG or WAV files anywhere on the list, up to 300 MB each. A track can be in any
        number of playlists; the default one plays when nothing else is scheduled.{" "}
        <HelpLink article="upload-your-music" label="file formats and size limits for uploads" className="align-middle" />
      </p>

      <JinglesDialog open={jinglesOpen} onClose={() => setJinglesOpen(false)} station={station} onStorageChange={lib.applyStorageDelta} />
      <FixTagsDialog open={fixTagsOpen} onClose={() => setFixTagsOpen(false)} tracks={lib.untaggedInView} onSaved={lib.applyTagFixes} />
      {currentPlaylist && (
        <TrackPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          playlistName={currentPlaylist.name}
          candidates={lib.pickerCandidates}
          libraryEmpty={lib.tracks.length === 0}
          onAdd={lib.handleAddFromLibrary}
        />
      )}
      <AddToPlaylistDialog
        open={bulkAddIds !== null}
        onClose={() => setBulkAddIds(null)}
        count={bulkAddIds?.length ?? 0}
        playlists={lib.playlists}
        onAdd={(playlistId) => lib.handleBulkAddToPlaylist(playlistId, bulkAddIds ?? [])}
      />
      <PlaylistNameDialog
        dialog={nameDialog}
        onClose={() => setNameDialog(null)}
        onSubmit={(name) =>
          nameDialog?.mode === "rename" ? lib.renamePlaylist(nameDialog.playlist, name) : lib.createPlaylist(name)
        }
      />
      {lib.confirmDialog}
    </div>
  )
}
