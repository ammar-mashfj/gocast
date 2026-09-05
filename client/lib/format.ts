/**
 * Single source of truth for human-readable date and duration formatting.
 *
 * Before this file existed, ~5 components had their own variants of formatDate /
 * formatDuration / formatRelative — they drifted apart and produced subtly
 * different outputs across the app. New formatters belong here.
 */

export type DateMode = "relative" | "short" | "full"

/**
 * Format a date for display.
 *
 *  - `relative`: "just now", "12m ago", "3d ago" — switches to `short` after 7d
 *  - `short`:    "Apr 15"
 *  - `full`:     "Mon Apr 15 · 6:30 PM"
 */
export function formatDate(iso: string, mode: DateMode = "short"): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  if (mode === "relative") {
    const diffMs = Date.now() - date.getTime()
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    // Fall through to short for older entries.
    return formatDate(iso, "short")
  }

  if (mode === "full") {
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Compact human duration (e.g. `"1h 23m"`, `"45m"`, `"<1m"`).
 *
 * Use for "how long was this broadcast?" style context. For live timer
 * displays prefer the HH:MM:SS variant in the studio panels.
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return s > 0 ? `${s}s` : "<1m"
}

/**
 * Convert two ISO timestamps into a duration string.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const seconds = Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
  return formatDuration(seconds)
}

/**
 * Cumulative "airtime" for a station — same as duration but always rounds
 * to at least minutes (a 47-second total reads as "<1m", not "47s").
 */
export function formatAirtime(totalSeconds: number): string {
  if (totalSeconds < 60) return totalSeconds <= 0 ? "0m" : "<1m"
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

/**
 * Human-readable byte size. Picks MB for anything under 1 GB and GB above,
 * one decimal on GB (so `1.6 GB / 3.0 GB` lines up visually with the cap).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/**
 * HH:MM:SS for live timers (studio elapsed counters, file progress).
 *
 * Floors to whole seconds first. Track durations arrive from the analyzer as
 * floats, and the seconds field used to print the fractional remainder
 * verbatim — a 0.8-second file rendered as `00:00.8025` rather than `00:00`.
 */
export function formatClock(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds))
  const h = String(Math.floor(total / 3600)).padStart(2, "0")
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const s = String(total % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

/**
 * "Aug 29, 6:04 PM" — a timestamp precise enough to tell two broadcasts on the
 * same day apart, which `formatDate(iso, "short")` cannot. Distinct from
 * `"full"`, which leads with the weekday and is too wide for a table column.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * "GB" → "United Kingdom", falling back to the code itself.
 *
 * `Intl.DisplayNames` is built in and knows every ISO 3166-1 code, so there is
 * no country table to keep in the bundle or keep current. It throws on a
 * malformed code rather than returning undefined — the analytics tables only
 * ever hold two-letter codes, but this is fed by data and must not be able to
 * take a page down.
 */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * "GB" → 🇬🇧. The flag emoji for a country is literally its two letters shifted
 * into the Regional Indicator block, so no image or icon set is involved.
 *
 * Returns an empty string for anything that is not two ASCII letters, which
 * keeps a stray code from rendering as two unrelated glyphs beside a name.
 */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return ""
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  )
}
