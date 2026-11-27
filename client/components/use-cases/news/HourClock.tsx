import { cn } from "@/lib/utils"

/**
 * The news page's centrepiece: a radio "hour clock" (the format stations
 * draw their hour on), with GoCast's two kinds of air on it. Bulletins sit
 * in on-time slots (Pro AutoDJ), music and talk fill the rest, and breaking
 * news is a live takeover from the browser at any minute (Free). Static,
 * drawn in SVG so it scales and stays crisp; the colours are the product's
 * on-air (violet) and live (red) tokens.
 */

type Arc = { from: number; to: number; kind: "bulletin" | "fill"; label?: string }

const HOUR: Arc[] = [
  { from: 0, to: 5, kind: "bulletin", label: ":00 News" },
  { from: 5, to: 30, kind: "fill" },
  { from: 30, to: 32, kind: "bulletin", label: ":30 Headlines" },
  { from: 32, to: 60, kind: "fill" },
]

const R = 120
const C = 150

function point(min: number, r = R) {
  const a = (min / 60) * Math.PI * 2 - Math.PI / 2
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
}

function arcPath(from: number, to: number) {
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  const large = to - from > 30 ? 1 : 0
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`
}

export function HourClock() {
  return (
    <figure className="grid items-center gap-10 rounded-card bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
      <svg viewBox="0 0 300 300" role="img" aria-labelledby="hour-clock-title" className="mx-auto w-full max-w-[26rem]">
        <title id="hour-clock-title">
          An hour on a news station: news at the top of the hour and headlines at half past, both on time, music and
          talk in between, and breaking news live at any minute.
        </title>
        {/* Minute ticks */}
        {Array.from({ length: 60 }, (_, m) => {
          const [x1, y1] = point(m, m % 5 === 0 ? 96 : 100)
          const [x2, y2] = point(m, 104)
          return (
            <line
              key={m}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={m % 5 === 0 ? "stroke-muted-foreground" : "stroke-surface-strong"}
              strokeWidth={m % 5 === 0 ? 2 : 1}
            />
          )
        })}
        {HOUR.map((a) => (
          <path
            key={a.from}
            d={arcPath(a.from + 0.4, a.to - 0.4)}
            fill="none"
            strokeWidth={22}
            strokeLinecap="butt"
            className={cn(a.kind === "bulletin" ? "stroke-on-air" : "stroke-surface-strong")}
          />
        ))}
        {/* Quarter-hour labels, inside the ticks, so it reads as a clock. */}
        {[0, 15, 30, 45].map((m) => {
          const [x, y] = point(m, 80)
          return (
            <text key={m} x={x} y={y + 4} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">
              :{String(m).padStart(2, "0")}
            </text>
          )
        })}
        {/* Breaking news: a live takeover can land anywhere; drawn at :47. */}
        {(() => {
          const [x, y] = point(47)
          return (
            <g>
              <circle cx={x} cy={y} r={13} className="fill-live" />
              <circle cx={x} cy={y} r={20} fill="none" strokeWidth={2} className="stroke-live opacity-40" />
            </g>
          )
        })()}
        <text x={C} y={C - 4} textAnchor="middle" className="fill-foreground font-display text-[26px] font-extrabold">
          One hour
        </text>
        <text x={C} y={C + 20} textAnchor="middle" className="fill-text-faint font-mono text-[9px] tracking-widest uppercase">
          Riverside News
        </text>
      </svg>

      <figcaption className="flex flex-col gap-6">
        <Legend swatch="bg-on-air" title=":00 News and :30 Headlines" tag="On time · Pro">
          Recorded bulletins in slots set to start exactly on time. AutoDJ picks songs that end before the hour, or
          fades the last one out, so the news starts on the dot.
        </Legend>
        <Legend swatch="bg-surface-strong" title="Everything in between" tag="AutoDJ · Pro">
          Music, features and repeats from your library, on a weekly schedule.
        </Legend>
        <Legend swatch="bg-live" title="Breaking news, any minute" tag="Live · Free">
          Go live from a browser, on a laptop or a phone, and you take over the station within seconds. On Pro, the
          hour carries on when you finish.
        </Legend>
      </figcaption>
    </figure>
  )
}

function Legend({ swatch, title, tag, children }: { swatch: string; title: string; tag: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3.5 gap-y-1.5">
      <span className={cn("mt-1.5 size-4 rounded-full", swatch)} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-card-title">{title}</span>
        <span className="eyebrow-sm text-text-faint">{tag}</span>
      </div>
      <p className="col-start-2 text-body text-muted-foreground text-pretty">{children}</p>
    </div>
  )
}
