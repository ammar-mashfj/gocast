"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  /** Label for the confirming button. */
  confirmLabel: string
  cancelLabel?: string
  /** Irreversible: the confirm is drawn as the only red button in the dialog. */
  destructive?: boolean
}

/**
 * `window.confirm`, as a dialog that belongs to the app.
 *
 * The browser prompt is unstyled, blocks the whole tab (including a live
 * broadcast's UI), can't name the thing being deleted in anything but plain
 * text, and some browsers suppress it after a few uses. This keeps the same
 * one-line call shape — `if (!(await confirm({...}))) return` — so replacing
 * a native prompt changes no flow, only what the question looks like.
 *
 * Render the returned element once in the component that asks. Nesting inside
 * another Radix dialog (the jingles list) is supported: it stacks on top and
 * returns focus to the dialog underneath.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  // Open is its own flag: the options outlive the close, so the dialog's exit
  // animation still shows the question — nulling them together flashed an
  // empty title and a blank violet button on every close.
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

  const element = (
    <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => settle(false)}>
            {options?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={options?.destructive ? "destructive" : "default"}
            className="h-10"
            onClick={() => settle(true)}
          >
            {options?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return [confirm, element]
}
