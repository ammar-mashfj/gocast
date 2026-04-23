"use client"

/**
 * Listener-side library — anonymous, localStorage-backed.
 *
 * Two surfaces:
 *  - **Saved stations**: explicit favorites the listener bookmarked.
 *  - **History**: the last few stations they actually listened to.
 *
 * Anonymous-first by design — no account required. We can sync to the backend
 * later once accounts opt in to syncing favourites across devices.
 */

const SAVED_KEY = "gocast:saved-stations:v1"
const HISTORY_KEY = "gocast:history:v1"
const HISTORY_LIMIT = 8

export interface LibraryEntry {
  slug: string
  name: string
  artworkUrl: string | null
  genre: string | null
  /** ms since epoch */
  at: number
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded / disabled — silently ignore
  }
}

/** Fired when saved or history changes so subscribers can re-render. */
const CHANGE_EVENT = "gocast:library-change"

function notify() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getSaved(): LibraryEntry[] {
  return safeRead<LibraryEntry[]>(SAVED_KEY, [])
}

export function isSaved(slug: string): boolean {
  return getSaved().some((s) => s.slug === slug)
}

export function toggleSaved(entry: Omit<LibraryEntry, "at">): boolean {
  const current = getSaved()
  const exists = current.some((s) => s.slug === entry.slug)
  const next = exists
    ? current.filter((s) => s.slug !== entry.slug)
    : [{ ...entry, at: Date.now() }, ...current].slice(0, 50)
  safeWrite(SAVED_KEY, next)
  notify()
  return !exists
}

export function getHistory(): LibraryEntry[] {
  return safeRead<LibraryEntry[]>(HISTORY_KEY, [])
}

export function recordListen(entry: Omit<LibraryEntry, "at">): void {
  const current = getHistory().filter((s) => s.slug !== entry.slug)
  const next = [{ ...entry, at: Date.now() }, ...current].slice(0, HISTORY_LIMIT)
  safeWrite(HISTORY_KEY, next)
  notify()
}

export function subscribeLibrary(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  // Cross-tab updates via the storage event.
  window.addEventListener("storage", listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener("storage", listener)
  }
}
