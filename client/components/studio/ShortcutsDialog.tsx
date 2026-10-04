"use client"

import { IconKeyboard } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ds/Dialog"

/** What the studio page's keydown handler answers to, in the order a host reaches for them. */
const SHORTCUTS: { keys: string; what: string; mic?: boolean }[] = [
  { keys: "Space", what: "Hold to talk", mic: true },
  { keys: "L", what: "Keep the mic open, or close it", mic: true },
  { keys: "K", what: "Play or pause the music" },
  { keys: "N", what: "Next track" },
  { keys: "P", what: "Previous track" },
  { keys: "R", what: "Repeat the list, or hold this track" },
  { keys: "M", what: "Hear the show in your headphones (monitor)" },
]

/**
 * The studio's keyboard shortcuts, behind an icon button beside the mic
 * settings: a dialog rather than a fold, and in a row that is already there,
 * so the studio page stays the height it is at every size.
 */
export function ShortcutsDialog({ micDisabled }: { micDisabled: boolean }) {
  const shown = SHORTCUTS.filter((s) => !s.mic || !micDisabled)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          className="size-13 rounded-button bg-card text-foreground hover:bg-card/80"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <IconKeyboard className="size-5.5" />
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>They work anywhere on the studio page, except while you’re typing.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col">
          {shown.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
              <dt className="text-sm">{s.what}</dt>
              <dd>
                <kbd className="inline-flex min-w-8 justify-center rounded-tag bg-surface-inset px-2 py-1 font-mono text-xs font-semibold">
                  {s.keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
