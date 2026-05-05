import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { StationArtwork } from "@/components/StationArtwork"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"
import { DiscoverFilters } from "./DiscoverFilters"

const DISCOVER_TITLE = "Discover live stations"
const DISCOVER_DESCRIPTION = "Browse and search every public station broadcasting live on GoCast — by genre, name, or what's on right now."

export const metadata: Metadata = {
  title: DISCOVER_TITLE,
  description: DISCOVER_DESCRIPTION,
  alternates: { canonical: "/discover" },
  robots: { index: false, follow: false },
  openGraph: {
    title: DISCOVER_TITLE,
    description: DISCOVER_DESCRIPTION,
    type: "website",
    url: "/discover",
    siteName: "GoCast",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "GoCast — Live radio from your browser" }],
  },
  twitter: {
    card: "summary_large_image",
    title: DISCOVER_TITLE,
    description: DISCOVER_DESCRIPTION,
    images: ["/og-image.jpg"],
  },
}

interface PaginatedStations {
  data: Station[]
  meta?: { current_page: number; last_page: number; total: number }
}

const GRADIENTS = [
  "linear-gradient(135deg, #1a0533, #2d1b69)",
  "linear-gradient(135deg, #0f2b1a, #1a5c33)",
  "linear-gradient(135deg, #2b1a0f, #5c3a1a)",
  "linear-gradient(135deg, #1a0f2b, #3a1a5c)",
]

async function getStations(searchParams: { q?: string; genre?: string; sort?: string; page?: string }): Promise<PaginatedStations> {
  const params = new URLSearchParams()
  if (searchParams.q) params.set("q", searchParams.q)
  if (searchParams.genre) params.set("genre", searchParams.genre)
  if (searchParams.sort) params.set("sort", searchParams.sort)
  if (searchParams.page) params.set("page", searchParams.page)

  try {
    const res = await fetch(`${env.apiUrl}/public/stations?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    })
    if (!res.ok) return { data: [] }
    return await res.json()
  } catch {
    return { data: [] }
  }
}

async function getGenres(): Promise<string[]> {
  try {
    const res = await fetch(`${env.apiUrl}/public/genres`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; sort?: string; page?: string }>
}) {
  redirect("/")

  const params = await searchParams
  const [{ data: stations, meta }, genres] = await Promise.all([
    getStations(params),
    getGenres(),
  ])

  const liveCount = stations.filter((s) => s.is_live).length
  const totalPages = meta?.last_page ?? 0
  const currentPage = meta?.current_page ?? 1

  return (
    <>
      <section className="px-4 md:px-10 pt-8 md:pt-12 pb-6">
        <div className="text-xs tracking-[3px] uppercase text-violet-muted mb-3">Discover</div>
        <h1 className="text-3xl md:text-5xl font-semibold -tracking-wide leading-tight mb-3">
          Every station on GoCast.
        </h1>
        <p className="text-sm md:text-base text-text-muted max-w-[560px] leading-relaxed">
          {meta?.total ?? stations.length} station{(meta?.total ?? stations.length) === 1 ? "" : "s"} ·{" "}
          <span className="text-emerald-300">{liveCount} live now</span>
        </p>
      </section>

      <DiscoverFilters genres={genres} initial={params} />

      <section className="px-4 md:px-10 pb-12">
        {stations.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            No stations match your filters yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {stations.map((station, i) => (
              <Link
                key={station.id}
                href={`/station/${station.slug}`}
                className="group bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 transition-all hover:border-violet-border/50 hover:bg-violet-full/[0.03] no-underline flex items-center gap-3"
              >
                <StationArtwork
                  src={station.artwork_url}
                  alt={station.name}
                  className="size-12 rounded-xl shrink-0"
                  iconSize={18}
                  background={GRADIENTS[i % GRADIENTS.length]}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-secondary truncate">{station.name}</div>
                  <div className="text-xs text-text-faint truncate">{station.genre || "Live radio"}</div>
                </div>
                {station.is_live && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="size-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[9px] text-emerald-300 uppercase tracking-wider">Live</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              const newParams = new URLSearchParams()
              if (params.q) newParams.set("q", params.q)
              if (params.genre) newParams.set("genre", params.genre)
              if (params.sort) newParams.set("sort", params.sort)
              newParams.set("page", String(page))
              const isActive = page === currentPage
              return (
                <Link
                  key={page}
                  href={`/discover?${newParams}`}
                  className={`size-9 rounded-lg flex items-center justify-center text-sm no-underline transition-colors ${
                    isActive
                      ? "bg-violet-full text-white"
                      : "bg-white/[0.03] border border-white/[0.06] text-text-muted hover:border-violet-border/40 hover:text-white"
                  }`}
                >
                  {page}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
