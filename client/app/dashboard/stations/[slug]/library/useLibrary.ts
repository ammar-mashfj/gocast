"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { toast } from "sonner"
import api from "@/lib/axios"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { LIBRARY_KEY } from "./PlaylistRail"
import type { TrackEditFields } from "./TrackRow"
import { useTrackUpload } from "./useTrackUpload"

/** Renumber a member list after anything that changes it, so `position` stays what the # column shows. */
function renumber(list: Track[]): Track[] {
  return list.map((t, i) => (t.position === i + 1 ? t : { ...t, position: i + 1 }))
}

/** Which AutoDJ page the hook serves: Library (every file) or Playlists. */
export type LibraryPage = "library" | "playlists"

/**
 * The Library and Playlists pages' state: the library and the playlists
 * built from it, kept agreeing.
 *
 * Two lists describe the same tracks — the library (every file, with which
 * playlists it is in) and each playlist's members (a subset, in play order) —
 * so every edit is applied to both here, optimistically, and refetched on
 * failure. The views only render and call these.
 */
export function useLibrary(
  page: LibraryPage,
  station: Station,
  initialTracks: Track[],
  initialMeta: LibraryMeta,
  initialPlaylists: Playlist[],
) {
  const [confirm, confirmDialog] = useConfirm()
  const slug = station.slug
  const [tracks, setTracks] = useState<Track[]>(initialTracks)
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists)
  const [meta, setMeta] = useState<LibraryMeta>(initialMeta)
  const [members, setMembers] = useState<Record<string, Track[]>>({})
  // Playlists whose member fetch failed. Without this the entry stays
  // undefined, the effect below never retries, and the view spins forever.
  const [memberErrors, setMemberErrors] = useState<Set<string>>(() => new Set())
  // Library is always the whole library; Playlists opens on the default.
  const [selected, setSelected] = useState<string>(() =>
    page === "library" ? LIBRARY_KEY : (initialPlaylists.find((p) => p.is_default)?.id ?? initialPlaylists[0]?.id ?? LIBRARY_KEY),
  )
  const [savingOrder, setSavingOrder] = useState(false)

  /**
   * AutoDJ is not on this plan. Uploading and creating playlists are what this
   * locks — listing, reordering, editing and deleting all stay live, matching
   * the API exactly. A downgrade must never trap someone's files behind a
   * paywall, and a library someone can still curate is a much better argument
   * for upgrading than one they've been locked out of.
   */
  const locked = useAutoDjLocked()

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
    if (memberErrors.has(id)) return
    let cancelled = false
    api
      .get<{ data: Track[] }>(`/playlists/${id}/tracks`)
      .then(({ data }) => {
        if (!cancelled) setMembers((prev) => ({ ...prev, [id]: data.data }))
      })
      .catch(() => {
        if (cancelled) return
        toast.error("Couldn't load that playlist.")
        setMemberErrors((prev) => new Set(prev).add(id))
      })
    return () => {
      cancelled = true
    }
  }, [currentPlaylist, members, memberErrors])

  /** Clear a failed fetch so the effect above tries again. */
  const retryMembers = useCallback((id: string) => {
    setMemberErrors((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

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
        await Promise.allSettled([refetchLibrary(), currentPlaylist ? refetchMembers(currentPlaylist.id) : null])
      }
    },
    [refetchLibrary, refetchMembers, currentPlaylist],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const target = tracks.find((t) => t.id === id)
      if (!target) return
      const ok = await confirm({
        title: `Delete “${target.title}”?`,
        description: "It leaves every playlist too. This can't be undone.",
        confirmLabel: "Delete track",
        keepLabel: "Keep it",
      })
      if (!ok) return

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
        await Promise.allSettled([refetchLibrary(), currentPlaylist ? refetchMembers(currentPlaylist.id) : null])
      }
    },
    [tracks, bumpPlaylist, applyStorageDelta, refetchLibrary, refetchMembers, currentPlaylist, confirm],
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

      const deleted = `Deleted ${targets.length} track${targets.length === 1 ? "" : "s"}`
      try {
        const { data } = await api.delete<{ data: Track[]; meta: LibraryMeta }>(
          `/stations/${slug}/tracks`,
          { data: { track_ids: ids } },
        )
        setTracks(data.data)
        setMeta(data.meta)
      } catch {
        toast.error("Delete failed. Refreshing…")
        await Promise.allSettled([
          refetchLibrary(),
          refetchPlaylists(),
          currentPlaylist ? refetchMembers(currentPlaylist.id) : null,
        ])
        return
      }
      // The delete landed. The rail's per-playlist counts and the open
      // playlist's membership both moved; neither is in the response. A
      // failure here is a stale list, not a failed delete, and says so.
      try {
        await refetchPlaylists()
        if (currentPlaylist) await refetchMembers(currentPlaylist.id)
        toast.success(`${deleted}.`)
      } catch {
        toast.error(`${deleted}, but the list didn't refresh.`)
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
    async (playlistId: string, ids: string[]): Promise<boolean> => {
      if (ids.length === 0) return true

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
        return true
      } catch {
        toast.error("Couldn't add those tracks.")
        return false
      }
    },
    [playlistNames],
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
        await Promise.allSettled([refetchMembers(playlist.id), refetchLibrary()])
      }
    },
    [currentPlaylist, members, bumpPlaylist, refetchMembers, refetchLibrary],
  )

  const handleAddFromLibrary = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const playlist = currentPlaylist
      if (!playlist) return true
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
        return true
      } catch {
        toast.error("Couldn't add those tracks.")
        return false
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
        await refetchMembers(playlist.id).catch(() => undefined)
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

  const createPlaylist = useCallback(
    async (name: string) => {
      const { data } = await api.post<{ data: Playlist }>(`/stations/${slug}/playlists`, { name })
      setPlaylists((prev) => [...prev, data.data])
      setMembers((prev) => ({ ...prev, [data.data.id]: [] }))
      setSelected(data.data.id)
      toast.success(`Created ${data.data.name}.`)
    },
    [slug],
  )

  const renamePlaylist = useCallback(async (playlist: Playlist, name: string) => {
    const { data } = await api.patch<{ data: Playlist }>(`/playlists/${playlist.id}`, { name })
    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, name: data.data.name } : p)))
  }, [])

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
    // Slots that play this playlist go with it (the API cascades them), so
    // the owner hears about that here rather than from a gap in the week.
    const slotCount = (station.autodj_slots ?? []).filter((s) => s.playlist_id === playlist.id).length
    const slotNote =
      slotCount === 0
        ? ""
        : ` ${slotCount === 1 ? "The schedule slot that plays it is" : `The ${slotCount} schedule slots that play it are`} removed too.`
    const ok = await confirm({
      title: `Delete “${playlist.name}”?`,
      description: `The tracks stay in your library.${slotNote}`,
      confirmLabel: "Delete playlist",
      keepLabel: "Keep playlist",
    })
    if (!ok) return
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
      await Promise.allSettled([refetchPlaylists(), refetchLibrary()])
    }
  }, [currentPlaylist, defaultPlaylist, station.autodj_slots, refetchPlaylists, refetchLibrary, confirm])

  // ---- derived ----------------------------------------------------------

  /**
   * Untagged tracks in what is on screen, not in the whole library. The
   * banner used to count the library everywhere, so a playlist with every
   * artist filled in still said "12 tracks have no artist tag" and "Fix tags"
   * opened a list of rows that weren't in it. A playlist whose members are
   * still loading counts as none rather than borrowing the library's number.
   */
  const untaggedInView = useMemo(() => {
    if (currentPlaylist === null) return tracks.filter((t) => !t.artist)
    return (members[currentPlaylist.id] ?? []).filter((t) => !t.artist)
  }, [currentPlaylist, members, tracks])
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


  const pickerCandidates = useMemo(() => {
    if (!currentPlaylist) return []
    const inside = new Set((members[currentPlaylist.id] ?? []).map((t) => t.id))
    return tracks.filter((t) => !inside.has(t.id))
  }, [currentPlaylist, members, tracks])


  return {
    slug,
    locked,
    tracks,
    playlists,
    meta,
    members,
    memberErrors,
    retryMembers,
    selected,
    setSelected,
    savingOrder,
    defaultPlaylist,
    currentPlaylist,
    playlistNames,
    untaggedInView,
    totalSeconds,
    nowPlayingId,
    usagePct,
    pickerCandidates,
    progress,
    uploading,
    upload,
    applyStorageDelta,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleBulkAddToPlaylist,
    applyTagFixes,
    handleRemove,
    handleAddFromLibrary,
    handleReorder,
    toggleOrder,
    createPlaylist,
    renamePlaylist,
    setDefault,
    deletePlaylist,
    confirmDialog,
  }
}
