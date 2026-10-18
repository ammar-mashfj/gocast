import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"
import { PageHeader } from "@/components/ds/PageHeader"
import { DeleteStation } from "./DeleteStation"
import { EncoderSection } from "./EncoderSection"
import { LinksCard } from "./LinksCard"
import { ProfileCard } from "./ProfileCard"
import { StreamCard } from "./StreamCard"

export const metadata: Metadata = { title: "Station settings" }

/**
 * Everything about a station you set once and then stop thinking about.
 *
 * The profile spans the top, as the Overview header does. Then the stream
 * addresses (the link people come here to copy) beside two tiles that
 * open in dialogs, links and your own DJ software. Delete last, set apart. One
 * column below xl, in the same order.
 */
export default async function StationSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  try {
    station = (await apiFetch<{ data: Station }>(`/stations/${slug}`)).data
  } catch (err) {
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) notFound()
    console.error(`[station/${slug}/settings] fetch failed:`, err)
    throw err
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Station settings" />
      <ProfileCard station={station} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <StreamCard station={station} />
        {/* On xl the two tiles share the stream card's height. They open in
            dialogs, so they never grow and the columns stay in line. */}
        <div className="flex min-w-0 flex-col gap-5 xl:self-stretch xl:*:flex-1">
          <LinksCard station={station} />
          <EncoderSection station={station} />
        </div>
      </div>
      <div className="mt-4">
        <DeleteStation slug={station.slug} name={station.name} />
      </div>
    </div>
  )
}
