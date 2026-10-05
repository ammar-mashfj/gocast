import { redirect } from "next/navigation"
import { getMyStation } from "@/lib/station-server"
import { Card } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"
import { StationForm } from "@/components/dashboard/station-form/StationForm"

/**
 * The dashboard root, and the only place that answers "which station is this?".
 *
 * A user has one station, so there is no list to land on: this either sends
 * them into it or, when they have not made it yet, IS the onboarding page —
 * the station form right on the page, since making the station is the only
 * thing to do here. Everything else in the dashboard links here rather than
 * to a station URL, because this is the one route that can resolve the slug.
 */
export default async function DashboardPage() {
  const station = await getMyStation()
  if (station) redirect(`/dashboard/stations/${station.slug}`)

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader
        title="Create your station"
        description="Pick a name. Artwork, genre and a description are optional and can change any time."
      />
      <Card>
        <StationForm />
      </Card>
      <p className="text-body-sm text-pretty text-text-faint">
        Next you get a player page link to share, and you can go live from the studio right here in your browser. Nothing to install, and
        listeners don’t need an account to tune in.
      </p>
    </div>
  )
}
