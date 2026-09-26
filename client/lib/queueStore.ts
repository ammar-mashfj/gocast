/**
 * IndexedDB-backed persistence for the audio queue and playback position.
 * Keeps the queue intact across page refreshes so broadcasters don't lose
 * their playlist when the page reloads.
 */

const DB_NAME = 'gocast'
const QUEUE_STORE = 'queue'
const PLAYBACK_STORE = 'playback'
const DB_VERSION = 2

interface StoredTrack {
  id: string
  file: File
  title: string
  artist: string
  /**
   * Place in the running order. The store is keyed by a random UUID and
   * `getAll()` returns records in KEY order, not insertion order — without
   * this a restored queue came back shuffled, and the saved `currentIndex`
   * pointed at whichever song happened to sort into that slot. Absent on
   * queues saved before it existed; those keep the order they load in.
   */
  position?: number
}

export interface PlaybackState {
  currentIndex: number
  offset: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PLAYBACK_STORE)) {
        db.createObjectStore(PLAYBACK_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Replace the stored queue with the given tracks (clears then re-inserts). */
export async function saveQueue(tracks: { id: string; file: File; title: string; artist: string }[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  store.clear()
  tracks.forEach((track, position) => {
    store.put({ id: track.id, file: track.file, title: track.title, artist: track.artist, position } satisfies StoredTrack)
  })
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** Read all tracks from IndexedDB, in running order. */
export async function loadQueue(): Promise<StoredTrack[]> {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readonly')
  const store = tx.objectStore(QUEUE_STORE)
  const req = store.getAll()
  const result = await new Promise<StoredTrack[]>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
    .map((track, i) => ({ track, rank: track.position ?? i }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ track }) => track)
}

/** Delete all tracks and the saved playback position from IndexedDB. */
export async function clearQueue(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction([QUEUE_STORE, PLAYBACK_STORE], 'readwrite')
  tx.objectStore(QUEUE_STORE).clear()
  tx.objectStore(PLAYBACK_STORE).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function savePlayback(state: PlaybackState): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(PLAYBACK_STORE, 'readwrite')
  tx.objectStore(PLAYBACK_STORE).put(state, 'current')
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadPlayback(): Promise<PlaybackState | null> {
  const db = await openDB()
  const tx = db.transaction(PLAYBACK_STORE, 'readonly')
  const req = tx.objectStore(PLAYBACK_STORE).get('current')
  const result = await new Promise<PlaybackState | null>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

/**
 * What the studio will open with, read before a broadcast exists — so the Go
 * Live page can say what is waiting instead of the show opening on a surprise.
 * Mirrors {@link AudioEngine.resumePlayback}: the "last song" is only reported
 * when that method would actually cue it.
 */
export interface SavedQueueSummary {
  trackCount: number
  bytes: number
  lastTrack: { title: string; artist: string; offset: number } | null
}

export async function loadQueueSummary(): Promise<SavedQueueSummary> {
  const [tracks, playback] = await Promise.all([loadQueue(), loadPlayback()])
  const track = playback ? tracks[playback.currentIndex] : undefined
  return {
    trackCount: tracks.length,
    bytes: tracks.reduce((sum, t) => sum + (t.file?.size ?? 0), 0),
    lastTrack: track && playback
      ? { title: track.title, artist: track.artist, offset: Math.max(0, playback.offset) }
      : null,
  }
}
