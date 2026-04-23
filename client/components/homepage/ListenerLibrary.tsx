"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { IconHeartFilled, IconHistory } from "@tabler/icons-react"
import {
  type LibraryEntry,
  getSaved,
  getHistory,
  subscribeLibrary,
} from "@/lib/listenerLibrary"
import { StationArtwork } from "@/components/StationArtwork"

const GRADIENTS = [
  "linear-gradient(135deg, #1a0533, #2d1b69)",
  "linear-gradient(135deg, #0f2b1a, #1a5c33)",
  "linear-gradient(135deg, #2b1a0f, #5c3a1a)",
  "linear-gradient(135deg, #1a0f2b, #3a1a5c)",
]

function StationTile({ entry, index }: { entry: LibraryEntry; index: number }) {
  return (
    <Link
      href={`/station/${entry.slug}`}
      className="group bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 transition-all hover:border-violet-border/50 hover:bg-violet-full/[0.03] no-underline flex items-center gap-3 min-w-0"
    >
      <StationArtwork
        src={entry.artworkUrl}
        alt={entry.name}
        className="size-11 rounded-xl shrink-0"
        iconSize={18}
        background={GRADIENTS[index % GRADIENTS.length]}
      />
      <div className="flex flex-col min-w-0">
        <div className="text-sm font-medium text-text-secondary truncate">{entry.name}</div>
        <div className="text-xs text-text-faint truncate">{entry.genre || "Live radio"}</div>
      </div>
    </Link>
  )
}

/**
 * Pick-up-where-you-left-off + saved-stations row, anonymous-only.
 * Renders nothing on first paint (avoids a layout flash for first-time visitors)
 * and only mounts content once we know what's in the listener's library.
 */
export default function ListenerLibrary() {
  const [hydrated, setHydrated] = useState(false)
  const [saved, setSaved] = useState<LibraryEntry[]>([])
  const [history, setHistory] = useState<LibraryEntry[]>([])

  useEffect(() => {
    function refresh() {
      setSaved(getSaved())
      setHistory(getHistory())
    }
    refresh()
    // SSR fallback rendered nothing; flip the gate now that we know what's in
    // localStorage. Intentional cascade — the alternative is a hydration flash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
    return subscribeLibrary(refresh)
  }, [])

  if (!hydrated) return null
  if (saved.length === 0 && history.length === 0) return null

  // Show "Recently played" if listener has any history (de-dupe with saved); otherwise show saved alone.
  const recentEntries = history.filter((h) => !saved.some((s) => s.slug === h.slug)).slice(0, 4)

  return (
    <section className="px-4 md:px-10 py-8 md:py-12">
      {saved.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <IconHeartFilled size={14} className="text-rose-400" />
            <h3 className="text-sm tracking-[2px] uppercase text-violet-muted font-medium">
              Your saved stations
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {saved.slice(0, 4).map((entry, i) => (
              <StationTile key={entry.slug} entry={entry} index={i} />
            ))}
          </div>
        </div>
      )}

      {recentEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <IconHistory size={14} className="text-text-muted" />
            <h3 className="text-sm tracking-[2px] uppercase text-text-muted font-medium">
              Pick up where you left off
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentEntries.map((entry, i) => (
              <StationTile key={entry.slug} entry={entry} index={i} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
