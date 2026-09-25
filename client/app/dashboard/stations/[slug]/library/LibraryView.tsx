"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { toast } from "sonner"
import {
  IconCheck,
  IconLoader2,
  IconMicrophone,
  IconPlus,
  IconSparkles,
} from "@tabler/icons-react"
import api from "@/lib/axios"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatBytes, formatDuration } from "@/lib/format"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { AddToPlaylistDialog } from "./AddToPlaylistDialog"
import { AllTracksView } from "./AllTracksView"
import { AutoDjUpsell } from "./AutoDjUpsell"
import { FixTagsDialog } from "./FixTagsDialog"
import { JinglesDialog } from "./JinglesDialog"
import { PlaylistRail, LIBRARY_KEY } from "./PlaylistRail"
import { PlaylistView } from "./PlaylistView"
import { TrackPicker } from "./TrackPicker"
import type { TrackEditFields } from "./TrackRow"
import { AUDIO_ACCEPT } from "./upload"
import { useTrackUpload } from "./useTrackUpload"
import { UploadProgressBar } from "./UploadProgressBar"
import { HelpLink } from "@/components/dashboard/HelpLink"

interface Props {
  station: Station
  initialTracks: Track[]
  initialMeta: LibraryMeta
  initialPlaylists: Playlist[]
}

/** Renumber a member list after anything that changes it, so `position` stays what the # column shows. */
function renumber(list: Track[]): Track[] {
  return list.map((t, i) => (t.position === i + 1 ? t : { ...t, position: i + 1 }))
}

type NameDialog = { mode: "create" } | { mode: "rename"; playlist: Playlist } | null

/**
 * The AutoDJ screen: the library on one side, the playlists built from it on
 * the other, and one set of state that keeps them agreeing.
 *
 * Two lists describe the same tracks — the library (every file, with which
 * playlists it is in) and each playlist's members (a subset, in play order) —
 * so every edit is applied to both here rather than in whichever view the
 * click landed in. The views are presentational and receive callbacks.
 */
