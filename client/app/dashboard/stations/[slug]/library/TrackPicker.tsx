"use client"

import { useEffect, useMemo, useState } from "react"
import { IconCheck, IconSearch } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import type { Track } from "@/interfaces/Track"

interface Props {
  open: boolean
  onClose: () => void
  playlistName: string
  /** Library tracks NOT already in the playlist — the only ones worth offering. */
  candidates: Track[]
  /** Resolves once the server has them; the dialog closes on success. */
  onAdd: (ids: string[]) => Promise<void>
}

/**
 * Pick tracks from the library to put in a playlist. Multi-select with search,
 * because the realistic case is "the forty calm ones out of three hundred", not
 * one at a time.
 */
export function TrackPicker({ open, onClose, playlistName, candidates, onAdd }: Props) {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)

  // A fresh dialog each time it opens — a selection left over from the last
  // playlist would be added to this one by whoever clicks fastest.
  useEffect(() => {
    if (open) {
      setQuery("")
      setPicked(new Set())
      setSaving(false)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      q
        ? candidates.filter((t) => `${t.title} ${t.artist ?? ""}`.toLowerCase().includes(q))
        : candidates,
    [candidates, q],
  )

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setPicked((prev) => {
      const next = new Set(prev)
      const allIn = visible.every((t) => next.has(t.id))
      for (const t of visible) {
        if (allIn) next.delete(t.id)
        else next.add(t.id)
      }
      return next
    })
  }

  async function submit() {
    if (picked.size === 0 || saving) return
    setSaving(true)
    try {
      // In library order, so "select all" adds them the way they are listed
      // rather than in click order.
      await onAdd(candidates.filter((t) => picked.has(t.id)).map((t) => t.id))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to {playlistName}</DialogTitle>
          <DialogDescription>
            {candidates.length === 0
              ? "Every track in your library is already in this playlist."
              : "Pick from your library. A track can be in as many playlists as you like."}
          </DialogDescription>
        </DialogHeader>

        {candidates.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <IconSearch
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title or artist"
                  className="h-9 pl-9 text-sm"
                  autoFocus
                />
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAllVisible} disabled={visible.length === 0}>
                {visible.every((t) => picked.has(t.id)) && visible.length > 0 ? "Clear" : "Select all"}
              </Button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
              {visible.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No matches.</div>
              ) : (
                visible.map((track) => {
                  const on = picked.has(track.id)
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => toggle(track.id)}
                      aria-pressed={on}
                      className={cn(
                        "w-full grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left text-sm border-b border-border last:border-b-0 cursor-pointer",
                        on ? "bg-primary/10" : "hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "size-4 rounded border inline-flex items-center justify-center",
                          on ? "bg-primary border-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {on && <IconCheck size={12} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{track.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {track.artist ?? "Unknown artist"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {track.duration_seconds > 0 ? formatDuration(Math.round(track.duration_seconds)) : "—"}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={picked.size === 0 || saving}>
            {saving ? "Adding…" : picked.size === 0 ? "Add" : `Add ${picked.size} track${picked.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
