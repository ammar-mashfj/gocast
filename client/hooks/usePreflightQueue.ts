"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { QUEUE_BYTE_LIMIT, readDurationFromFile, readTagsFromFile } from "@/lib/audioEngine"
import { clearQueue, loadPlayback, loadQueue, savePlayback, saveQueue, type PlaybackState } from "@/lib/queueStore"
import { fitFiles, moveTrack, removeTrack, type PreflightTrack } from "@/lib/preflightQueue"
import { formatBytes } from "@/lib/format"

type QueueState = { tracks: PreflightTrack[] | null; playback: PlaybackState | null }

/**
 * The saved running order, editable on pre-flight. Reads and writes the same
 * IndexedDB queue the studio's engine restores from, so what you line up
 * here is what plays when you go live.
 *
 * `tracks` is null while loading and stays null when storage is unavailable
 * (private mode, blocked): pre-flight then says so instead of showing an
 * empty list it can't save to.
 */
export function usePreflightQueue(slug: string) {
  const [tracks, setTracks] = useState<PreflightTrack[] | null>(null)
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [adding, setAdding] = useState(false)
  /**
   * The list as of the last write, for code that resumes after an await.
   * add() spends seconds reading tags, and the store answers after its own
   * wait; a Remove or Clear made meanwhile, or a length the loader filled
   * in, must not be overwritten by state captured before the wait.
   */
  const latest = useRef<QueueState>({ tracks: null, playback: null })

  const commit = useCallback((next: PreflightTrack[] | null, nextPlayback: PlaybackState | null) => {
    latest.current = { tracks: next, playback: nextPlayback }
    setTracks(next)
    setPlayback(nextPlayback)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Sequential: loadQueue may claim a legacy playback record that
        // loadPlayback must then see under this station.
        const stored = await loadQueue(slug)
        const pb = await loadPlayback(slug)
        if (cancelled) return
        const list = stored.map((t) => ({ id: t.id, file: t.file, title: t.title, artist: t.artist, duration: 0 }))
        commit(list, pb)
        // Lengths fill in behind the list: reading each header is cheap but
        // not free, and the list is useful before they arrive.
        for (const t of list) {
          const duration = await readDurationFromFile(t.file).catch(() => 0)
          if (cancelled) return
          const current = latest.current.tracks
          if (duration > 0 && current) {
            commit(current.map((x) => (x.id === t.id ? { ...x, duration } : x)), latest.current.playback)
          }
        }
      } catch {
        if (!cancelled) setUnavailable(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, commit])

  const persist = useCallback(
    async (next: PreflightTrack[], nextPlayback: PlaybackState | null) => {
      commit(next, nextPlayback)
      try {
        if (next.length === 0) {
          await clearQueue(slug)
          return
        }
        const { unreadable, unsaved } = await saveQueue(slug, next)
        if (nextPlayback) await savePlayback(slug, nextPlayback)

        // The store left these out of the saved order, so the list drops
        // them too: a track shown here that isn't there when the show
        // starts would be a lie. Taken out one by one so the saved spot
        // keeps pointing at the same song.
        const skipped = new Set([...unreadable, ...unsaved])
        if (skipped.size === 0) return
        let state = { tracks: latest.current.tracks ?? [], playback: latest.current.playback }
        const dropped = state.tracks.filter((t) => skipped.has(t.id))
        if (dropped.length === 0) return
        for (const t of dropped) state = removeTrack(state.tracks, state.playback, t.id)
        const playbackMoved = state.playback !== latest.current.playback
        commit(state.tracks, state.playback)
        if (playbackMoved && state.playback) await savePlayback(slug, state.playback)

        toast.warning(skippedMessage(dropped, new Set(unreadable)))
      } catch {
        toast.error("Couldn’t save your running order in this browser")
      }
    },
    [slug, commit],
  )

  async function add(files: FileList | File[]) {
    if (!latest.current.tracks) return
    const audio = Array.from(files).filter((f) => f.type.startsWith("audio/"))
    if (audio.length === 0) {
      toast.error("Those aren’t audio files. Add MP3, M4A, AAC, FLAC, OGG or WAV.")
      return
    }
    setAdding(true)
    try {
      const used = latest.current.tracks.reduce((s, t) => s + t.file.size, 0)
      const { fit, skipped } = fitFiles(audio, used, QUEUE_BYTE_LIMIT)
      // One file at a time, as AudioEngine.addFiles does: each length read
      // holds a media element, and Chrome refuses players past ~75 a page
      // (fewer on Android). Read all at once, a long drop records 0s for
      // the reads that error out or miss the metadata timeout.
      const read: PreflightTrack[] = []
      for (const file of fit) {
        const [duration, tags] = await Promise.all([readDurationFromFile(file).catch(() => 0), readTagsFromFile(file)])
        read.push({ id: crypto.randomUUID(), file, title: tags.title, artist: tags.artist, duration })
      }
      // Merged onto the list as it is now, not as it was when the files
      // were picked: the reads above take a while on a long list.
      await persist([...(latest.current.tracks ?? []), ...read], latest.current.playback)
      if (skipped.length > 0) {
        toast.error(`${skipped.length} ${skipped.length === 1 ? "file" : "files"} left out: the running order holds up to ${formatBytes(QUEUE_BYTE_LIMIT)}.`)
      }
    } finally {
      setAdding(false)
    }
  }

  function remove(id: string) {
    const { tracks: current, playback: pb } = latest.current
    if (!current) return
    const next = removeTrack(current, pb, id)
    void persist(next.tracks, next.playback)
  }

  function move(from: number, to: number) {
    const { tracks: current, playback: pb } = latest.current
    if (!current) return
    const next = moveTrack(current, pb, from, to)
    if (next.tracks === current) return
    void persist(next.tracks, next.playback)
  }

  async function clear() {
    await persist([], null)
  }

  /** The song the last show stopped in, and where — for "Pick up where you stopped". */
  const savedSpot =
    tracks && playback && tracks[playback.currentIndex]
      ? { track: tracks[playback.currentIndex], offset: Math.max(0, playback.offset) }
      : null

  return { tracks, unavailable, adding, add, remove, move, clear, savedSpot }
}

/**
 * What the host is told when the store left tracks out, in the words the
 * studio uses when its engine drops them (BroadcastContext's dropMessage).
 * One toast for the lot: a file that can't be read and one the browser
 * wouldn't keep both end the same way, out of the running order.
 */
function skippedMessage(dropped: PreflightTrack[], unreadable: Set<string>): string {
  const one = dropped.length === 1
  const what = one ? `"${dropped[0].title}"` : `${dropped.length} tracks`
  const allUnreadable = dropped.every((t) => unreadable.has(t.id))
  if (allUnreadable) {
    return `${what} couldn’t be read anymore and ${one ? "was" : "were"} taken out of the running order. Add the ${one ? "file" : "files"} again to play ${one ? "it" : "them"}.`
  }
  return `This browser couldn’t keep ${what} (storage may be full), so ${one ? "it was" : "they were"} left out of the running order.`
}
