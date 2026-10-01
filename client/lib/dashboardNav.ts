/**
 * The dashboard's places, in one list: the sidebar draws it and the top
 * bar's breadcrumb names the current page from it, so a page can't be
 * "Broadcasts" in one and "Your shows" in the other.
 *
 * Every page belongs to the account's one station, so most destinations need
 * its slug. `href` is the slugless fallback — /dashboard resolves the station
 * server-side and forwards — used before the station is known, for accounts
 * that have none yet (/dashboard is then the create-a-station page), and by
 * old bookmarks.
 */

export type NavKey = "overview" | "studio" | "autodj" | "schedule" | "audience" | "shows" | "settings"

export interface NavItem {
  key: NavKey
  label: string
  href: string
  stationHref?: (slug: string) => string
  /** The feature a plan has to include; the link stays live either way. */
  lock?: "autodj" | "audience"
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", label: "Overview", href: "/dashboard", stationHref: (s) => `/dashboard/stations/${s}` },
  // Idle, Studio opens pre-flight; the shell sends it straight to the studio
  // while a show is running (see AppSidebar).
  { key: "studio", label: "Studio", href: "/dashboard", stationHref: (s) => `/dashboard/stations/${s}/live` },
  { key: "autodj", label: "AutoDJ", href: "/dashboard/library", stationHref: (s) => `/dashboard/stations/${s}/library`, lock: "autodj" },
  // AutoDJ slots only, so it carries the AutoDJ lock. Show times live in
  // station settings (docs/features/schedule.md).
  { key: "schedule", label: "Schedule", href: "/dashboard", stationHref: (s) => `/dashboard/stations/${s}/schedule`, lock: "autodj" },
  { key: "audience", label: "Audience", href: "/dashboard", stationHref: (s) => `/dashboard/stations/${s}/audience`, lock: "audience" },
  { key: "shows", label: "Your shows", href: "/dashboard/broadcasts" },
  // Station settings. Account settings (/dashboard/settings) are in the
  // account menu, labelled "Account", so the two never share a name.
  { key: "settings", label: "Settings", href: "/dashboard", stationHref: (s) => `/dashboard/stations/${s}/settings` },
]

const STATION_PAGE = /^\/dashboard\/stations\/[^/]+(?:\/([^/]+))?/

const SEGMENT_TO_KEY: Record<string, NavKey> = {
  live: "studio",
  studio: "studio",
  library: "autodj",
  schedule: "schedule",
  audience: "audience",
  settings: "settings",
}

/** Which nav item a path belongs to; null for pages outside the nav (Account). */
export function activeNav(pathname: string): NavKey | null {
  if (pathname === "/dashboard") return "overview"
  if (pathname === "/dashboard/library") return "autodj"
  if (pathname.startsWith("/dashboard/broadcasts")) return "shows"
  const m = STATION_PAGE.exec(pathname)
  if (!m) return null
  return m[1] ? (SEGMENT_TO_KEY[m[1]] ?? null) : "overview"
}

/**
 * The breadcrumb's page name, after the station's: null on the overview,
 * where the station name alone is the crumb.
 */
export function pageLabel(pathname: string): string | null {
  if (pathname.startsWith("/dashboard/settings")) return "Account"
  if (pathname.startsWith("/dashboard/design-system")) return "Design system"
  const key = activeNav(pathname)
  if (!key || key === "overview") return null
  return NAV_ITEMS.find((i) => i.key === key)!.label
}
