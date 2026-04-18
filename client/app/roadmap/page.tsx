import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Roadmap — GoCast",
  description: "What's live, what's next, and what's on the horizon for GoCast.",
}

const LIVE_NOW = [
  "Browser broadcasting with push-to-talk",
  "Player pages with live metadata",
  "File queue with drag & drop",
  "Keyboard shortcuts",
  "Seamless reconnect",
]

const COMING_SOON = [
  "Pro plan with Stripe billing",
  "AutoDJ — station plays 24/7 from uploaded tracks",
  "Listener analytics and geographic insights",
  "Embeddable player widget",
  "Scheduled broadcasts",
  "Connect OBS, BUTT, or external streaming software",
]

const ON_THE_HORIZON = [
  "Desktop app for system audio capture",
  "Custom domains",
  "Mobile broadcasting app",
  "Station directory and discovery",
  "API access",
  "Team accounts and multi-DJ support",
]

function Section({
  label,
  accent,
  items,
  dimmed = false,
}: {
  label: string
  accent: string
  items: string[]
  dimmed?: boolean
}) {
  return (
    <section className={dimmed ? "opacity-60" : ""}>
      <div className="flex items-center gap-3 mb-6">
        <span className={`inline-block w-2 h-2 rounded-full ${accent}`} aria-hidden />
        <h2 className="text-[11px] tracking-[3px] uppercase text-text-muted/85">
          {label}
        </h2>
      </div>
      <ul className="list-none p-0 flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item}
            className="text-[14px] text-text-muted flex items-center gap-3"
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${accent} shrink-0`}
              aria-hidden
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-muted-foreground no-underline hover:text-foreground transition-colors"
        >
          &larr; Back to GoCast
        </Link>

        <h1 className="text-3xl md:text-[40px] font-semibold -tracking-wide mt-8 mb-2">
          Roadmap
        </h1>
        <p className="text-sm text-text-faint mb-14 leading-[1.7]">
          What&apos;s live, what&apos;s next, and what&apos;s on the horizon.
        </p>

        <div className="flex flex-col gap-14">
          <Section label="Live now" accent="bg-emerald-400" items={LIVE_NOW} />
          <Section label="Coming soon" accent="bg-violet-full" items={COMING_SOON} />
          <Section
            label="On the horizon"
            accent="bg-white/40"
            items={ON_THE_HORIZON}
            dimmed
          />
        </div>

        <p className="text-sm text-text-faint mt-20 leading-[1.7]">
          Have a feature request? Email{" "}
          <a
            href="mailto:hello@gocast.fm"
            className="text-text-muted no-underline hover:text-white transition-colors"
          >
            hello@gocast.fm
          </a>
          .
        </p>
      </div>
    </div>
  )
}
