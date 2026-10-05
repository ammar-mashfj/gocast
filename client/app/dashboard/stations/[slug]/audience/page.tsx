import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import { Station } from "@/interfaces/Station"
import { Audience, AudienceReport, AUDIENCE_WINDOWS } from "@/interfaces/Audience"
import { Card } from "@/components/ds/Card"
import { PageHeader } from "@/components/ds/PageHeader"
import { StatTile } from "@/components/ds/Stat"
import { AudienceChart } from "@/components/dashboard/audience/AudienceChart"
import { AudienceBreakdown as Breakdown } from "@/components/dashboard/audience/AudienceBreakdown"
import { NoListenersYet } from "./NoListenersYet"
import { HowWeCount } from "./HowWeCount"
import { AudienceUpsell } from "@/components/dashboard/audience/AudienceUpsell"
import { formatAirtime, formatDuration, countryName } from "@/lib/format"
import { cn } from "@/lib/utils"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { env } from "@/lib/env"

/**
 * Who is listening, and where from.
 *
 * A page rather than a card on the station overview: the overview answers "is
 * my station working", and this answers "is anyone there" — different
 * questions, asked at different moments, and the second needs a chart, four
 * breakdowns and a range control that would crowd the first out.
 *
 * THE PLAN GATE IS THE API'S, NOT THIS FILE'S. The payload arrives either
 * locked or complete, and the branch below renders whichever it got. Nothing
 * here reads the plan to decide what to fetch, so there is no way for the UI
 * to ask for something the server would refuse, and no second copy of the
 * entitlement rule to drift from the first.
 */
// Its own tab title: every dashboard tab used to read the marketing title,
// so history and open tabs were indistinguishable.
export const metadata: Metadata = { title: "Audience" }

export default async function StationAudiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ days?: string }>
}) {
  const { slug } = await params
  const { days } = await searchParams

  // Validated here as well as on the server: a bad value would otherwise be
  // echoed straight back into the range links below as a live URL.
  const requested = AUDIENCE_WINDOWS.find((w) => String(w) === days)

  let station: Station
  let audience: Audience

  try {
    const [stationRes, audienceRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Audience }>(
        `/stations/${slug}/audience${requested ? `?days=${requested}` : ""}`,
      ),
    ])
    station = stationRes.data
    audience = audienceRes.data
  } catch (err) {
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) {
      notFound()
    }
    console.error(`[station/${slug}/audience] fetch failed:`, err)
    throw err
  }

  const playerUrl = `${env.appUrl}/station/${station.slug}`

  // The title is the room while the station is on air (the prototype's):
  // "12 people are listening." Off air, or nobody there, it is the page's name.
  const live = audience.live
  const title = live > 0 && station.state !== "offline" ? `${live} ${live === 1 ? "person is" : "people are"} listening.` : "Audience"

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={title}
        aside={<HelpLink article="read-your-audience-page" label="what the audience numbers mean" />}
        description={
          audience.locked
            ? "Listeners on your station right now, and the most you\u2019ve ever had at once."
            : "Everyone who pressed play — on your player page and on the direct stream."
        }
        actions={
          !audience.locked && (
            <RangeLinks
              slug={station.slug}
              windows={AUDIENCE_WINDOWS.filter((w) => w <= audience.plan_days)}
              current={audience.range_days}
            />
          )
        }
      />

      {audience.locked ? (
        <>
          {/* has_listeners too: the peak comes from the minute sampler, which
              can lag or miss listens the raw sessions recorded. */}
          {audience.live === 0 && audience.peak_all_time === 0 && !station.stats?.has_listeners ? (
            // Two zeros are not a report. The link is what changes them.
            <NoListenersYet
              playerUrl={playerUrl}
              message="Nobody has tuned in yet. Your first listeners come from your link, so send it to a few people before your next show."
            />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile label="Listening now" value={audience.live} sub={station.state === "offline" ? "station is off air" : "right now"} />
              <StatTile
                label="Peak at once"
                value={audience.peak_all_time}
                sub={audience.peak_all_time > 0 ? "most listening together, all time" : "share your link to grow"}
              />
            </div>
          )}
          <AudienceUpsell stationName={station.name} />
        </>
      ) : (
        <AudienceReportView
          report={audience}
          slug={station.slug}
          playerUrl={playerUrl}
          hasListeners={station.stats?.has_listeners ?? false}
        />
      )}
    </div>
  )
}

