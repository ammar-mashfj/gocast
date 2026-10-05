"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { QUEUE_BYTE_LIMIT, readDurationFromFile, readTagsFromFile } from "@/lib/audioEngine"
import { clearQueue, loadPlayback, loadQueue, savePlayback, saveQueue, type PlaybackState } from "@/lib/queueStore"
import { fitFiles, removeTrack, type PreflightTrack } from "@/lib/preflightQueue"
import { formatBytes } from "@/lib/format"

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
        setTracks(list)
        setPlayback(pb)
        // Lengths fill in behind the list: reading each header is cheap but
        // not free, and the list is useful before they arrive.
        for (const t of list) {
          const duration = await readDurationFromFile(t.file).catch(() => 0)
          if (cancelled) return
          if (duration > 0) setTracks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, duration } : x)) ?? prev)
        }
      } catch {
        if (!cancelled) setUnavailable(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const persist = useCallback(
    async (next: PreflightTrack[], nextPlayback: PlaybackState | null) => {
      setTracks(next)
      setPlayback(nextPlayback)
      try {
        if (next.length === 0) await clearQueue(slug)
        else {
          await saveQueue(slug, next)
          if (nextPlayback) await savePlayback(slug, nextPlayback)
        }
      } catch {
        toast.error("Couldn’t save your running order in this browser")
      }
    },
    [slug],
  )

  async function add(files: FileList | File[]) {
    if (!tracks) return
    const audio = Array.from(files).filter((f) => f.type.startsWith("audio/"))
    if (audio.length === 0) {
      toast.error("Those aren’t audio files. Add MP3, M4A, AAC, FLAC, OGG or WAV.")
      return
    }
    setAdding(true)
    try {
      const used = tracks.reduce((s, t) => s + t.file.size, 0)
      const { fit, skipped } = fitFiles(audio, used, QUEUE_BYTE_LIMIT)
      const read = await Promise.all(
        fit.map(async (file) => {
          const [duration, tags] = await Promise.all([readDurationFromFile(file).catch(() => 0), readTagsFromFile(file)])
          return { id: crypto.randomUUID(), file, title: tags.title, artist: tags.artist, duration }
        }),
      )
      await persist([...tracks, ...read], playback)
      if (skipped.length > 0) {
        toast.error(`${skipped.length} ${skipped.length === 1 ? "file" : "files"} left out: the running order holds up to ${formatBytes(QUEUE_BYTE_LIMIT)}.`)
      }
    } finally {
      setAdding(false)
    }
  }

  function remove(id: string) {
    if (!tracks) return
    const next = removeTrack(tracks, playback, id)
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

  return { tracks, unavailable, adding, add, remove, clear, savedSpot }
}
