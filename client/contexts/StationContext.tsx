"use client"

import { createContext, useContext } from "react"

/**
 * The signed-in user's station, resolved once by the dashboard layout.
 *
 * Identity only — name, slug, artwork, genre, description. Everything that
 * moves (state, now playing, listeners) is deliberately absent: this value is
 * rendered on every dashboard route and would go stale the moment the station
 * changed, and the components that care already poll for it.
 *
 * It exists so the chrome around a page can name the station WITHOUT asking
 * the API. The header used to fetch `/stations/{slug}` from the browser purely
 * to fill in one breadcrumb, which meant a skeleton sat where the station name
 * belongs until a round-trip came back — on every fresh load of every station
 * page. The layout is already awaiting the account; resolving the station
 * alongside it costs nothing extra and the name is simply there when the first
 * byte of HTML is.
 *
 * Null means the user has not created a station yet — /dashboard is then the
 * onboarding page — or that the lookup failed. Treat it as "no name to show",
 * never as "no station exists": the API is the authority.
 */
export interface CurrentStation {
  slug: string
  name: string
  artwork_url: string | null
  genre: string | null
  description: string | null
}

const StationContext = createContext<CurrentStation | null>(null)

export function StationProvider({
  station,
  children,
}: {
  station: CurrentStation | null
  children: React.ReactNode
}) {
  return <StationContext.Provider value={station}>{children}</StationContext.Provider>
}

export function useCurrentStation(): CurrentStation | null {
  return useContext(StationContext)
}

/**
 * The station identified by a route slug, or null when the route is not about
 * this user's station.
 *
 * The slug check is not ceremony. `getMyStation()` picks the OLDEST station of
 * an account that somehow holds two, so an owner viewing the other one would
 * otherwise be shown the wrong name on the right page — a worse failure than
 * showing no name at all.
 */
export function useStationBySlug(slug: string | null): CurrentStation | null {
  const station = useCurrentStation()

  if (!slug || !station || station.slug !== slug) return null

  return station
}
