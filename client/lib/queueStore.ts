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
 *
 * Each track's audio is written once, in a transaction of its own, and the
 * running order lives in a separate record (v4). Saving used to rewrite every
 * track's blob in one transaction on every edit, so one file the browser could
 * no longer read — an Android picker copy that had been cleaned up — aborted
 * every later save, and the queue silently stopped persisting.
 */

const DB_NAME = 'gocast'
const QUEUE_STORE = 'queue'
const PLAYBACK_STORE = 'playback'
/** Running order per station: the track ids, keyed by slug. */
const ORDER_STORE = 'order'
const STATION_INDEX = 'station'
/** Playback key used before records were scoped to a station. */
const LEGACY_PLAYBACK_KEY = 'current'
const DB_VERSION = 4

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
   *
   * Only the order at the time the track was first stored: since v4 the
   * station's {@link ORDER_STORE} record wins, and this is the fallback for
   * queues saved before it.
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
      if (!db.objectStoreNames.contains(ORDER_STORE)) {
        db.createObjectStore(ORDER_STORE)
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

/**
 * Settle when `tx` commits. Rejects with a real Error: a failed request's
 * error event reaches the transaction before it aborts, while `tx.error` is
 * still null — Firefox reported those as "rejection with value null".
 */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (event: Event) => {
      const cause = tx.error ?? (event.target as IDBRequest | null)?.error ?? null
      reject(cause ?? new Error('Queue storage transaction failed'))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = fail
    tx.onabort = fail
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Sort `tracks` into running order: the station's order record when there is
 * one, else each record's own `position`. Tracks the order doesn't list go
 * after the ones it does.
 */
function inOrder(tracks: StoredTrack[], order?: string[]): StoredTrack[] {
  const rank = order ? new Map(order.map((id, i) => [id, i])) : null
  return tracks
    .map((track, i) => ({ track, rank: rank ? (rank.get(track.id) ?? order!.length + (track.position ?? i)) : (track.position ?? i) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ track }) => track)
}

/**
 * Whether the browser can still read `file`. A File survives in memory after
 * the data behind it is gone — a picker copy Android cleaned up, or storage
 * the browser evicted — and only fails when something reads it.
 */
export async function isReadable(file: File): Promise<boolean> {
  try {
    await file.slice(0, 1).arrayBuffer()
    return true
  } catch {
    return false
  }
}

/**
 * Saves run one at a time, in the order they were asked for. Each one opens
 * its own database handle, so without this a quick remove-then-reorder could
 * commit out of order and the older running order would win.
 */
let saving: Promise<unknown> = Promise.resolve()
function serially<T>(work: () => Promise<T>): Promise<T> {
  const next = saving.then(work, work)
  saving = next.catch(() => undefined)
  return next
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

export interface SaveQueueResult {
  /** Tracks whose file the browser can no longer read. They can't play either. */
  unreadable: string[]
  /** Readable tracks the browser refused to store (usually storage full). */
  unsaved: string[]
}

/**
 * Make the station's stored queue match `tracks`.
 *
 * Only what changed is written: a new track's audio once, in a transaction of
 * its own so a file the browser refuses fails alone; a retagged track's
 * record; and the running order as a list of ids, so moving or removing a
 * track never rewrites any audio. Tracks that could not be stored are left
 * out of the saved order and returned, rather than failing the whole save.
 */
export function saveQueue(
  station: string,
  tracks: { id: string; file: File; title: string; artist: string }[],
): Promise<SaveQueueResult> {
  return serially(async () => {
    const db = await openDB()
    try {
      const existing = new Map(
        (await request(db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).index(STATION_INDEX).getAll(station)))
          .map((track) => [track.id, track]),
      )
      const unreadable: string[] = []
      const unsaved: string[] = []

      for (const [position, track] of tracks.entries()) {
        const stored = existing.get(track.id)
        if (stored && stored.title === track.title && stored.artist === track.artist) continue
        // Probed outside the transaction: an await on anything but IndexedDB
        // inside one lets it auto-commit.
        if (!stored && !(await isReadable(track.file))) {
          unreadable.push(track.id)
          continue
        }
        try {
          const tx = db.transaction(QUEUE_STORE, 'readwrite')
          tx.objectStore(QUEUE_STORE).put(
            stored
              ? { ...stored, title: track.title, artist: track.artist }
              : { id: track.id, file: track.file, title: track.title, artist: track.artist, position, station } satisfies StoredTrack,
          )
          await done(tx)
        } catch (err) {
          console.warn('[queueStore] could not store', track.title, err)
          // A retag that failed still has its old record; only a new track is lost.
          if (!stored) unsaved.push(track.id)
        }
      }

      const skipped = new Set([...unreadable, ...unsaved])
      const keep = new Set(tracks.map((track) => track.id))
      const tx = db.transaction([QUEUE_STORE, ORDER_STORE], 'readwrite')
      const store = tx.objectStore(QUEUE_STORE)
      existing.forEach((_, id) => {
        if (!keep.has(id)) store.delete(id)
      })
      tx.objectStore(ORDER_STORE).put(tracks.map((track) => track.id).filter((id) => !skipped.has(id)), station)
      await done(tx)

      return { unreadable, unsaved }
    } finally {
      db.close()
    }
  })
}

/**
 * Read the station's tracks from IndexedDB, in running order. A station
 * with nothing saved takes over the pre-v3 unscoped queue, if one is there.
 */
export async function loadQueue(station: string): Promise<StoredTrack[]> {
  const db = await openDB()
  const tx = db.transaction([QUEUE_STORE, PLAYBACK_STORE, ORDER_STORE], 'readwrite')
  const own = await request(tx.objectStore(QUEUE_STORE).index(STATION_INDEX).getAll(station))
  const order: string[] | undefined = await request(tx.objectStore(ORDER_STORE).get(station))
  const result = own.length > 0 ? inOrder(own, order) : await claimLegacy(tx, station)
  await done(tx)
  db.close()
  return result
}

/** Delete the station's tracks and saved playback position from IndexedDB. */
export function clearQueue(station: string): Promise<void> {
  return serially(async () => {
    const db = await openDB()
    try {
      const tx = db.transaction([QUEUE_STORE, PLAYBACK_STORE, ORDER_STORE], 'readwrite')
      await deleteStationTracks(tx, station)
      tx.objectStore(PLAYBACK_STORE).delete(station)
      tx.objectStore(ORDER_STORE).delete(station)
      await done(tx)
    } finally {
      db.close()
    }
  })
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
