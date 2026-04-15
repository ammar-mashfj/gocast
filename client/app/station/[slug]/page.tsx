import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { PlayerView } from "@/app/station/[slug]/PlayerView"

async function getStation(slug: string): Promise<Station | null> {
  try {
    const res = await fetch(`${env.apiUrl}/public/stations/${slug}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const station = await getStation(slug)

  if (!station) {
    return { title: "Station not found — GoCast" }
  }

  const title = `${station.name} — GoCast`
  const description = station.description || `Listen to ${station.name} live on GoCast`
  const appUrl = env.appUrl

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "music.radio_station",
      url: `${appUrl}/station/${station.slug}`,
      ...(station.artwork_url ? { images: [{ url: station.artwork_url }] } : {}),
    },
    twitter: {
      card: station.artwork_url ? "summary_large_image" : "summary",
      title,
      description,
      ...(station.artwork_url ? { images: [station.artwork_url] } : {}),
    },
  }
}

export default async function StationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const station = await getStation(slug)

  if (!station) {
    notFound()
  }

  return <PlayerView station={station} />
}
