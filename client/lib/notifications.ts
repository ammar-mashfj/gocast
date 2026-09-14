import { env } from "@/lib/env"
import type { Notification, NotificationLevel } from "@/interfaces/Notification"

/**
 * Level => the icon's colour, and nothing else.
 *
 * Deliberately only tints the glyph rather than the row. A feed where every
 * item carries a coloured background is a feed where the one genuinely urgent
 * item doesn't stand out, and "your plan ended" is a warning, not an alarm.
 *
 * Indexed through {@link notificationLevelClass} for the same reason as the
 * icons: an unknown level renders as neutral rather than as unstyled.
 */
const LEVEL_CLASSES: Record<NotificationLevel, string> = {
  info: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
}

export function notificationLevelClass(level: string): string {
  return LEVEL_CLASSES[level as NotificationLevel] ?? LEVEL_CLASSES.info
}

/**
 * The badge number, as the backend says it should be rendered.
 *
 * The ceiling comes from the API (`capped_at`) rather than from a constant
 * here, so the server and every client agree on where "a lot" begins.
 */
export function formatUnreadCount(count: number, cappedAt: number): string {
  return count > cappedAt ? `${cappedAt}+` : String(count)
}

/**
 * The origin a link has to match to be worth routing client-side.
 *
 * The LIVE origin, with the build-time env var as the server-render fallback.
 * The question this answers is "would navigating here stay inside the page the
 * viewer currently has open", and only `window.location` knows that: a build
 * shipped without NEXT_PUBLIC_APP_URL, or a dev session reached over the LAN on
 * a different host than the one baked in, would otherwise class every one of
 * its own links as external and full-page-load them.
 */
function appOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  try {
    return env.appUrl ? new URL(env.appUrl).origin : ""
  } catch {
    return ""
  }
}

export interface NotificationLink {
  href: string
  external: boolean
}

/**
 * Resolve a notification's action URL for the router, or null if it is not
 * something this app should link to at all.
 *
 * The backend stores ABSOLUTE urls — a notification payload is also read by
 * things that are not this app, so a bare path would be ambiguous. But handing
 * an absolute same-origin URL to next/link produces a full page load: the
 * dashboard shell, the layout's two API calls and all, every time somebody
 * clicks a notification that only wanted to move them one route over.
 *
 * So same-origin links are reduced to a path and navigate client-side, and
 * anything else is left alone and rendered as a plain anchor.
 *
 * SCHEME IS CHECKED, not assumed. Rows are written once and never migrated and
 * this is the one field that becomes an `href`, so the payload a build from
 * two years ago wrote is still rendered by today's client. Anything that is
 * not http(s) — `javascript:` above all, which parses perfectly well and comes
 * back with an origin of "null" — is dropped, and NotificationItem renders the
 * row as the plain mark-read button it uses for notifications with no action.
 */
export function notificationHref(url: string): NotificationLink | null {
  const origin = appOrigin()
  let target: URL

  try {
    // Resolved against our own origin, so a relative path from an older
    // payload still means what it would have meant.
    target = new URL(url, origin || undefined)
  } catch {
    return null
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return null
  }

  if (origin && target.origin === origin) {
    return { href: `${target.pathname}${target.search}${target.hash}`, external: false }
  }

  return { href: target.href, external: true }
}

/**
 * What a row should actually do when it is clicked.
 *
 * ONE PLACE DECIDES THIS, and it is not NotificationItem. The row renders the
 * result; every rule about what a payload means lives here, next to
 * notificationHref, which is the other half of the same job.
 *
 * The rules, and why each one falls back rather than failing:
 *
 *   • No action, or a URL this app will not link to (see notificationHref —
 *     `javascript:` and friends), is `none`. The row still marks itself read,
 *     because a row that looks like the others and does nothing reads as
 *     broken.
 *   • `expand` needs something to reveal. A payload claiming it with no points
 *     degrades to `link` instead of opening an empty dialog — the backend
 *     refuses to construct that pair, but these rows are never migrated and
 *     this renders whatever a past build wrote.
 *   • Anything else, including a mode invented after this build shipped and a
 *     row from before modes existed, is `link`. That is the guarantee the
 *     whole feature rests on: a backend deploy may add a mode, and an old
 *     client takes you to the URL rather than leaving the row inert.
 */
export type NotificationBehaviour =
  | { kind: "none" }
  | { kind: "link"; href: string; external: boolean }
  | { kind: "expand"; href: string; external: boolean }

export function resolveNotificationAction(
  notification: Notification,
): NotificationBehaviour {
  const action = notification.action

  if (!action) return { kind: "none" }

  const link = notificationHref(action.url)

  if (link === null) return { kind: "none" }

  const points = action.detail?.points ?? []

  if (action.mode === "expand" && points.length > 0) {
    return { kind: "expand", ...link }
  }

  return { kind: "link", ...link }
}
