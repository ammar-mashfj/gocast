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
  /** The audible "powered by GoCast" ID is mixed into this user's streams. */
  watermarked: boolean
}

/**
 * What Pro costs, in whole dollars per month.
 *
 * Lives on the client because the `plans` table has no price column — there
 * is no billing integration yet, so no server-side number to read. The
 * marketing page and the in-dashboard upsell both import this rather than
 * hardcoding it twice and disagreeing after the next pricing change.
 */
export const PRO_PRICE_USD = 15

/**
 * Pro is not self-serve yet: there is no Stripe integration and no checkout
 * route. Access is requested through ProAccessDialog and granted by hand, so
 * every "upgrade" affordance opens that form rather than a payment page.
 * Flip this once billing ships and the CTAs become real upgrade links.
 */
export const PRO_AVAILABLE = false
