"use client"

import { taggedStationUrl } from "@/lib/share"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { CopyField } from "@/components/ds/CopyField"

/**
 * The station's link, with Open ↗ (the player page, as a listener sees it)
 * and Share… in the corner for every way to hand it out: messaging apps, the
 * tune-in code (QR) and the embed (Pro) all live in the Share dialog, so the
 * card is one field tall. The copied link carries
 * the owner share tag; the displayed one is bare.
 */
export function YourLinkCard({ url, appUrl, slug, stationName }: { url: string; appUrl: string; slug: string; stationName: string }) {
  return (
    <Card>
      <CardHeader title="Your link" />
      <StationLinkRow url={url} appUrl={appUrl} slug={slug} stationName={stationName} />
    </Card>
  )
}

/**
 * The link on its own: the field with Copy, then Open ↗ (not on phones).
 * Share (the dialog with the QR code and embed) is off for now. In the
 * overview hero, under the station's name; the card above is off for now.
 */
export function StationLinkRow({
  url,
  appUrl,
  slug,
  className,
}: {
  url: string
  appUrl: string
  slug: string
  /** Unused while Share is off. */
  stationName?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <CopyField
        label="Station link"
        value={taggedStationUrl(appUrl, slug, "owner")}
        display={url.replace(/^https?:\/\//, "")}
        className="min-w-0 flex-[1_1_16rem]"
      />
      {/* Not on a phone: opening another tab there is rarely what's wanted. */}
      <Button variant="quiet" size="sm" className="max-md:hidden" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">Open ↗</a>
      </Button>
    </div>
  )
}
