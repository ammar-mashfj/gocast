"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { IconArrowRight, IconExternalLink, IconPlaylist, IconSettings } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StationArtwork } from "@/components/StationArtwork"
import { useStationBySlug } from "@/contexts/StationContext"

/**
 * The station page while its data is in flight.
 *
 * A client component, and deliberately so: the dashboard layout persists
 * across this transition, so the station's IDENTITY — artwork, name, genre,
 * description — is already in context and is rendered for real here. Only the
 * parts that actually depend on the pending fetches are skeletons.
 *
 * That is the whole point. This file used to skeleton the name too, so the one
 * thing that never changes between renders was the thing that flickered: you
 * clicked into your station and watched a grey bar sit where its name belongs,
 * then get replaced by the same name it would have shown all along. Painting
 * known values as unknown is worse than painting nothing. The same goes for
 * fixed copy — section titles, column heads, the "Listening now" label — which
 * is text here, not bars.
 *
 * GEOMETRY IS COPIED, NOT APPROXIMATED. The page is a flat `.sheet` with one
 * raised panel (the control strip), and the old skeleton drew the layout
 * before that: a boxed two-column grid with a listener dial in a sidebar. On
 * every load the whole page visibly rearranged itself into a different one.
 * So this file reuses the page's own wrappers — `.sheet`, the same Card
 * structure, the same hairline sections and container queries — and a
 * geometry change to page.tsx or the components it renders has to be made
 * here too.
 *
 * The strip is drawn in its ON-AIR shape (power | now playing | listening).
 * The layout context carries identity, not state, so this cannot know which
 * shape is coming; the three-part one is the one the page is built around.
 *
 * WHY THE (overview) ROUTE GROUP. A loading.tsx covers its own segment AND
 * every descendant segment without one of its own. Sitting directly in
 * `[slug]/`, this file was therefore the fallback for library, schedule,
 * audience, settings, live and studio as well — so opening the Schedule page,
 * or switching between the Music and Schedule tabs, flashed a power card,
 * an activity chart and a listener dial that belong to a different page
 * entirely. Every one of those routes is dynamic (`apiFetch` reads cookies and
 * sets no-store), so the flash happened on every single navigation, not
 * occasionally.
 *
 * The route group adds no URL segment — the station page is still at
 * `/dashboard/stations/{slug}` — but it does add a segment boundary, which is
 * all Next needs to stop handing this skeleton to the siblings. They carry
 * their own now.
 */
