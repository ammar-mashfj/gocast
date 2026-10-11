"use client"

import { IconPlus } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { formatAirtime } from "@/lib/format"
import { playlistSwatch } from "@/lib/playlistSwatches"
import type { Playlist } from "@/interfaces/Playlist"

/** `selected` when the whole library is in view rather than a playlist (the Library page). */
export const LIBRARY_KEY = "library"

interface Props {
  playlists: Playlist[]
  /** A playlist id. */
  selected: string
  onSelect: (key: string) => void
  onCreate: () => void
  /** No AutoDJ on this plan: creating is blocked, browsing is not. */
  locked: boolean
}

/**
 * The Playlists page's list: every playlist, each with the violet shade it
 * wears on the schedule. A column beside the open playlist from md up; a
 * scrolling row of chips above it on a phone, where a column would push the
 * table below the fold.
 */
export function PlaylistRail({ playlists, selected, onSelect, onCreate, locked }: Props) {
  return (
    <nav
      aria-label="Music"
      className="flex max-w-full min-w-0 shrink-0 gap-1 overflow-x-auto pb-1 md:w-60 md:flex-col md:overflow-visible md:pb-0"
    >
      {playlists.map((playlist, i) => (
        <RailItem
          key={playlist.id}
          active={selected === playlist.id}
          onClick={() => onSelect(playlist.id)}
          swatch={playlistSwatch(i).dot}
          label={playlist.name}
          detail={railDetail(playlist)}
          title={playlist.is_default ? "Plays whenever nothing else is scheduled." : undefined}
        />
      ))}

      <button
        type="button"
        onClick={onCreate}
        disabled={locked}
        title={locked ? "Playlists are part of AutoDJ, which isn't in your plan." : undefined}
        className="flex shrink-0 items-center gap-2 rounded-control px-3 py-3 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
      >
        <IconPlus className="size-4" />
        New playlist
      </button>
    </nav>
  )
}

function railDetail(playlist: Playlist): string {
  const count = playlist.track_count ?? 0
  const seconds = playlist.duration_seconds ?? 0
  return seconds > 0 ? `${count} · ${formatAirtime(seconds)}` : String(count)
}

function RailItem({
  active,
  onClick,
  swatch,
  label,
  detail,
  title,
}: {
  active: boolean
  onClick: () => void
  swatch?: string
  label: string
  detail: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex max-w-56 min-w-0 shrink-0 items-center justify-between gap-2.5 rounded-control p-3 text-left transition-colors outline-none md:max-w-none md:shrink",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-card text-foreground" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {swatch && <span aria-hidden className={cn("size-2.5 shrink-0 rounded-swatch", swatch)} />}
        <span className="truncate text-body font-semibold">{label}</span>
      </span>
      <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">{detail}</span>
    </button>
  )
}
