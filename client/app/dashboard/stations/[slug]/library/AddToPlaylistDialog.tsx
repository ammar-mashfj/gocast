"use client"

import { useEffect, useState } from "react"
import { IconPlaylist, IconStarFilled } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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
      <DialogContent className="sm:max-w-sm">
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
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                disabled={saving !== null}
                onClick={() => void pick(playlist.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer transition-colors",
                  "hover:bg-muted/60 disabled:opacity-60 disabled:cursor-default",
                  saving === playlist.id && "bg-muted",
                )}
              >
                <span className="shrink-0 inline-flex text-muted-foreground">
                  {playlist.is_default ? (
                    <IconStarFilled size={13} className="text-primary" />
                  ) : (
                    <IconPlaylist size={15} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                  {saving === playlist.id ? "Adding…" : railDetail(playlist)}
                </span>
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving !== null}>
            Cancel
          </Button>
        </DialogFooter>
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
