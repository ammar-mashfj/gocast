/**
 * How the broadcaster connected.
 *
 * In practice every row is written by harbor's `live_connected` event, which
 * reports "external" for an Icecast source client and "browser" for the
 * studio's WebSocket — and "browser" for any container too old to say.
 *
 * "electron" is reserved for a desktop client that would POST its own session
 * to StreamSessionController::store. Nothing calls that endpoint today, so no
 * row currently carries it.
 */
export type StreamSessionSource = "browser" | "electron" | "external"

/**
 * One broadcast session.
 *
 * IMPORTANT, and the reason several things on the station page are labelled
 * the way they are: a session row is only ever written for a HUMAN
 * broadcaster. Both places that can create one — harbor's `live_connected`
 * event, which is the only one in use, and a POST to
 * /stations/{slug}/sessions, which is reserved for a desktop client that does
 * not exist yet — are about a publisher connecting. Putting a station on air
 * with the AutoDJ
 * rotation creates no session at all, so "airtime" derived from these rows
 * means *live* airtime and must say so.
 */
export interface StreamSession {
  id: string
  station_id: string
  started_at: string
  /** Null while the broadcast is still running. */
  ended_at: string | null
  peak_listeners: number
  source_type: StreamSessionSource
  /**
   * The broadcaster's software, when harbor saw one: "Mixxx 2.5.0",
   * "libshout/2.4.6", a browser user-agent. Null for the studio's own session
   * row and for any container that predates the template reporting it, so
   * nothing may branch on it — it exists to answer "which client?" in support.
   */
  client?: string | null
}
