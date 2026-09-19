"use client"

import { usePublicStationStats } from "./usePublicStationStats"

/**
 * Current concurrent listeners for a station.
 *
 * A thin read over {@link usePublicStationStats}, which owns the timer. Kept
 * as its own hook because the station overview wants only this number and
 * should not have to know that air state and now-playing arrive on the same
 * response.
 *
 * Reads the PUBLIC endpoint rather than the owner's status endpoint, because
 * the count lives there and nowhere else: `GET /stations/{slug}/status`
 * reports the audio graph, not the audience. The Icecast half of the number
 * is written by `stations:sync-listeners` once a minute, so it moves in
 * minute-sized steps however often we ask.
 *
 * `null` means "not known yet" and should render as nothing, not as 0 — an
 * off-air station genuinely has no audience, but a page that has not answered
 * yet should not claim one either way.
 */
export function useListenerCount(slug: string, enabled = true): number | null {
  return usePublicStationStats(slug, { enabled })?.count ?? null
}
