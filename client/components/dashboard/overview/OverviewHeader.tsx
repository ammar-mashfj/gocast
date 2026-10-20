"use client"

import { useEffect, useRef, useState } from "react"
import { IconPencil } from "@tabler/icons-react"
import type { Station } from "@/interfaces/Station"
import { copyText } from "@/lib/clipboard"
import { formatDate } from "@/lib/format"
import { taggedStationUrl } from "@/lib/share"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Tag } from "@/components/ds/Tag"
import { StationArtwork } from "@/components/StationArtwork"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { ShareButton } from "@/components/dashboard/share/ShareButton"

/**
 * Who the station is: artwork, name and genre, and how long it's been
 * around, as the first row of the hero's main panel. The artwork, with a
 * pencil over it, is the way into Edit profile. Anything that changes what
 * listeners hear is the hero's own. Under the name: Copy player link,
 * QR code & embed (the tune-in code, the Pro embed, a phone's share sheet) and Open ↗. The description is not shown:
 * it is on the player page and in Edit profile, and two lines of it were
 * what kept the overview from fitting one screen.
 */
export function OverviewHeader({ station, lastLive, appUrl }: { station: Station; lastLive: string | null; appUrl: string }) {
  const [editing, setEditing] = useState(false)
  // Drawn on the server and again in the browser, so both must agree. The
  // month in a fixed zone (the station's, else UTC): unzoned, a station made
  // late on the 31st was "Oct" on a UTC server and "Nov" in Asia.
  const since = new Date(station.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: station.timezone ?? "UTC" })
  const lastLiveAgo = lastLive && station.state !== "live" ? formatDate(lastLive, "relative") : null

  return (
    // The artwork, with a pencil over its corner, is Edit profile. Copy
    // player link, QR code & embed and Open ↗ stand in for the link itself, which isn't shown.
    // Phones (below sm): the buttons stacked right of the artwork, the name
    // on its own row underneath. From sm: a profile header — the name, then
    // the buttons in a row, beside a big artwork.
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 sm:gap-x-5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={station.artwork_url ? "Edit profile and artwork" : "Edit profile and add artwork"}
        className="group relative shrink-0 overflow-hidden sm:row-span-2 rounded-well outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StationArtwork src={station.artwork_url} alt="" className="size-28 text-text-faint sm:size-44" iconSize={28} sizes="176px" priority />
        {!station.artwork_url && (
          <span className="absolute inset-x-0 bottom-1 text-center eyebrow-sm text-text-faint">Add</span>
        )}
        <span aria-hidden className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm">
          <IconPencil size={14} />
        </span>
      </button>

      <div className="flex min-w-0 flex-col gap-2 sm:col-start-2 sm:row-start-2 sm:flex-row sm:flex-wrap sm:items-center sm:self-start">
        <CopyLinkButton value={taggedStationUrl(appUrl, station.slug, "owner")} />
        <ShareButton appUrl={appUrl} slug={station.slug} stationName={station.name} className="sm:w-auto" />
        <Button variant="ghost" size="md" full className="sm:w-auto" asChild>
          <a href={`${appUrl}/station/${station.slug}`} target="_blank" rel="noopener noreferrer">Open ↗</a>
        </Button>
      </div>

      {/* The genre runs inline after the name, like a word: when the name
          wraps, it sits at the end of the last line, not on a row of its own. */}
      <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:self-end">
        {/* Phones: a size smaller and two lines at most, so a long name
            can't push the overview into a scroll. Full name on hover/long-press. */}
        <div className="min-w-0 break-words max-sm:line-clamp-2" title={station.name}>
          {/* The gap is the name's own margin plus a space, not a margin on
              the tag: a tag that wraps to its own line then starts flush left. */}
          <h1 className="mr-1 inline font-display text-title max-sm:text-title-sm">{station.name}</h1>
          {station.genre && <>{" "}<Tag className="align-middle">{station.genre}</Tag></>}
        </div>
        {/* Live, it's only "Since …": dropped on phones, where the hero needs the line. */}
        <p className={cn("text-body-sm text-text-faint", station.state === "live" && "max-sm:hidden")}>
          {`Since ${since}`}
          {lastLiveAgo && (
            <>
              {" · "}
              {/* "3m ago" by the clock at render: the browser's can be a
                  minute on from the server's. Allowed to differ, like any
                  relative time. */}
              <span suppressHydrationWarning>{`Last live ${lastLiveAgo}`}</span>
            </>
          )}
        </p>
      </div>

      <StationFormDialog open={editing} onClose={() => setEditing(false)} station={station} />
    </header>
  )
}

/**
 * Copy player link, soft so Go live stays the one solid button. The link
 * isn't on screen, so when copying fails the whole link appears, selected,
 * to copy by hand.
 */
function CopyLinkButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    const ok = await copyText(value)
    setState(ok ? "copied" : "failed")
    if (timer.current) clearTimeout(timer.current)
    if (ok) timer.current = setTimeout(() => setState("idle"), 1800)
  }

  return (
    <>
      <Button variant="subtle" size="md" full className="sm:w-auto" onClick={copy}>
        {state === "copied" ? "Copied" : state === "failed" ? "Copy it yourself" : "Copy player link"}
      </Button>
      {state === "failed" && (
        <input
          ref={(el) => el?.select()}
          readOnly
          value={value}
          aria-label="Player link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded-button bg-surface-inset px-3 py-2 font-mono text-body-sm outline-none sm:basis-full"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Player link copied" : state === "failed" ? "Couldn’t copy. The full player link is selected for you to copy." : ""}
      </span>
    </>
  )
}
