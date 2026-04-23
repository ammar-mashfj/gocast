"use client"

/**
 * Lightweight milestone tracker — fires once per achievement per browser.
 *
 * Storage is the simplest thing that works: a single localStorage key
 * holding a string array of fired keys. Keys are namespaced so we can
 * mix listener-count milestones with lifetime ones without collision.
 */

const STORE_KEY = "gocast:milestones-fired:v1"

function read(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set()
  } catch {
    return new Set()
  }
}

function persist(set: Set<string>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

/**
 * Fire `cb` once for `key`. Returns true if the milestone fires (first time),
 * false if it has already fired before.
 */
export function fireOnce(key: string, cb: () => void): boolean {
  const set = read()
  if (set.has(key)) return false
  set.add(key)
  persist(set)
  cb()
  return true
}

/** Listener-count milestone thresholds for the studio toast. */
export const LISTENER_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const
