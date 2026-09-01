"use client"

import { IconCheck, IconSparkles } from "@tabler/icons-react"
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
  "Tracks play in the order you set, then loop from the top",
  "Jingles and station IDs interleave automatically between tracks",
  "Going live interrupts the rotation instantly; it resumes when you stop",
]

export function AutoDjUpsell({ stationName }: { stationName: string }) {
  // The same dialog the header CTA and the sidebar open — see
  // ProRequestContext. Read here rather than passed down: there is exactly
  // one of it per dashboard, so threading it through props would only create
  // the chance of wiring in a second.
  const request = useProRequest()

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] overflow-hidden">
      <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium">
            Keep {stationName} on air when you&apos;re not
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xl">
            Right now your stream stops the moment you close your encoder — listeners
            get silence and drop off. AutoDJ fills that gap with your own uploads,
            loops them in order, and hands the stream back the second you go live.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5 list-none p-0">
            {SELLING_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 md:w-56 md:border-l md:border-primary/15 md:pl-8">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold">${PRO_PRICE_USD}</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {PRO_AVAILABLE
              ? "Billed monthly, cancel any time. Your uploads stay if you downgrade."
              : "Pro is in beta — we're onboarding a few stations at a time. Your uploads stay yours either way."}
          </p>

          {request.requested ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-primary">
              <IconCheck size={16} />
              Request sent
            </div>
          ) : (
            <Button className="mt-4 w-full" onClick={request.open}>
              <IconSparkles size={16} data-icon="inline-start" />
              Request access
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
