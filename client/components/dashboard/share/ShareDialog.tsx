"use client"

import { useRef, useSyncExternalStore } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { shareOrCopy, taggedStationUrl } from "@/lib/share"
import { ProTag } from "@/components/ds/Tag"

/**
 * "QR code & embed" from the overview: the shapes the link comes in that a
 * copied link can't be — the tune-in code (QR) and the embed (Pro) — plus,
 * where the device has one (phones, mostly), its own share sheet, which
 * reaches every app the host actually has. Copying is the button beside this
 * one, so it isn't repeated here; nor is a hand-picked list of apps.
 * Picking the code or the embed closes this dialog and opens that one; the
 * close must not hand focus back to the button in between, or the next
 * dialog opens with nothing focused (the same hand-off as UpdatesMenu).
 *
 * The shared link carries the owner share tag, so the visits it brings are
 * attributed (lib/share.ts).
 */
export function ShareDialog({
  open,
  onOpenChange,
  appUrl,
  slug,
  stationName,
  onPick,
  embedLocked = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appUrl: string
  slug: string
  stationName: string
  /** Opens the tune-in code or the embed instead; this dialog closes first. */
  onPick: (what: "qr" | "embed") => void
  /** Embed is Pro: shows the tag, and the pick is the caller's to route. */
  embedLocked?: boolean
}) {
  const url = taggedStationUrl(appUrl, slug, "owner")
  const message = `Listen to ${stationName} on GoCast`
  const canNativeShare = useCanNativeShare()
  const handingOff = useRef(false)

  function pick(what: "qr" | "embed") {
    handingOff.current = true
    onOpenChange(false)
    onPick(what)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onCloseAutoFocus={(event) => {
          if (handingOff.current) {
            handingOff.current = false
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{"QR code & embed"}</DialogTitle>
          <DialogDescription>Other ways to hand out {stationName}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => pick("qr")} className={target}>
            <span className="font-bold">Tune-in code</span>
            <span className="text-body-sm text-muted-foreground">A QR code for posters, flyers and the end of a set.</span>
          </button>
          <button type="button" onClick={() => pick("embed")} className={target}>
            <span className="flex items-center gap-2 font-bold">
              Embed
              {embedLocked && <ProTag />}
            </span>
            <span className="text-body-sm text-muted-foreground">The player, on your own website.</span>
          </button>
          {canNativeShare && (
            <button
              type="button"
              onClick={async () => {
                if ((await shareOrCopy(url, stationName, message)) !== "failed") onOpenChange(false)
              }}
              className={target}
            >
              <span className="font-bold">Send with…</span>
              <span className="text-body-sm text-muted-foreground">Any app on this device.</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const target =
  "flex flex-col items-start gap-0.5 rounded-button bg-surface-control px-4 py-3 text-left text-base transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-ring"

const subscribe = () => () => {}
/** Whether this browser has a system share sheet. False on the server. */
function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  )
}
