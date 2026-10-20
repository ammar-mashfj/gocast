"use client"

import * as React from "react"
import { IconChevronRight } from "@tabler/icons-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"

/**
 * A settings section that opens in a dialog (a sheet on phones) instead of
 * unfolding in place. The tile never changes size, so opening one doesn't
 * push the cards around it out of line on the two-column page.
 *
 * `id` is an anchor: arriving at settings#id opens it, as the folds did.
 * The dialog's content unmounts when closed, so keep drafts in the caller.
 */
export function SettingsTile({
  id,
  title,
  description,
  dialogDescription,
  open,
  onOpenChange,
  children,
}: {
  id: string
  title: React.ReactNode
  /** The tile's line: what's there, or what it's for. */
  description: React.ReactNode
  dialogDescription?: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  // Opened by a link from another page (pre-flight's "Using DJ software
  // instead?", the setup checklist), or by a hash change on this one.
  React.useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${id}`) onOpenChange(true)
    }
    check()
    window.addEventListener("hashchange", check)
    return () => window.removeEventListener("hashchange", check)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={() => onOpenChange(true)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-card bg-card p-5 text-left outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-heading">{title}</span>
          <span className="text-body-sm text-muted-foreground">{description}</span>
        </span>
        <IconChevronRight aria-hidden className="size-4 shrink-0 text-text-faint" />
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {dialogDescription && <DialogDescription>{dialogDescription}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </>
  )
}
