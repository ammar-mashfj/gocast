"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  const snippet = embedSnippet(slug, stationName)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Embed on your site</DialogTitle>
          <DialogDescription>
            Paste this where you want the player to appear. Listeners on your site
            count toward {stationName}&apos;s audience like any other.
          </DialogDescription>
        </DialogHeader>

        {/* Preview: the real thing, so what they see is what they get. Only
            mounted while open so a closed dialog is not holding a player. */}
        {open && (
          <div className="rounded-xl overflow-hidden border border-border bg-background">
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

        <div className="relative">
          <pre className="rounded-lg border border-border bg-muted/40 p-3 pr-24 text-[11px] leading-relaxed text-muted-foreground overflow-x-auto whitespace-pre">
            <code>{snippet}</code>
          </pre>
          <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={copy}>
            {copied ? <IconCheck data-icon="inline-start" /> : <IconCopy data-icon="inline-start" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Width stretches to its container; change <code className="text-foreground/80">height</code> if
          you want more room. The embed goes offline if the station leaves Pro.
        </p>
      </DialogContent>
    </Dialog>
  )
}
