/**
 * The signed-in user's entitlements, as answered by `GET /user`.
 *
 * These are ANSWERS, not the plans row: the API decides what a plan allows
 * (StationLifecycleService), and the client only renders the verdict. Adding
 * a `max_stations`-style column here and deriving rules from it would be a
 * second copy of that logic, free to drift from the one that actually
 * returns 403.
 */
export interface Plan {
  slug: string
  name: string
  /** False on Free. Gates uploading to the AutoDJ library — nothing else. */
  autodj_enabled: boolean
  /**
   * Days of audience history this plan may SEE. 0 on Free, which still gets
   * listeners-right-now and the all-time peak.
   *
   * Display only — collection has never been gated, so an upgrade reveals the
   * station's existing history rather than starting a clock. The number is
   * rendered ("Last 90 days"), so it lives here rather than being a boolean.
   */
  analytics_days: number
  max_listeners: number
  /**
   * May this account's stations be embedded on other sites? False on Free.
   * Decides whether the dashboard shows the snippet; the embed page itself
   * 404s for a plan without it, so a wrong answer here hides a working
   * feature or shows a broken one — never grants anything.
   */
  embed_enabled: boolean
  /**
   * May this account broadcast from BUTT, Mixxx or any other Icecast source
   * client? False on Free, which still has the browser studio. Decides whether
   * the settings card shows the connection details or the upsell; harbor's auth
   * callback is what actually refuses a connection.
   */
  encoder_enabled: boolean
  /**
   * Built, never switched on — no audio actually carries the ID. Kept because
   * the API still returns it; do not render it or gate anything on it. See the
   * same note on Station.watermarked.
   */
  watermarked: boolean
  /**
   * ISO timestamp of when this plan ends and the account drops to Free, or
   * null for an open-ended plan. Set by a paid term, an invite or an admin
   * grant. Display
   * only — the API's `plans:expire` job is what enforces it.
   */
  expires_at: string | null
}

/**
 * What Pro adds over Free, condensed — the pricing card and the dashboard
 * upsell both read this, so they can't disagree. The full list lives in the
 * "What you get on Free and on Pro" help article.
 */
export const PRO_FEATURES = [
  "24/7 AutoDJ from your library (3 GB)",
  "Playlists and a weekly schedule",
  "Broadcast from BUTT, Mixxx or any Icecast encoder",
  "Public stream URL for TuneIn & Sonos",
  "Embed your player, on your own domain",
  "1,000 concurrent listeners",
  "90 days of listener analytics, by country",
  "Priority support",
]
