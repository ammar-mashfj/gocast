"use client"

import { useState } from "react"
import { IconCheck, IconChevronDown, IconPlus } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ds/Dialog"
import { ProTag, Tag } from "@/components/ds/Tag"
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
 * wears on the schedule. A column beside the open playlist from lg up. Below
 * lg (phones and tablets) a full-width button naming the open playlist,
 * which opens the list in a sheet: a sideways-scrolling strip of chips hid
 * most of them, and a 240px column squeezed the playlist on a tablet.
 */
export function PlaylistRail(props: Props) {
  return (
    <>
      <PlaylistPicker {...props} />
      <nav aria-label="Playlists" className="hidden w-60 shrink-0 flex-col gap-1 lg:flex">
        {props.playlists.map((playlist, i) => (
          <RailItem
            key={playlist.id}
            active={props.selected === playlist.id}
            onClick={() => props.onSelect(playlist.id)}
            swatch={playlistSwatch(i).dot}
            label={playlist.name}
            detail={railDetail(playlist)}
            title={playlist.is_default ? "Plays whenever nothing else is scheduled." : undefined}
          />
        ))}
        <NewPlaylistButton onCreate={props.onCreate} locked={props.locked} />
      </nav>
    </>
  )
}

function PlaylistPicker({ playlists, selected, onSelect, onCreate, locked }: Props) {
  const [open, setOpen] = useState(false)
  const index = playlists.findIndex((p) => p.id === selected)
  const current = index >= 0 ? playlists[index] : null

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-4 rounded-control bg-card px-4.5 py-4 text-left outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Labelled, so it reads as "which playlist you're looking at"
            rather than a stray row. */}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="eyebrow text-text-faint">Playlist · {playlists.length} in all</span>
          <span className="flex min-w-0 items-center gap-2.5">
            {current && <span aria-hidden className={cn("size-2.5 shrink-0 rounded-swatch", playlistSwatch(index).dot)} />}
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{current?.name ?? "Choose a playlist"}</span>
          </span>
          {current && <span className="text-body-sm text-muted-foreground">{pickerDetail(current)}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-body-sm font-semibold text-muted-foreground">
          Change
          <IconChevronDown aria-hidden className="size-4" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Playlists</DialogTitle>
            <DialogDescription>
              {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}. Pick one to open it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <NewPlaylistButton
              locked={locked}
              onCreate={() => {
                setOpen(false)
                onCreate()
              }}
            />
            {playlists.map((playlist, i) => {
              const active = playlist.id === selected
              return (
                <button
                  key={playlist.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    onSelect(playlist.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex min-h-13 items-center gap-2.5 rounded-control px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                  )}
                >
                  <span aria-hidden className={cn("size-2.5 shrink-0 rounded-swatch", playlistSwatch(i).dot)} />
                  <span className="min-w-0 flex-1 truncate text-body font-semibold">{playlist.name}</span>
                  {playlist.is_default && <Tag className="shrink-0">Default</Tag>}
                  <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">{railDetail(playlist)}</span>
                  <IconCheck aria-hidden className={cn("size-4 shrink-0", active ? "text-foreground" : "invisible")} />
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NewPlaylistButton({ onCreate, locked }: { onCreate: () => void; locked: boolean }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={locked}
      title={locked ? "Playlists are part of AutoDJ, which isn't in your plan." : undefined}
      className="flex shrink-0 items-center gap-2 rounded-control px-3 py-3 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
    >
      <IconPlus className="size-4" />
      New playlist
      {locked && <ProTag />}
    </button>
  )
}

/** Compact, for the rail and the sheet's rows: "12 · 48m", or "Empty". */
function railDetail(playlist: Playlist): string {
  const count = playlist.track_count ?? 0
  const seconds = playlist.duration_seconds ?? 0
  if (count === 0) return "Empty"
  return seconds > 0 ? `${count} · ${formatAirtime(seconds)}` : String(count)
}

/** In words, for the picker button, where there's room: "12 tracks · 48m". */
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
        "flex min-w-0 items-center justify-between gap-2.5 rounded-control p-3 text-left transition-colors outline-none",
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
