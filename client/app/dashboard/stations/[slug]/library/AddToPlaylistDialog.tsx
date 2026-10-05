"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ds/Dialog"
import { cn } from "@/lib/utils"
import { playlistSwatch } from "@/lib/playlistSwatches"
import { formatAirtime } from "@/lib/format"
import type { Playlist } from "@/interfaces/Playlist"

interface Props {
  open: boolean
  onClose: () => void
  /** How many library tracks are selected — this dialog never sees which. */
  count: number
  playlists: Playlist[]
  /** Resolves once the server has them; the dialog closes on success. */
  onAdd: (playlistId: string) => Promise<void>
}

/**
 * Put the library's current selection into a playlist.
 *
 * The mirror image of TrackPicker, which picks tracks for a known playlist.
 * Here the tracks are known and the playlist is the question, which is the
 * shape the flow takes when someone has just selected forty files and wants
 * them somewhere. Doing it the other way round means opening the playlist
 * first and re-finding the same forty in a list of three hundred.
 *
 * Adding is idempotent on the server — a track already in the chosen playlist
 * is ignored rather than duplicated — so this deliberately does not filter or
 * warn about overlap. Saying "12 of these are already in Main rotation" would
 * be noise in front of a button that handles it correctly.
 */
export function AddToPlaylistDialog({ open, onClose, count, playlists, onAdd }: Props) {
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (open) setSaving(null)
  }, [open])

  async function pick(playlistId: string) {
    if (saving !== null) return
    setSaving(playlistId)
    try {
      await onAdd(playlistId)
      onClose()
    } finally {
      setSaving(null)
    }
  }

  const noun = `${count} track${count === 1 ? "" : "s"}`

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add {noun} to…</DialogTitle>
          <DialogDescription>
            {playlists.length === 0
              ? "You have no playlists yet. Create one from the rail on the left."
              : "A track can be in as many playlists as you like. Ones already in there are skipped."}
          </DialogDescription>
        </DialogHeader>

        {playlists.length > 0 && (
          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
            {playlists.map((playlist, i) => (
              <button
                key={playlist.id}
                type="button"
                disabled={saving !== null}
                onClick={() => void pick(playlist.id)}
                aria-busy={saving === playlist.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3.5 py-3 text-left transition-colors outline-none",
                  "hover:bg-surface-control focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
                  saving === playlist.id && "bg-surface-control",
                )}
              >
                <span aria-hidden className={cn("size-3 shrink-0 rounded-swatch", playlistSwatch(i).dot)} />
                <span className="min-w-0 flex-1 truncate text-body font-semibold">{playlist.name}</span>
                <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">
                  {saving === playlist.id ? "Adding…" : railDetail(playlist)}
                </span>
              </button>
            ))}
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}

/** Same count · runtime summary the rail shows, so the two agree. */
function railDetail(playlist: Playlist): string {
  const count = playlist.track_count ?? 0
  const seconds = playlist.duration_seconds ?? 0
  return seconds > 0 ? `${count} · ${formatAirtime(seconds)}` : `${count}`
}
