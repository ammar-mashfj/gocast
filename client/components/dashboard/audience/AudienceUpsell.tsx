"use client"

import { IconLock, IconSparkles, IconCheck } from "@tabler/icons-react"
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
    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] overflow-hidden">
      <div className="relative">
        {/* Decorative: the real message is the copy below, and a screen reader
            reading out twenty invented numbers would be actively misleading. */}
        <div className="flex items-end gap-1.5 h-24 px-5 pt-6 opacity-30" aria-hidden="true">
          {SAMPLE.map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-primary"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/[0.06] via-primary/[0.03] to-transparent" />
      </div>

      <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <IconLock size={15} className="text-primary shrink-0" />
            <h2 className="text-lg font-medium">See who&apos;s listening to {stationName}</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xl">
            We&apos;ve been recording your audience since the day this station went up —
            every listener, every country, every day. Pro unlocks the last 90 days of
            it, so it&apos;s all there the moment you upgrade rather than starting from
            today.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5 list-none p-0">
            {SELLING_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Chart above is a sample, not your station.
          </p>
        </div>

        <div className="shrink-0 md:w-56 md:border-l md:border-primary/15 md:pl-8">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold">${PRO_PRICE_USD}</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {PRO_AVAILABLE
              ? "Billed monthly, cancel any time. Your history stays if you downgrade."
              : "Free while Pro is in beta — no card. Your history keeps building either way."}
          </p>
          <button
            type="button"
            onClick={request.open}
            disabled={request.requested}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100"
          >
            {request.requested ? <IconCheck size={14} /> : <IconSparkles size={14} />}
            {request.requested ? "Requested" : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    </div>
  )
}