export function LibraryView({ station, initialTracks, initialMeta, initialPlaylists }: Props) {
  const slug = station.slug
  const [tracks, setTracks] = useState<Track[]>(initialTracks)
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists)
  const [meta, setMeta] = useState<LibraryMeta>(initialMeta)
  const [members, setMembers] = useState<Record<string, Track[]>>({})
  const [selected, setSelected] = useState<string>(
    () => initialPlaylists.find((p) => p.is_default)?.id ?? LIBRARY_KEY,
  )
  const [dragOver, setDragOver] = useState(false)
  const [jinglesOpen, setJinglesOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [nameDialog, setNameDialog] = useState<NameDialog>(null)
  /** The library selection waiting for a playlist to be chosen; null = closed. */
  const [bulkAddIds, setBulkAddIds] = useState<string[] | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [fixTagsOpen, setFixTagsOpen] = useState(false)
  const [tagBannerDismissed, setTagBannerDismissed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * AutoDJ is not on this plan. Uploading and creating playlists are what this
   * locks — listing, reordering, editing and deleting all stay live, matching
   * the API exactly. A downgrade must never trap someone's files behind a
   * paywall, and a library someone can still curate is a much better argument
   * for upgrading than one they've been locked out of.
   */
  const locked = useAutoDjLocked()

  // The dashboard's single request dialog, mounted by the layout.
  const proRequest = useProRequest()

  // Which row is on air. Polled at the hook's own pace.
  const { status } = useStationStatus(slug)

  const defaultPlaylist = useMemo(() => playlists.find((p) => p.is_default) ?? null, [playlists])
  const currentPlaylist = useMemo(
    () => (selected === LIBRARY_KEY ? null : (playlists.find((p) => p.id === selected) ?? null)),
    [selected, playlists],
  )
  const playlistNames = useMemo(() => new Map(playlists.map((p) => [p.id, p.name])), [playlists])

  // A playlist's members are fetched the first time it is opened and kept
  // after that, updated in place by every edit below.
  useEffect(() => {
    if (currentPlaylist === null || members[currentPlaylist.id] !== undefined) return
    const id = currentPlaylist.id
    let cancelled = false
    api
      .get<{ data: Track[] }>(`/playlists/${id}/tracks`)
      .then(({ data }) => {
        if (!cancelled) setMembers((prev) => ({ ...prev, [id]: data.data }))
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load that playlist.")
      })
    return () => {
      cancelled = true
    }
  }, [currentPlaylist, members])

  const refetchMembers = useCallback(async (id: string) => {
    const { data } = await api.get<{ data: Track[] }>(`/playlists/${id}/tracks`)
    setMembers((prev) => ({ ...prev, [id]: data.data }))
  }, [])

  const refetchLibrary = useCallback(async () => {
    const { data } = await api.get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`)
    setTracks(data.data)
    setMeta(data.meta)
  }, [slug])

  const refetchPlaylists = useCallback(async () => {
    const { data } = await api.get<{ data: Playlist[] }>(`/stations/${slug}/playlists`)
    setPlaylists(data.data)
  }, [slug])

  const applyStorageDelta = useCallback((deltaBytes: number) => {
    setMeta((prev) => ({ ...prev, storage_used_bytes: prev.storage_used_bytes + deltaBytes }))
  }, [])

  /** Keep the rail's counts honest without a refetch. */
  const bumpPlaylist = useCallback((id: string, deltaCount: number, deltaSeconds: number) => {
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              track_count: Math.max(0, (p.track_count ?? 0) + deltaCount),
              duration_seconds: Math.max(0, (p.duration_seconds ?? 0) + deltaSeconds),
            }
          : p,
      ),
    )
  }, [])

  // ---- uploads ---------------------------------------------------------

  /**
   * Applied per batch so a long drop fills the list as it goes. The server
   * says which playlists each new row joined, so both lists can be updated
   * without a round trip.
   */
  const handleUploaded = useCallback(
    (added: Track[]) => {
      setTracks((prev) => [...prev, ...added])
      applyStorageDelta(added.reduce((sum, t) => sum + t.file_size_bytes, 0))
      for (const track of added) {
        for (const id of track.playlist_ids ?? []) {
          bumpPlaylist(id, 1, track.duration_seconds ?? 0)
          setMembers((prev) =>
            prev[id] === undefined
              ? prev
              : { ...prev, [id]: renumber([...prev[id], { ...track, playlist_ids: undefined }]) },
          )
        }
      }
    },
    [applyStorageDelta, bumpPlaylist],
  )

  const { progress, uploading, upload } = useTrackUpload({
    slug,
    playlistId: currentPlaylist?.id ?? null,
    noun: "track",
    onUploaded: handleUploaded,
  })

  function pickFiles() {
    if (locked) return
    fileInputRef.current?.click()
  }

  // ---- track edits (both lists) ----------------------------------------

  const handleEdit = useCallback(
    async (id: string, fields: TrackEditFields) => {
      const patch = (t: Track) => (t.id === id ? ({ ...t, ...fields } as Track) : t)
      setTracks((prev) => prev.map(patch))
      setMembers((prev) => Object.fromEntries(Object.entries(prev).map(([k, list]) => [k, list.map(patch)])))
      try {
        await api.patch(`/tracks/${id}`, fields)
      } catch {
        toast.error("Save failed. Refreshing…")
        await refetchLibrary()
        if (currentPlaylist) await refetchMembers(currentPlaylist.id)
      }
    },
    [refetchLibrary, refetchMembers, currentPlaylist],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const target = tracks.find((t) => t.id === id)
      if (!target) return
      // TODO: replace with shadcn AlertDialog
      if (!window.confirm(`Delete "${target.title}"? It leaves every playlist too. This can't be undone.`)) return

      setTracks((prev) => prev.filter((t) => t.id !== id))
      setMembers((prev) =>
        Object.fromEntries(Object.entries(prev).map(([k, list]) => [k, renumber(list.filter((t) => t.id !== id))])),
      )
      for (const pid of target.playlist_ids ?? []) bumpPlaylist(pid, -1, -(target.duration_seconds ?? 0))
      applyStorageDelta(-target.file_size_bytes)

      try {
        await api.delete(`/tracks/${id}`)
        toast.success("Track deleted.")
      } catch {
        toast.error("Delete failed. Refreshing…")
        await refetchLibrary()
        if (currentPlaylist) await refetchMembers(currentPlaylist.id)
      }
    },
    [tracks, bumpPlaylist, applyStorageDelta, refetchLibrary, refetchMembers, currentPlaylist],
  )

  /**
   * Delete every selected file in one request.
   *
   * Not a loop over handleDelete: each single delete rewrites the station's
   * playlist file and reloads Liquidsoap, so twenty of them is twenty reloads
   * of a station that may be on air. The bulk endpoint does that work once.
   *
   * Optimistic first so a long list clears immediately, then the server's own
   * library replaces it — after a batch, the counts and the storage meter are
   * exactly what nobody should be guessing at.
   */
  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      const set = new Set(ids)
      const targets = tracks.filter((t) => set.has(t.id))
      if (targets.length === 0) return

      setTracks((prev) => prev.filter((t) => !set.has(t.id)))
      setMembers((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([k, list]) => [k, renumber(list.filter((t) => !set.has(t.id)))]),
        ),
      )
      for (const track of targets) {
        for (const pid of track.playlist_ids ?? []) {
          bumpPlaylist(pid, -1, -(track.duration_seconds ?? 0))
        }
      }
      applyStorageDelta(-targets.reduce((sum, t) => sum + t.file_size_bytes, 0))

      try {
        const { data } = await api.delete<{ data: Track[]; meta: LibraryMeta }>(
          `/stations/${slug}/tracks`,
          { data: { track_ids: ids } },
        )
        setTracks(data.data)
        setMeta(data.meta)
        toast.success(`Deleted ${targets.length} track${targets.length === 1 ? "" : "s"}.`)
        // The rail's per-playlist counts and the open playlist's membership
        // both moved; neither is in the response.
        await refetchPlaylists()
        if (currentPlaylist) await refetchMembers(currentPlaylist.id)
      } catch {
        toast.error("Delete failed. Refreshing…")
        await refetchLibrary()
        await refetchPlaylists()
        if (currentPlaylist) await refetchMembers(currentPlaylist.id)
      }
    },
    [
      tracks,
      slug,
      bumpPlaylist,
      applyStorageDelta,
      refetchLibrary,
      refetchPlaylists,
      refetchMembers,
      currentPlaylist,
    ],
  )

  /**
   * Put the library's selection into a playlist chosen in the dialog.
   *
   * One POST for the whole set — the endpoint has always taken a list, and it
   * ignores tracks already in the playlist, so overlapping selections need no
   * special case here.
   */
  const handleBulkAddToPlaylist = useCallback(
    async (playlistId: string) => {
      const ids = bulkAddIds ?? []
      if (ids.length === 0) return

      try {
        const { data } = await api.post<{ data: Track[] }>(`/playlists/${playlistId}/tracks`, {
          track_ids: ids,
        })
        setMembers((prev) => ({ ...prev, [playlistId]: data.data }))
        const set = new Set(ids)
        setTracks((prev) =>
          prev.map((t) =>
            set.has(t.id) && !(t.playlist_ids ?? []).includes(playlistId)
              ? { ...t, playlist_ids: [...(t.playlist_ids ?? []), playlistId] }
              : t,
          ),
        )
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  track_count: data.data.length,
                  duration_seconds: data.data.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0),
                }
              : p,
          ),
        )
        const name = playlistNames.get(playlistId) ?? "the playlist"
        toast.success(`Added ${ids.length} track${ids.length === 1 ? "" : "s"} to ${name}.`)
      } catch {
        toast.error("Couldn't add those tracks.")
        throw new Error("add failed")
      }
    },
    [bulkAddIds, playlistNames],
  )

  const applyTagFixes = useCallback((updates: Array<{ id: string; artist: string }>) => {
    const byId = new Map(updates.map((u) => [u.id, u.artist]))
    const patch = (t: Track) => (byId.has(t.id) ? { ...t, artist: byId.get(t.id)! } : t)
    setTracks((prev) => prev.map(patch))
    setMembers((prev) => Object.fromEntries(Object.entries(prev).map(([k, list]) => [k, list.map(patch)])))
  }, [])

  // ---- membership -------------------------------------------------------

  const handleRemove = useCallback(
    async (trackId: string) => {
      const playlist = currentPlaylist
      if (!playlist) return
      const removed = members[playlist.id]?.find((t) => t.id === trackId)
      setMembers((prev) => ({ ...prev, [playlist.id]: renumber((prev[playlist.id] ?? []).filter((t) => t.id !== trackId)) }))
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, playlist_ids: (t.playlist_ids ?? []).filter((id) => id !== playlist.id) } : t,
        ),
      )
      bumpPlaylist(playlist.id, -1, -(removed?.duration_seconds ?? 0))
      try {
        await api.delete(`/playlists/${playlist.id}/tracks/${trackId}`)
      } catch {
        toast.error("Couldn't remove it. Refreshing…")
        await refetchMembers(playlist.id)
        await refetchLibrary()
      }
    },
    [currentPlaylist, members, bumpPlaylist, refetchMembers, refetchLibrary],
  )

  const handleAddFromLibrary = useCallback(
    async (ids: string[]) => {
      const playlist = currentPlaylist
      if (!playlist) return
      try {
        const { data } = await api.post<{ data: Track[] }>(`/playlists/${playlist.id}/tracks`, { track_ids: ids })
        setMembers((prev) => ({ ...prev, [playlist.id]: data.data }))
        const set = new Set(ids)
        setTracks((prev) =>
          prev.map((t) =>
            set.has(t.id) && !(t.playlist_ids ?? []).includes(playlist.id)
              ? { ...t, playlist_ids: [...(t.playlist_ids ?? []), playlist.id] }
              : t,
          ),
        )
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlist.id
              ? {
                  ...p,
                  track_count: data.data.length,
                  duration_seconds: data.data.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0),
                }
              : p,
          ),
        )
        toast.success(`Added ${ids.length} track${ids.length === 1 ? "" : "s"} to ${playlist.name}.`)
      } catch {
        toast.error("Couldn't add those tracks.")
        throw new Error("add failed")
      }
    },
    [currentPlaylist],
  )

  const handleReorder = useCallback(
    async (ids: string[]) => {
      const playlist = currentPlaylist
      if (!playlist) return
      setMembers((prev) => {
        const byId = new Map((prev[playlist.id] ?? []).map((t) => [t.id, t]))
        return { ...prev, [playlist.id]: renumber(ids.map((id) => byId.get(id)!).filter(Boolean)) }
      })
      try {
        await api.patch(`/playlists/${playlist.id}/tracks/reorder`, { ids })
      } catch {
        toast.error("Couldn't save order. Refreshing…")
        await refetchMembers(playlist.id)
      }
    },
    [currentPlaylist, refetchMembers],
  )

  // ---- playlists --------------------------------------------------------

  /**
   * Flip a playlist between sequential and shuffle. Optimistic, and safe to
   * be: the setting is read per track by the scheduler and never rendered
   * into the .liq, so nothing restarts and no listener hears the switch. The
   * change lands on the NEXT track boundary — the container has already been
   * handed the song it is about to play.
   */
  const toggleOrder = useCallback(async () => {
    const playlist = currentPlaylist
    if (!playlist || locked || savingOrder) return
    const next = playlist.order === "shuffle" ? "sequential" : "shuffle"
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, order: next } : p)))
    setSavingOrder(true)
    try {
      await api.patch(`/playlists/${playlist.id}`, { order: next })
      toast.success(
        next === "shuffle"
          ? "Shuffling. Every track plays once before any repeats."
          : "Back to play order, top to bottom.",
        { description: "Takes effect after the track that's on air now." },
      )
    } catch {
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, order: playlist.order } : p)))
      toast.error("Couldn't change the play order.")
    } finally {
      setSavingOrder(false)
    }
  }, [currentPlaylist, locked, savingOrder])

  const submitName = useCallback(
    async (name: string) => {
      if (nameDialog === null) return
      if (nameDialog.mode === "create") {
        const { data } = await api.post<{ data: Playlist }>(`/stations/${slug}/playlists`, { name })
        setPlaylists((prev) => [...prev, data.data])
        setMembers((prev) => ({ ...prev, [data.data.id]: [] }))
        setSelected(data.data.id)
        toast.success(`Created ${data.data.name}.`)
      } else {
        const { playlist } = nameDialog
        const { data } = await api.patch<{ data: Playlist }>(`/playlists/${playlist.id}`, { name })
        setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, name: data.data.name } : p)))
      }
    },
    [nameDialog, slug],
  )

  const setDefault = useCallback(async () => {
    const playlist = currentPlaylist
    if (!playlist || playlist.is_default) return
    const previous = playlists
    setPlaylists((prev) => prev.map((p) => ({ ...p, is_default: p.id === playlist.id })))
    try {
      await api.patch(`/playlists/${playlist.id}`, { is_default: true })
      toast.success(`${playlist.name} is now the default.`, {
        description: "It plays whenever nothing else is scheduled, and new uploads land in it.",
      })
    } catch {
      setPlaylists(previous)
      toast.error("Couldn't change the default.")
    }
  }, [currentPlaylist, playlists])

  const deletePlaylist = useCallback(async () => {
    const playlist = currentPlaylist
    if (!playlist || playlist.is_default) return
    // TODO: replace with shadcn AlertDialog
    // Slots that play this playlist go with it (the API cascades them), so
    // the owner hears about that here rather than from a gap in the week.
    const slotCount = (station.autodj_slots ?? []).filter((s) => s.playlist_id === playlist.id).length
    const slotNote =
      slotCount === 0
        ? ""
        : ` ${slotCount === 1 ? "The schedule slot that plays it is" : `The ${slotCount} schedule slots that play it are`} removed too.`
    if (!window.confirm(`Delete "${playlist.name}"? The tracks stay in your library.${slotNote}`)) return
    setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id))
    setMembers((prev) => {
      const next = { ...prev }
      delete next[playlist.id]
      return next
    })
    setTracks((prev) =>
      prev.map((t) => ({ ...t, playlist_ids: (t.playlist_ids ?? []).filter((id) => id !== playlist.id) })),
    )
    setSelected(defaultPlaylist?.id ?? LIBRARY_KEY)
    try {
      await api.delete(`/playlists/${playlist.id}`)
      toast.success(`Deleted ${playlist.name}.`)
    } catch {
      toast.error("Couldn't delete it. Refreshing…")
      const { data } = await api.get<{ data: Playlist[] }>(`/stations/${slug}/playlists`)
      setPlaylists(data.data)
      await refetchLibrary()
    }
  }, [currentPlaylist, defaultPlaylist, slug, station.autodj_slots, refetchLibrary])

  // ---- derived ----------------------------------------------------------

  const untagged = useMemo(() => tracks.filter((t) => !t.artist), [tracks])
  const totalSeconds = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0), [tracks])

  /**
   * The row that is on air. `now_playing` carries no track id, so this
   * matches on title + artist — exactly what StationStatusController::upNext()
   * does server-side. Restricted to the AutoDJ source, since a live
   * broadcaster's metadata has nothing to do with the rotation.
   */
  const nowPlayingId = useMemo(() => {
    const np = status?.now_playing
    if (!np || status?.source !== "autodj") return null
    const match = tracks.find((t) => t.title === np.title && (t.artist ?? null) === (np.artist ?? null))
    return match?.id ?? null
  }, [status, tracks])

  const usagePct = Math.min(100, (meta.storage_used_bytes / meta.storage_cap_bytes) * 100)

  const stats = [
    `${tracks.length} track${tracks.length === 1 ? "" : "s"}`,
    totalSeconds > 0 ? `${formatDuration(Math.round(totalSeconds))} of music` : null,
    `${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`,
    locked ? "plays only on Pro" : null,
    `${formatBytes(meta.storage_used_bytes)} of ${formatBytes(meta.storage_cap_bytes)} used`,
  ].filter(Boolean) as string[]

  const pickerCandidates = useMemo(() => {
    if (!currentPlaylist) return []
    const inside = new Set((members[currentPlaylist.id] ?? []).map((t) => t.id))
    return tracks.filter((t) => !inside.has(t.id))
  }, [currentPlaylist, members, tracks])

  const belowToolbar = (
    <>
      {/* Progress sits between the toolbar and the storage meter: in the
          panel the files are landing in, and above the bar that is about to
          move because of them. */}
      {progress && (
        <UploadProgressBar progress={progress} className="border-b border-border bg-primary/5 px-4 py-2.5" />
      )}

      {/* Storage, reduced to the one pixel row it earns. */}
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
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setTagBannerDismissed(true)}>
            Dismiss
          </Button>
        </div>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[280px] flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
              Music
              <HelpLink
                article="upload-your-music"
                label="file formats, size limits and where uploads land"
              />
            </h1>
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
              dialog that could work. Disabled outright rather than opened
              onto a screen of dead controls. */}
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
              <span>{proRequest.requested ? "Request sent" : "Upgrade to enable AutoDJ"}</span>
            </Button>
          ) : (
            <Button
              onClick={pickFiles}
              disabled={uploading}
              title={
                currentPlaylist
                  ? `Uploads join ${currentPlaylist.name}.`
                  : `Uploads join ${defaultPlaylist?.name ?? "the default playlist"}.`
              }
            >
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
              Preview of the playlist editor
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-start">
        <PlaylistRail
          playlists={playlists}
          libraryCount={tracks.length}
          selected={selected}
          onSelect={setSelected}
          onCreate={() => setNameDialog({ mode: "create" })}
          locked={locked}
        />

        {/* The whole panel is the drop target: dragging files anywhere over
            the list uploads them into whatever is being looked at. */}
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
            "flex-1 min-w-0 w-full rounded-xl border overflow-hidden transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border bg-card",
          )}
        >
          {currentPlaylist ? (
            <PlaylistView
              key={currentPlaylist.id}
              playlist={currentPlaylist}
              tracks={members[currentPlaylist.id] ?? null}
              locked={locked}
              uploading={uploading}
              savingOrder={savingOrder}
              nowPlayingId={nowPlayingId}
              onPickFiles={pickFiles}
              onAddFromLibrary={() => setPickerOpen(true)}
              onReorder={handleReorder}
              onRemove={handleRemove}
              onEdit={handleEdit}
              onToggleOrder={toggleOrder}
              onRename={() => setNameDialog({ mode: "rename", playlist: currentPlaylist })}
              onSetDefault={setDefault}
              onDelete={deletePlaylist}
              belowToolbar={belowToolbar}
            />
          ) : (
            <AllTracksView
              tracks={tracks}
              playlistNames={playlistNames}
              locked={locked}
              uploading={uploading}
              nowPlayingId={nowPlayingId}
              onPickFiles={pickFiles}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onBulkDelete={handleBulkDelete}
              onBulkAdd={setBulkAddIds}
              belowToolbar={belowToolbar}
            />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
        {locked && "On Pro: "}
        MP3, M4A, AAC, FLAC, OGG and WAV up to 300 MB per file. A track can be in any number of
        playlists; the default playlist plays whenever nothing else is scheduled. Station IDs and
        liners belong under{" "}
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
        so they interleave between tracks instead of joining a playlist.
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

      {currentPlaylist && (
        <TrackPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          playlistName={currentPlaylist.name}
          candidates={pickerCandidates}
          onAdd={handleAddFromLibrary}
        />
      )}

      <AddToPlaylistDialog
        open={bulkAddIds !== null}
        onClose={() => setBulkAddIds(null)}
        count={bulkAddIds?.length ?? 0}
        playlists={playlists}
        onAdd={handleBulkAddToPlaylist}
      />

      <PlaylistNameDialog dialog={nameDialog} onClose={() => setNameDialog(null)} onSubmit={submitName} />
    </div>
  )
}

interface NameDialogProps {
  dialog: NameDialog
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}

/** One small dialog for both "New playlist" and "Rename": a name, and a button. */
function PlaylistNameDialog({ dialog, onClose, onSubmit }: NameDialogProps) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = dialog !== null
  const initial = dialog?.mode === "rename" ? dialog.playlist.name : ""

  useEffect(() => {
    if (open) {
      setName(initial)
      setError(null)
      setSaving(false)
    }
  }, [open, initial])

  async function submit() {
    const trimmed = name.trim()
    if (trimmed === "" || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      onClose()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { errors?: { name?: string[] } } } })?.response?.data?.errors?.name?.[0] ??
        "Couldn't save that name."
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "rename" ? "Rename playlist" : "New playlist"}</DialogTitle>
          <DialogDescription>
            {dialog?.mode === "rename"
              ? "Listeners never see this; it is for you."
              : "A playlist is a set of tracks with its own play order. Fill it from your library, or upload straight into it."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Morning Calm"
            maxLength={60}
            autoFocus
            aria-label="Playlist name"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit()
            }}
          />
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={name.trim() === "" || saving}>
            {saving ? "Saving…" : dialog?.mode === "rename" ? "Rename" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
