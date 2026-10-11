"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { IconHeartFilled, IconHistory } from "@tabler/icons-react"
import { StationArtwork } from "@/components/StationArtwork"
import {
  type LibraryEntry,
  getSaved,
  getHistory,
  subscribeLibrary,
} from "@/lib/listenerLibrary"

function StationTile({ entry }: { entry: LibraryEntry }) {
  return (
    <Link
      href={`/station/${entry.slug}`}
      // min-w-0: a grid item's minimum width is otherwise its content, so a long
      // station name would widen the tile (and the page) instead of truncating.
      className="flex min-w-0 items-center gap-3 rounded-well bg-card p-3 no-underline transition-colors outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
    >
      <StationArtwork src={entry.artworkUrl} alt={entry.name} className="size-12 shrink-0 overflow-hidden rounded-item" iconSize={18} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body font-semibold text-foreground">{entry.name}</span>
        <span className="truncate text-caption text-text-faint">{entry.genre || "Live radio"}</span>
      </div>
    </Link>
  )
}

function Group({ icon, title, entries }: { icon: React.ReactNode; title: string; entries: LibraryEntry[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <span className="text-on-air-text">{icon}</span>
        <h3 className="font-display text-heading">{title}</h3>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]">
        {entries.map((entry) => (
          <StationTile key={entry.slug} entry={entry} />
        ))}
      </div>
    </div>
  )
}

/**
 * Pick-up-where-you-left-off + saved-stations row, for a returning listener.
 * The one section on the page that is for listeners rather than
 * broadcasters, which is why it stays: it is the only reason someone who
 * came back to hear a station has to be here at all.
 *
 * Renders nothing on first paint (avoids a layout flash for first-time
 * visitors) and only mounts content once we know what's in the library.
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

  // "Recently played" if the listener has any history (de-duped against saved).
  const recentEntries = history.filter((h) => !saved.some((s) => s.slug === h.slug)).slice(0, 4)

  return (
    <section className="border-t border-line">
      <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-gutter py-12 sm:py-16">
        {saved.length > 0 && (
          <Group icon={<IconHeartFilled size={16} />} title="Your saved stations" entries={saved.slice(0, 4)} />
        )}
        {recentEntries.length > 0 && (
          <Group icon={<IconHistory size={16} />} title="Pick up where you left off" entries={recentEntries} />
        )}
      </div>
    </section>
  )
}
