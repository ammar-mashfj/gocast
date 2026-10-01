import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"
import { PageHeader } from "@/components/ds/PageHeader"
import { DeleteStation } from "./DeleteStation"
import { EncoderSection } from "./EncoderSection"
import { LinksCard } from "./LinksCard"
import { ProfileCard } from "./ProfileCard"
import { ShowTimesSection } from "./ShowTimesSection"
import { StreamCard } from "./StreamCard"

export const metadata: Metadata = { title: "Station settings" }

/**
 * Everything about a station you set once and then stop thinking about.
 *
 * Left: what listeners see (profile, links, show times). Right: how audio
 * gets out and in (stream addresses, your own DJ software), and delete,
 * last and quiet. One column below xl.
 */
export default async function StationSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  try {
    station = (await apiFetch<{ data: Station }>(`/stations/${slug}`)).data
  } catch (err) {
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) notFound()
    console.error(`[station/${slug}/settings] fetch failed:`, err)
    throw err
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Station settings" />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <ProfileCard station={station} />
          <LinksCard station={station} />
          <ShowTimesSection station={station} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <StreamCard station={station} />
          <EncoderSection station={station} />
          <DeleteStation slug={station.slug} name={station.name} />
        </div>
      </div>
    </div>
  )
}
