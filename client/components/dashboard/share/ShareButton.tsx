"use client"

import { useState } from "react"
import { useEmbedLocked } from "@/contexts/AccountContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { Button } from "@/components/ds/Button"
import { EmbedDialog } from "@/components/dashboard/EmbedDialog"
import { ShareDialog } from "@/components/dashboard/share/ShareDialog"
import { TuneInCodeDialog } from "@/components/dashboard/share/TuneInCodeDialog"

/**
 * "QR code & embed", beside Copy player link: the tune-in code (QR), the
 * embed and, on phones, the device's share sheet. The embed is Pro: on Free,
 * picking it opens the Pro request instead of the snippet. The one way into
 * the embed snippet in the dashboard, which the Pro plan and the help sell.
 */
export function ShareButton({
  appUrl,
  slug,
  stationName,
  className,
}: {
  appUrl: string
  slug: string
  stationName: string
  className?: string
}) {
  const [open, setOpen] = useState<"qr" | "embed" | "share" | null>(null)
  const embedLocked = useEmbedLocked()
  const checkout = useProCheckout()
  const close = (next: boolean) => !next && setOpen(null)
  const pick = (what: "qr" | "embed") => {
    if (what !== "embed" || !embedLocked) return setOpen(what)
    checkout.open()
  }
  const url = `${appUrl}/station/${slug}`

  return (
    <>
      <Button variant="ghost" size="md" full className={className} onClick={() => setOpen("share")}>
        {"QR code & embed"}
      </Button>
      <TuneInCodeDialog open={open === "qr"} onOpenChange={close} url={url} appUrl={appUrl} slug={slug} stationName={stationName} />
      <EmbedDialog open={open === "embed"} onOpenChange={close} slug={slug} stationName={stationName} />
      <ShareDialog open={open === "share"} onOpenChange={close} appUrl={appUrl} slug={slug} stationName={stationName} onPick={pick} embedLocked={embedLocked} />
    </>
  )
}
