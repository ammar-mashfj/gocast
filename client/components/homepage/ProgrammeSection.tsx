import { ProTag } from "@/components/ds/Tag"
import { Points, Section, SectionIntro } from "./Section"
import { WeekGrid } from "./WeekGrid"

const POINTS = [
  {
    title: "Playlists, not one big folder",
    body: "Group your library the way a radio station thinks — by show, by mood, by hour of the day.",
  },
  {
    title: "Sequential or shuffled",
    body: "Play a set in the order you built it, or shuffle a deck that never repeats a track until it has played them all.",
  },
  {
    title: "Nothing to babysit",
    body: "Slots switch at the next track boundary, in your station’s timezone. Gaps fall back to your default rotation.",
  },
] as const

/**
 * The rest of Pro, as a checklist under the one Pro screen worth showing.
 * It used to be a strip of its own above pricing; here it reads as "and the
 * plan that gives you the schedule also gives you these".
 */
const PRO_EXTRAS = [
  {
    title: "A stream URL of your own",
    body: "A public Icecast URL that works in TuneIn, Sonos, VLC and every directory that takes one.",
  },
  {
    title: "Your site, your domain",
    body: "Embed the player with one line of HTML, or point a DNS record at your station.",
  },
  {
    title: "Broadcast from your own gear",
    body: "BUTT, Mixxx, or any Icecast source client connects straight to your station.",
  },
  {
    title: "Know who is listening",
    body: "Ninety days of listener history, by day and by country. Live count and all-time peak stay free on every plan.",
  },
] as const

/**
 * The proof behind "the station runs a week on its own": the Schedule screen
 * itself, because a claim about scheduling is not believable without seeing
 * the grid.
 */
export default function ProgrammeSection() {
  return (
    <Section id="autodj">
      <SectionIntro
        split
        eyebrow="AutoDJ scheduling"
        tag={<ProTag />}
        title="Your week, on air."
        lead="Set it once and the station follows it — at the mic, asleep, or on holiday. Go live at any point and your voice takes over; end the show and the schedule picks straight back up."
      />
      <WeekGrid />
      <Points points={POINTS} />
      <div className="flex flex-col gap-4 pt-2 sm:pt-6">
        <h3 className="font-display text-title">Also included in Pro</h3>
        <ul role="list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRO_EXTRAS.map((x) => (
            <li key={x.title} className="flex flex-col gap-2.5 rounded-card bg-card p-5.5">
              <span className="font-display text-heading">{x.title}</span>
              <span className="text-body-sm text-muted-foreground">{x.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
