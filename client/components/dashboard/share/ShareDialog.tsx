"use client"

import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { shareOrCopy, taggedStationUrl } from "@/lib/share"
import { cn } from "@/lib/utils"

/**
 * "Share…" from the overview's link card: the prototype's grid of places to
 * send the link — Copy link, WhatsApp, Email, X — plus the system share
 * sheet where the device has one (phones, mostly), for everything else.
 *
 * Every target carries the owner share tag, so the visits it brings are
 * attributed (lib/share.ts).
 */
export function ShareDialog({
  open,
  onOpenChange,
  appUrl,
  slug,
  stationName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appUrl: string
  slug: string
  stationName: string
}) {
  const url = taggedStationUrl(appUrl, slug, "owner")
  const message = `Listen to ${stationName} on GoCast`
  const canNativeShare = useCanNativeShare()

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
      onOpenChange(false)
    } catch {
      toast.error("Couldn’t copy — copy the link manually", { description: url, duration: 8000 })
    }
  }

  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent(message)}&body=${encodeURIComponent(`${message}: ${url}`)}` },
    { label: "X", href: `https://x.com/intent/post?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}` },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Share {stationName}</DialogTitle>
          <DialogDescription>Listeners open it in any browser. No app, no account.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className={target}>
            Copy link
          </button>
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => onOpenChange(false)} className={target}>
              {l.label}
            </a>
          ))}
          {canNativeShare && (
            <button
              type="button"
              onClick={async () => {
                if ((await shareOrCopy(url, stationName, message)) !== "failed") onOpenChange(false)
              }}
              className={cn(target, "col-span-2")}
            >
              More…
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const target =
  "flex h-13 items-center justify-center rounded-button bg-surface-control text-base font-bold transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-ring"

const subscribe = () => () => {}
/** Whether this browser has a system share sheet. False on the server. */
function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  )
}
