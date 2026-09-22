interface Capability {
  title: string
  body: string
  pro?: boolean
}

const CAPABILITIES: Capability[] = [
  {
    title: "A stream URL of your own",
    body: "A public Icecast URL that works in TuneIn, Sonos, VLC and every directory that takes one.",
    pro: true,
  },
  {
    title: "Your site, your domain",
    body: "Embed the player with one line of HTML, or point a DNS record at your station.",
    pro: true,
  },
  {
    title: "Broadcast from your own gear",
    body: "BUTT, Mixxx, or any Icecast source client connects straight to your station.",
    pro: true,
  },
  {
    title: "Know who is listening",
    body: "Ninety days of listener history, day by day and country by country. Live count and all-time peak stay free on every plan.",
    pro: true,
  },
]

/**
 * The checklist tier, sitting directly above pricing because that is where
 * "does it do X" is an actual question rather than a distraction.
 *
 * Deliberately colourless. The accent palette on the old feature grid assigned
 * a hue per card rather than per category, so the same tag rendered amber on
 * one card and violet on the next and the colour carried no information. Here
 * exactly one thing is coloured — the Pro marker — because exactly one thing
 * needs to be read at a glance.
 */
export default function CapabilityStrip() {
  return (
    <section className="px-4 md:px-10 pt-4 pb-12 md:pb-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-8">
          <span className="text-xs tracking-[0.25em] uppercase text-text-secondary">
            Also included in <span className="text-amber-300/90 font-semibold">Pro</span>
          </span>
          <div className="h-px flex-1 min-w-8 bg-white/[0.06]" />
        </div>

        <ul role="list" className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-7">
          {CAPABILITIES.map((c) => (
            <li key={c.title}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base font-semibold text-amber-300/90">{c.title}</span>
              </div>
              <p className="text-base text-text-secondary leading-[1.7] text-pretty tracking-[0.01em] mt-1.5 max-w-[46ch]">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
