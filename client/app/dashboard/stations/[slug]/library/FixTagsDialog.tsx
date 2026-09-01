"use client"

import { useState } from "react"
import { toast } from "sonner"
import { IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import api from "@/lib/axios"
import type { Track } from "@/interfaces/Track"

interface FixTagsDialogProps {
  open: boolean
  onClose: () => void
  /** Only the untagged ones — the caller filters. */
  tracks: Track[]
  /** Applied optimistically by the caller for the rows that actually saved. */
  onSaved: (updates: Array<{ id: string; artist: string }>) => void
}

/**
 * Bulk-fill missing artist tags.
 *
 * There is no bulk endpoint — the API offers `PATCH /tracks/{track}` and
 * nothing else — so this fans out one request per changed row. That is fine at
 * the scale a station's rotation actually reaches (tens), and the alternative
 * is asking the user to open, edit and save each row by hand, which is the
 * thing that made every row read "Unknown artist" in the first place.
 *
 * Requests run sequentially rather than in parallel: the upload endpoints are
 * already throttled, and a burst of 40 PATCHes is a good way to find out where
 * the general limiter sits. Partial success is reported honestly and the rows
 * that landed are kept.
 */
export function FixTagsDialog({ open, onClose, tracks, onSaved }: FixTagsDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /**
   * Clear on the way out rather than on the way in, so a previous session's
   * half-typed artists can't reappear against a different set of tracks. Doing
   * it in an effect keyed on `open` would work too, but only by spending an
   * extra render to undo state we already control the exit from.
   */
  function close() {
    setValues({})
    onClose()
  }

  const filled = Object.entries(values)
    .map(([id, artist]) => ({ id, artist: artist.trim() }))
    .filter((entry) => entry.artist !== "")

  async function save() {
    if (filled.length === 0 || saving) return
    setSaving(true)

    const saved: Array<{ id: string; artist: string }> = []
    let failed = 0

    for (const entry of filled) {
      try {
        await api.patch(`/tracks/${entry.id}`, { artist: entry.artist })
        saved.push(entry)
      } catch {
        failed += 1
      }
    }

    setSaving(false)
    if (saved.length > 0) onSaved(saved)

    if (failed === 0) {
      toast.success(`Tagged ${saved.length} track${saved.length === 1 ? "" : "s"}.`)
      close()
    } else if (saved.length === 0) {
      toast.error("Couldn't save any tags — please try again.")
    } else {
      toast.error(`Tagged ${saved.length}, but ${failed} failed. The rest are still listed.`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) close() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fix missing artists</DialogTitle>
          <DialogDescription>
            These tracks have no artist tag, so listeners see “Unknown artist” in the
            player. Fill in the ones you know — blank rows are left alone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {tracks.map((track) => (
            <div key={track.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{track.title}</div>
                {/* The filename is often the only clue to what an untagged
                    file actually is — the title may just be the filename
                    stem the importer fell back to. */}
                <div className="text-xs text-muted-foreground truncate">
                  {track.original_filename}
                </div>
              </div>
              <Input
                value={values[track.id] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [track.id]: e.target.value }))}
                placeholder="Artist"
                className="h-8 w-40 shrink-0 text-sm"
                disabled={saving}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={filled.length === 0 || saving}>
            {saving && <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />}
            {saving
              ? "Saving…"
              : filled.length === 0
                ? "Save"
                : `Save ${filled.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
