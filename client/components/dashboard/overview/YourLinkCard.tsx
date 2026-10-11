"use client"

import { useState } from "react"
import { useEmbedLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { taggedStationUrl } from "@/lib/share"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { CopyField } from "@/components/ds/CopyField"
import { EmbedDialog } from "@/components/dashboard/EmbedDialog"
import { ShareDialog } from "@/components/dashboard/share/ShareDialog"
import { TuneInCodeDialog } from "@/components/dashboard/share/TuneInCodeDialog"

/**
 * The station's link, with Open ↗ (the player page, as a listener sees it)
 * and Share… in the corner for every way to hand it out: messaging apps, the
 * tune-in code (QR) and the embed (Pro) all live in the Share dialog, so the
 * card is one field tall. The copied link carries
 * the owner share tag; the displayed one is bare.
 */
export function YourLinkCard({ url, appUrl, slug, stationName }: { url: string; appUrl: string; slug: string; stationName: string }) {
  const [open, setOpen] = useState<"qr" | "embed" | "share" | null>(null)
  const embedLocked = useEmbedLocked()
  const proRequest = useProRequest()
  const close = (next: boolean) => !next && setOpen(null)
  const pick = (what: "qr" | "embed") => (what === "embed" && embedLocked ? proRequest.open() : setOpen(what))

  return (
    <Card>
      <CardHeader
        title="Your link"
        aside={
          <span className="-my-2 -mr-3.5 flex gap-1">
            <Button variant="quiet" size="sm" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">Open ↗</a>
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setOpen("share")}>
              Share…
            </Button>
          </span>
        }
      />
      <CopyField label="Station link" value={taggedStationUrl(appUrl, slug, "owner")} display={url.replace(/^https?:\/\//, "")} />

      <TuneInCodeDialog open={open === "qr"} onOpenChange={close} url={url} appUrl={appUrl} slug={slug} stationName={stationName} />
      <EmbedDialog open={open === "embed"} onOpenChange={close} slug={slug} stationName={stationName} />
      <ShareDialog open={open === "share"} onOpenChange={close} appUrl={appUrl} slug={slug} stationName={stationName} onPick={pick} embedLocked={embedLocked} />
    </Card>
  )
}
