"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { IconChevronLeft, IconLoader2, IconPlus } from "@tabler/icons-react"
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
import { AutoDjUpsell } from "./AutoDjUpsell"
import { FixTagsDialog } from "./FixTagsDialog"
import { PlaylistNameDialog, type NameDialog } from "./PlaylistNameDialog"
import { PlaylistPhoneList, PlaylistRail } from "./PlaylistRail"
import { PlaylistView } from "./PlaylistView"
import { TrackPicker } from "./TrackPicker"
import { AUDIO_ACCEPT } from "./upload"
import { UploadProgressBar } from "./UploadProgressBar"
import { useLibrary, type LibraryPage } from "./useLibrary"

/**
 * Two of the AutoDJ pages, sharing one state: Library (every file, full
 * width) and Playlists (the playlist list beside the open playlist). All state and every edit is in `useLibrary`;
 * this lays it out and owns which dialog is open.
 *
 * On a plan without AutoDJ the editor still renders, read-only for uploads
 * and new playlists, under the upsell — the tracks are the clearest
 * explanation of what AutoDJ would do with them, and a downgrade never traps
 * anyone's files.
 */
export function LibraryView({
  page,
  station,
  initialTracks,
  initialMeta,
  initialPlaylists,
  openPlaylistId,
}: {
  page: LibraryPage
  /** Playlists: open this one rather than the default. */
  openPlaylistId?: string
  station: Station
  initialTracks: Track[]
  initialMeta: LibraryMeta
  initialPlaylists: Playlist[]
}) {
  const lib = useLibrary(page, station, initialTracks, initialMeta, initialPlaylists, openPlaylistId)
  const { locked, currentPlaylist, defaultPlaylist } = lib

  // ── Phones and tablets: a list, then one playlist on its own screen ──
  // The open playlist is ?playlist=<id>, written with the History API (no
  // server round trip), so the phone's Back returns to the list. From lg
  // the rail and the playlist share the screen and this is ignored.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const openId = searchParams.get("playlist")
  const phoneDetail = openId !== null && lib.playlists.some((p) => p.id === openId)
  const pushedDetail = useRef(false)
  const { setSelected, prefetchMembers } = lib
  /** Where the list was scrolled, to put it back there on return. */
  const listScroll = useRef(0)

  function openOnPhone(id: string) {
    listScroll.current = window.scrollY
    setSelected(id)
    window.history.pushState(null, "", `${pathname}?playlist=${id}`)
    pushedDetail.current = true
  }

  // Scroll once the new screen has been drawn, never before it: scrolling
  // first showed the list jumping to the top, then the playlist replacing it.
  const wasDetail = useRef(phoneDetail)
  useLayoutEffect(() => {
    if (page !== "playlists" || wasDetail.current === phoneDetail) return
    wasDetail.current = phoneDetail
    if (window.matchMedia("(min-width: 64rem)").matches) return
    // (x, y), not { behavior: "instant" }: older Safari throws on that value.
    window.scrollTo(0, phoneDetail ? 0 : listScroll.current)
  }, [page, phoneDetail])

  // While the phone list is up, load every playlist's tracks in the
  // background, so a tap opens a finished playlist rather than a spinner.
  const playlistIds = lib.playlists.map((p) => p.id).join(",")
  useEffect(() => {
    if (page !== "playlists" || phoneDetail || window.matchMedia("(min-width: 64rem)").matches) return
    void prefetchMembers(playlistIds.split(",").filter(Boolean))
  }, [page, phoneDetail, playlistIds, prefetchMembers])

  function backToList() {
    // Back where we pushed, so the history doesn't fill with list entries;
    // a deep link (the status band's Open playlist) has nothing to go back to.
    if (pushedDetail.current) window.history.back()
    else window.history.replaceState(null, "", pathname)
    pushedDetail.current = false
  }

  // The URL leads: Back/forward between list and playlist, and a deep link.
  useEffect(() => {
    if (page !== "playlists" || openId === null) return
    if (lib.playlists.some((p) => p.id === openId)) setSelected(openId)
    // A deleted playlist's URL: back to the list.
    else window.history.replaceState(null, "", pathname)
  }, [page, openId, lib.playlists, setSelected, pathname])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [nameDialog, setNameDialog] = useState<NameDialog>(null)
  /** The library selection waiting for a playlist to be chosen; null = closed. */
  const [bulkAddIds, setBulkAddIds] = useState<string[] | null>(null)
  const [fixTagsOpen, setFixTagsOpen] = useState(false)
  const [tagNoteDismissed, setTagNoteDismissed] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const trackCount = `${lib.tracks.length} ${lib.tracks.length === 1 ? "track" : "tracks"}`
  // Library only. Playlists had "2 playlists · from 2 tracks", which read as
  // nonsense; the picker and the playlist's own header carry its numbers.
  const stats = [
    trackCount,
    lib.totalSeconds > 0 ? formatAirtime(Math.round(lib.totalSeconds)) : null,
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
        // Phones: the sentence, then the two buttons sharing a row beneath it.
        // From sm: one row, buttons on the right.
        <div className="flex flex-col gap-3 border-t border-line px-5.5 py-3 text-body-sm sm:flex-row sm:items-center">
          <span className="flex-1 text-pretty text-muted-foreground">
            {untagged} {untagged === 1 ? "track" : "tracks"}
            {currentPlaylist ? " in this playlist" : ""} {untagged === 1 ? "has" : "have"} no artist. Listeners see “Unknown artist”.
          </span>
          <div className="flex shrink-0 gap-2 max-sm:*:flex-1">
            <Button size="sm" variant="subtle" onClick={() => setFixTagsOpen(true)}>Fix tags</Button>
            <Button size="sm" variant="quiet" onClick={() => setTagNoteDismissed(true)}>Dismiss</Button>
          </div>
        </div>
      )}
    </>
  )

  // Library-wide actions, in each view's ⋯ menu. Null when there are none,
  // so the menu (or its separator) isn't drawn empty. Jingles moved to their
  // own page.
  const menuItems = untagged > 0 && (
    <DropdownMenuItem onClick={() => setFixTagsOpen(true)}>
      Fix artist tags
      <span className="ml-auto font-mono text-caption text-text-faint tabular-nums">{untagged}</span>
    </DropdownMenuItem>
  )

  return (
    <div className="flex flex-col gap-5.5">
      <PageHeader
        // A playlist open on a phone is its own screen: "All playlists" and
        // the playlist's name head it, not the list's header again.
        className={page === "playlists" && phoneDetail ? "max-lg:hidden" : undefined}
        title={page === "library" ? "Library" : "Playlists"}
        aside={
          <>
            {locked && <ProTag />}
            {page === "library" ? (
              <HelpLink article="upload-your-music" label="uploading music to your library" />
            ) : (
              <HelpLink article="playlists-and-the-rotation" label="how AutoDJ and playlists work" />
            )}
          </>
        }
        description={
          page === "library"
            ? "Every track you’ve uploaded. AutoDJ plays them from your playlists whenever you’re not live."
            : "What AutoDJ plays, in order or shuffled. The default playlist plays whenever nothing else is scheduled."
        }
        // Phones: the header button sits on its own row under the
        // description, so it spans it. On Playlists the header makes
        // playlists; adding tracks is the open playlist's own button.
        actionsClassName="max-sm:w-full max-sm:*:flex-1"
        actions={
          !locked && (
            page === "playlists" ? (
              <Button onClick={() => setNameDialog({ mode: "create" })}>
                <IconPlus />
                New playlist
              </Button>
            ) : (
              <Button
                onClick={() => fileInput.current?.click()}
                disabled={lib.uploading}
                title={`Uploads join ${currentPlaylist?.name ?? defaultPlaylist?.name ?? "the default playlist"}.`}
              >
                {lib.uploading ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
                {lib.uploading ? "Uploading…" : "Add tracks"}
              </Button>
            )
          )
        }
      />
      {page === "library" && <p className="-mt-3.5 font-mono text-body-sm tracking-wider text-text-faint uppercase">{stats.join(" · ")}</p>}

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

      {locked && (
        <>
          <AutoDjUpsell stationName={station.name} />
          {/* Names the editor below for what it is, so it doesn't read as the feature working. */}
          <div className="flex items-center gap-3">
            <span className="shrink-0 eyebrow text-text-faint">{page === "library" ? "Preview of your library" : "Preview of the playlist editor"}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {page === "library" ? (
        <DropZone locked={locked} onFiles={lib.upload}>
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
        </DropZone>
      ) : (
        <div className="flex min-w-0 flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:gap-5">
          <PlaylistRail
            playlists={lib.playlists}
            selected={lib.selected}
            onSelect={(id) => {
              // Keep the URL on the open playlist, or the effect above would
              // pull the selection back to an older ?playlist.
              setSelected(id)
              window.history.replaceState(null, "", `${pathname}?playlist=${id}`)
            }}
          />
          {!phoneDetail && (
            <div className="lg:hidden">
              <PlaylistPhoneList playlists={lib.playlists} onOpen={openOnPhone} />
            </div>
          )}
          {phoneDetail && (
            <button
              type="button"
              onClick={backToList}
              className="-ml-1 flex w-fit cursor-pointer items-center gap-1 rounded-control py-1 pr-2 text-body-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <IconChevronLeft aria-hidden className="size-4.5" />
              All playlists
            </button>
          )}
          <DropZone locked={locked} onFiles={lib.upload} className={phoneDetail ? undefined : "max-lg:hidden"}>
            {currentPlaylist ? (
              <PlaylistView
                key={currentPlaylist.id}
                playlist={currentPlaylist}
                index={lib.playlists.findIndex((p) => p.id === currentPlaylist.id)}
                tracks={lib.members[currentPlaylist.id] ?? null}
                loadFailed={lib.memberErrors.has(currentPlaylist.id)}
                onRetry={() => lib.retryMembers(currentPlaylist.id)}
                locked={locked}
                savingOrder={lib.savingOrder}
                nowPlayingId={lib.nowPlayingId}
                onAddFromLibrary={() => setPickerOpen(true)}
                onUpload={() => fileInput.current?.click()}
                uploading={lib.uploading}
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
              <p className="px-5.5 py-10 text-center text-body text-muted-foreground">
                No playlists yet. Make one to choose what AutoDJ plays.
              </p>
            )}
          </DropZone>
        </div>
      )}

      <p className="max-w-[34rem] text-body-sm text-pretty text-text-faint">
        {locked ? "On Pro, drop" : "Drop"} MP3, M4A, AAC, FLAC, OGG or WAV files anywhere on the list, up to 300 MB each.{" "}
        {page === "library"
          ? "They join the default playlist; add them to others from here or from Playlists."
          : "They join the open playlist. A track can be in any number of playlists."}{" "}
        <HelpLink article="upload-your-music" label="file formats and size limits for uploads" className="align-middle" />
      </p>

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
        onSubmit={(name, color) =>
          nameDialog?.mode === "rename"
            ? lib.renamePlaylist(nameDialog.playlist, name, color)
            : lib.createPlaylist(name, color).then((created) => {
                // On a phone, straight into the new playlist to fill it.
                if (!window.matchMedia("(min-width: 64rem)").matches) openOnPhone(created.id)
              })
        }
      />
      {lib.confirmDialog}
    </div>
  )
}

/** The list's card, and the drop target: files dropped anywhere on it upload. */
function DropZone({ locked, onFiles, className, children }: { locked: boolean; onFiles: (files: FileList) => unknown; className?: string; children: React.ReactNode }) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver && !locked) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) void onFiles(e.dataTransfer.files)
      }}
      className={cn(
        "w-full min-w-0 flex-1 rounded-card bg-card outline-offset-4 transition-[outline-color]",
        dragOver ? "outline-2 outline-dashed outline-line-strong" : "outline-transparent",
        className,
      )}
    >
      {children}
    </div>
  )
}
