/**
 * IndexedDB-backed persistence for the audio queue and playback position.
 * Keeps the queue intact across page refreshes so broadcasters don't lose
 * their playlist when the page reloads.
 *
 * Every record belongs to one station. Before v3 the database held a single
 * unscoped queue, so a broadcaster who opened a second station in the same
 * browser found the first station's music waiting for them. Records saved
 * by that version carry no `station` and are claimed by the first station
 * that loads its queue — see {@link claimLegacy} — which keeps the common
 * single-station broadcaster's queue and position intact across the upgrade.
 *
 * Keyed by slug rather than id because the slug is what every caller has to
 * hand and it is immutable after creation (see Station::booted in the API).
 */

const DB_NAME = 'gocast'
const QUEUE_STORE = 'queue'
const PLAYBACK_STORE = 'playback'
const STATION_INDEX = 'station'
/** Playback key used before records were scoped to a station. */
const LEGACY_PLAYBACK_KEY = 'current'
const DB_VERSION = 3

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
  /** Owning station's slug. Absent on records saved before v3. */
  station?: string
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
      const queue = db.objectStoreNames.contains(QUEUE_STORE)
        ? req.transaction!.objectStore(QUEUE_STORE)
        : db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      // Records without a `station` are simply absent from the index, which
      // is how the legacy queue is told apart from any station's.
      if (!queue.indexNames.contains(STATION_INDEX)) {
        queue.createIndex(STATION_INDEX, 'station', { unique: false })
      }
      if (!db.objectStoreNames.contains(PLAYBACK_STORE)) {
        db.createObjectStore(PLAYBACK_STORE)
      }
    }
    // Another tab still has the old schema open. It closes its handle after
    // every operation, so this clears within milliseconds; surfacing it
    // beats hanging the caller forever if it does not.
    req.onblocked = () => reject(new Error('Queue storage is being upgraded in another tab'))
    req.onsuccess = () => {
      const db = req.result
      // Let a newer tab upgrade the schema instead of blocking on this one.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function inOrder(tracks: StoredTrack[]): StoredTrack[] {
  return tracks
    .map((track, i) => ({ track, rank: track.position ?? i }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ track }) => track)
}

/** Delete every queue record belonging to `station`. Runs inside `tx`. */
async function deleteStationTracks(tx: IDBTransaction, station: string): Promise<void> {
  const store = tx.objectStore(QUEUE_STORE)
  const keys = await request(store.index(STATION_INDEX).getAllKeys(station))
  keys.forEach((key) => store.delete(key))
}

/**
 * Hand the pre-v3 unscoped queue and playback position to `station`, if there
 * are any. Runs inside `tx`, which must cover both stores. Returns the tracks
 * now owned by the station, in running order.
 */
async function claimLegacy(tx: IDBTransaction, station: string): Promise<StoredTrack[]> {
  const queue = tx.objectStore(QUEUE_STORE)
  const legacy = (await request(queue.getAll())).filter((track) => track.station === undefined)
  if (legacy.length === 0) return []
  const claimed = inOrder(legacy).map((track, position) => ({ ...track, position, station }))
  claimed.forEach((track) => queue.put(track))

  const playback = tx.objectStore(PLAYBACK_STORE)
  const legacyPlayback = await request(playback.get(LEGACY_PLAYBACK_KEY))
  if (legacyPlayback) {
    playback.put(legacyPlayback, station)
    playback.delete(LEGACY_PLAYBACK_KEY)
  }
  return claimed
}

/** Replace the station's stored queue with the given tracks. */
export async function saveQueue(
  station: string,
  tracks: { id: string; file: File; title: string; artist: string }[],
): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  await deleteStationTracks(tx, station)
  tracks.forEach((track, position) => {
    store.put({ id: track.id, file: track.file, title: track.title, artist: track.artist, position, station } satisfies StoredTrack)
  })
  await done(tx)
  db.close()
}

/**
 * Read the station's tracks from IndexedDB, in running order. A station
 * with nothing saved takes over the pre-v3 unscoped queue, if one is there.
 */
export async function loadQueue(station: string): Promise<StoredTrack[]> {
  const db = await openDB()
  const tx = db.transaction([QUEUE_STORE, PLAYBACK_STORE], 'readwrite')
  const own = await request(tx.objectStore(QUEUE_STORE).index(STATION_INDEX).getAll(station))
  const result = own.length > 0 ? inOrder(own) : await claimLegacy(tx, station)
  await done(tx)
  db.close()
  return result
}

/** Delete the station's tracks and saved playback position from IndexedDB. */
export async function clearQueue(station: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction([QUEUE_STORE, PLAYBACK_STORE], 'readwrite')
  await deleteStationTracks(tx, station)
  tx.objectStore(PLAYBACK_STORE).delete(station)
  await done(tx)
  db.close()
}

export async function savePlayback(station: string, state: PlaybackState): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(PLAYBACK_STORE, 'readwrite')
  tx.objectStore(PLAYBACK_STORE).put(state, station)
  await done(tx)
  db.close()
}

export async function loadPlayback(station: string): Promise<PlaybackState | null> {
  const db = await openDB()
  const tx = db.transaction(PLAYBACK_STORE, 'readonly')
  const result = await request(tx.objectStore(PLAYBACK_STORE).get(station))
  db.close()
  return result ?? null
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

export async function loadQueueSummary(station: string): Promise<SavedQueueSummary> {
  // Sequential on purpose: loadQueue may claim the legacy playback record,
  // and loadPlayback must see it under the station's key.
  const tracks = await loadQueue(station)
  const playback = await loadPlayback(station)
  const track = playback ? tracks[playback.currentIndex] : undefined
  return {
    trackCount: tracks.length,
    bytes: tracks.reduce((sum, t) => sum + (t.file?.size ?? 0), 0),
    lastTrack: track && playback
      ? { title: track.title, artist: track.artist, offset: Math.max(0, playback.offset) }
      : null,
  }
}
