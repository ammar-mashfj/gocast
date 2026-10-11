import type { PlaybackState } from "@/lib/queueStore"

/**
 * Editing the saved running order on pre-flight, before the audio engine
 * exists. The queue lives in IndexedDB (lib/queueStore.ts) with a playback
 * record — which song the last show stopped in, and where — that the engine
 * resumes from. Removing a song must keep that record pointing at the same
 * song, or "Pick up where you stopped" resumes the wrong one.
 */
export interface PreflightTrack {
  id: string
  file: File
  title: string
  artist: string
  /** Seconds; 0 until read. */
  duration: number
}

export function removeTrack(
  tracks: PreflightTrack[],
  playback: PlaybackState | null,
  id: string,
): { tracks: PreflightTrack[]; playback: PlaybackState | null } {
  const index = tracks.findIndex((t) => t.id === id)
  if (index === -1) return { tracks, playback }
  const next = tracks.filter((t) => t.id !== id)
  if (!playback || next.length === 0) return { tracks: next, playback: next.length === 0 ? null : playback }

  const current = playback.currentIndex
  if (index < current) return { tracks: next, playback: { ...playback, currentIndex: current - 1 } }
  if (index === current) {
    // The song it stopped in is gone: pick up at the start of the one that
    // now stands in its place (or the last, if it was the end).
    return { tracks: next, playback: { currentIndex: Math.min(current, next.length - 1), offset: 0 } }
  }
  return { tracks: next, playback }
}

/** Which files fit under the queue's byte limit, in order; the rest are skipped. */
export function fitFiles<F extends { size: number }>(files: F[], usedBytes: number, limit: number): { fit: F[]; skipped: F[] } {
  const fit: F[] = []
  const skipped: F[] = []
  let used = usedBytes
  for (const f of files) {
    if (used + f.size > limit) {
      skipped.push(f)
    } else {
      fit.push(f)
      used += f.size
    }
  }
  return { fit, skipped }
}

/** "12 tracks · 50m 18s" for the running order's header. */
export function queueMeta(tracks: { duration: number }[]): string {
  const n = tracks.length
  if (n === 0) return "Empty"
  const total = Math.round(tracks.reduce((s, t) => s + t.duration, 0))
  const label = `${n} ${n === 1 ? "track" : "tracks"}`
  if (total <= 0) return label
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return `${label} · ${h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`}`
}
