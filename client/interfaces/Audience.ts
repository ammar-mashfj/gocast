/**
 * The audience report for one station, as answered by
 * `GET /stations/{slug}/audience`.
 *
 * A DISCRIMINATED UNION, because the locked payload is not the full one with
 * fields missing — it is a different shape, and the API deliberately does not
 * serialise anything a free account may not see. Modelling it as
 * `daily?: Bucket[]` would let a component read `report.daily` on a locked
 * report and render an empty chart where the upsell belongs; this way the
 * compiler asks "which is it?" first.
 */
export interface AudienceLocked {
  locked: true
  plan_days: 0
  range_days: 0
  /** Listeners right now. Free, real, and the whole point of the locked view. */
  live: number
  peak_all_time: number
}

export interface AudienceDay {
  /** `YYYY-MM-DD`, UTC — the day the rollup recorded it under. */
  day: string
  /** Listening time: one listener present for one minute. Includes Icecast. */
  listener_minutes: number
  /** Highest concurrent listeners seen that day. */
  peak: number
  /** Sessions that started that day. */
  sessions: number
  /** Distinct listeners that day. See the note on `totals.listeners`. */
  listeners: number
}

export interface AudienceCountry {
  /** ISO 3166-1 alpha-2. */
  country: string
  sessions: number
  listener_seconds: number
}

export interface AudienceBreakdownRow {
  label: string
  sessions: number
}

/**
 * A truncated list plus the figure it was truncated from.
 *
 * `total` is NOT the sum of `rows` whenever the list ran long — countries and
 * referrers are both unbounded. Percentages must be computed against `total`,
 * or a station heard in thirty countries would report its top twelve as if
 * they were the entire audience.
 */
export interface AudienceDimension<T> {
  rows: T[]
  total: number
}

export interface AudienceReport {
  locked: false
  /** The widest window this plan may request. */
  plan_days: number
  /** The window actually served — never wider than `plan_days`. */
  range_days: number
  live: number
  peak_all_time: number
  totals: {
    listener_minutes: number
    /** Highest concurrent figure in the window — a maximum, never a sum. */
    peak: number
    sessions: number
    /**
     * Distinct listeners per day, added up across the window.
     *
     * NOT deduplicated across days, and it cannot be: the visitor hash is
     * re-keyed daily by design so nobody can be followed from one day to the
     * next. Someone who tunes in on Monday and Tuesday counts twice. Any label
     * on this number has to say "per day" or it is claiming a reach we made
     * ourselves unable to measure.
     */
    listeners: number
    avg_listen_seconds: number
    qualified_listens: number
  }
  /** One entry per day of the window, zeros included — never sparse. */
  daily: AudienceDay[]
  /**
   * `countries.total` is every listen that could be placed in a country at
   * all, which is what distinguishes "nobody listened" from "country lookup
   * isn't configured on this deployment" — without a CDN in front of the API
   * every country comes back null, and an empty list alone would read as an
   * empty room.
   */
  countries: AudienceDimension<AudienceCountry>
  devices: AudienceDimension<AudienceBreakdownRow>
  browsers: AudienceDimension<AudienceBreakdownRow>
  referrers: AudienceDimension<AudienceBreakdownRow>
}

export type Audience = AudienceLocked | AudienceReport

/** Windows the range control offers. Must match AudienceController::WINDOWS. */
export const AUDIENCE_WINDOWS = [7, 30, 90] as const
