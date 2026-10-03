"use client"

import { useEffect, useState } from "react"
import type { Playlist } from "@/interfaces/Playlist"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"

export type NameDialog = { mode: "create" } | { mode: "rename"; playlist: Playlist } | null

/** One small dialog for both "New playlist" and "Rename": a name, and a button. */
export function PlaylistNameDialog({
  dialog,
  onClose,
  onSubmit,
}: {
  dialog: NameDialog
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = dialog !== null
  const initial = dialog?.mode === "rename" ? dialog.playlist.name : ""

  // Reset to the dialog's starting name each time it opens.
  useEffect(() => {
    if (!open) return
    setName(initial)
    setError(null)
    setSaving(false)
  }, [open, initial])

  async function submit() {
    const trimmed = name.trim()
    if (trimmed === "" || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      onClose()
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { errors?: { name?: string[] } } } })?.response?.data?.errors?.name?.[0] ??
          "Couldn’t save that name.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "rename" ? "Rename playlist" : "New playlist"}</DialogTitle>
          <DialogDescription>
            {dialog?.mode === "rename"
              ? "Listeners never see this; it’s for you."
              : "A set of tracks with its own play order. Fill it from your library, or upload straight into it."}
          </DialogDescription>
        </DialogHeader>
        <TextField
          label="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning Calm"
          maxLength={60}
          autoFocus
          error={error}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
        />
        <DialogFooter>
          <Button size="lg" onClick={submit} disabled={name.trim() === "" || saving}>
            {saving ? "Saving…" : dialog?.mode === "rename" ? "Rename" : "Create playlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