export default function StationDetailLoading() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""
  const station = useStationBySlug(slug || null)

  return (
    // The Skeleton primitive pulses unconditionally; stopping it here keeps
    // the whole page still for anyone who asked for reduced motion.
    <div className="sheet flex flex-col gap-8 motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      {/* Header — real wherever the layout already knows the answer. */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5">
        {station ? (
          <StationArtwork
            src={station.artwork_url}
            alt={station.name}
            className="size-16 md:size-24 rounded-2xl shrink-0"
            iconSize={24}
            sizes="96px"
          />
        ) : (
          <Skeleton className="size-16 md:size-24 rounded-2xl shrink-0" />
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {station ? (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-display text-2xl font-semibold truncate">{station.name}</h1>
              {station.genre && (
                <Badge variant="secondary" className="shrink-0 text-[11px]">{station.genre}</Badge>
              )}
            </div>
          ) : (
            <Skeleton className="h-8 w-48" />
          )}

          {station ? (
            station.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{station.description}</p>
            )
          ) : (
            <Skeleton className="h-5 w-64" />
          )}

          {/* The meta line genuinely is pending — it counts broadcasts and
              reads the current state, neither of which the layout carries. */}
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Both links only need the slug, so they are live already. The
              edit button between them is a bar: its dialog needs the full
              station record, which is exactly what is still loading. */}
          <Button variant="outline" className="flex-1 md:flex-initial" asChild>
            <a href={`/station/${slug}`} target="_blank" rel="noopener noreferrer">
              <IconExternalLink data-icon="inline-start" />
              Player page
            </a>
          </Button>
          <Skeleton className="h-9 flex-1 md:flex-initial md:w-44" />
          <Button variant="outline" size="icon" asChild title="Station settings">
            <Link href={`/dashboard/stations/${slug}/settings`}>
              <IconSettings />
              <span className="sr-only">Station settings</span>
            </Link>
          </Button>
        </div>
      </header>

      <section aria-label="On air now" className="flex flex-col gap-6">
        {/* The control strip — StationPower's panel, the one raised surface
            on the page. Container names and column tracks are StationPower's
            own, so the parts break at the same widths as the real strip. */}
        <div className="@container/cards overflow-hidden rounded-2xl border border-white/[0.09] bg-panel shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]">
          <div className="grid grid-cols-[minmax(0,1fr)] @3xl/cards:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @5xl/cards:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,15rem)]">
            {/* Power: state pill, what it means, then the two actions. */}
            <div className="@container/power p-5">
              <div className="flex flex-col gap-5 @lg/power:flex-row @lg/power:items-center @lg/power:justify-between">
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-7 w-56 max-w-full" />
                  <Skeleton className="h-5 w-44 max-w-full" />
                </div>
                <div className="flex flex-col gap-2 shrink-0 @lg/power:min-w-[190px]">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            </div>

            {/* Now playing. */}
            <div className="flex flex-col gap-1.5 border-t border-white/[0.06] p-5 @3xl/cards:border-l @3xl/cards:border-t-0">
              <h2 className="text-xs font-medium text-muted-foreground">Now playing</h2>
              <Skeleton className="h-7 w-52 max-w-full" />
              <Skeleton className="h-5 w-40 max-w-full" />
            </div>

            {/* Listening now — LiveListeners `bare`. */}
            <div className="border-t border-white/[0.06] p-5 @3xl/cards:col-span-2 @5xl/cards:col-span-1 @5xl/cards:border-l @5xl/cards:border-t-0">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xs font-medium text-muted-foreground">Listening now</h2>
                <Skeleton className="h-9 w-14" />
                <Skeleton className="h-5 w-40 max-w-full" />
                <Link
                  href={`/dashboard/stations/${slug}/audience`}
                  className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  View audience
                  <IconArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* AutoDjRotation, flat on the sheet under a hairline. */}
        <div className="border-t border-white/[0.07] pt-6">
          <Card className="@container/autodj gap-0 overflow-hidden">
            <CardContent className="flex flex-col items-start gap-3 pb-4 @2xl/autodj:flex-row @2xl/autodj:items-center @2xl/autodj:justify-between @2xl/autodj:gap-4">
              <div className="flex items-center gap-3 min-w-0 w-full">
                <div className="size-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <IconPlaylist size={18} className="text-muted-foreground" />
                </div>
                <div className="min-w-0 flex flex-col gap-1">
                  <div className="text-base font-medium">AutoDJ rotation</div>
                  <Skeleton className="h-4 w-56 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-36 shrink-0" />
            </CardContent>

            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] md:grid-cols-[1.5rem_minmax(0,1fr)_8rem_auto] items-center gap-3 px-6 py-2.5 border-t border-border"
              >
                <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="hidden md:block h-4 w-24" />
                <Skeleton className="h-4 w-9" />
              </div>
            ))}
          </Card>
        </div>
      </section>

      {/* Broadcast activity | Recent broadcasts, split by a vertical rule. */}
      <section
        aria-label="Your shows"
        className="grid items-start gap-8 border-t border-white/[0.07] pt-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:gap-0 xl:divide-x xl:divide-white/[0.07] xl:[&>*:first-child]:pr-8 xl:[&>*+*]:pl-8"
      >
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-base font-medium">Broadcast activity</h2>
              <span className="text-xs text-muted-foreground">Last 14 days</span>
            </div>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4 mb-6">
              {["Live airtime", "Broadcasts", "Peak listeners", "Total airtime"].map((label) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            {/* The chart's 80px, then its axis row. */}
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-full mt-2" />
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Live broadcasts only — time on air with the AutoDJ rotation isn&apos;t recorded
              as a session, so it doesn&apos;t appear here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Recent broadcasts</CardTitle>
            <Link
              href="/dashboard/broadcasts"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors"
            >
              View all
              <IconArrowRight size={14} />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] gap-3 px-3 pb-2 text-xs text-muted-foreground">
              <span>Started</span>
              <span className="hidden md:block">Source</span>
              <span>Duration</span>
              <span className="text-right">Peak</span>
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] gap-3 items-center px-3 py-2.5 border-t border-border"
              >
                <Skeleton className="h-5 w-32 max-w-full" />
                <Skeleton className="hidden md:block h-5 w-16" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-6 ml-auto" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Share your station | Finish setting up. */}
      <section
        aria-label="Share"
        className="grid items-start gap-8 border-t border-white/[0.07] pt-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-white/[0.07] md:[&>*:first-child]:pr-8 md:[&>*+*]:pl-8"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Share your station</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Anyone with this link can tune in from a browser — no app, no signup.
            </p>
            <Skeleton className="h-11 w-full rounded-lg" />
            <div className="flex gap-2 mt-3">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 flex-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between gap-3">
            <CardTitle className="text-base font-medium">Finish setting up</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="size-4 mt-0.5 rounded-full shrink-0 border border-white/[0.18]"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-full max-w-xs" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
