import { WeekGridMock } from "./WeekGridMock"

const POINTS = [
  {
    title: "Playlists, not one big folder",
    body: "Group your library however a radio station thinks — by show, by mood, by hour of the day.",
  },
  {
    title: "Sequential or shuffled",
    body: "Play a set in the order you built it, or shuffle a deck that never repeats a track until it has played them all.",
  },
  {
    title: "Nothing to babysit",
    body: "Slots switch at the next track boundary, in your station's timezone. Gaps fall back to your default rotation.",
  },
]

/**
 * The proof behind the "when you're not" feature cards. Those cards claim the
 * station runs a week on its own; this section shows the screen that does it,
 * because a claim about scheduling is not believable without seeing the grid.
 */
export default function ProgrammeSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center max-w-6xl mx-auto">
        <div className="order-2 md:order-1">
          <WeekGridMock />
        </div>

        <div className="order-1 md:order-2">
          <div className="text-xs tracking-[3px] uppercase text-violet-muted mb-4">
            AutoDJ scheduling
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold -tracking-wide leading-tight mb-4 text-balance">
            Your week, on air.
          </h2>
          <p className="text-sm md:text-base text-text-muted leading-relaxed mb-8 max-w-[46ch]">
            Set it once and the station follows it — whether you are at the
            microphone, asleep, or on holiday. Go live at any point and your
            voice takes over; hang up and the schedule picks straight back up.
          </p>

          <ul role="list" className="flex flex-col gap-5">
            {POINTS.map((point) => (
              <li key={point.title} className="flex gap-3.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-muted" aria-hidden="true" />
                <span>
                  <span className="block text-[15px] font-medium text-text-secondary">
                    {point.title}
                  </span>
                  <span className="block text-sm text-text-muted leading-relaxed mt-0.5">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
