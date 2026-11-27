import type { Spotlight } from "@/interfaces/Spotlight"

/** The studio and go-live pages: a dialog there sits over somebody's show. */
const STUDIO_PAGE = /^\/dashboard\/stations\/[^/]+\/(live|studio)(?:[/?#]|$)/

/**
 * Whether a spotlight may open by itself here and now. Never over the
 * studio, and never while a show is running anywhere in the dashboard: the
 * host is mid-broadcast and a modal is the last thing they need. The chip is
 * still there, so nothing is lost; it opens on the next calm page.
 */
export function canAutoOpen(pathname: string, broadcastState: string | null): boolean {
  if (broadcastState !== null && broadcastState !== "idle") return false
  return !STUDIO_PAGE.test(pathname)
}

/** The one to open on this visit: the first new one (the API sorts by priority). */
export function pickAutoOpen(items: Spotlight[]): Spotlight | null {
  return items.find((s) => s.state === "new") ?? null
}

/**
 * "Ends in 5 hours" inside the last day, "Ends Mon, Dec 1" before that, in
 * the viewer's own timezone. Null when there is no end or it has passed.
 */
export function endsLabel(endsAt: string | null, now: number = Date.now(), locale?: string): string | null {
  if (!endsAt) return null
  const end = Date.parse(endsAt)
  if (Number.isNaN(end) || end <= now) return null
  const hours = (end - now) / 3_600_000
  if (hours < 1) return "Ends within the hour"
  if (hours < 24) {
    const h = Math.round(hours)
    return `Ends in ${h} ${h === 1 ? "hour" : "hours"}`
  }
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(new Date(end))
  return `Ends ${day}`
}

/** Dashboard paths stay in the app; anything else opens in a new tab. */
export function isInternalLink(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//")
}

export const KIND_LABEL: Record<Spotlight["kind"], string> = {
  offer: "Offer",
  feature: "New",
  notice: "Notice",
}