/**
 * The unlocked report.
 *
 * ONE COVERAGE RULE FOR EVERY CARD. The figures come from two sources that
 * see different people (see AudienceReport): listening time and peak are
 * sampled once a minute and include direct-stream (Icecast) listeners;
 * everything else is counted from player-page listens, which Icecast never
 * creates. Each card used to pick its own empty test, and they disagreed —
 * the dev station showed "Listeners 7" and a 100% device split beside
 * Countries saying "Nobody has pressed play in this window yet", and
 * "Listening time 0m" beside "Average listen 15m 53s". Now every card reads
 * the same `coverage` value, and a sampled figure that is still zero while
 * listens exist says "not measured yet" instead of printing a 0 the rest of
 * the page contradicts.
 */
function AudienceReportView({
  report,
  slug,
  playerUrl,
  hasListeners,
}: {
  report: AudienceReport
  slug: string
  playerUrl: string
  /** StationResource's answer, which also counts listens the sampler missed. */
  hasListeners: boolean
}) {
  const { totals } = report
  const listens = totals.sessions
  const sampled = totals.listener_minutes > 0

  // "listens": player-page sessions exist, so every breakdown has rows to
  //   draw or a specific reason it can't classify them.
  // "stream-only": sampled listening exists but nobody used the player page,
  //   so breakdowns are empty for a reason that isn't "nobody listened".
  // "none": nobody, by either measure.
  const coverage: "listens" | "stream-only" | "none" =
    listens > 0 ? "listens" : sampled ? "stream-only" : "none"

  const nobody = "Nobody has pressed play in this window yet."
  const streamOnly =
    "Everyone in this window listened on the direct stream. Devices, browsers and locations are only recorded for your player page."

  // One sentence per dimension, all driven by `coverage`, so no card can
  // claim an empty room while another card is showing who was in it.
  const breakdownEmpty = (whenListens: string) =>
    coverage === "listens" ? whenListens : coverage === "stream-only" ? streamOnly : nobody

  // A sampled figure of zero beside real listens means the minute sampler
  // hasn't caught them (sub-minute listens, or `listeners:sweep` not running)
  // — not that nobody listened. Say so rather than print "0m" next to a
  // fifteen-minute average.
  const unsampled = coverage === "listens" && !sampled
  const peakAllTime = Math.max(report.peak_all_time, totals.peak)

  // Nobody by either measure: the tiles would all read "—" and the chart and
  // breakdowns would each explain the same absence. One sentence and the
  // link instead. A station that HAS been heard, just not in this window, is
  // told so and offered the widest window its plan allows.
  if (coverage === "none") {
    const everHeard = report.peak_all_time > 0 || hasListeners
    const widest = report.plan_days
    return (
      <NoListenersYet
        playerUrl={playerUrl}
        message={
          // A direct-stream listener makes no session and isn't in the
          // sampled figures until the next minute's sample.
          report.live > 0
            ? `${report.live === 1 ? "Someone is" : `${report.live} people are`} listening right now on the direct stream. They'll show up here within a few minutes.`
            : everHeard
            ? `Nobody tuned in during the last ${report.range_days} days. Share your link before your next show and they'll show up here.`
            : "Nobody has tuned in yet. Your first listeners come from your link, so send it to a few people before your next show."
        }
        wider={
          everHeard && widest > report.range_days
            ? { href: `/dashboard/stations/${slug}/audience?days=${widest}`, label: `See the last ${widest} days` }
            : undefined
        }
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile
            label="Listening time"
            value={unsampled ? "—" : formatAirtime(totals.listener_minutes * 60)}
            sub={
              unsampled
                ? "not measured yet"
                : `all listeners, last ${report.range_days} days`
            }
          />
          <StatTile
            label="Daily listeners"
            value={String(totals.listeners)}
            // "Daily" because that is exactly what it is. The visitor hash is
            // re-keyed daily so nobody can be followed between days, which
            // means a returning listener genuinely counts once per day and a
            // "unique listeners" label would be claiming a reach figure we
            // cannot compute.
            sub={
              coverage === "stream-only"
                ? "player page only"
                : `player page, counted once a day`
            }
          />
          <StatTile
            label="Peak at once"
            value={unsampled && totals.peak === 0 ? "—" : String(totals.peak)}
            sub={
              unsampled && totals.peak === 0
                ? "not measured yet"
                : `most listening together · ${peakAllTime} all time`
            }
          />
          <StatTile
            label="Average listen"
            value={totals.avg_listen_seconds > 0 ? formatDuration(totals.avg_listen_seconds) : "—"}
            sub={
              totals.finished_listens > 0
                ? `across ${totals.finished_listens} finished listen${totals.finished_listens === 1 ? "" : "s"}`
                : coverage === "listens"
                  ? "no listen has finished yet"
                  : "player page only"
            }
          />
      </div>

      <Card>
          <AudienceChart
            daily={report.daily}
            rangeDays={report.range_days}
            // "none" never reaches here (see NoListenersYet above), so an
            // empty chart only ever means the sampler hasn't caught up.
            empty="Listening time hasn't been sampled for these listens yet. It's measured once a minute, so very short listens may never appear here."
          />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
            <Breakdown
              title="Countries"
              items={report.countries.rows.map((c) => ({
                key: c.country,
                label: countryName(c.country),
                // A code, not an emoji flag: the design system's no-emoji rule.
                code: c.country,
                value: c.sessions,
                detail: formatAirtime(c.listener_seconds),
              }))}
              total={report.countries.total}
              remainderLabel="Everywhere else"
              // Location is resolved from a CDN header (see GeoResolver), so
              // a deployment without one records nobody's country — the list
              // must not read as "you have no listeners" to a station that
              // has plenty. It is also rolled up hourly from finished listens
              // only, so a brand-new listen shows up here last.
              empty={breakdownEmpty(
                "No locations recorded for these listens yet. Countries fill in about an hour after a listen ends.",
              )}
              footnote={`Located ${report.countries.total} of ${listens} listens. The rest are still in progress or couldn't be placed.`}
            />
        </Card>

        <Card>
            <Breakdown
              title="Devices"
              items={report.devices.rows.map((d) => ({
                key: d.label,
                label: d.label.charAt(0).toUpperCase() + d.label.slice(1),
                value: d.sessions,
              }))}
              total={report.devices.total}
              empty={breakdownEmpty("None of these listens identified their device.")}
            />
        </Card>

        <Card>
            <Breakdown
              title="Browsers"
              items={report.browsers.rows.map((b) => ({
                key: b.label,
                label: b.label,
                value: b.sessions,
              }))}
              total={report.browsers.total}
              empty={breakdownEmpty("None of these listens identified their browser.")}
            />
        </Card>

        <Card>
            <Breakdown
              title="Where they came from"
              items={report.referrers.rows.map((r) => ({
                key: r.label,
                label: r.label,
                value: r.sessions,
              }))}
              total={report.referrers.total}
              remainderLabel="Other sites"
              empty={breakdownEmpty(
                "Nobody arrived from a link we could see — most listeners open the page directly.",
              )}
              footnote="Only the site name is recorded, never the full address."
            />
        </Card>
      </div>

      <HowWeCount />
    </>
  )
}

/** The range choice, as the design system's small Segmented — links, because the range is in the URL the server reads. */
function RangeLinks({ slug, windows, current }: { slug: string; windows: readonly number[]; current: number }) {
  return (
    <nav aria-label="Time range" className="grid auto-cols-fr grid-flow-col gap-0.75 rounded-item bg-card p-0.75">
      {windows.map((w) => (
        <Link
          key={w}
          href={`/dashboard/stations/${slug}/audience?days=${w}`}
          aria-current={w === current ? "page" : undefined}
          className={cn(
            "flex h-7.5 items-center justify-center rounded-segment px-3.5 font-mono text-caption font-semibold tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            w === current ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {w}d
        </Link>
      ))}
    </nav>
  )
}
