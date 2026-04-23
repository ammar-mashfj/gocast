"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { IconMusic, IconMicrophoneOff } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface GoLiveTriggerProps {
  /** Slug + display name of the station to launch. */
  slug: string
  name: string
  /** Trigger element(s). Wrapped in a span that catches the click. */
  children: ReactNode
}

/**
 * Wraps any clickable element to open the broadcast-mode picker before
 * navigating to `/dashboard/stations/{slug}/live`. Used by every "Go live"
 * affordance — primary button, station-card hover link, last-broadcast
 * "Go live again" — so the mic/files choice is always made up front.
 *
 * Stores the choice in `localStorage` under `broadcast:micDisabled:{slug}`
 * which the live page reads on mount.
 */
export function GoLiveTrigger({ slug, name, children }: GoLiveTriggerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function start(skipMic: boolean) {
    setOpen(false)
    try {
      if (skipMic) {
        localStorage.setItem(`broadcast:micDisabled:${slug}`, "true")
      } else {
        localStorage.removeItem(`broadcast:micDisabled:${slug}`)
      }
    } catch { /* localStorage blocked — live page falls back to mic enabled */ }
    router.push(`/dashboard/stations/${slug}/live`)
  }

  return (
    <>
      <span
        className="contents"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {children}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How do you want to broadcast?</DialogTitle>
            <DialogDescription>
              Pick how you want to go on air for {name}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => start(false)}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent bg-transparent cursor-pointer"
            >
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <IconMusic size={18} className="text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">Files and microphone</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Play audio files and talk over them with push-to-talk. Requires microphone permission.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => start(true)}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent bg-transparent cursor-pointer"
            >
              <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <IconMicrophoneOff size={18} className="text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-medium">Files only</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Stream audio files without a microphone. No browser permissions needed.
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
