/**
 * How the broadcaster connected. Written by StreamSessionController::store
 * (the browser studio sends "browser") and defaults to "browser" for sessions
 * opened by harbor's `live_connected` event.
 */
export type StreamSessionSource = "browser" | "electron" | "external"

/**
 * One broadcast session.
 *
 * IMPORTANT, and the reason several things on the station page are labelled
 * the way they are: a session row is only ever written for a HUMAN
 * broadcaster. Both places that create one — the studio calling
 * POST /stations/{slug}/sessions, and harbor's `live_connected` event — are
 * about a publisher connecting. Putting a station on air with the AutoDJ
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
}
