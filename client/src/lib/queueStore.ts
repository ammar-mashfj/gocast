const DB_NAME = 'gocast'
const QUEUE_STORE = 'queue'
const PLAYBACK_STORE = 'playback'
const DB_VERSION = 2

interface StoredTrack {
  id: string
  file: File
  title: string
  artist: string
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

export async function saveQueue(tracks: { id: string; file: File; title: string; artist: string }[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  store.clear()
  for (const track of tracks) {
    store.put({ id: track.id, file: track.file, title: track.title, artist: track.artist } satisfies StoredTrack)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

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
}

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
