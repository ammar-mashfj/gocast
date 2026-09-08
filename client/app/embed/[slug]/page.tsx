import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { EmbedPlayer } from "./EmbedPlayer"

/**
 * The embeddable player, at `/embed/{slug}`.
 *
 * The gate is the API's, not this page's: `/public/stations/{slug}/embed`
 * answers 404 unless the owner's plan allows embedding, and this page turns
 * that into a Next 404. Reading the plan here instead would put a second
 * copy of the rule in TypeScript, free to drift from the one that matters.
 *
 * This route is the ONE place the app may be framed — next.config.ts drops
 * X-Frame-Options for /embed/* and sends `frame-ancestors *` instead. Nothing
 * that needs a session may ever live under this path.
 */
async function getEmbeddableStation(slug: string): Promise<Station | null> {
  // Same retry shape as the station page: in dev, undici's first request
  // after an idle window hits a half-closed keep-alive socket.
  const isDev = process.env.NODE_ENV === "development"
  const attempts = isDev ? 2 : 1

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${env.apiUrl}/public/stations/${slug}/embed`, {
        headers: { Accept: "application/json" },
        signal: isDev ? AbortSignal.timeout(3000) : undefined,
        // A short window rather than the station page's 60s: a downgrade
        // is supposed to take embeds down promptly, and this payload is one
        // row per embed load, not per listener.
        ...(isDev ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
      })
      if (!res.ok) return null
      const json = await res.json()
      return json.data
    } catch (err) {
      if (i === attempts - 1) {
        if (isDev) console.warn(`[embed] fetch failed for ${slug}:`, err)
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
  const station = await getEmbeddableStation(slug)

  // Never indexed: the canonical page for a station is /station/{slug}, and
  // an indexed embed is a duplicate that ranks against it with no chrome.
  return {
    title: station ? `${station.name} — Player` : "Not available",
    robots: { index: false, follow: false },
    ...(station ? { alternates: { canonical: `${env.appUrl}/station/${station.slug}` } } : {}),
  }
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const station = await getEmbeddableStation(slug)

  if (!station) {
    notFound()
  }

  return <EmbedPlayer station={station} />
}
