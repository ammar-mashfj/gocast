import { redirect } from "next/navigation"
import { getMyStation } from "@/lib/station-server"
import { CreateStationButton } from "@/components/dashboard/CreateStationButton"

/**
 * The dashboard root, and the only place that answers "which station is this?".
 *
 * A user has one station, so there is no list to land on: this either sends
 * them into it or, when they have not made it yet, IS the onboarding page.
 * Everything else in the dashboard links here rather than to a station URL,
 * because this is the one route that can resolve the slug.
 */
export default async function DashboardPage() {
  const station = await getMyStation()

  if (station) {
    redirect(`/dashboard/stations/${station.slug}`)
  }

  // One action and one sentence about what follows it. This used to be a
  // centred empty-state plus three identical icon cards selling features to
  // someone who has already signed up, one of which promised "no studio" in a
  // product whose main screen is called Studio. Left-aligned like every other
  // dashboard page, so the first screen a new account sees is already the
  // shape of the ones after it.
  return (
    <div className="max-w-2xl flex flex-col gap-8 py-4">
      <div className="flex flex-col items-start gap-5">
        <div>
          <h1 className="font-display text-[38px] font-extrabold leading-none tracking-[-0.04em]">
            Create your station
          </h1>
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            Pick a name. Artwork, genre and a description are optional and can change any time.
          </p>
        </div>
        <CreateStationButton />
      </div>

      {/* What happens next, as its own card on the page. */}
      <p className="max-w-[60ch] rounded-3xl bg-card p-5 text-sm leading-relaxed text-muted-foreground">
        Next you get a player page link to share, and you can go live from the
        Studio right here in your browser. Nothing to install, and listeners
        don&apos;t need an account to tune in.
      </p>
    </div>
  )
}
