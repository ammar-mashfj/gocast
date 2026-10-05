"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { copyText } from "@/lib/clipboard"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ds/Dialog"
import { EMBED_HEIGHT, embedSnippet, embedUrl } from "@/lib/embed"

interface EmbedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  stationName: string
}

/**
 * The snippet a Pro owner pastes into their own site, with a live preview.
 *
 * Shared by the station page's share card and the studio's stream panel so
 * the two cannot hand out different markup. Callers decide whether to open
 * it at all — see useEmbedLocked — this component assumes the account may.
 *
 * The preview is the real embed in a real iframe, at the height the snippet
 * asks for. If it renders here it will render on the owner's site; if the
 * plan does not allow it, this is also where they find out.
 */
export function EmbedDialog({ open, onOpenChange, slug, stationName }: EmbedDialogProps) {
  const [copied, setCopied] = useState(false)
  const copyRef = useRef<HTMLButtonElement>(null)
  const snippet = embedSnippet(slug, stationName)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    if (await copyText(snippet)) setCopied(true)
    else toast.error("Couldn't copy — select the code and copy it manually")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Focus starts on Copy, not in the preview: inside the iframe, Esc
          goes to the player and the dialog can't hear it. */}
      <DialogContent
        size="lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          copyRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Embed on your site</DialogTitle>
          <DialogDescription>
            Paste this where you want the player to appear. Listeners on your site
            count toward {stationName}’s audience like any other.
          </DialogDescription>
        </DialogHeader>

        {/* Preview: the real thing, so what they see is what they get. Only
            mounted while open so a closed dialog is not holding a player. The
            well holds the snippet's height before the iframe paints, so the
            snippet below does not jump when the player loads. */}
        {open && (
          <div
            className="overflow-hidden rounded-chip border border-border bg-background"
            style={{ height: EMBED_HEIGHT }}
          >
            <iframe
              src={embedUrl(slug)}
              title={`${stationName} on GoCast`}
              width="100%"
              height={EMBED_HEIGHT}
              style={{ border: 0, display: "block" }}
              allow="autoplay"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {/* Mono because it is markup to be pasted verbatim. The copy button
              used to float over the top-right of this block, which hid the end
              of the first line on a phone; it lives in the footer now. */}
          <pre
            aria-label="Embed code"
            className="overflow-x-auto whitespace-pre rounded-chip border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed text-text-secondary"
          >
            <code>{snippet}</code>
          </pre>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The width stretches to fit its container. Change{" "}
            <code className="font-mono text-foreground/80">height</code> for more
            room. The embed goes offline if the station leaves Pro.
          </p>
        </div>

        <DialogFooter>
          <Button ref={copyRef} size="lg" onClick={copy}>
            {copied ? <IconCheck data-icon="inline-start" /> : <IconCopy data-icon="inline-start" />}
            <span>{copied ? "Copied" : "Copy code"}</span>
          </Button>
        </DialogFooter>
        {/* The button's label changes silently for a screen reader; this says it. */}
        <span className="sr-only" aria-live="polite">
          {copied ? "Embed code copied" : ""}
        </span>
      </DialogContent>
    </Dialog>
  )
}
