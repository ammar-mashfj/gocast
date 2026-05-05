"use client"

import { useState, useEffect, useTransition, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconSearch, IconLoader2 } from "@tabler/icons-react"

interface DiscoverFiltersProps {
  genres: string[]
  initial: { q?: string; genre?: string; sort?: string }
}

export function DiscoverFilters({ genres, initial }: DiscoverFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(initial.q ?? "")
  const [genre, setGenre] = useState(initial.genre ?? "")
  const [sort, setSort] = useState(initial.sort ?? "live")

  // Re-sync local state if user navigates back/forward — intentional cascade
  // because we're mirroring an external store (the URL) into form state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ(searchParams.get("q") ?? "")
    setGenre(searchParams.get("genre") ?? "")
    setSort(searchParams.get("sort") ?? "live")
  }, [searchParams])

  function applyFilters(next: { q?: string; genre?: string; sort?: string }) {
    const params = new URLSearchParams()
    const finalQ = next.q ?? q
    const finalGenre = next.genre ?? genre
    const finalSort = next.sort ?? sort
    if (finalQ) params.set("q", finalQ)
    if (finalGenre) params.set("genre", finalGenre)
    if (finalSort && finalSort !== "live") params.set("sort", finalSort)
    startTransition(() => {
      router.push(`/discover${params.toString() ? `?${params}` : ""}`)
    })
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    applyFilters({ q })
  }

  return (
    <section className="px-4 md:px-10 pb-6">
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-0">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stations"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-text-faint focus:outline-none focus:border-violet-border/70 transition-colors"
            aria-label="Search stations"
          />
        </form>
        <select
          value={genre}
          onChange={(e) => { setGenre(e.target.value); applyFilters({ genre: e.target.value }) }}
          className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-border/70 transition-colors min-w-[140px]"
          aria-label="Filter by genre"
        >
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); applyFilters({ sort: e.target.value }) }}
          className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-border/70 transition-colors min-w-[120px]"
          aria-label="Sort by"
        >
          <option value="live">Live first</option>
          <option value="new">Newest</option>
        </select>
        {pending && <IconLoader2 size={16} className="animate-spin text-text-muted" />}
      </div>
    </section>
  )
}
