import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import { Station } from "@/interfaces/Station"
import { Audience, AUDIENCE_WINDOWS } from "@/interfaces/Audience"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AudienceChart } from "@/components/dashboard/audience/AudienceChart"
import { AudienceBreakdown } from "@/components/dashboard/audience/AudienceBreakdown"
import { AudienceUpsell } from "@/components/dashboard/audience/AudienceUpsell"
import { formatAirtime, formatDuration, countryName, countryFlag } from "@/lib/format"
import { cn } from "@/lib/utils"

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
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[station/${slug}/audience] fetch failed:`, err)
    throw err
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground" asChild>
            <Link href={`/dashboard/stations/${station.slug}`}>
              <IconArrowLeft data-icon="inline-start" />
              {station.name}
            </Link>
          </Button>
          <h1 className="text-2xl font-medium">Audience</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            {audience.locked
              ? "Listeners on your station right now, and the most you've ever had at once."
              : "Everyone who pressed play — on your player page and on the direct stream."}
          </p>
        </div>

        {!audience.locked && (
          <nav
            className="flex items-center gap-1 rounded-lg border p-1 shrink-0"
            aria-label="Time range"
          >
            {AUDIENCE_WINDOWS.filter((w) => w <= audience.plan_days).map((window) => {
              const active = window === audience.range_days
              return (
                <Link
                  key={window}
                  href={`/dashboard/stations/${station.slug}/audience?days=${window}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {window}d
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {audience.locked ? (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-5">
              <Tile
                label="Listening now"
                value={String(audience.live)}
                hint={station.state === "offline" ? "station is off air" : "right now"}
              />
              <Tile
                label="Peak listeners"
                value={String(audience.peak_all_time)}
                hint={audience.peak_all_time > 0 ? "concurrent, all time" : "share your link to grow"}
              />
            </CardContent>
          </Card>

          <AudienceUpsell stationName={station.name} />
        </>
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Tile
                label="Listening time"
                value={formatAirtime(audience.totals.listener_minutes * 60)}
                hint={`across ${audience.range_days} days`}
              />
              <Tile
                label="Listeners"
                value={String(audience.totals.listeners)}
                // Says "per day" because that is exactly what it is. The
                // visitor hash is re-keyed daily so nobody can be followed
                // between days, which means a returning listener genuinely
                // counts once per day and a "unique listeners" label would be
                // claiming a reach figure we cannot compute.
                hint="counted once per day"
              />
              <Tile
                label="Peak listeners"
                value={String(audience.totals.peak)}
                hint={`most at once · ${audience.peak_all_time} all time`}
              />
              <Tile
                label="Average listen"
                value={
                  audience.totals.avg_listen_seconds > 0
                    ? formatDuration(audience.totals.avg_listen_seconds)
                    : "—"
                }
                hint={
                  audience.totals.avg_listen_seconds > 0
                    ? `${audience.totals.qualified_listens} listens over a minute`
                    : "no finished listens yet"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <AudienceChart daily={audience.daily} rangeDays={audience.range_days} />
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent>
                <AudienceBreakdown
                  title="Countries"
                  items={audience.countries.rows.map((c) => ({
                    key: c.country,
                    label: `${countryFlag(c.country)} ${countryName(c.country)}`.trim(),
                    value: c.sessions,
                    detail: formatAirtime(c.listener_seconds),
                  }))}
                  total={audience.countries.total}
                  remainderLabel="Everywhere else"
                  // Two genuinely different situations, and a broadcaster can
                  // act on only one of them. See GeoResolver: country is
                  // resolved from a CDN header, so a deployment without one
                  // records nobody's country and the list would otherwise read
                  // as "you have no listeners" to a station that has plenty.
                  empty={
                    audience.totals.sessions > 0
                      ? "No countries recorded for this window. Location is resolved at the edge, so it needs the CDN in front of the API — ask support if this stays empty."
                      : "Nobody has pressed play in this window yet."
                  }
                  footnote={`From ${audience.countries.total} of ${audience.totals.sessions} listens — the rest couldn't be placed.`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <AudienceBreakdown
                  title="Devices"
                  items={audience.devices.rows.map((d) => ({
                    key: d.label,
                    label: d.label.charAt(0).toUpperCase() + d.label.slice(1),
                    value: d.sessions,
                  }))}
                  total={audience.devices.total}
                  empty="No device data for this window yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <AudienceBreakdown
                  title="Browsers"
                  items={audience.browsers.rows.map((b) => ({
                    key: b.label,
                    label: b.label,
                    value: b.sessions,
                  }))}
                  total={audience.browsers.total}
                  empty="No browser data for this window yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <AudienceBreakdown
                  title="Where they came from"
                  items={audience.referrers.rows.map((r) => ({
                    key: r.label,
                    label: r.label,
                    value: r.sessions,
                  }))}
                  total={audience.referrers.total}
                  remainderLabel="Other sites"
                  empty="Nobody arrived from a link we could see — most players open the page directly."
                  footnote="Only the site name is recorded, never the full address."
                />
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Listening time counts every minute anyone spent tuned in, including
            listeners on the direct stream who never open your player page. Days run
            in UTC. Listener records older than 90 days are deleted, so countries and
            devices only ever cover that window.
          </p>
        </>
      )}
    </div>
  )
}

/** One headline figure. Same shape as the tiles on the station overview. */
function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-medium tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground truncate" title={hint}>{hint}</div>
    </div>
  )
}
