"use client"

import { IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { ProTag } from "@/components/ds/Tag"
import { useProRequest } from "@/contexts/ProRequestContext"
import { PRO_AVAILABLE, PRO_PRICE_USD } from "@/interfaces/Plan"

/**
 * What a free account sees where the history would be.
 *
 * The sample bars behind the lock are FICTIONAL AND LABELLED AS SUCH. Blurring
 * a real chart was the first idea and it is the wrong one: a free station's
 * numbers are genuinely being recorded, so a blurred real chart would be
 * showing someone their own data while telling them they can't have it. This
 * shows the SHAPE of the feature — which is what "what would I get?" actually
 * asks — and says the word "sample" so nobody mistakes it for their station.
 *
 * The one true statement here does the selling: the data already exists. An
 * upgrade reveals ninety days of history that has been accumulating since the
 * station went up, rather than starting a clock.
 */
const SELLING_POINTS = [
  "90 days of listening time, day by day",
  "Where your listeners are, by country",
  "Phone or desktop, and which browsers",
  "Which sites and socials send you listeners",
]

/** A plausible fortnight. Fixed, not random, so it never redraws on re-render. */
const SAMPLE = [8, 14, 11, 19, 26, 22, 31, 27, 38, 34, 29, 44, 39, 52, 47, 61, 55, 68, 74, 66]

export function AudienceUpsell({ stationName }: { stationName: string }) {
  const request = useProRequest()

  return (
    <div className="overflow-hidden rounded-card bg-card">
      <div>
        {/* Decorative: the real message is the copy below, and a screen reader
            reading out twenty invented numbers would be actively misleading. */}
        <div className="flex items-end gap-1.5 h-24 px-5 pt-6 opacity-30" aria-hidden="true">
          {SAMPLE.map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-swatch bg-on-air"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
        <div className="min-w-0 flex-1">
          <ProTag />
          <h2 className="mt-2.5 font-display text-title-sm">See who’s listening to {stationName}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground">
            We’ve been recording your audience since the day this station went up —
            every listener, every country, every day. Pro unlocks the last 90 days of
            it, so it’s all there the moment you upgrade rather than starting from
            today.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5 list-none p-0">
            {SELLING_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-caption text-text-faint">
            Chart above is a sample, not your station.
          </p>
        </div>

        <div className="shrink-0 md:w-56 md:border-l md:border-line md:pl-8">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-title-lg">${PRO_PRICE_USD}</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </div>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            {PRO_AVAILABLE
              ? "Billed monthly, cancel any time. Your history stays if you downgrade."
              : "Free while Pro is in beta — no card. Your history keeps building either way."}
          </p>
          <Button variant="pro" full className="mt-4" onClick={request.open} disabled={request.requested}>
            {request.requested && <IconCheck />}
            {request.requested ? "Requested" : "Request Pro"}
          </Button>
        </div>
      </div>
    </div>
  )
}
