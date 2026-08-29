import { redirect } from "next/navigation"

/**
 * There is no station list any more — a user has one station.
 *
 * The route is kept as a redirect rather than deleted because this URL is in
 * the wild: old bookmarks, the marketing nav, and any link sent before the
 * change all point at it. /dashboard resolves the station and forwards.
 */
export default function StationsIndexPage() {
  redirect("/dashboard")
}
