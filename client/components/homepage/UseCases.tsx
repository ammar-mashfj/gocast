import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { Section, SectionIntro } from "./Section"
import { UseCaseRow } from "./UseCaseRow"

/**
 * "Who it's for": one card per audience page (`/for/<slug>`). Each card
 * draws that audience's own moment on air in a small still screen, the
 * same way the Pro extras do, so the grid reads as ten different stations
 * rather than ten icons with the noun swapped. The stations, times and
 * numbers are made up; the formats are the product's.

 */
type UseCase = {
  slug: string
  title: string
  line: string
  picture: React.ReactNode
}

// Order (from prod stations, 2026-11-23): the audiences with the most
// active stations lead — DJs and news — then the rest by size. Faith
// stations sit together at the end regardless of size, so the row never
// opens on, or seems to favour, one religion (churches are in fact the
// second-largest group on GoCast).
const USE_CASES: UseCase[] = [
  {
    slug: "djs",
    title: "DJs",
    line: "Play live mixes from your browser, no software needed.",
    picture: <Meter />,
  },
  {
    slug: "news",
    title: "News",
    line: "Bulletins on the hour, AutoDJ in between.",
    picture: <Bulletins />,
  },
  {
    slug: "musicians",
    title: "Musicians & labels",
    line: "A station that plays only your catalogue.",
    picture: <Catalogue />,
  },
  {
    slug: "community-radio",
    title: "Community radio",
    line: "Several presenters taking turns on one station.",
    picture: <Presenters />,
  },
  {
    slug: "fm-simulcast",
    title: "FM stations",
    line: "Put your FM station online through your own encoder.",
    picture: <Simulcast />,
  },
  {
    slug: "student-radio",
    title: "School & university radio",
    line: "A station run by students, news included.",
    picture: (
      <Rows
        rows={[
          { time: "12:30", label: "Campus news", live: true },
          { time: "13:00", label: "Lunch mix" },
        ]}
      />
    ),
  },
  {
    slug: "ai-radio",
    title: "AI-generated stations",
    line: "AI-made music or shows, playing day and night.",
    picture: <AlwaysOn />,
  },
  {
    slug: "diaspora-radio",
    title: "Diaspora & language radio",
    line: "Radio in your language for a community abroad.",
    picture: <Languages />,
  },
  {
    slug: "churches",
    title: "Churches",
    line: "Sunday service live, worship music in between.",
    picture: (
      <Rows
        rows={[
          { time: "Sun 10:00", label: "Sunday service", live: true },
          { time: "12:00", label: "Worship music" },
        ]}
      />
    ),
  },
  {
    slug: "mosques",
    title: "Mosques",
    line: "Friday khutbah live, Quran recitation the rest of the week.",
    picture: (
      <Rows
        rows={[
          { time: "Fri 13:00", label: "Khutbah", live: true },
          { time: "14:00", label: "Quran recitation" },
        ]}
      />
    ),
  },
]

