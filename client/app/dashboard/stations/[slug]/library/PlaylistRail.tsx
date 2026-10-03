"use client"

import { IconPlus } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { formatAirtime } from "@/lib/format"
import { playlistSwatch } from "@/lib/playlistSwatches"
import type { Playlist } from "@/interfaces/Playlist"

/** The pseudo-entry for the whole library, alongside the real playlists. */
export const LIBRARY_KEY = "library"

interface Props {
  playlists: Playlist[]
  libraryCount: number
  /** A playlist id, or LIBRARY_KEY. */
  selected: string
  onSelect: (key: string) => void
  onCreate: () => void
  /** No AutoDJ on this plan: creating is blocked, browsing is not. */
  locked: boolean
}

/**
 * Where the owner picks what they're looking at: every file they own
 * (LIBRARY), or one of the rotations built from it (PLAYLISTS, each with the
 * violet shade it wears on the schedule). A column beside the table from md
 * up; a scrolling row of chips above it on a phone, where a column would push
 * the table below the fold. The group labels are md-and-up only, so they
 * don't break the chip row.
 */
export function PlaylistRail({ playlists, libraryCount, selected, onSelect, onCreate, locked }: Props) {
  return (
    <nav
      aria-label="Music"
      className="flex max-w-full min-w-0 shrink-0 gap-1 overflow-x-auto pb-1 md:w-60 md:flex-col md:overflow-visible md:pb-0"
    >
      <RailLabel>Library</RailLabel>
      <RailItem
        active={selected === LIBRARY_KEY}
        onClick={() => onSelect(LIBRARY_KEY)}
        label="All tracks"
        detail={String(libraryCount)}
        title="Every file you own. Upload, delete and fix tags here."
      />

      <RailLabel className="md:pt-4.5">Playlists</RailLabel>
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

function RailLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("hidden px-3 pb-2 eyebrow text-text-faint select-none md:block", className)}>{children}</span>
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
