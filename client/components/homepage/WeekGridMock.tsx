const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MINUTES_PER_DAY = 24 * 60

interface MockSlot {
  label: string
  colour: string
  days: number[]
  start: string
  end: string
}

/**
 * A plausible week, not a real one. Chosen to show the three things the
 * Schedule page actually does: one playlist repeating across weekdays, a
 * different one at the weekend, and a slot that runs past midnight onto the
 * next day — which is drawn as two segments here exactly as the API resolves
 * it. The gaps are not empty; they are the default rotation, which is why
 * the legend names it rather than the grid drawing it.
 */
const SLOTS: MockSlot[] = [
  { label: "Morning Coffee", colour: "bg-sky-500/60", days: [1, 2, 3, 4, 5], start: "06:00", end: "10:00" },
  { label: "Drivetime", colour: "bg-amber-500/60", days: [1, 2, 3, 4, 5], start: "16:00", end: "19:00" },
  { label: "Weekend Brunch", colour: "bg-emerald-500/60", days: [0, 6], start: "09:00", end: "13:00" },
  { label: "Late Night", colour: "bg-violet-500/70", days: [5, 6], start: "22:00", end: "02:00" },
]

function minutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10))
  return h * 60 + m
}

// Split at midnight so every segment belongs to exactly one row. Static, so
// it runs once at module load rather than on every render.
const SEGMENTS: Array<{ day: number; from: number; to: number; slot: MockSlot }> = []
for (const slot of SLOTS) {
  const start = minutes(slot.start)
  let duration = minutes(slot.end) - start
  if (duration <= 0) duration += MINUTES_PER_DAY
  for (const day of slot.days) {
    const end = start + duration
    if (end > MINUTES_PER_DAY) {
      SEGMENTS.push({ day, from: start, to: MINUTES_PER_DAY, slot })
      SEGMENTS.push({ day: (day + 1) % 7, from: 0, to: end - MINUTES_PER_DAY, slot })
    } else {
      SEGMENTS.push({ day, from: start, to: end, slot })
    }
  }
}

/**
 * Static mock of the station Schedule page, shaped like the real WeekStrip so
 * the visitor reads it as "that is the screen I'll be using" rather than an
 * infographic. Nothing here is interactive or fetched.
 */
export function WeekGridMock() {
  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      <div className="absolute inset-0 -z-1 translate-y-4 rounded-[28px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.15),transparent_65%)] blur-2xl" aria-hidden="true" />

      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-md p-5 md:p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="text-[11px] tracking-widest uppercase text-violet-muted">
            This week
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            On air · Morning Coffee
          </div>
        </div>

        <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1">
          <span />
          <div className="relative h-4 text-[10px] text-text-faint tabular-nums" aria-hidden="true">
            {[0, 6, 12, 18, 24].map((h) => (
              <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h / 24) * 100}%` }}>
                {h === 24 ? "24" : String(h).padStart(2, "0")}
              </span>
            ))}
          </div>

          {DAY_NAMES.map((name, day) => (
            <div key={name} className="contents">
              <span className="text-[11px] text-text-faint self-center">{name}</span>
              <div className="relative h-6 rounded bg-white/[0.04] overflow-hidden">
                {[6, 12, 18].map((h) => (
                  <span
                    key={h}
                    className="absolute top-0 bottom-0 w-px bg-white/[0.06]"
                    style={{ left: `${(h / 24) * 100}%` }}
                  />
                ))}
                {SEGMENTS.filter((s) => s.day === day).map((s, i) => (
                  <span
                    key={`${s.slot.label}-${day}-${i}`}
                    className={`absolute top-0.5 bottom-0.5 rounded-sm ${s.slot.colour}`}
                    style={{
                      left: `${(s.from / MINUTES_PER_DAY) * 100}%`,
                      width: `${((s.to - s.from) / MINUTES_PER_DAY) * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.05] flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-white/[0.08] border border-white/[0.12]" />
            All Tracks (default)
          </span>
          {SLOTS.map((slot) => (
            <span key={slot.label} className="inline-flex items-center gap-1.5">
              <span className={`inline-block size-2.5 rounded-sm ${slot.colour}`} />
              {slot.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