export default function UseCases() {
  return (
    <Section id="who-its-for">
      <SectionIntro
        split
        eyebrow="Who it's for"
        title="One platform, a lot of different stations."
        lead="DJs and musicians, newsrooms, student and community stations, churches and mosques. See how each one runs on GoCast."
      />
      <UseCaseRow>
        {USE_CASES.map((u) => (
          <li key={u.slug} className="w-[min(78%,20rem)] min-w-0 shrink-0 snap-start sm:w-[calc((100%-0.75rem)/2.3)] lg:w-76">
            <Link
              href={`/for/${u.slug}`}
              className="group flex h-full flex-col gap-4 rounded-card bg-card p-3.5 no-underline outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                aria-hidden
                className="flex h-30 flex-col justify-center gap-2 lg:h-36 lg:gap-2.5 lg:p-4 overflow-hidden rounded-well bg-background p-3 transition-colors group-hover:bg-card"
              >
                {u.picture}
              </div>
              <div className="flex flex-1 flex-col gap-2 px-1 pb-1">
                <span className="font-display text-heading text-foreground">
                  {u.title}
                </span>
                <span className="text-body-sm text-muted-foreground">{u.line}</span>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-1 eyebrow-sm text-foreground">
                  See how
                  <IconArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </UseCaseRow>
    </Section>
  )
}

/* ---- The little screens. Short words only: on a phone a card is ~250px. ---- */

function Row({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-h-9 min-w-0 items-center gap-2 rounded-item bg-surface-raised px-2.5", className)}>
      {children}
    </div>
  )
}

/** A two-slot schedule: the live one on top, what AutoDJ plays next below. */
function Rows({ rows }: { rows: { time: string; label: string; live?: boolean }[] }) {
  return (
    <>
      {rows.map((r) => (
        <Row key={r.label} className={cn("py-1.5", r.live && "bg-live-tint")}>
          {/* Time over label: side by side, a ~170px card truncates the label. */}
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-caption text-text-faint tabular-nums">{r.time}</span>
            <span className="truncate text-body-sm font-semibold">{r.label}</span>
          </span>
          {r.live && <span className="ml-auto size-2 shrink-0 rounded-full bg-live" />}
        </Row>
      ))}
    </>
  )
}

function Presenters() {
  const people = [
    ["Amira", "Mon 18:00"],
    ["Tom", "Tue 20:00"],
    ["Joy", "Wed 07:00"],
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {people.map(([name, time], i) => (
        <div key={name} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold",
              i === 0 ? "bg-live text-live-ink" : "bg-surface-strong text-foreground",
            )}
          >
            {name[0]}
          </span>
          <span className="min-w-0 truncate text-body-sm font-semibold">{name}</span>
          <span className="ml-auto shrink-0 font-mono text-caption text-text-faint tabular-nums">{time}</span>
        </div>
      ))}
    </div>
  )
}

const BARS = [10, 18, 26, 14, 30, 22, 12, 28, 20, 16, 24, 9]

function Meter() {
  return (
    <>
      <div className="flex items-center justify-between">
        <StatusLamp tone="mic" size="sm">
          Live mix
        </StatusLamp>
        <span className="font-mono text-caption tabular-nums">01:12:40</span>
      </div>
      <div className="flex h-9 items-center gap-0.75">
        {BARS.map((h, i) => (
          <span key={i} className="flex-1 rounded-xs bg-live" style={{ height: h }} />
        ))}
      </div>
    </>
  )
}

function AlwaysOn() {
  return (
    <>
      <div className="flex items-center justify-between">
        <StatusLamp tone="onair" size="sm">
          On air
        </StatusLamp>
        <span className="font-mono text-caption text-text-faint">24/7</span>
      </div>
      <Row>
        <span className="min-w-0 truncate text-body-sm font-semibold">Neon Drift</span>
        <span className="ml-auto shrink-0 font-mono text-caption text-text-faint">3:41</span>
      </Row>
    </>
  )
}

function Catalogue() {
  const tracks = ["Paper Boats", "Low Tide", "Glasshouse"]
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow-sm text-text-faint">Your catalogue</span>
      {tracks.map((t, i) => (
        <div key={t} className="flex items-center gap-2">
          <span className="w-3 shrink-0 font-mono text-caption text-text-faint tabular-nums">{i + 1}</span>
          <span className={cn("min-w-0 truncate text-body-sm", i === 0 ? "font-semibold text-on-air-text" : "text-muted-foreground")}>
            {t}
          </span>
        </div>
      ))}
    </div>
  )
}

function Languages() {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {["العربية", "Español", "Kiswahili", "Tagalog"].map((l) => (
          <span key={l} className="rounded-tag bg-surface-raised px-2 py-1 text-caption font-semibold">
            {l}
          </span>
        ))}
      </div>
      <div className="flex justify-between gap-2 px-0.5">
        {[
          ["UK", 38],
          ["DE", 24],
          ["CA", 17],
        ].map(([c, pct]) => (
          <span key={c} className="font-mono text-caption tabular-nums">
            <span className="text-muted-foreground">{c}</span> {pct}%
          </span>
        ))}
      </div>
    </>
  )
}

function Bulletins() {
  const hours = ["13", "14", "15"]
  return (
    <>
      <div className="flex gap-1">
        {hours.map((h, i) => (
          <div key={h} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("h-2 rounded-xs", i === 1 ? "bg-live" : "bg-surface-strong")} />
            <span className="font-mono text-caption text-text-faint tabular-nums">{h}h</span>
          </div>
        ))}
      </div>
      <Row className="bg-live-tint">
        <span className="min-w-0 truncate text-body-sm font-semibold">News at 14:00</span>
        <span className="ml-auto size-2 shrink-0 rounded-full bg-live" />
      </Row>
    </>
  )
}

function Simulcast() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 rounded-item bg-surface-raised px-2.5 py-1.5 font-mono text-body-sm font-semibold whitespace-nowrap tabular-nums">98.4 FM</span>
        <IconArrowRight size={14} className="shrink-0 text-text-faint" />
        <span className="shrink-0 rounded-item bg-surface-raised px-2.5 py-1.5 text-body-sm font-semibold">Online</span>
      </div>
      <span className="eyebrow-sm inline-flex items-center gap-2 text-ok">
        <span className="size-2 rounded-full bg-ok" />
        Encoder connected
      </span>
    </>
  )
}
