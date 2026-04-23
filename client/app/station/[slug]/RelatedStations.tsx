"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Station } from "@/interfaces/Station"
import { Skeleton } from "@/components/ui/skeleton"
import { StationArtwork } from "@/components/StationArtwork"
import { env } from "@/lib/env"

const GRADIENTS = [
  "linear-gradient(135deg, #1a0533, #2d1b69)",
  "linear-gradient(135deg, #0f2b1a, #1a5c33)",
  "linear-gradient(135deg, #2b1a0f, #5c3a1a)",
  "linear-gradient(135deg, #1a0f2b, #3a1a5c)",
]

/**
 * "More live now" — keeps a listener inside GoCast when their current
 * station ends or they get curious. Renders nothing if there's nothing
 * else to recommend. Designed to be inlined into the player's controls
 * column so it shares vertical space with the play button etc.
 */
export function RelatedStations({ excludeSlug }: { excludeSlug: string }) {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`${env.apiUrl}/public/featured`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const list: Station[] = (j.data ?? []).filter((s: Station) => s.slug !== excludeSlug)
        setStations(list.slice(0, 3))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [excludeSlug])

  // Skeleton during fetch — matches the row shape so there's no layout shift
  // when the real data arrives.
  if (loading) {
    return (
      <div className="mt-8 w-full max-w-sm md:w-auto md:min-w-[300px] md:max-w-md">
        <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground mb-2">
          More live now
        </div>
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-1.5 flex items-center gap-2.5"
            >
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (stations.length === 0) return null

  return (
    <div className="mt-8 w-full max-w-sm md:w-auto md:min-w-[300px] md:max-w-md">
      <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground mb-2">
        More live now
      </div>
      <div className="flex flex-col gap-1.5">
        {stations.map((s, i) => (
          <Link
            key={s.id}
            href={`/station/${s.slug}`}
            className="group bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-1.5 transition-colors hover:border-violet-border/40 hover:bg-violet-full/[0.05] no-underline flex items-center gap-2.5"
          >
            <StationArtwork
              src={s.artwork_url}
              alt={s.name}
              className="size-8 rounded-lg shrink-0"
              iconSize={14}
              background={GRADIENTS[i % GRADIENTS.length]}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">{s.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{s.genre || "Live"}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="size-1.5 bg-emerald-400 rounded-full animate-pulse" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
