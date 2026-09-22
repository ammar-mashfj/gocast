import { StudioMock } from "./StudioMock"
import { PlanBadge } from "./PlanBadge"

/*
 * One capability each, not one detail each.
 *
 * The previous three were a keyboard shortcut, a ducking percentage and a
 * claim that closing the tab costs your listeners nothing — a trick, a spec
 * and something that is not true. Nothing here may imply the browser session
 * is disposable: a refresh drops the socket and takes the station off air,
 * which is exactly why the studio registers a beforeunload warning.
 * None of them said the thing a visitor is
 * actually unsure about, which is whether a browser tab can hold a real
 * studio. So each point now names a whole piece of the desk: the running
 * order, the mixer, the room.
 */
const POINTS = [
  {
    title: "A running order, not a file picker",
    body: "Drag tracks in, reorder them while they are playing, and repeat one or all. The deck counts down what is left of the track on air, so you always know how long you have before you need to talk or queue the next track.",
  },
  {
    title: "A mic that behaves like a mixer",
    body: "Hold space and the bed ducks under your voice, then lifts when you let go. Monitor the music through headphones while you do it — the mic is never on unless you put it there  , so you cannot howl yourself back.",
  },
  {
    title: "The room, while you are in it",
    body: "Your listener count moves in real time next to the deck, with the share link and a QR code beside it. You can see people arrive and hand out the link without coming off air.",
  },
]

/**
 * Replaces the nine-card feature grid that used to sit here.
 *
 * That grid summarised six things the page goes on to show properly a screen
 * later — the scheduling cards duplicated ProgrammeSection outright, and the
 * stream-URL cards restated the player mock already standing in the hero. What
 * had no home anywhere was the studio itself, which is also the half a visitor
 * is least willing to take on trust. So the section now does one job: show the
 * deck mid-broadcast and say three things about it.
 *
 * The leftovers live in CapabilityStrip, above pricing, where a checklist is
 * what someone actually wants.
 */
export default function StudioSection() {
  return (
    <section className="px-4 md:px-10 py-12 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center max-w-6xl mx-auto">
        <div className="order-1">
          <div className="text-xs tracking-[0.25em] uppercase text-violet-muted mb-4">
            Inside the studio <PlanBadge plan="free" />
          </div>
          <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-semibold -tracking-wide leading-tight mb-4 text-balance">
            The whole studio, in one tab.
          </h2>
          <p className="text-base text-text-secondary tracking-[0.01em] leading-relaxed mb-8 max-w-[46ch]">
            Queue the music, open the mic, watch the room fill. A running order
            you can rearrange mid-show, a bed that ducks under your voice,
            sound monitoring and live listener numbers — the desk a small
            station runs on, with nothing to install.
          </p>

          <ul role="list" className="flex flex-col gap-5">
            {POINTS.map((point) => (
              <li key={point.title} className="flex gap-3.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-muted" aria-hidden="true" />
                <span>
                  <span className="block text-base font-semibold text-white">
                    {point.title}
                  </span>
                  <span className="block text-base text-text-secondary leading-[1.7] text-pretty tracking-[0.01em] mt-1.5">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="order-2">
          <StudioMock />
        </div>
      </div>
    </section>
  )
}
