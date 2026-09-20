"use client"

import { IconMusic, IconPlaylist, IconPlus, IconStarFilled } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatAirtime } from "@/lib/format"
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
 * Where the owner picks what they are looking at: every file they own, or one
 * of the rotations built from them. A column beside the list from md up; a
 * scrolling row of chips above it on a phone, where a column would push the
 * list below the fold.
 *
 * The two groups are LABELLED rather than merely separated. "All tracks" used
 * to sit above a hairline divider styled exactly like the playlists under it,
 * so the one entry that manages files — upload, delete, fix tags — read as
 * just another rotation and went unnoticed. A divider says "these are
 * different"; only a label says how.
 *
 * Labels are md-and-up only. Below that the rail is a horizontal chip row and
 * headings in the middle of it would break the line.
 */
export function PlaylistRail({
  playlists,
  libraryCount,
  selected,
  onSelect,
  onCreate,
  locked,
}: Props) {
  return (
    <nav
      aria-label="Music"
      className="flex md:flex-col gap-1 md:w-56 shrink-0 overflow-x-auto md:overflow-visible pb-1 md:pb-0"
    >
      <RailLabel>Library</RailLabel>

      <RailItem
        active={selected === LIBRARY_KEY}
        onClick={() => onSelect(LIBRARY_KEY)}
        icon={<IconMusic size={15} />}
        label="All tracks"
        detail={`${libraryCount}`}
        title="Every file you own. Upload, delete and fix tags here."
      />

      <RailLabel className="md:pt-3">Playlists</RailLabel>

      {playlists.map((playlist) => (
        <RailItem
          key={playlist.id}
          active={selected === playlist.id}
          onClick={() => onSelect(playlist.id)}
          icon={
            playlist.is_default ? (
              <IconStarFilled size={13} className="text-primary" />
            ) : (
              <IconPlaylist size={15} />
            )
          }
          label={playlist.name}
          detail={railDetail(playlist)}
          title={playlist.is_default ? "Default — plays whenever nothing else is scheduled." : undefined}
        />
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={onCreate}
        disabled={locked}
        title={locked ? "Playlists are part of AutoDJ, which isn't in your plan." : undefined}
        className="justify-start text-muted-foreground shrink-0"
      >
        <IconPlus size={15} data-icon="inline-start" />
        New playlist
      </Button>
    </nav>
  )
}

/** A group heading inside the rail. Invisible on a phone — see the note above. */
function RailLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "hidden md:block px-2.5 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/70 select-none",
        className,
      )}
    >
      {children}
    </span>
  )
}

function railDetail(playlist: Playlist): string {
  const count = playlist.track_count ?? 0
  const seconds = playlist.duration_seconds ?? 0
  return seconds > 0 ? `${count} · ${formatAirtime(seconds)}` : `${count}`
}

interface RailItemProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  detail: string
  title?: string
}

function RailItem({ active, onClick, icon, label, detail, title }: RailItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-left shrink-0 md:shrink cursor-pointer transition-colors",
        "min-w-0 max-w-[14rem] md:max-w-none",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span className="shrink-0 inline-flex">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground/80 shrink-0">{detail}</span>
    </button>
  )
}
