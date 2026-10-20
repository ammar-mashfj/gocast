"use client"

import { useEffect, useState } from "react"
import { IconBan, IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { inkFor } from "@/lib/playlistSwatches"
import type { Playlist } from "@/interfaces/Playlist"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"

export type NameDialog = { mode: "create" } | { mode: "rename"; playlist: Playlist } | null

const HEX = /^#[0-9a-f]{6}$/i

/** One-tap shortcuts into the hex field; any other hex is just as valid. */
const PRESETS = [
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Sky", hex: "#38bdf8" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Lime", hex: "#a3e635" },
  { name: "Yellow", hex: "#facc15" },
  { name: "Orange", hex: "#f97316" },
  { name: "Red", hex: "#ef4444" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Magenta", hex: "#d946ef" },
  { name: "Slate", hex: "#94a3b8" },
]

/** "ff6b00", "#FF6B00" → "#ff6b00"; anything else as typed, for the error. */
function normaliseHex(raw: string): string {
  const t = raw.trim()
  return /^[0-9a-f]{6}$/i.test(t) ? `#${t.toLowerCase()}` : t.toLowerCase()
}

/**
 * One small dialog for both "New playlist" and editing one: a name, a colour
 * (a preset dot or any hex; empty = the automatic shade), and a button. The default playlist
 * has no colour field: it never draws a block on the schedule.
 */
export function PlaylistNameDialog({
  dialog,
  onClose,
  onSubmit,
}: {
  dialog: NameDialog
  onClose: () => void
  onSubmit: (name: string, color: string | null) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = dialog !== null
  const initial = dialog?.mode === "rename" ? dialog.playlist.name : ""
  const initialColor = dialog?.mode === "rename" ? (dialog.playlist.color ?? "") : ""
  const showColor = !(dialog?.mode === "rename" && dialog.playlist.is_default)
  const hex = normaliseHex(color)
  const colorError = hex !== "" && !HEX.test(hex) ? "Use a hex colour like #ff6b00." : null

  // Reset to the dialog's starting values each time it opens.
  useEffect(() => {
    if (!open) return
    setName(initial)
    setColor(initialColor)
    setError(null)
    setSaving(false)
  }, [open, initial, initialColor])

  async function submit() {
    const trimmed = name.trim()
    if (trimmed === "" || saving || colorError) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(trimmed, hex === "" ? null : hex)
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
      {/* No focus on open: the dialog's own autofocus put a caret in the
          name (and raised the phone keyboard) before anything was read. */}
      <DialogContent size="sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "rename" ? "Edit playlist" : "New playlist"}</DialogTitle>
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
          error={error}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
        />
        {showColor && (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-body-sm font-semibold text-muted-foreground">Colour on the schedule</legend>
            {/* Plain buttons with an inline background: no native colour
                picker (a full hue/saturation tool on every browser, and a
                different one on each). The dots only fill in the hex. */}
            <div className="grid grid-cols-7 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => setColor("")}
                aria-pressed={hex === ""}
                aria-label="Automatic colour"
                title="Automatic"
                className={cn(
                  "grid size-8 cursor-pointer place-items-center rounded-full border border-line-strong text-text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  hex === "" && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
              >
                <IconBan aria-hidden size={16} />
              </button>
              {PRESETS.map((preset) => {
                const on = hex === preset.hex
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setColor(preset.hex)}
                    aria-pressed={on}
                    aria-label={preset.name}
                    title={preset.name}
                    className={cn(
                      "grid size-8 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                    )}
                    style={{ backgroundColor: preset.hex, color: inkFor(preset.hex) }}
                  >
                    {on && <IconCheck aria-hidden size={16} stroke={3} />}
                  </button>
                )
              })}
            </div>
            <TextField
              label="Hex"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Automatic"
              maxLength={7}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              error={colorError}
              hint="Tap a colour, or type any hex."
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit()
              }}
              trailing={
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-swatch border border-line-strong"
                  style={{ backgroundColor: HEX.test(hex) ? hex : undefined }}
                />
              }
            />
          </fieldset>
        )}
        <DialogFooter>
          <Button size="lg" onClick={submit} disabled={name.trim() === "" || saving || colorError !== null}>
            {saving ? "Saving…" : dialog?.mode === "rename" ? "Save" : "Create playlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
