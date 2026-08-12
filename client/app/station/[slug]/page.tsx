import type { Metadata } from "next"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { Station } from "@/interfaces/Station"
import { User } from "@/interfaces/User"
import { env } from "@/lib/env"
import PlayerViewClient from "@/app/station/[slug]/PlayerViewClient"

async function getStation(slug: string): Promise<Station | null> {
  // Dev: undici holds keep-alive sockets longer than FrankenPHP keeps them
  // alive, so the first attempt after an idle window hits a half-closed
  // socket and ConnectTimeouts at 10s. Second attempt opens a fresh socket
  // and lands in <200ms. In prod a real LB in front of the api hides this.
  const isDev = process.env.NODE_ENV === "development"
  const attempts = isDev ? 2 : 1

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${env.apiUrl}/public/stations/${slug}`, {
        headers: { Accept: "application/json" },
        signal: isDev ? AbortSignal.timeout(3000) : undefined,
        ...(isDev ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
      })
      if (!res.ok) return res.status === 404 ? null : null
      const json = await res.json()
      return json.data
    } catch (err) {
      // Last attempt — give up. Earlier attempts retry the stale-socket case.
      if (i === attempts - 1) {
        if (isDev) console.warn(`[getStation] fetch failed for ${slug}:`, err)
        return null
      }
    }
  }
  return null
}

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

  const title = `${station.name} — Live on GoCast`
  const description = station.description || `Tune in to ${station.name} live${station.genre ? ` (${station.genre})` : ""} on GoCast — your browser radio.`
  const appUrl = env.appUrl
  const url = `${appUrl}/station/${station.slug}`
  const imageUrl = station.artwork_url || `${appUrl}/og-image.jpg`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "music.radio_station",
      url,
      siteName: "GoCast",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: station.artwork_url ? station.name : "GoCast — Live radio from your browser" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
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
        ...(station.artwork_url ? { image: station.artwork_url } : {}),
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
      <PlayerViewClient station={station} isOwner={isOwner} />
    </>
  )
}
