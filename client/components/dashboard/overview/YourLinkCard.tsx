"use client"

import { useState } from "react"
import { useEmbedLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { taggedStationUrl } from "@/lib/share"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { CopyField } from "@/components/ds/CopyField"
import { ProTag } from "@/components/ds/Tag"
import { EmbedDialog } from "@/components/dashboard/EmbedDialog"
import { ShareDialog } from "@/components/dashboard/share/ShareDialog"
import { TuneInCodeDialog } from "@/components/dashboard/share/TuneInCodeDialog"

/**
 * The station's link and every way to hand it out: Copy, the tune-in code
 * (QR), the embed (Pro), and Share… for messaging apps. The copied link
 * carries the owner share tag; the displayed one is bare.
 */
export function YourLinkCard({ url, appUrl, slug, stationName }: { url: string; appUrl: string; slug: string; stationName: string }) {
  const [open, setOpen] = useState<"qr" | "embed" | "share" | null>(null)
  const embedLocked = useEmbedLocked()
  const proRequest = useProRequest()
  const close = (next: boolean) => !next && setOpen(null)

  return (
    <Card>
      <CardHeader title="Your link" aside="No app, no account" />
      <CopyField label="Station link" value={taggedStationUrl(appUrl, slug, "owner")} display={url.replace(/^https?:\/\//, "")} />
      <div className="flex flex-wrap gap-2">
        <Button variant="subtle" onClick={() => setOpen("qr")}>Tune-in code</Button>
        <Button variant="subtle" onClick={() => (embedLocked ? proRequest.open() : setOpen("embed"))}>
          Embed
          {embedLocked && <ProTag />}
        </Button>
        <Button variant="subtle" onClick={() => setOpen("share")}>Share…</Button>
      </div>

      <TuneInCodeDialog open={open === "qr"} onOpenChange={close} url={url} appUrl={appUrl} slug={slug} stationName={stationName} />
      <EmbedDialog open={open === "embed"} onOpenChange={close} slug={slug} stationName={stationName} />
      <ShareDialog open={open === "share"} onOpenChange={close} appUrl={appUrl} slug={slug} stationName={stationName} />
    </Card>
  )
}
