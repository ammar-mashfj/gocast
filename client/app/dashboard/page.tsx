import { redirect } from "next/navigation"
import { getMyStation } from "@/lib/station-server"
import { CreateStation } from "@/components/dashboard/station-form/CreateStation"

/**
 * The dashboard root, and the only place that answers "which station is this?".
 *
 * A user has one station, so there is no list to land on: this either sends
 * them into it or, when they have not made it yet, IS the onboarding page —
 * the create screen right here, since making the station is the only thing
 * to do. Everything else in the dashboard links here rather than to a
 * station URL, because this is the one route that can resolve the slug.
 */
export default async function DashboardPage() {
  const station = await getMyStation()
  if (station) redirect(`/dashboard/stations/${station.slug}`)

  return <CreateStation />
}
