import { cn } from "@/lib/utils"

/**
 * The diaspora page's centrepiece: an airport departure board, because a
 * diaspora station is home, sent everywhere it went. One show (Sunday
 * evening in Lagos) and its local time in each country listeners are in,
 * with the share each country makes up (the Pro audience page's
 * "by country"). Times are for late November (no daylight saving anywhere
 * on the board). Static.
 */

const ROWS = [
  { country: "Nigeria", note: "Home", time: "20:00", day: "Sun", share: 22, home: true },
  { country: "United Kingdom", note: "", time: "19:00", day: "Sun", share: 31 },
  { country: "United States", note: "Houston", time: "13:00", day: "Sun", share: 19 },
  { country: "Canada", note: "Toronto", time: "14:00", day: "Sun", share: 11 },
  { country: "Ireland", note: "", time: "19:00", day: "Sun", share: 9 },
  { country: "UAE", note: "Dubai", time: "23:00", day: "Sun", share: 8 },
]

export function DepartureBoard() {
  return (
    <figure className="flex flex-col gap-4 overflow-hidden rounded-card bg-[#0b0a09] p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-1 font-mono">
        <span className="text-body-sm font-semibold tracking-[0.18em] text-fault uppercase">Lagos Sunday Live</span>
        <span className="text-caption tracking-widest text-text-faint uppercase">Station time 20:00 WAT</span>
      </div>
      <table className="w-full border-separate border-spacing-y-1.5 font-mono">
        <thead>
          <tr className="text-left text-[0.6875rem] tracking-[0.16em] text-text-faint uppercase">
            <th scope="col" className="px-3 pb-1 font-medium">Listening in</th>
            <th scope="col" className="px-3 pb-1 text-right font-medium">Local time</th>
            <th scope="col" className="hidden px-3 pb-1 text-right font-medium sm:table-cell">Share</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.country} className={cn("text-fault", r.home && "text-ok")}>
              <th scope="row" className="rounded-l-[6px] bg-[#16140f] px-3 py-3 text-left font-semibold tracking-wide uppercase">
                <span className="block truncate text-body-sm sm:text-body">{r.country}</span>
                {r.note && <span className="block text-[0.6875rem] tracking-[0.14em] text-text-faint">{r.note}</span>}
              </th>
              <td className="bg-[#16140f] px-3 py-3 text-right text-body tabular-nums sm:text-title-sm">
                <span className="text-text-faint">{r.day} </span>
                {r.time}
              </td>
              <td className="hidden rounded-r-[6px] bg-[#16140f] px-3 py-3 text-right text-body-sm tabular-nums sm:table-cell">
                {r.share}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="px-1 text-body-sm text-text-faint text-pretty">
        One show, six countries. Shares like these come from the audience page, which Pro keeps for 90 days.
      </figcaption>
    </figure>
  )
}
