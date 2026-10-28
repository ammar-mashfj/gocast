import { IconPlayerPlayFilled } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
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
    body: "Slots start at the next track change, or on the dot if you switch that on, in your station’s timezone. Gaps fall back to your default rotation.",
  },
] as const

/**
 * The rest of Pro, each with a still picture of it, under the one Pro screen
 * worth showing. It used to be a strip of its own above pricing; here it
 * reads as "and the plan that gives you the schedule also gives you these".
 * Still on purpose: every section above moves, this one lets the eye rest
 * before pricing. The formats are the dashboard's (StreamCard, the encoder
 * fields, the embed); the station and the numbers are made up.
 */
const PRO_EXTRAS = [
  {
    title: "A stream URL of your own",
    body: "A public Icecast URL that works in TuneIn, Sonos, VLC and every directory that takes one.",
    picture: <StreamPicture />,
  },
  {
    title: "A player on your own site",
    body: "Embed the live player on any page you run. One iframe, copied from your dashboard.",
    picture: <EmbedPicture />,
  },
  {
    title: "Broadcast from your own gear",
    body: "BUTT, Mixxx, or any Icecast source client connects straight to your station.",
    picture: <EncoderPicture />,
  },
  {
    title: "Know who is listening",
    body: "Ninety days of listener history, by day and by country. Live count and all-time peak stay free on every plan.",
    picture: <AudiencePicture />,
  },
]

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
        <h3 className="font-display text-title text-pro">Also included in Pro</h3>
        <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRO_EXTRAS.map((x) => (
            <li key={x.title} className="flex min-w-0 flex-col gap-4 rounded-card bg-card p-4 sm:p-5">
              {/* p-3.5 rather than 4: Safari sets the mono links ~3% wider than
                  Chrome, and the 4-up cards leave them no slack. */}
              <div aria-hidden className="flex h-36 flex-col justify-center gap-3 overflow-hidden rounded-well bg-background p-3.5">
                {x.picture}
              </div>
              <div className="flex flex-col gap-2.5 px-1 pb-1">
                <span className="font-display text-heading">{x.title}</span>
                <span className="text-body-sm text-muted-foreground">{x.body}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

/** A stream address for radio apps, and where it plays. */
function StreamPicture() {
  return (
    <>
      {/* A demo address, kept short enough for one line on every card
          width: a cut-off or wrapped link reads as broken. */}
      <div className="flex min-h-11 items-center rounded-item bg-surface-raised px-2.5 py-1.5">
        <span className="min-w-0 font-mono text-caption [overflow-wrap:anywhere]">stream.gocast.fm/night-bus</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["TuneIn", "Sonos", "VLC"].map((app) => (
          <span key={app} className="rounded-tag bg-surface-raised px-2 py-1 eyebrow-sm text-muted-foreground">
            {app}
          </span>
        ))}
      </div>
    </>
  )
}

/** Someone else's page with the player in it. */
function EmbedPicture() {
  return (
    <div className="flex flex-col overflow-hidden rounded-item bg-surface-raised">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="size-1.5 rounded-full bg-surface-strong" />
        <span className="size-1.5 rounded-full bg-surface-strong" />
        <span className="ml-1.5 font-mono text-caption text-text-faint">yoursite.com</span>
      </div>
      <div className="flex items-center gap-2.5 bg-card px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <IconPlayerPlayFilled size={14} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-body-sm font-semibold">Night Bus</span>
          <StatusLamp tone="onair" size="sm">On air</StatusLamp>
        </div>
      </div>
    </div>
  )
}

/** An encoder on the ingest, as the encoder fields describe it. */
function EncoderPicture() {
  return (
    <>
      <div className="flex flex-col gap-1 rounded-item bg-surface-raised px-2.5 py-2.5">
        <span className="eyebrow-sm text-text-faint">BUTT →</span>
<span className="font-mono text-caption [overflow-wrap:anywhere]">ingest.gocast.fm/night-bus</span>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="eyebrow-sm inline-flex items-center gap-2 text-ok">
          <span className="size-2 rounded-full bg-ok" />
          Connected
        </span>
        <span className="font-mono text-caption text-muted-foreground tabular-nums">128 kbps</span>
      </div>
    </>
  )
}

/** A week of listeners by day, and where they are. */
const WEEK = [38, 52, 45, 61, 74, 90, 68]
const COUNTRIES = [
  ["UK", 41],
  ["US", 22],
  ["DE", 9],
] as const

function AudiencePicture() {
  return (
    <>
      <div className="flex h-12 items-end gap-1.5">
        {WEEK.map((v, i) => (
          <span key={i} className="flex-1 rounded-xs bg-pro" style={{ height: `${v}%` }} />
        ))}
      </div>
      <div className="flex justify-between gap-2 px-0.5">
        {COUNTRIES.map(([c, pct]) => (
          <span key={c} className="font-mono text-caption tabular-nums">
            <span className="text-muted-foreground">{c}</span> {pct}%
          </span>
        ))}
      </div>
    </>
  )
}
