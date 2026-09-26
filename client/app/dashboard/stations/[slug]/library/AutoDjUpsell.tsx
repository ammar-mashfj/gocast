"use client"

import { IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useProRequest } from "@/contexts/ProRequestContext"
import { PRO_AVAILABLE, PRO_PRICE_USD } from "@/interfaces/Plan"

/**
 * What a free account sees above its own library.
 *
 * The screen deliberately still renders the rotation editor underneath this,
 * read-only. Hiding it and showing a bare paywall would answer "you can't"
 * without ever answering "what is it" — and the tracks below are the clearest
 * possible explanation of what AutoDJ does with them.
 */
const SELLING_POINTS = [
  "Upload your own music — no shared or licensed pool",
  "Playlists in your order or shuffled, on a weekly schedule",
  "Jingles (short clips like \u201cYou\u2019re listening to\u2026\u201d) play between songs",
  "Going live interrupts the rotation instantly; it resumes when you stop",
]

export function AutoDjUpsell({ stationName }: { stationName: string }) {
  // The same dialog the sidebar's plan card opens — see
  // ProRequestContext. Read here rather than passed down: there is exactly
  // one of it per dashboard, so threading it through props would only create
  // the chance of wiring in a second.
  const request = useProRequest()

  return (
    // A plain panel, not a violet-washed one: violet is the brand and the
    // on-air colour, and a tinted box read as AutoDJ already running.
    <div className="rounded-xl border border-white/[0.09] bg-panel shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] overflow-hidden">
      <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium">
            Keep {stationName} on air when you&apos;re not
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xl">
            AutoDJ plays your uploaded music whenever you&apos;re not live. Right now your station goes silent the moment you
            close the studio tab, and listeners drop off. With AutoDJ it keeps
            playing, and hands back to you the second you go live.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5 list-none p-0">
            {SELLING_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 md:w-56 md:border-l md:border-white/[0.06] md:pl-8">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold">${PRO_PRICE_USD}</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {PRO_AVAILABLE
              ? "Billed monthly, cancel any time. Your uploads stay if you downgrade."
              : "Free while Pro is in beta — no card. We're onboarding a few stations at a time, and your uploads stay yours either way."}
          </p>

          {request.requested ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-violet-muted">
              <IconCheck size={16} />
              Request sent
            </div>
          ) : (
            // The page's one filled button and its only request action (the
            // header's "Upgrade to enable AutoDJ" is gone; the H1 keeps just
            // the amber Pro tag). "Request", not "Upgrade" — Pro is granted by hand.
            <Button className="mt-4 w-full" onClick={request.open}>
              Request Pro
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
