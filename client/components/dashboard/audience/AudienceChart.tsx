"use client"

import { AudienceDay } from "@/interfaces/Audience"
import { formatAirtime, formatCount } from "@/lib/format"
import { DayBarChart, type DayColumn } from "@/components/dashboard/charts/DayBarChart"

/**
 * Listening time per day.
 *
 * ONE SERIES, ON PURPOSE. Listening time, peak concurrency, arrivals and
 * distinct listeners all live on different scales, and drawing any two of them
 * together needs a second y-axis — the one chart mistake that reliably makes a
 * reader believe a crossover means something. The other three ride in the
 * tooltip instead, where they are read against a day rather than against each
 * other.
 *
 * Listening time is the one plotted because it is the only measure that
 * includes ICECAST listeners: they hold a socket and are counted by polling,
 * so they never produce a session row. A chart of arrivals would quietly omit
 * everyone not on our own web player.
 */
interface AudienceChartProps {
  daily: AudienceDay[]
  rangeDays: number
  /**
   * Shown when no day has any listening time. Supplied by the page because
   * the right sentence depends on what the OTHER cards know: "nobody
   * listened" is false when player-page listens exist that the minute
   * sampler simply hasn't caught, and the page is the one place that holds
   * both figures.
   */
  empty: string
}

export function AudienceChart({ daily, rangeDays, empty }: AudienceChartProps) {
  const label = (iso: string) =>
    // Parsed as UTC, formatted as UTC: the buckets are UTC days, and letting
    // the browser shift them into local time would relabel every bar by one
    // day for anyone west of Greenwich.
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })

  const columns: DayColumn[] = daily.map((d) => ({
    key: d.day,
    date: new Date(`${d.day}T12:00:00Z`),
    bars: d.listener_minutes > 0 ? [{ id: d.day, value: d.listener_minutes }] : [],
    detail: (
      <>
        {label(d.day)} — {formatAirtime(d.listener_minutes * 60)}
        {d.peak > 0 && <span className="text-muted-foreground"> · peak {formatCount(d.peak)}</span>}
        {d.listeners > 0 && (
          <span className="text-muted-foreground"> · {formatCount(d.listeners)} listener{d.listeners === 1 ? "" : "s"}</span>
        )}
      </>
    ),
  }))

  return (
    <DayBarChart
      title={<h2 className="font-display text-heading">Listening time per day</h2>}
      range={`Last ${rangeDays} days`}
      columns={columns}
      tick={(minutes) => (minutes === 0 ? "0" : formatAirtime(Math.round(minutes) * 60))}
      ariaLabel={`Listening time per day over the last ${rangeDays} days. Full figures in the table below.`}
      empty={empty}
    >
      {/* Identity is never colour-alone, and a bar chart is not readable by a
          screen reader. Same numbers, same order, no visual weight. */}
      {/* sr-only on a wrapper, never on the <table>: a table ignores the 1px
          height and grows to fit its rows, so an sr-only table still pushed
          the document ~1,200px taller. */}
      <div className="sr-only">
        <table>
          <caption>Listening time per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Listening time</th>
              <th scope="col">Peak listeners</th>
              <th scope="col">Listeners</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <th scope="row">{label(d.day)}</th>
                <td>{formatAirtime(d.listener_minutes * 60)}</td>
                <td>{formatCount(d.peak)}</td>
                <td>{formatCount(d.listeners)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DayBarChart>
  )
}
