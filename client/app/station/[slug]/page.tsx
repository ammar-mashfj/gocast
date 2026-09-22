import type { Metadata } from "next"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { User } from "@/interfaces/User"
import { env } from "@/lib/env"
import { metaDescription } from "@/lib/seo"
import { PlayerView } from "./PlayerView"
import { getStation } from "./getStation"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const station = await getStation(slug)

  if (!station) {
    // 404'd station pages must not be indexed — otherwise Google picks up
    // a "soft 404" that pollutes search results for the brand.
    return {
      title: "Station not found",
      robots: { index: false, follow: true },
    }
  }

  // `absolute`: the root template appends "— GoCast", and this title already
  // names GoCast, so a plain string rendered "X — Live on GoCast — GoCast".
  const title = `${station.name} — Live on GoCast`
  // The owner's bio is free text — newlines, any length — so it is flattened
  // and cut to snippet length rather than passed through.
  const description = metaDescription(
    station.description ||
      `Tune in to ${station.name} live${station.genre ? ` (${station.genre})` : ""} on GoCast — your browser radio.`,
  )
  const url = `${env.appUrl}/station/${station.slug}`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // A station that has never made a sound is a page with a name on it and
    // nothing else. It stays reachable — the owner shares it before the first
    // broadcast — but is kept out of the index until it has something to
    // offer. Same rule as the stations sitemap (Station::scopeIndexable).
    ...(station.indexable === false ? { robots: { index: false, follow: true } } : {}),
    // No `images` in either card: opengraph-image.tsx and twitter-image.tsx
    // beside this file compose one from the artwork and the name, and a
    // file-based image outranks anything set here.
    openGraph: {
      title,
      description,
      type: "music.radio_station",
      url,
      siteName: "GoCast",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: "@gocastfm",
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

  // Detect ownership server-side so the player page can render an
  // owner-only "Open studio" affordance without a client round-trip.
  let isOwner = false
  try {
    const cookieStore = await cookies()
    const userCookie = cookieStore.get("user")?.value
    if (userCookie) {
      const user: User = JSON.parse(decodeURIComponent(userCookie))
      isOwner = user.id === station.user_id
    }
  } catch {
    // malformed user cookie — treat as anonymous
  }

  const url = `${env.appUrl}/station/${station.slug}`
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RadioStation",
        "@id": `${url}#station`,
        name: station.name,
        url,
        description: station.description || `Listen to ${station.name} live on GoCast`,
        ...(station.artwork_url ? { image: station.artwork_url, logo: station.artwork_url } : {}),
        ...(station.genre ? { genre: station.genre } : {}),
        broadcastService: {
          "@type": "BroadcastService",
          name: station.name,
          broadcastDisplayName: station.name,
          // schema.org: broadcastFrequency=Online declares the station is
          // currently broadcasting. AutoDJ counts as broadcasting (audio
          // is flowing to listeners), so use is_on_air, not is_live.
          ...(station.is_on_air ? { broadcastFrequency: "Online" } : {}),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${env.appUrl}/` },
          { "@type": "ListItem", position: 2, name: station.name, item: url },
        ],
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {/* Server-rendered, not behind `dynamic(..., { ssr: false })` as it
          used to be. That boundary meant the HTML a crawler or a link
          unfurler received was a skeleton — no <h1>, no station name, no
          description, only the meta tags. Nothing in PlayerView touches a
          browser API during render (hls.js imports cleanly on the server;
          every window/navigator/localStorage read is in an effect or a
          handler), so the whole page now arrives as HTML and hydrates. */}
      <PlayerView station={station} isOwner={isOwner} />
    </>
  )
}
