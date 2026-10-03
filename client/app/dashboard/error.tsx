"use client"

import { useEffect } from "react"
import Link from "next/link"
import { IconArrowRight, IconRefresh } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { useBroadcast } from "@/contexts/BroadcastContext"

/**
 * A dashboard page failed to render.
 *
 * This boundary sits INSIDE the dashboard layout, so the layout — and with it
 * BroadcastProvider, the socket, the mixer and the mic — is still mounted.
 * A host whose library page throws mid-show is still on air, and the most
 * useful sentence here is the one that says so; the old card only said
 * "Something went wrong" and invited them to leave.
 *
 * The raw error message stays out of the heading: it is written for us, not
 * for a broadcaster. It is kept behind "Details", with the digest the server
 * logs carry, so a support message can quote it.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const { state, stationSlug } = useBroadcast()
  const live = state === "live" || state === "reconnecting"

  useEffect(() => {
    console.error("[dashboard] page error:", error)
  }, [error])

  return (
    <div className="flex max-w-2xl flex-col gap-6 py-4">
      <div className="flex flex-col gap-3">
        {/* No "Page error" pill above this: it was a kicker (DESIGN.md bans
            them), and the heading already says the same thing. */}
        <h1 className="font-display text-page">This page didn’t load</h1>
        <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          {/* Keyed spans, not fragments: page translation moves bare text
              nodes, and swapping them in place throws (instrumentation-client). */}
          {live ? (
            <span key="live">
              <span className="font-medium text-live-text">Your broadcast is still on air.</span>{" "}
              Only this page failed — the show runs in this tab, so keep it open and try again.
            </span>
          ) : (
            <span key="idle">Something on our side stopped this page from rendering. Trying again usually fixes it.</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* unstable_retry, not reset: reset() re-renders without re-fetching,
            so a failed server fetch just failed again (Next 16 error.md). */}
        <Button size="lg" onClick={() => unstable_retry()}>
          <IconRefresh data-icon="inline-start" />
          Try again
        </Button>
        <Button variant="ghost" size="lg" asChild>
          {/* A Link, never an anchor: a full page load would tear down the
              broadcast this page just promised is still running. */}
          {/* The broadcasting station, not the current one: they differ when
              the host has switched stations mid-show. */}
          <Link href={live && stationSlug ? `/dashboard/stations/${stationSlug}/studio` : "/dashboard"}>
            {live ? "Back to the studio" : "Go to your station"}
            <IconArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>

      <details className="max-w-[60ch] rounded-button bg-card px-4 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">Details for support</summary>
        <p className="mt-2 font-mono break-words">
          {error.message || "No message"}
          {error.digest && <><br />ref {error.digest}</>}
        </p>
      </details>
    </div>
  )
}
