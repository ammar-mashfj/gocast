/**
 * A tab that was opened before a deploy still asks for the old build's JS
 * chunks. During the build they 500, and after it they are gone, so a client
 * navigation dies with a ChunkLoadError and the page looks frozen until the
 * person reloads. The error boundaries call reloadOnceForStaleBuild so the
 * reload happens for them.
 *
 * "Once": a reload inside the last 30s is not repeated, so a deploy that is
 * still running shows the error page instead of reloading in a loop.
 */

const KEY = "gocast:stale-build-reload"
const WINDOW_MS = 30_000

export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === "ChunkLoadError" ||
    /Failed to load chunk|Loading chunk [\w-]+ failed|Importing a module script failed|error loading dynamically imported module/i.test(error.message)
  )
}

/** Reloads the page and returns true when `error` is a stale-build error not already retried. */
export function reloadOnceForStaleBuild(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleBuildError(error)) return false
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < WINDOW_MS) return false
    window.sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // No sessionStorage (private mode, blocked): reloading without the guard
    // could loop, so leave it to the error page.
    return false
  }
  window.location.reload()
  return true
}
