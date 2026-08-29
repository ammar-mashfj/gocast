import { redirect } from "next/navigation"
import { getMyStation } from "@/lib/station-server"

/**
 * The AutoDJ library is owned per-station, and a user has one station — so
 * this is a forwarder, not a page. It used to be a picker: a list of station
 * cards that only ever rendered for accounts with two or more.
 *
 * It stays on its own route because the sidebar links here: "AutoDJ" is a
 * fixed nav item and cannot know the slug.
 */
export default async function LibraryIndexPage() {
  const station = await getMyStation()

  // No station yet — /dashboard is the onboarding page, and the library is
  // meaningless until it exists.
  redirect(station ? `/dashboard/stations/${station.slug}/library` : "/dashboard")
}
