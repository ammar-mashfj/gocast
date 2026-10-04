"use client"

import { useCallback, useId, useRef, useState, type ReactNode } from "react"
import { IconLoader2 } from "@tabler/icons-react"
import { Button } from "./Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog"

/**
 * A yes/no question, as the design system asks it.
 *
 *   - The cancel names what you keep ("Keep going", "Keep station"), never
 *     "Cancel", and is the quiet button.
 *   - `tone="default"`: the confirm is the off-white primary. Ending a show,
 *     removing tracks, turning AutoDJ off — things that can be undone or
 *     redone.
 *   - `tone="danger"`: a permanent delete. The confirm is the error red, the
 *     consequences are listed, and with `confirmText` it stays disabled until
 *     that text is typed.
 */
export interface ConfirmOptions {
  title: string
  description?: ReactNode
  /** What goes, as a short list under the description. */
  consequences?: string[]
  confirmLabel: string
  /** What is kept: "Keep station". */
  keepLabel: string
  tone?: "default" | "danger"
  /** Text to type before the confirm is enabled, e.g. the station's slug. */
  confirmText?: string
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  /** The confirm is running: buttons disabled, spinner on the confirm. */
  busy?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  busy = false,
  title,
  description,
  consequences,
  confirmLabel,
  keepLabel,
  tone = "default",
  confirmText,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("")
  // Every opening starts empty, however the last one closed (Keep, Esc, the
  // scrim, or the parent after a confirm): a box still holding the name
  // would leave the delete armed.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTyped("")
  }
  const inputId = useId()
  // Case-insensitive: slugs and emails are, and a phone keyboard capitalises.
  const matches = !confirmText || typed.trim().toLowerCase() === confirmText.toLowerCase()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm" showCloseButton={false} swipeToClose>
        <DialogHeader className="pr-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {consequences && consequences.length > 0 && (
          <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-sm leading-relaxed">
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}

        {confirmText && (
          <label htmlFor={inputId} className="flex flex-col gap-1.5 rounded-button bg-card px-4 py-3">
            <span className="text-caption font-semibold text-muted-foreground">
              Type <span className="font-mono text-foreground">{confirmText}</span> to confirm
            </span>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="bg-transparent font-mono text-base text-foreground outline-none"
            />
          </label>
        )}

        <DialogFooter>
          <Button size="lg" variant="subtle" disabled={busy} onClick={() => onOpenChange(false)}>
            {keepLabel}
          </Button>
          <Button
            size="lg"
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={busy || !matches}
            onClick={onConfirm}
          >
            {busy && <IconLoader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `window.confirm` as an app dialog, for a question asked from an event
 * handler: `if (!(await confirm({...}))) return`. Render the returned
 * element once in the component that asks. Nesting inside another dialog
 * (the jingles list) works: it stacks on top and returns focus underneath.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  // Open is its own flag: the options outlive the close, so the exit
  // animation still shows the question.
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second ask while one is open answers the first with "no".
    resolver.current?.(false)
    setOptions(next)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOpen(false)
  }, [])

  const element = options ? (
    <ConfirmDialog {...options} open={open} onOpenChange={(next) => !next && settle(false)} onConfirm={() => settle(true)} />
  ) : null

  return [confirm, element]
}
