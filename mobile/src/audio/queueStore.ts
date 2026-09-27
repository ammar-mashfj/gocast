import { Directory, File, Paths } from 'expo-file-system';

import { readJson, removeJson, writeJson } from '../lib/kv';

/**
 * The saved running order, the phone's version of the web studio's IndexedDB
 * store (client/lib/queueStore.ts). The web keeps each File blob in IndexedDB;
 * here each picked file is copied into the app's own documents directory, so
 * the queue survives the picker's cache being cleared and the app restarting.
 *
 * The order and tags live in a JSON file next to them. Audio files nothing
 * references any more are deleted by {@link pruneFiles}, which runs behind
 * the undo window rather than at removal time, so Undo still has a file to
 * put back.
 */

export interface StoredTrack {
  id: string;
  /** File name inside the queue directory. */
  fileName: string;
  /** The name it had on the phone, for the filename tag fallback. */
  originalName: string;
  size: number;
  title: string;
  artist: string;
}

export interface PlaybackState {
  currentIndex: number;
  offset: number;
}

const QUEUE_KEY = 'studio-queue-v1';
const PLAYBACK_KEY = 'studio-playback-v1';

export function queueDirectory(): Directory {
  const dir = new Directory(Paths.document, 'queue');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function trackFile(track: Pick<StoredTrack, 'fileName'>): File {
  return new File(queueDirectory(), track.fileName);
}

/** Absolute path the audio library opens, without the file:// scheme. */
export function trackPath(track: Pick<StoredTrack, 'fileName'>): string {
  return decodeURI(trackFile(track).uri.replace(/^file:\/\//, ''));
}

/**
 * Move a picked file into the queue directory. The picker's copy lives in the
 * cache, which Android may clear at any time.
 */
export function importPickedFile(pickedUri: string, id: string, originalName: string): string {
  const ext = originalName.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? '';
  const fileName = `${id}${ext.toLowerCase()}`;
  const picked = new File(pickedUri);
  picked.move(new File(queueDirectory(), fileName));
  return fileName;
}

export function saveQueue(tracks: StoredTrack[]): void {
  writeJson(QUEUE_KEY, tracks);
}

export function loadQueue(): StoredTrack[] {
  const tracks = readJson<StoredTrack[]>(QUEUE_KEY, []);
  // A track whose file has gone missing cannot play; drop it rather than
  // stall the queue on it.
  return tracks.filter((t) => {
    try {
      return trackFile(t).exists;
    } catch {
      return false;
    }
  });
}

export function savePlayback(state: PlaybackState): void {
  writeJson(PLAYBACK_KEY, state);
}

export function loadPlayback(): PlaybackState | null {
  return readJson<PlaybackState | null>(PLAYBACK_KEY, null);
}

/** Delete every track and the saved playback position. */
export function clearQueue(): void {
  removeJson(QUEUE_KEY);
  removeJson(PLAYBACK_KEY);
  pruneFiles(new Set());
}

/** Delete audio files in the queue directory that `keep` does not name. */
export function pruneFiles(keep: Set<string>): void {
  try {
    for (const entry of queueDirectory().list()) {
      if (entry instanceof File && !keep.has(entry.name)) entry.delete();
    }
  } catch {
    /* best effort: a leftover file costs space, not correctness */
  }
}

export interface SavedQueueSummary {
  trackCount: number;
  bytes: number;
  lastTrack: { title: string; artist: string; offset: number } | null;
}

/** What the pre-flight screen shows before the engine exists. */
export function loadQueueSummary(): SavedQueueSummary {
  const tracks = loadQueue();
  const playback = loadPlayback();
  const track = playback ? tracks[playback.currentIndex] : undefined;
  return {
    trackCount: tracks.length,
    bytes: tracks.reduce((sum, t) => sum + t.size, 0),
    lastTrack:
      track && playback ? { title: track.title, artist: track.artist, offset: Math.max(0, playback.offset) } : null,
  };
}
