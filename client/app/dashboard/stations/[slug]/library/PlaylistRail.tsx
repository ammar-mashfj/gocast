"use client"

import { IconChevronRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Tag } from "@/components/ds/Tag"
import { formatAirtime } from "@/lib/format"
import { playlistDot, playlistDotTitle } from "@/lib/playlistSwatches"
import type { Playlist } from "@/interfaces/Playlist"

/** `selected` when the whole library is in view rather than a playlist (the Library page). */
export const LIBRARY_KEY = "library"

interface Props {
  playlists: Playlist[]
  /** A playlist id. */
  selected: string
  onSelect: (key: string) => void
}

/**
 * The Playlists page's list: every playlist, each with the violet shade it
 * wears on the schedule. A column beside the open playlist from lg up;
 * below lg, PlaylistPhoneList instead (a 240px column squeezed the playlist
 * on a tablet).
 */
export function PlaylistRail(props: Props) {
  return (
    <nav aria-label="Playlists" className="hidden w-60 shrink-0 flex-col gap-1 lg:flex">
      {props.playlists.map((playlist, i) => (
        <RailItem
          key={playlist.id}
          active={props.selected === playlist.id}
          onClick={() => props.onSelect(playlist.id)}
          swatch={playlistDot(playlist, i)}
          swatchTitle={playlistDotTitle(playlist)}
          label={playlist.name}
          detail={railDetail(playlist)}
          title={playlist.is_default ? "Plays whenever nothing else is scheduled." : undefined}
        />
      ))}
    </nav>
  )
}

/**
 * Phones and tablets (below lg): the Playlists page opens on this list, and
 * a tap opens that playlist on its own screen (LibraryView). It replaced a
 * "Change" picker above the open playlist, which nobody read as belonging
 * to the card under it.
 */
export function PlaylistPhoneList({ playlists, onOpen }: { playlists: Playlist[]; onOpen: (id: string) => void }) {
  if (playlists.length === 0) {
    return <p className="rounded-card bg-card px-5.5 py-10 text-center text-body text-muted-foreground">No playlists yet. Make one to choose what AutoDJ plays.</p>
  }
  return (
    <nav aria-label="Playlists" className="flex flex-col rounded-card bg-card p-1.5 [&>button+button]:border-t [&>button+button]:border-line">
      {playlists.map((playlist, i) => (
        <button
          key={playlist.id}
          type="button"
          onClick={() => onOpen(playlist.id)}
          className="flex min-h-16 cursor-pointer items-center gap-3 rounded-control px-3.5 py-3 text-left outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden title={playlistDotTitle(playlist)} className={cn("size-3 shrink-0 rounded-swatch", playlistDot(playlist, i).className)} style={playlistDot(playlist, i).style} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-body font-semibold">{playlist.name}</span>
              {playlist.is_default && <Tag className="shrink-0">Default</Tag>}
            </span>
            <span className="text-body-sm text-muted-foreground">{pickerDetail(playlist)}</span>
          </span>
          <IconChevronRight aria-hidden className="size-5 shrink-0 text-text-faint" />
        </button>
      ))}
    </nav>
  )
}

/** Compact, for the rail and the sheet's rows: "12 · 48m", or "Empty". */
function railDetail(playlist: Playlist): string {
  const count = playlist.track_count ?? 0
  const seconds = playlist.duration_seconds ?? 0
  if (count === 0) return "Empty"
  return seconds > 0 ? `${count} · ${formatAirtime(seconds)}` : String(count)
}

/** In words, for the phone list, where there's room: "12 tracks · 48m". */
function pickerDetail(playlist: Playlist): string {
  const count = playlist.track_count ?? 0
  const seconds = playlist.duration_seconds ?? 0
  if (count === 0) return "No tracks yet"
  const tracks = `${count} ${count === 1 ? "track" : "tracks"}`
  return seconds > 0 ? `${tracks} · ${formatAirtime(seconds)}` : tracks
}

function RailItem({
  active,
  onClick,
  swatch,
  swatchTitle,
  label,
  detail,
  title,
}: {
  active: boolean
  onClick: () => void
  swatch?: { className: string; style?: React.CSSProperties }
  swatchTitle?: string
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
        "flex min-w-0 items-center justify-between gap-2.5 rounded-control p-3 text-left transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-card text-foreground" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {swatch && <span aria-hidden title={swatchTitle} className={cn("size-2.5 shrink-0 rounded-swatch", swatch.className)} style={swatch.style} />}
        <span className="truncate text-body font-semibold">{label}</span>
      </span>
      <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">{detail}</span>
    </button>
  )
}
